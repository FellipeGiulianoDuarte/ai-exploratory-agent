import { BrowserPort } from '../ports/BrowserPort';
import { LLMPort, ActionDecision, LLMPageContext } from '../ports/LLMPort';
import { FindingsRepository } from '../ports/FindingsRepository';
import { SessionRepository } from '../ports/SessionRepository';
import {
  ExplorationSession,
  ExplorationSessionConfig,
  CheckpointReason,
  HumanGuidance,
} from '../../domain/exploration/ExplorationSession';
import { Finding } from '../../domain/exploration/Finding';
import { EventBus } from '../../domain/events/DomainEvent';
import { Tool, ToolContext, ToolDefinition } from '../../domain/tools/Tool';
import { PageState } from '../../domain/browser/PageState';
import { PersonaManager, registerDefaultPersonas, PersonaAnalysis } from '../../domain/personas';
import { URLDiscoveryService } from './URLDiscoveryService';
import { NavigationPlanner } from './NavigationPlanner';
import { BugDeduplicationService } from './BugDeduplicationService';
import { PageExplorationContext } from './PageExplorationContext';
import { LoopDetectionService } from './LoopDetectionService';
import { FindingsProcessor } from './FindingsProcessor';
import { ProgressReporter } from './ProgressReporter';
import { loggers } from '../../infrastructure/logging';

/**
 * Configuration for the ExplorationService.
 */
export interface ExplorationServiceConfig {
  /** Maximum number of steps before stopping */
  maxSteps: number;
  /** Checkpoint interval (number of steps) */
  checkpointInterval: number;
  /** Progress summary interval (number of steps) - non-blocking summary */
  progressSummaryInterval: number;
  /** Default exploration objective */
  defaultObjective: string;
  /** Confidence threshold below which to pause for guidance */
  minConfidenceThreshold: number;
  /** Whether to auto-checkpoint on tool findings */
  checkpointOnToolFindings: boolean;
  /** Step timeout in milliseconds */
  stepTimeout: number;
  /** Enable testing personas for specialized suggestions */
  enablePersonas: boolean;
  /** Maximum suggestions per persona */
  maxSuggestionsPerPersona: number;
  /** Wait time after navigation in milliseconds */
  navigationWaitTime: number;
  /** Max actions per page before exit */
  maxActionsPerPage?: number;
  /** Max time per page in milliseconds */
  maxTimePerPage?: number;
  /** Min element interactions before exit */
  minElementInteractions?: number;
  /** Exit after finding N bugs on page */
  exitAfterBugsFound?: number;
  /** Required tools to run per page */
  requiredTools?: string[];
  /** Bug deduplication similarity threshold */
  similarityThreshold?: number;
  /** Enable pattern matching for deduplication */
  enablePatternMatching?: boolean;
  /** Enable semantic matching for deduplication */
  enableSemanticMatching?: boolean;
  /** Individual persona configuration */
  personaConfig?: {
    enableSecurity?: boolean;
    enableMonitor?: boolean;
    enableValidation?: boolean;
    enableChaos?: boolean;
    enableEdgeCase?: boolean;
  };
  /** Maximum number of times the same action can be repeated before forcing an alternative */
  actionLoopMaxRepetitions?: number;
}

const DEFAULT_CONFIG: ExplorationServiceConfig = {
  maxSteps: 100,
  checkpointInterval: 10,
  progressSummaryInterval: 5,
  defaultObjective:
    'Explore the web application thoroughly, looking for bugs, broken images, console errors, and usability issues.',
  minConfidenceThreshold: 0.5,
  checkpointOnToolFindings: true,
  stepTimeout: 30000,
  enablePersonas: true,
  maxSuggestionsPerPersona: 5,
  navigationWaitTime: 2000,
  actionLoopMaxRepetitions: 2,
};

/**
 * Callback for human-in-the-loop interactions.
 */
export interface HumanInteractionCallback {
  onCheckpoint: (
    session: ExplorationSession,
    reason: CheckpointReason,
    proposedAction?: ActionDecision
  ) => Promise<HumanGuidance>;
}

/**
 * Callback for progress summaries (non-blocking).
 */
export interface ProgressCallback {
  onProgress: (summary: ProgressSummary) => void;
}

