import { BrowserPort } from '../ports/BrowserPort';
import { LLMPort } from '../ports/LLMPort';
import { FindingsRepository } from '../ports/FindingsRepository';
import { SessionRepository } from '../ports/SessionRepository';
import { EventBus } from '../../domain/events/DomainEvent';
import { Tool } from '../../domain/tools/Tool';
import { PersonaManager, registerDefaultPersonas } from '../../domain/personas';
import { AppConfig } from '../../domain/config/AppConfig';
import { URLDiscoveryService } from './URLDiscoveryService';
import { NavigationPlanner } from './NavigationPlanner';
import { BugDeduplicationService } from './BugDeduplicationService';
import { PageExplorationContext } from './PageExplorationContext';
import { LoopDetectionService } from './LoopDetectionService';
import { FindingsProcessor } from './FindingsProcessor';
import { ProgressReporter } from './ProgressReporter';
import { ExplorationSessionConfig } from '../../domain/exploration/ExplorationSession';
import { HumanInteractionCallback, ProgressCallback } from '../ports/ExplorationTypes';

export interface AgentDependencies {
  browser: BrowserPort;
  llm: LLMPort;
  findingsRepository: FindingsRepository;
  eventBus: EventBus;
  tools: Map<string, Tool>;
  config: AppConfig;
  personaManager?: PersonaManager;
  sessionRepository?: SessionRepository;
  humanCallback?: HumanInteractionCallback;
  progressCallback?: ProgressCallback;
  urlDiscovery: URLDiscoveryService;
  navigationPlanner: NavigationPlanner;
  bugDeduplication: BugDeduplicationService;
  pageContext: PageExplorationContext;
  loopDetection: LoopDetectionService;
  findingsProcessor: FindingsProcessor;
  progressReporter: ProgressReporter;
}

/**
 * Factory to create and assemble dependencies for the Exploration Agent.
 * Helps reduce the complexity of the main ExplorationService.
 */
export class AgentDependencyFactory {
  constructor(
    private readonly config: AppConfig,
    private readonly browser: BrowserPort,
    private readonly llm: LLMPort,
    private readonly findingsRepository: FindingsRepository,
    private readonly eventBus: EventBus,
    private readonly tools: Map<string, Tool>,
    private readonly sessionRepository?: SessionRepository,
    private readonly personaManager?: PersonaManager,
    private readonly humanCallback?: HumanInteractionCallback,
    private readonly progressCallback?: ProgressCallback
  ) {}

  /**
   * Create the full dependency set for an agent.
   */
  createDependencies(): AgentDependencies {
    // Initialize modular services
    const urlDiscovery = new URLDiscoveryService({
      sameOriginOnly: true,
      maxQueueSize: this.config.navigation.maxQueueSize,
    });

    const navigationPlanner = new NavigationPlanner(urlDiscovery);

    const bugDeduplication = new BugDeduplicationService({
      similarityThreshold: this.config.deduplication.threshold,
      enablePatternMatching: this.config.deduplication.patternMatching,
      enableSemanticMatching: this.config.deduplication.semanticMatching,
    });

    const pageContext = new PageExplorationContext({
      maxActionsPerPage: 20,
      maxTimePerPage: 600000,
      requiredTools: this.config.exploration.requiredTools,
      minElementInteractions: 3,
      exitAfterBugsFound: this.config.exploration.exitAfterBugsFound,
    });

    const loopDetection = new LoopDetectionService({
      toolLoopThreshold: 3,
      actionLoopThreshold: 3,
    });

    const findingsProcessor = new FindingsProcessor({
      bugDeduplication,
      pageContext,
    });

    const progressReporter = new ProgressReporter();

    // Check if we need to initialize PersonaManager
    let personaManager = this.personaManager;
    if (!personaManager && this.config.personas.enabled) {
      personaManager = registerDefaultPersonas(undefined, this.config.personas);
    }

    return {
      browser: this.browser,
      llm: this.llm,
      findingsRepository: this.findingsRepository,
      eventBus: this.eventBus,
      tools: this.tools,
      config: this.config,
      personaManager: personaManager,
      sessionRepository: this.sessionRepository,
      humanCallback: this.humanCallback,
      progressCallback: this.progressCallback,
      urlDiscovery,
      navigationPlanner,
      bugDeduplication,
      pageContext,
      loopDetection,
      findingsProcessor,
      progressReporter,
    };
  }

  /**
   * Create configuration for a specific session.
   */
  createSessionConfig(targetUrl: string, objective?: string): ExplorationSessionConfig {
    return {
      targetUrl,
      objective: objective || this.config.exploration.objective,
      maxSteps: this.config.exploration.maxSteps,
      checkpointInterval: this.config.exploration.checkpointInterval,
      minConfidenceThreshold: this.config.llm.minConfidence,
      checkpointOnToolFindings: this.config.exploration.checkpointOnToolFindings,
    };
  }
}
