import { BrowserPort } from '../ports/BrowserPort';
import { LLMPort } from '../ports/LLMPort';
import { FindingsRepository } from '../ports/FindingsRepository';
import { SessionRepository } from '../ports/SessionRepository';
import { ExplorationSession } from '../../domain/exploration/ExplorationSession';
import { Finding } from '../../domain/exploration/Finding';
import { EventBus } from '../../domain/events/DomainEvent';
import { Tool } from '../../domain/tools/Tool';
import { PersonaManager } from '../../domain/personas';
import { AppConfig } from '../../domain/config/AppConfig';
import { NavigationPlanner } from './NavigationPlanner';
import { AgentDependencies, AgentDependencyFactory } from './AgentDependencyFactory';
import { HumanInteractionCallback, ProgressCallback } from '../ports/ExplorationTypes';
import { ExplorationStateMachine, createInitialContext } from './agent';
import { AgentSupervisor } from './supervisor';

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
 * Refactored to delegate dependency creation and state management to AgentDependencyFactory.
 */
export class ExplorationService {
  // Track the current/latest dependencies to support external access (getters)
  private currentDependencies?: AgentDependencies;
  private tools: Map<string, Tool> = new Map();
  private sessionRepository?: SessionRepository;
  private humanCallback?: HumanInteractionCallback;
  private progressCallback?: ProgressCallback;

  constructor(
    private browser: BrowserPort,
    private llm: LLMPort,
    private findingsRepository: FindingsRepository,
    private eventBus: EventBus,
    private config: AppConfig
  ) {
    // Dependencies are created fresh for each exploration run via AgentDependencyFactory
  }

  /**
   * Register a tool for use during exploration.
   */
  registerTool(tool: Tool): void {
    // We need to pass tools to the factory so it can inject them into dependencies.
    // Since the factory has a `tools` map in its constructor, we should access it or method.
    // Accessing private property is hard.
    // BETTER: Store tools here and pass them to Factory when creating dependencies.
    this.tools.set(tool.name, tool);
  }

  setSessionRepository(repository: SessionRepository): void {
    this.sessionRepository = repository;
  }

  setHumanCallback(callback: HumanInteractionCallback): void {
    this.humanCallback = callback;
  }

  setProgressCallback(callback: ProgressCallback): void {
    this.progressCallback = callback;
  }

  /**
   * explore() - Main entry point
   */
  async explore(startUrl: string, objective?: string): Promise<ExplorationResult> {
    const startTime = Date.now();

    // Create Fresh Dependencies for this run
    // Re-instantiate factory with current configuration (tools, callbacks, etc)
    const runFactory = new AgentDependencyFactory(
      this.config,
      this.browser,
      this.llm,
      this.findingsRepository,
      this.eventBus,
      this.tools,
      this.sessionRepository,
      undefined, // PersonaManager - let factory handle it
      this.humanCallback,
      this.progressCallback
    );

    const deps = runFactory.createDependencies();
    this.currentDependencies = deps; // Update reference for getters

    const sessionConfig = runFactory.createSessionConfig(startUrl, objective);
    const session = ExplorationSession.create(sessionConfig);
    session.setEventBus(this.eventBus);

    let stoppedReason: ExplorationResult['stoppedReason'] = 'completed';

    try {
      await this.browser.initialize();
      await this.browser.navigate(startUrl);

      await session.start();

      const stateMachine = new ExplorationStateMachine(deps);
      const context = createInitialContext('single-agent', session);

      const finalContext = await stateMachine.run(context);

      // Determine stop reason
      if (finalContext.error) stoppedReason = 'error';
      else if (finalContext.exitReason) {
        stoppedReason = finalContext.exitReason;
      }

      await session.stop(stoppedReason);
      const findings = await this.findingsRepository.findBySessionId(session.id);

      // Track token usage for getTokenUsage() getter
      this.lastTokenUsage = finalContext.tokenUsage;

      return {
        sessionId: session.id,
        totalSteps: session.currentStep,
        findings,
        summary: `Explored ${finalContext.visitedUrls.size} pages using State Machine architecture`,
        duration: Date.now() - startTime,
        stoppedReason,
        pagesVisited: Array.from(finalContext.visitedUrls),
        history: session.getHistoryForLLM(),
        tokenUsage: finalContext.tokenUsage,
      };
    } catch (error) {
      await session.stop('error');
      throw error;
    } finally {
      await this.browser.close();
    }
  }

  async exploreMultiple(
    startUrls: string[],
    options: {
      maxConcurrency?: number;
      maxStepsPerAgent?: number;
      globalMaxSteps?: number;
      objective?: string;
    } = {}
  ): Promise<import('./supervisor').MultiAgentResult> {
    // We need to pass a factory function that creates dependencies for each agent
    const dependencyFactoryCallback = (_agentId: string) => {
      // Create fresh dependencies for each agent
      const factory = new AgentDependencyFactory(
        this.config,
        this.browser,
        this.llm,
        this.findingsRepository,
        this.eventBus,
        this.tools,
        this.sessionRepository, // Use the shared repo? Yes.
        undefined, // Shared personas config handled by factory
        this.humanCallback,
        this.progressCallback
      );
      return factory.createDependencies();
    };

    // Create Config for the session
    const sessionConfigFactory = (url: string, obj?: string) => {
      // Create a temp factory just to reuse the method, or make method static?
      // Method is instance. But we have access to `this.factory` (the initial one) or `this.config`.
      // Let's just use a new factory instance or helper.
      return new AgentDependencyFactory(
        this.config,
        this.browser,
        this.llm,
        this.findingsRepository,
        this.eventBus,
        this.tools
      ).createSessionConfig(url, obj);
    };

    const supervisor = new AgentSupervisor(
      {
        maxConcurrency: options.maxConcurrency ?? 3,
        maxStepsPerAgent: options.maxStepsPerAgent ?? 20,
        globalMaxSteps: options.globalMaxSteps ?? this.config.exploration.maxSteps,
        navigationWaitTime: this.config.navigation.waitTime,
      },
      {
        createAgentDependencies: dependencyFactoryCallback,
        sessionConfig: sessionConfigFactory(startUrls[0], options.objective),
        eventBus: this.eventBus,
      }
    );

    return supervisor.explore(startUrls);
  }
  // Getters relying on currentDependencies

  getURLDiscoveryStats() {
    if (!this.currentDependencies) return { discovered: 0, visited: 0, unvisited: 0 };
    const siteMap = this.currentDependencies.urlDiscovery.getSiteMap();
    return {
      discovered: siteMap.totalDiscovered,
      visited: siteMap.totalVisited,
      unvisited: this.currentDependencies.urlDiscovery.getUnvisitedURLs().length,
    };
  }

  getNavigationPlanner(): NavigationPlanner | undefined {
    return this.currentDependencies?.navigationPlanner;
  }

  getPersonaManager(): PersonaManager | undefined {
    return this.currentDependencies?.personaManager;
  }

  private lastTokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

  getTokenUsage() {
    return this.lastTokenUsage;
  }
}