/**
 * Progress summary data.
 */
export interface ProgressSummary {
  currentStep: number;
  totalSteps: number;
  currentUrl: string;
  pagesVisited: string[];
  findingsCount: number;
  recentActions: string[];
  plannedActions: string[];
  personaSuggestionQueue: SuggestionQueueItem[];
}

/**
 * Item in the suggestion queue from personas.
 */
export interface SuggestionQueueItem {
  personaName: string;
  action: Partial<ActionDecision>;
  reasoning: string;
  targetUrl: string;
  priority: number;
}

/**
 * Result of an exploration run.
 */
export interface ExplorationResult {
  sessionId: string;
  totalSteps: number;
  findings: Finding[];
  summary: string;
  duration: number;
  stoppedReason: 'completed' | 'max_steps_reached' | 'stopped_by_user' | 'error';
  pagesVisited: string[];
  history: import('../ports/LLMPort').ExplorationHistoryEntry[];
  tokenUsage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * ExplorationService orchestrates the autonomous exploration loop.
 * It coordinates between the browser, LLM, tools, and human-in-the-loop interactions.
 */
export class ExplorationService {
  private browser: BrowserPort;
  private llm: LLMPort;
  private findingsRepository: FindingsRepository;
  private sessionRepository?: SessionRepository;
  private eventBus: EventBus;
  private tools: Map<string, Tool> = new Map();
  private config: ExplorationServiceConfig;
  private humanCallback?: HumanInteractionCallback;
  private progressCallback?: ProgressCallback;
  private personaManager?: PersonaManager;

  // URL Discovery and Navigation Planning
  private urlDiscovery: URLDiscoveryService;
  private navigationPlanner: NavigationPlanner;

  // Bug deduplication across pages
  private bugDeduplication: BugDeduplicationService;

  // Page-specific exploration context (fresh per page)
  private pageContext: PageExplorationContext;

  // Track tool usage per URL to prevent repetitive loops
  private toolUsageByUrl: Map<string, Set<string>> = new Map();

  // Track visited pages
  private visitedPages: Set<string> = new Set();

  // Suggestion queue from personas - prioritized by page and confidence
  private suggestionQueue: SuggestionQueueItem[] = [];

  // Track token usage across the session
  private tokenUsage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  };

  // Modular services for loop detection, finding processing, and progress reporting
  private loopDetection: LoopDetectionService;
  private findingsProcessor: FindingsProcessor;
  private progressReporter: ProgressReporter;

  // Track steps on current URL for exit criteria
  private stepsOnCurrentUrl = 0;
  private lastUrl = '';

  constructor(
    browser: BrowserPort,
    llm: LLMPort,
    findingsRepository: FindingsRepository,
    eventBus: EventBus,
    config: Partial<ExplorationServiceConfig> = {}
  ) {
    this.browser = browser;
    this.llm = llm;
    this.findingsRepository = findingsRepository;
    this.eventBus = eventBus;
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize URL Discovery and Navigation Planner
    this.urlDiscovery = new URLDiscoveryService({
      sameOriginOnly: true,
      maxQueueSize: 100,
    });
    this.navigationPlanner = new NavigationPlanner(this.urlDiscovery);
    loggers.urlDiscovery.info('URL discovery and navigation planning enabled');

    // Initialize bug deduplication service
    this.bugDeduplication = new BugDeduplicationService({
      similarityThreshold: this.config.similarityThreshold ?? 0.6,
      enablePatternMatching: this.config.enablePatternMatching ?? true,
      enableSemanticMatching: this.config.enableSemanticMatching ?? true,
    });

    // Initialize page exploration context (fresh context per page)
    this.pageContext = new PageExplorationContext({
      maxActionsPerPage: this.config.maxActionsPerPage ?? 8,
      maxTimePerPage: this.config.maxTimePerPage ?? 60000,
      requiredTools: this.config.requiredTools ?? ['broken_image_detector'],
      minElementInteractions: this.config.minElementInteractions ?? 3,
      exitAfterBugsFound: this.config.exitAfterBugsFound ?? 3,
    });

    // Initialize modular services
    this.loopDetection = new LoopDetectionService({
      toolLoopThreshold: 3,
      actionLoopThreshold: this.config.actionLoopMaxRepetitions ?? 2,
    });
    this.findingsProcessor = new FindingsProcessor({
      bugDeduplication: this.bugDeduplication,
      pageContext: this.pageContext,
    });
    this.progressReporter = new ProgressReporter();

    // Initialize personas if enabled
    if (this.config.enablePersonas) {
      this.personaManager = registerDefaultPersonas(undefined, this.config.personaConfig);

      // Log which personas are enabled
      const enabledPersonas = [];
      if (this.config.personaConfig?.enableSecurity !== false) enabledPersonas.push('Security');
      if (this.config.personaConfig?.enableMonitor !== false) enabledPersonas.push('Monitor');
      if (this.config.personaConfig?.enableValidation !== false) enabledPersonas.push('Validation');
      if (this.config.personaConfig?.enableChaos !== false) enabledPersonas.push('Chaos');
      if (this.config.personaConfig?.enableEdgeCase !== false) enabledPersonas.push('EdgeCase');

      loggers.personaManager.info(`Testing personas enabled: ${enabledPersonas.join(', ')}`);
    }
  }

