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
import { Finding, FindingType } from '../../domain/exploration/Finding';
import { EventBus } from '../../domain/events/DomainEvent';
import { Tool, ToolContext, ToolDefinition } from '../../domain/tools/Tool';
import { PageState } from '../../domain/browser/PageState';
import { PersonaManager, registerDefaultPersonas, PersonaAnalysis } from '../../domain/personas';
import { URLDiscoveryService } from './URLDiscoveryService';
import { NavigationPlanner } from './NavigationPlanner';
import { BugDeduplicationService } from './BugDeduplicationService';
import { PageExplorationContext } from './PageExplorationContext';

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
}

const DEFAULT_CONFIG: ExplorationServiceConfig = {
  maxSteps: 100,
  checkpointInterval: 10,
  progressSummaryInterval: 5,
  defaultObjective: 'Explore the web application thoroughly, looking for bugs, broken images, console errors, and usability issues.',
  minConfidenceThreshold: 0.5,
  checkpointOnToolFindings: true,
  stepTimeout: 30000,
  enablePersonas: true,
  maxSuggestionsPerPersona: 5,
  navigationWaitTime: 2000,
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

  // Track recent actions to prevent loops (action signature -> count)
  private recentActions: Map<string, number> = new Map();

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
    console.log('[URLDiscovery] URL discovery and navigation planning enabled');

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
      
      console.log(`[PersonaManager] Testing personas enabled: ${enabledPersonas.join(', ')}`);
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
  private updateSuggestionQueue(
    personaAnalyses: PersonaAnalysis[],
    currentUrl: string
  ): void {
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
        const targetUrl = suggestion.action.value && suggestion.action.action === 'navigate'
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
    return this.suggestionQueue
      .filter(s => s.targetUrl === currentUrl)
      .slice(0, limit);
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
      // Default console output
      console.log('\n' + '─'.repeat(60));
      console.log(`📊 Progress Update (Step ${session.currentStep}/${this.config.maxSteps})`);
      console.log('─'.repeat(60));
      console.log(`📍 Current URL: ${currentUrl}`);
      console.log(`📄 Pages visited: ${this.visitedPages.size}`);
      console.log(`🔍 Findings: ${session.findingIds.length}`);
      console.log(`\n📝 Recent actions:`);
      recentActions.slice(-3).forEach(a => console.log(`   • ${a}`));
      
      if (this.suggestionQueue.length > 0) {
        console.log(`\n🎯 Persona suggestions queued: ${this.suggestionQueue.length}`);
        const topSuggestions = this.getTopSuggestionsForPage(currentUrl, 3);
        if (topSuggestions.length > 0) {
          console.log(`   Top suggestions for this page:`);
          topSuggestions.forEach(s => {
            console.log(`   • [${s.personaName}] ${s.reasoning.substring(0, 60)}...`);
          });
        }
      }
      console.log('─'.repeat(60) + '\n');
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
    this.recentActions.clear();
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
        if (session.currentStep > 0 && 
            session.currentStep % this.config.progressSummaryInterval === 0) {
          this.printProgressSummary(session, llmPageContext.url, recentActions);
          
          // Periodic auto-save at progress intervals
          if (this.sessionRepository) {
            await this.sessionRepository.save(session);
            console.log(`[Session] Auto-saved at step ${session.currentStep}`);
          }
        }

        // Get LLM decision with retry logic
        const llmResponse = await this.executeWithRetry(
          () => this.llm.decideNextAction({
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
            const prevStats = this.pageContext.getStats();
            console.log(`[PageContext] Exiting ${this.lastUrl} after ${prevStats.actionsPerformed} actions, ${prevStats.bugsFound} bugs found`);
          }
          
          // Start fresh context for new page
          this.pageContext.startNewPage(llmPageContext.url, llmPageContext.title);
          this.lastUrl = llmPageContext.url;
          this.recentActions.clear();
          this.stepsOnCurrentUrl = 0;
          
          console.log(`[PageContext] Starting fresh context for: ${llmPageContext.url}`);
        } else {
          this.stepsOnCurrentUrl++;
        }

        // Exit criteria check - should we move to next page?
        if (exitCriteria.shouldExit && this.stepsOnCurrentUrl > 2) {
          console.log(`[ExitCriteria] ${exitCriteria.reason} - considering navigation`);
          
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

            console.log(`[ExitCriteria] Moving to: ${targetUrl.normalizedUrl} (${targetUrl.category})`);
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
            console.log('[Validation] Invalid navigate action with empty URL, requesting alternative');
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
            console.log(`[ToolLoop] Tool '${decision.toolName}' already used on ${currentUrl}, requesting alternative action`);

            // Get unvisited URLs to suggest navigation
            const unvisitedUrls = this.urlDiscovery.getUnvisitedURLs();
            const navigationSuggestion = unvisitedUrls.length > 0
              ? `\n\nSuggested next URLs to explore:\n${unvisitedUrls.slice(0, 5).map(u => `- ${u.normalizedUrl} (${u.linkText})`).join('\n')}`
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

        // Action loop detection: prevent repetitive actions (max 2 same actions)
        const actionSignature = this.getActionSignature(decision);
        const actionCount = this.recentActions.get(actionSignature) || 0;

        if (actionCount >= 2) {
          console.log(`[ActionLoop] Action '${actionSignature}' repeated ${actionCount} times, requesting alternative`);

          const retryResponse = await this.llm.decideNextAction({
            pageContext: llmPageContext,
            history: session.getHistoryForLLM(),
            tools: this.getToolDefinitions(),
            objective: `${sessionConfig.objective}\n\nIMPORTANT: You've tried the same action multiple times. Please choose a DIFFERENT action or navigate to a new page.`,
          });
          decision = retryResponse.decision;
          this.recentActions.clear(); // Clear to avoid infinite loops
        } else {
          // Track this action
          this.recentActions.set(actionSignature, actionCount + 1);
        }

        // Check if checkpoint is needed
        const checkpointReason = session.shouldCheckpoint(decision);
        if (checkpointReason && this.humanCallback) {
          await session.triggerCheckpoint(checkpointReason);

          // Auto-save session at checkpoint
          if (this.sessionRepository) {
            await this.sessionRepository.save(session);
            console.log(`[Session] Auto-saved at checkpoint (reason: ${checkpointReason})`);
          }

          const guidance = await this.humanCallback.onCheckpoint(session, checkpointReason, decision);
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
        if (decision.action === 'navigate' || 
            decision.action === 'click' ||
            stepResult.resultingUrl !== llmPageContext.url) {
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
          for (const issue of decision.observedIssues) {
            // Skip false positives (non-bugs)
            if (this.isFalsePositive(issue)) {
              continue;
            }
            
            // Check for duplicates using bug deduplication
            const duplicateId = this.bugDeduplication.isDuplicate(issue, llmPageContext.url);
            if (duplicateId) {
              // Skip duplicate
              continue;
            }
            
            // Determine severity based on issue content
            const severity = this.classifyIssueSeverity(issue);
            const findingType = this.classifyIssueType(issue);
            
            // Get steps to reproduce from page context
            const stepsToReproduce = this.pageContext.getStepsToReproduce();
            
            // Create description with steps to reproduce
            const fullDescription = `${issue}\n\n**Steps to Reproduce:**\n${stepsToReproduce.join('\n')}`;
            
            const finding = Finding.create({
              sessionId: session.id,
              stepNumber: session.currentStep,
              type: findingType,
              title: `${this.getIssueTitlePrefix(findingType)}: ${issue.substring(0, 50)}`,
              description: fullDescription,
              pageUrl: llmPageContext.url,
              pageTitle: llmPageContext.title,
              severity,
              metadata: {
                stepsToReproduce,
                pageActionsCount: this.pageContext.getActionCount(),
              },
            });
            await this.findingsRepository.save(finding);
            session.addFinding(finding.id);
            
            // Register with deduplication service
            this.bugDeduplication.registerBug(
              finding.id,
              finding.title,
              issue,
              severity,
              llmPageContext.url,
              stepsToReproduce
            );
            
            // Track bug found on page
            this.pageContext.recordBugFound();
            
            const severityEmoji = severity === 'critical' ? '🔴' : severity === 'high' ? '🟠' : severity === 'medium' ? '🟡' : '🟢';
            console.log(`${severityEmoji} [${severity.toUpperCase()}] ${issue}`);
          }
        }
      }

      // Generate summary
      const findings = await this.findingsRepository.findBySessionId(session.id);
      const summary = await this.llm.generateSummary(
        session.getHistoryForLLM(),
        findings.map((f) => f.summarize())
      );

      // End session
      await session.stop(stoppedReason);

      // Final auto-save of completed session
      if (this.sessionRepository) {
        await this.sessionRepository.save(session);
        console.log(`[Session] Final save completed (session: ${session.id})`);
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
        console.log(`[Session] Saved session after error (session: ${session.id})`);
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
      elements: pageState.interactiveElements.slice(0, 50).map((el) => ({
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
    return Array.from(this.tools.values()).map((tool) => tool.getDefinition());
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
        (err) => !pageContext.consoleErrors.includes(err)
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
        const data = result.data as { brokenImages: Array<{ src: string; reason: string }>; totalImages: number };
        if (data.brokenImages && data.brokenImages.length > 0) {
          const details = data.brokenImages.map((img) => `${img.src}: ${img.reason}`).join('\n');
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
   * Check if an observed issue is a false positive (not a real bug).
   * Filters out:
   * - "No bugs found" type messages
   * - Navigation descriptions
   * - Status updates without actual issues
   * - Contradictory or vague statements
   */
  private isFalsePositive(issue: string): boolean {
    const lowerIssue = issue.toLowerCase();
    
    // Filter out "no bugs/issues" messages - comprehensive patterns
    const noBugPatterns = [
      'no immediate bugs',
      'no bugs found',
      'no issues found',
      'no errors found',
      'no issues detected',
      'no bugs detected',
      'no issues on',
      'no bugs on',
      'no visible issues',
      'no apparent bugs',
      'no bugs observed',
      'no issues observed',
      'page looks good',
      'everything looks fine',
      'everything looks good',
      'looks correct',
      'appears correct',
      'working correctly',
      'works as expected',
      'functioning properly',
      'not yet tested',
      'none are visible',
      'but none are',
      'if any',
    ];
    
    for (const pattern of noBugPatterns) {
      if (lowerIssue.includes(pattern)) {
        return true;
      }
    }
    
    // Filter out navigation/status descriptions (not bugs)
    const navigationPatterns = [
      'navigating to',
      'navigating away',
      'navigate to',
      'navigation to',
      'page is focused',
      'currently on',
      'currently focused',
      'now on',
      'successfully loaded',
      'loaded successfully',
      'moving to',
      'going to',
      'proceeding to',
    ];
    
    for (const pattern of navigationPatterns) {
      if (lowerIssue.includes(pattern)) {
        return true;
      }
    }
    
    // Filter out speculative statements (not confirmed bugs)
    const speculativePatterns = [
      'actual outcome requires',
      'requires submission',
      'requires server',
      'server response unknown',
      'outcome requires',
      'may affect',
      'might affect',
      'could affect',
      'may impact',
      'might impact',
      'could impact',
      'potential issue if',
      'would need to',
      'needs further',
      'requires further',
    ];
    
    for (const pattern of speculativePatterns) {
      if (lowerIssue.includes(pattern)) {
        return true;
      }
    }
    
    // Filter out expected behavior descriptions
    const expectedBehaviorPatterns = [
      'accepts text',
      'accepts input',
      'accepts special characters',
      'field works',
      'input works',
      'button works',
      'link works',
      'as expected',
    ];
    
    for (const pattern of expectedBehaviorPatterns) {
      if (lowerIssue.includes(pattern)) {
        return true;
      }
    }
    
    // Filter out vague or contradictory statements
    // e.g., "No issues on current page; the page contains a broken image"
    if (lowerIssue.includes('no issues') || lowerIssue.includes('no bugs')) {
      return true;
    }
    
    // Must have some actionable content - reject very short or vague issues
    const words = issue.split(/\s+/).filter(w => w.length > 2);
    if (words.length < 3) {
      return true;
    }
    
    return false;
  }

  /**
   * Classify severity based on issue content.
   * 
   * SEVERITY GUIDELINES:
   * - CRITICAL: Security vulnerabilities, data loss, crashes
   * - HIGH: Functional bugs that break core features, undefined values in UI
   * - MEDIUM: Console errors, broken images, validation issues
   * - LOW: Typos, minor text issues, cosmetic problems
   */
  private classifyIssueSeverity(issue: string): 'critical' | 'high' | 'medium' | 'low' {
    const lowerIssue = issue.toLowerCase();
    
    // LOW: Typos and text issues (check first to avoid false HIGH classification)
    if (lowerIssue.includes('typo') ||
        lowerIssue.includes('misspell') ||
        lowerIssue.includes('spelling') ||
        lowerIssue.includes('contakt') ||  // Specific known typo
        (lowerIssue.includes('should be') && !lowerIssue.includes('error'))) {
      return 'low';
    }
    
    // CRITICAL: Security issues, data loss, crash
    if (lowerIssue.includes('security') ||
        lowerIssue.includes('injection') ||
        lowerIssue.includes('xss') ||
        lowerIssue.includes('unauthorized') ||
        lowerIssue.includes('crash') ||
        lowerIssue.includes('data loss') ||
        lowerIssue.includes('password exposed') ||
        lowerIssue.includes('credential')) {
      return 'critical';
    }
    
    // HIGH: Functional issues that break features
    if (lowerIssue.includes('undefined') ||
        lowerIssue.includes('null') ||
        lowerIssue.includes('[object object]') ||
        lowerIssue.includes('nan') ||
        lowerIssue.includes("doesn't work") ||
        lowerIssue.includes('not working') ||
        lowerIssue.includes('fails to') ||
        lowerIssue.includes('cannot') ||
        lowerIssue.includes('unable to') ||
        lowerIssue.includes('500') ||
        lowerIssue.includes('exception')) {
      return 'high';
    }
    
    // MEDIUM: Console errors, broken images, validation issues, 404s
    if (lowerIssue.includes('error') ||
        lowerIssue.includes('console') ||
        lowerIssue.includes('broken image') ||
        lowerIssue.includes('image not') ||
        lowerIssue.includes('404') ||
        lowerIssue.includes('validation') ||
        lowerIssue.includes('missing') ||
        lowerIssue.includes('incorrect')) {
      return 'medium';
    }
    
    // Low: Minor issues, suggestions
    return 'low';
  }

  /**
   * Classify issue type based on content.
   */
  private classifyIssueType(issue: string): FindingType {
    const lowerIssue = issue.toLowerCase();
    
    if (lowerIssue.includes('typo') || lowerIssue.includes('misspell') || lowerIssue.includes('spelling')) {
      return 'text_issue';
    }
    if (lowerIssue.includes('console') || lowerIssue.includes('javascript error')) {
      return 'console_error';
    }
    if (lowerIssue.includes('image') || lowerIssue.includes('img')) {
      return 'broken_image';
    }
    if (lowerIssue.includes('security') || lowerIssue.includes('xss') || lowerIssue.includes('injection')) {
      return 'security';
    }
    if (lowerIssue.includes('usability') || lowerIssue.includes('ux') || lowerIssue.includes('confusing')) {
      return 'usability';
    }
    if (lowerIssue.includes('layout') || lowerIssue.includes('display') || lowerIssue.includes('ui')) {
      return 'ui_issue';
    }
    if (lowerIssue.includes('network') || lowerIssue.includes('404') || lowerIssue.includes('500')) {
      return 'network_error';
    }
    
    return 'observed_bug';
  }

  /**
   * Get title prefix based on finding type.
   */
  private getIssueTitlePrefix(type: FindingType): string {
    const prefixes: Record<FindingType, string> = {
      'broken_image': 'Broken Image',
      'console_error': 'Console Error',
      'network_error': 'Network Error',
      'accessibility': 'Accessibility Issue',
      'usability': 'Usability Issue',
      'functional': 'Functional Bug',
      'performance': 'Performance Issue',
      'security': 'Security Issue',
      'observed_bug': 'Bug Found',
      'text_issue': 'Text Issue',
      'ui_issue': 'UI Issue',
      'other': 'Issue',
    };
    return prefixes[type] || 'Issue';
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
          console.log(`⚠️ Attempt ${attempt} failed, retrying in ${delay}ms...`);
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
        console.log(`[URLDiscovery] Found ${newUrls.length} new URLs (${unvisited.length} total in queue)`);
        
        // Log first few new URLs
        for (const url of newUrls.slice(0, 3)) {
          const path = new URL(url.normalizedUrl).pathname;
          console.log(`   + [${url.category}] ${path} - "${url.linkText.substring(0, 40)}"`);
        }
        if (newUrls.length > 3) {
          console.log(`   ... and ${newUrls.length - 3} more`);
        }
      }
    } catch (error) {
      // URL discovery is non-critical, don't fail exploration
      console.log(`[URLDiscovery] Scan error (non-critical): ${error instanceof Error ? error.message : String(error)}`);
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

  /**
   * Create a unique signature for an action to detect loops.
   * Format: action:selector:value (normalized)
   */
  private getActionSignature(decision: ActionDecision): string {
    const parts: string[] = [decision.action];

    if (decision.selector) {
      parts.push(decision.selector);
    }

    if (decision.value) {
      // Normalize value to catch similar inputs
      const normalizedValue = decision.value
        .toLowerCase()
        .replace(/['"]/g, '')
        .substring(0, 50); // Limit length for comparison
      parts.push(normalizedValue);
    }

    if (decision.toolName) {
      parts.push(decision.toolName);
    }

    return parts.join(':');
  }
}