  /**
   * Register a tool for use during exploration.
   */
  registerTool(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * Get the persona manager for external access.
   */
  getPersonaManager(): PersonaManager | undefined {
    return this.personaManager;
  }

  /**
   * Set the human interaction callback.
   */
  setHumanCallback(callback: HumanInteractionCallback): void {
    this.humanCallback = callback;
  }

  /**
   * Set the session repository for auto-saving sessions.
   */
  setSessionRepository(repository: SessionRepository): void {
    this.sessionRepository = repository;
  }

  /**
   * Set the progress callback for non-blocking summaries.
   */
  setProgressCallback(callback: ProgressCallback): void {
    this.progressCallback = callback;
  }

  /**
   * Helper to wait for a specified time.
   */
  private async wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Add suggestions to the queue, limiting per persona and prioritizing by current page.
   */
  private updateSuggestionQueue(personaAnalyses: PersonaAnalysis[], currentUrl: string): void {
    // Clear old suggestions and rebuild
    this.suggestionQueue = [];

    for (const analysis of personaAnalyses) {
      if (!analysis.isRelevant) continue;

      // Limit suggestions per persona
      const limitedSuggestions = analysis.suggestions
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, this.config.maxSuggestionsPerPersona);

      for (const suggestion of limitedSuggestions) {
        // Determine target URL - current page or other
        const targetUrl =
          suggestion.action.value && suggestion.action.action === 'navigate'
            ? suggestion.action.value
            : currentUrl;

        // Prioritize same-page suggestions
        const samePage = targetUrl === currentUrl;
        const priority = samePage
          ? suggestion.confidence * 10 + (analysis.suggestions.indexOf(suggestion) < 3 ? 5 : 0)
          : suggestion.confidence;

        this.suggestionQueue.push({
          personaName: analysis.personaName,
          action: suggestion.action,
          reasoning: suggestion.reasoning,
          targetUrl,
          priority,
        });
      }
    }

    // Sort by priority (higher first), same-page items prioritized
    this.suggestionQueue.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Get top suggestions for current page.
   */
  private getTopSuggestionsForPage(currentUrl: string, limit: number = 5): SuggestionQueueItem[] {
    return this.suggestionQueue.filter(s => s.targetUrl === currentUrl).slice(0, limit);
  }

  /**
   * Print progress summary (non-blocking).
   */
  private printProgressSummary(
    session: ExplorationSession,
    currentUrl: string,
    recentActions: string[]
  ): void {
    if (!this.progressCallback) {
      // Use ProgressReporter for formatted console output
      const topSuggestions = this.getTopSuggestionsForPage(currentUrl, 3);
      this.progressReporter.printProgressSummary(
        session.currentStep,
        this.config.maxSteps,
        {
          url: currentUrl,
          pagesVisited: this.visitedPages.size,
          findings: session.findingIds.length,
          recentActions: recentActions.slice(-3),
        },
        this.suggestionQueue.map(s => ({ personaName: s.personaName, reasoning: s.reasoning })),
        topSuggestions.map(s => ({ personaName: s.personaName, reasoning: s.reasoning }))
      );
    } else {
      this.progressCallback.onProgress({
        currentStep: session.currentStep,
        totalSteps: this.config.maxSteps,
        currentUrl,
        pagesVisited: Array.from(this.visitedPages),
        findingsCount: session.findingIds.length,
        recentActions,
        plannedActions: this.getTopSuggestionsForPage(currentUrl, 5).map(s => s.reasoning),
        personaSuggestionQueue: this.suggestionQueue.slice(0, 10),
      });
    }
  }

  /**
   * Create session configuration from service config.
   */
  private createSessionConfig(targetUrl: string, objective?: string): ExplorationSessionConfig {
    return {
      targetUrl,
      objective: objective || this.config.defaultObjective,
      maxSteps: this.config.maxSteps,
      checkpointInterval: this.config.checkpointInterval,
      minConfidenceThreshold: this.config.minConfidenceThreshold,
      checkpointOnToolFindings: this.config.checkpointOnToolFindings,
    };
  }

  /**
   * Start an exploration session.
   */
  async explore(startUrl: string, objective?: string): Promise<ExplorationResult> {
    const startTime = Date.now();
    const sessionConfig = this.createSessionConfig(startUrl, objective);
    const session = ExplorationSession.create(sessionConfig);
    session.setEventBus(this.eventBus);

    // Reset tracking for new exploration
    this.toolUsageByUrl.clear();
    this.visitedPages.clear();
    this.suggestionQueue = [];
    this.bugDeduplication.clear();
    this.tokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    this.urlDiscovery.clear();
    this.loopDetection.reset();
    this.stepsOnCurrentUrl = 0;
    this.lastUrl = '';

    // Track recent actions for progress summary
    const recentActions: string[] = [];

    // Start the session
    await session.start();

    // Initialize browser
    await this.browser.initialize();

    let stoppedReason: ExplorationResult['stoppedReason'] = 'completed';

    try {
      // Navigate to start URL
      await this.browser.navigate(startUrl);

      // Wait for page to fully load
      await this.wait(this.config.navigationWaitTime);
      this.visitedPages.add(startUrl);

      // Initial URL discovery scan
      await this.scanPageForUrls(startUrl);

      // Start fresh page context
      const pageTitle = await this.browser.getTitle();
      this.pageContext.startNewPage(startUrl, pageTitle);

      // Main exploration loop
      while (session.isRunning || session.isPaused) {
        // Check max steps
        if (session.hasReachedMaxSteps()) {
          stoppedReason = 'max_steps_reached';
          break;
        }

        // Get current page state
        const pageState = await this.browser.extractPageState();
        const llmPageContext = this.buildPageContext(pageState);

        // Track visited page
        this.visitedPages.add(llmPageContext.url);

        // Get persona suggestions if enabled
        let personaAnalysis: PersonaAnalysis[] | undefined;
        if (this.personaManager) {
          personaAnalysis = this.personaManager.collectSuggestions(llmPageContext, []);

          // Update suggestion queue with limited suggestions
          this.updateSuggestionQueue(personaAnalysis, llmPageContext.url);
        }

        // Get URL queue context for LLM
        const urlQueueContext = this.navigationPlanner.getPlanContextForLLM();

        // Get already reported bugs summary for LLM
        const reportedBugsSummary = this.bugDeduplication.getReportedBugsSummary();

        // Check exit criteria for current page
        const exitCriteria = this.pageContext.evaluateExitCriteria();

        // Print progress summary at intervals and auto-save session
        if (
          session.currentStep > 0 &&
          session.currentStep % this.config.progressSummaryInterval === 0
        ) {
          this.printProgressSummary(session, llmPageContext.url, recentActions);

          // Periodic auto-save at progress intervals
          if (this.sessionRepository) {
            await this.sessionRepository.save(session);
            this.progressReporter.printSessionSaved(session.id, 'auto');
          }
        }

        // Get LLM decision with retry logic
        const llmResponse = await this.executeWithRetry(
          () =>
            this.llm.decideNextAction({
              pageContext: llmPageContext,
              history: session.getHistoryForLLM(),
              tools: this.getToolDefinitions(),
              objective: sessionConfig.objective,
              personaAnalysis,
              urlQueueContext,
              reportedBugsSummary,
            }),
          3, // max retries
          1000 // initial delay
        );

        // Track token usage
        this.tokenUsage.promptTokens += llmResponse.usage.promptTokens;
        this.tokenUsage.completionTokens += llmResponse.usage.completionTokens;
        this.tokenUsage.totalTokens += llmResponse.usage.totalTokens;

        let decision = llmResponse.decision;

        // Check if LLM says we're done
        if (decision.action === 'done') {
          stoppedReason = 'completed';
          break;
        }

        // Check if URL changed - start fresh page context
        if (llmPageContext.url !== this.lastUrl) {
          if (this.lastUrl) {
            // Log exit from previous page
            this.progressReporter.printPageContextChange(this.lastUrl, llmPageContext.url, 'exit');
          }

          // Start fresh context for new page
          this.pageContext.startNewPage(llmPageContext.url, llmPageContext.title);
          this.lastUrl = llmPageContext.url;
          this.loopDetection.resetActionHistory();
          this.stepsOnCurrentUrl = 0;

          this.progressReporter.printPageContextChange(null, llmPageContext.url, 'start');
        } else {
          this.stepsOnCurrentUrl++;
        }

        // Exit criteria check - should we move to next page?
        if (exitCriteria.shouldExit && this.stepsOnCurrentUrl > 2) {
          this.progressReporter.printExitCriteria(exitCriteria.reason);

          // Get an unvisited URL from the queue
          const unvisitedUrls = this.urlDiscovery.getUnvisitedURLs();
          if (unvisitedUrls.length > 0) {
            // Prioritize by category: auth > product > cart > info > other
            const priorityOrder = ['auth', 'product', 'cart', 'user', 'info', 'other'];
            let targetUrl = unvisitedUrls[0];

            for (const category of priorityOrder) {
              const found = unvisitedUrls.find(u => u.category === category);
              if (found) {
                targetUrl = found;
                break;
              }
            }

            loggers.exitCriteria.info(`Moving to: ${targetUrl.normalizedUrl}`, {
              category: targetUrl.category,
            });
            decision = {
              action: 'navigate',
              value: targetUrl.normalizedUrl,
              reasoning: `Exit criteria met for current page. Moving to next unvisited URL: ${targetUrl.linkText || targetUrl.normalizedUrl}`,
              confidence: 0.8,
            };
          }
        }

        // Validate navigate action - prevent empty/invalid URLs
        if (decision.action === 'navigate') {
          if (!decision.value || decision.value.trim() === '') {
            this.progressReporter.printNavigationValidation('', false, 'empty URL');
            const retryResponse = await this.llm.decideNextAction({
              pageContext: llmPageContext,
              history: session.getHistoryForLLM(),
              tools: this.getToolDefinitions(),
              objective: `${sessionConfig.objective}\n\nIMPORTANT: Your last navigate action had an empty URL. Please choose a different action.`,
            });
            decision = retryResponse.decision;
          }
        }

        // Loop detection: prevent calling the same tool on the same URL
        if (decision.action === 'tool' && decision.toolName) {
          const currentUrl = llmPageContext.url;
          const urlTools = this.toolUsageByUrl.get(currentUrl) || new Set();

          if (urlTools.has(decision.toolName)) {
            // Tool already used on this URL - force a different action
            this.progressReporter.printLoopDetected('tool', decision.toolName, 1);

            // Get unvisited URLs to suggest navigation
            const unvisitedUrls = this.urlDiscovery.getUnvisitedURLs();
            const navigationSuggestion =
              unvisitedUrls.length > 0
                ? `\n\nSuggested next URLs to explore:\n${unvisitedUrls
                    .slice(0, 5)
                    .map(u => `- ${u.normalizedUrl} (${u.linkText})`)
                    .join('\n')}`
                : '';

            // Request a new decision with explicit instruction to not use tools
            const retryResponse = await this.llm.decideNextAction({
              pageContext: llmPageContext,
              history: session.getHistoryForLLM(),
              tools: [], // Remove tools from options to force navigation/interaction
              objective: `${sessionConfig.objective}\n\nIMPORTANT: You already ran all available tools on this page. Please navigate to a new page from the unvisited URLs below or interact with different elements.${navigationSuggestion}`,
            });
            decision = retryResponse.decision;
          } else {
            // Mark this tool as used on this URL
            urlTools.add(decision.toolName);
            this.toolUsageByUrl.set(currentUrl, urlTools);
          }
        }

        // Action loop detection: prevent repetitive actions using LoopDetectionService
        this.loopDetection.recordAction(decision);
        const loopResult = this.loopDetection.detectLoop(decision);

        if (loopResult.isLoop) {
          this.progressReporter.printLoopDetected(
            loopResult.type || 'action',
            loopResult.pattern || 'unknown',
            loopResult.count || 0
          );

          const retryResponse = await this.llm.decideNextAction({
            pageContext: llmPageContext,
            history: session.getHistoryForLLM(),
            tools: this.getToolDefinitions(),
            objective: `${sessionConfig.objective}\n\nIMPORTANT: You've tried the same action multiple times. Please choose a DIFFERENT action or navigate to a new page.`,
          });
          decision = retryResponse.decision;
          this.loopDetection.resetActionHistory(); // Clear to avoid infinite loops
        }

        // Check if checkpoint is needed
        const checkpointReason = session.shouldCheckpoint(decision);
        if (checkpointReason && this.humanCallback) {
          await session.triggerCheckpoint(checkpointReason);

          // Auto-save session at checkpoint
          if (this.sessionRepository) {
            await this.sessionRepository.save(session);
            this.progressReporter.printSessionSaved(session.id, 'checkpoint');
          }

          const guidance = await this.humanCallback.onCheckpoint(
            session,
            checkpointReason,
            decision
          );
          await session.applyGuidance(guidance);

          if (guidance.action === 'stop') {
            stoppedReason = 'stopped_by_user';
            break;
          }
        }

        // Execute the action
        const stepStartTime = Date.now();
        const stepResult = await this.executeStep(session, decision, llmPageContext);
        const stepDuration = Date.now() - stepStartTime;

        // Record action in page context
        this.pageContext.recordAction(decision, stepResult.success, stepResult.error || '');

        // Track the action for progress summaries
        const actionDescription = this.describeAction(decision);
        recentActions.push(actionDescription);
        if (recentActions.length > 10) recentActions.shift();

        // If navigation occurred, wait for page to load and scan for new URLs
        if (
          decision.action === 'navigate' ||
          decision.action === 'click' ||
          stepResult.resultingUrl !== llmPageContext.url
        ) {
          await this.wait(this.config.navigationWaitTime);
          this.visitedPages.add(stepResult.resultingUrl);

          // Scan new page for URLs
          await this.scanPageForUrls(stepResult.resultingUrl);
        }

        // Record the step
        await session.recordStep(
          decision,
          stepResult.success,
          stepResult.resultingUrl,
          stepDuration,
          stepResult.error
        );

        // Process findings from step (tool results)
        for (const finding of stepResult.findings) {
          // Check for duplicates using bug deduplication service
          const duplicateId = this.bugDeduplication.isDuplicate(finding.title, llmPageContext.url);
          if (!duplicateId) {
            await this.findingsRepository.save(finding);
            session.addFinding(finding.id);
            this.bugDeduplication.registerBug(
              finding.id,
              finding.title,
              finding.description,
              finding.severity,
              llmPageContext.url,
              this.pageContext.getStepsToReproduce()
            );
            this.pageContext.recordBugFound();
          }
        }

        // Check for observed issues in the decision and create findings
        if (decision.observedIssues && decision.observedIssues.length > 0) {
          // Process issues through FindingsProcessor - handles validation, deduplication, and Finding creation
          const processedFindings = this.findingsProcessor.processObservedIssues(
            decision,
            session.id,
            session.currentStep,
            llmPageContext
          );

          // Save non-duplicate findings and add to session
          for (const processed of processedFindings) {
            if (!processed.isDuplicate) {
              await this.findingsRepository.save(processed.finding);
              session.addFinding(processed.finding.id);
              this.pageContext.recordBugFound();
            }
          }
        }
      }

      // Generate summary
      const findings = await this.findingsRepository.findBySessionId(session.id);
      const summary = await this.llm.generateSummary(
        session.getHistoryForLLM(),
        findings.map(f => f.summarize())
      );

      // End session
      await session.stop(stoppedReason);

      // Final auto-save of completed session
      if (this.sessionRepository) {
        await this.sessionRepository.save(session);
        this.progressReporter.printSessionSaved(session.id, 'final');
      }

      return {
        sessionId: session.id,
        totalSteps: session.currentStep,
        findings,
        summary,
        duration: Date.now() - startTime,
        stoppedReason,
        pagesVisited: Array.from(this.visitedPages),
        history: session.getHistoryForLLM(),
        tokenUsage: { ...this.tokenUsage },
      };
    } catch (error) {
      stoppedReason = 'error';
      await session.stop('error');

      // Save session state even on error
      if (this.sessionRepository) {
        await this.sessionRepository.save(session);
        this.progressReporter.printSessionSaved(session.id, 'error');
      }

      // Generate summary even on error
      const findings = await this.findingsRepository.findBySessionId(session.id);
      const summary = `Exploration ended due to error: ${error instanceof Error ? error.message : String(error)}`;

      return {
        sessionId: session.id,
        totalSteps: session.currentStep,
        findings,
        summary,
        duration: Date.now() - startTime,
        stoppedReason,
        pagesVisited: Array.from(this.visitedPages),
        history: session.getHistoryForLLM(),
        tokenUsage: { ...this.tokenUsage },
      };
    } finally {
      await this.browser.close();
    }
  }

  /**
   * Build page context for LLM from PageState.
   */
  private buildPageContext(pageState: PageState): LLMPageContext {
    return {
      url: pageState.url,
      title: pageState.title,
      visibleText: pageState.visibleText?.substring(0, 5000) || '',
      elements: pageState.interactiveElements.slice(0, 50).map(el => ({
        selector: el.selector,
        type: el.type,
        text: el.text || '',
        isVisible: el.isVisible,
      })),
      consoleErrors: pageState.consoleErrors || [],
      networkErrors: pageState.networkErrors || [],
    };
  }

  /**
   * Describe an action for progress tracking.
   */
  private describeAction(decision: ActionDecision): string {
    switch (decision.action) {
      case 'navigate':
        return `Navigate to ${decision.value}`;
      case 'click':
        return `Click on ${decision.selector}`;
      case 'fill':
        return `Fill ${decision.selector} with "${decision.value?.substring(0, 20)}..."`;
      case 'select':
        return `Select "${decision.value}" in ${decision.selector}`;
      case 'hover':
        return `Hover over ${decision.selector}`;
      case 'scroll':
        return `Scroll page`;
      case 'back':
        return `Navigate back`;
      case 'refresh':
        return `Refresh page`;
      case 'tool':
        return `Run tool: ${decision.toolName}`;
      default:
        return `${decision.action}`;
    }
  }

  /**
   * Get tool definitions for LLM.
   */
  private getToolDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(tool => tool.getDefinition());
  }

  /**
   * Execute a single exploration step.
   */
  private async executeStep(
    session: ExplorationSession,
    decision: ActionDecision,
    pageContext: LLMPageContext
  ): Promise<{
    success: boolean;
    error?: string;
    resultingUrl: string;
    findings: Finding[];
  }> {
    const findings: Finding[] = [];
    let success = true;
    let error: string | undefined;

    try {
      switch (decision.action) {
        case 'navigate':
          if (decision.value) {
            const result = await this.browser.navigate(decision.value);
            success = result.success;
            error = result.error;
          }
          break;

        case 'click':
          if (decision.selector) {
            const result = await this.browser.click(decision.selector);
            success = result.success;
            error = result.error;
          }
          break;

        case 'fill':
          if (decision.selector && decision.value) {
            const result = await this.browser.fill(decision.selector, decision.value);
            success = result.success;
            error = result.error;
          }
          break;

        case 'select':
          if (decision.selector && decision.value) {
            const result = await this.browser.select(decision.selector, decision.value);
            success = result.success;
            error = result.error;
          }
          break;

        case 'hover':
          if (decision.selector) {
            const result = await this.browser.hover(decision.selector);
            success = result.success;
            error = result.error;
          }
          break;

        case 'scroll':
          // Use evaluate to scroll
          await this.browser.evaluate(() => window.scrollBy(0, 500));
          break;

        case 'back':
          await this.browser.goBack();
          break;

        case 'refresh':
          await this.browser.refresh();
          break;

        case 'tool':
          if (decision.toolName) {
            const toolFindings = await this.executeTool(
              session,
              decision.toolName,
              decision.toolParams || {},
              pageContext
            );
            findings.push(...toolFindings);
          }
          break;
      }

      // Check for new console errors after action
      const newPageState = await this.browser.extractPageState();
      const newConsoleErrors = newPageState.consoleErrors.filter(
        err => !pageContext.consoleErrors.includes(err)
      );

      if (newConsoleErrors.length > 0) {
        const consoleFinding = Finding.fromConsoleErrors(
          session.id,
          session.currentStep + 1,
          newPageState.url,
          newPageState.title,
          newConsoleErrors
        );
        findings.push(consoleFinding);
      }

      const resultingUrl = await this.browser.getCurrentUrl();

      return {
        success,
        error,
        resultingUrl,
        findings,
      };
    } catch (err) {
      const resultingUrl = await this.browser.getCurrentUrl();
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        resultingUrl,
        findings,
      };
    }
  }

  /**
   * Execute a tool and return any findings.
   */
  private async executeTool(
    session: ExplorationSession,
    toolName: string,
    params: Record<string, unknown>,
    pageContext: LLMPageContext
  ): Promise<Finding[]> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      return [];
    }

    const context: ToolContext = {
      browser: this.browser,
      currentUrl: pageContext.url,
    };

    const result = await tool.execute(params, context);
    const findings: Finding[] = [];

    if (result.success && result.data) {
      // Handle broken image detector results
      if (toolName === 'broken_image_detector') {
        const data = result.data as {
          brokenImages: Array<{ src: string; reason: string }>;
          totalImages: number;
        };
        if (data.brokenImages && data.brokenImages.length > 0) {
          const details = data.brokenImages.map(img => `${img.src}: ${img.reason}`).join('\n');
          const finding = Finding.fromBrokenImages(
            session.id,
            session.currentStep + 1,
            pageContext.url,
            pageContext.title,
            data.brokenImages.length,
            data.totalImages,
            details
          );
          findings.push(finding);
        }
      }

      // More tool handlers can be added here
    }

    return findings;
  }

  /**
   * Execute an async operation with retry logic.
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    initialDelay: number = 1000
  ): Promise<T> {
    let lastError: Error | undefined;
    let delay = initialDelay;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < maxRetries) {
          this.progressReporter.printRetry(attempt, delay);
          await this.wait(delay);
          delay *= 2; // Exponential backoff
        }
      }
    }

    throw lastError;
  }

  /**
   * Get total token usage for the session.
   */
  getTokenUsage(): { promptTokens: number; completionTokens: number; totalTokens: number } {
    return { ...this.tokenUsage };
  }

  /**
   * Scan the current page for discoverable URLs.
   */
  private async scanPageForUrls(currentUrl: string): Promise<void> {
    try {
      // Use browser's evaluate method directly through BrowserPort interface
      const newUrls = await this.urlDiscovery.scanPage(this.browser, currentUrl);

      if (newUrls.length > 0) {
        const unvisited = this.urlDiscovery.getUnvisitedURLs();
        // Use ProgressReporter for URL discovery results
        this.progressReporter.printUrlDiscoveryResults(
          newUrls.slice(0, 3).map(u => ({
            category: u.category,
            normalizedUrl: u.normalizedUrl,
            linkText: u.linkText,
          })),
          unvisited.length
        );
      }
    } catch (error) {
      // URL discovery is non-critical, don't fail exploration
      this.progressReporter.printUrlDiscoveryError(error);
    }
  }

  /**
   * Get URL discovery stats for external access.
   */
  getURLDiscoveryStats(): { discovered: number; visited: number; unvisited: number } {
    const siteMap = this.urlDiscovery.getSiteMap();
    const unvisited = this.urlDiscovery.getUnvisitedURLs();
    return {
      discovered: siteMap.totalDiscovered,
      visited: siteMap.totalVisited,
      unvisited: unvisited.length,
    };
  }

  /**
   * Get the navigation planner for external access.
   */
  getNavigationPlanner(): NavigationPlanner {
    return this.navigationPlanner;
  }
}
