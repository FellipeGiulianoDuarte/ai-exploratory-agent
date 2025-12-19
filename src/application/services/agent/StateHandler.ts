import { AgentContext } from './AgentContext';
import { ExplorationState } from '../../../domain/exploration/ExplorationState';

/**
 * Result from a state handler execution.
 */
export interface StateHandlerResult {
  /** Updated context after handler execution */
  context: AgentContext;
  /** Next state to transition to */
  nextState: ExplorationState;
}

/**
 * Interface for state handlers.
 * Each handler processes a specific state in the exploration state machine.
 */
export interface StateHandler {
  /**
   * Handle the current state and return the next state with updated context.
   */
  handle(context: AgentContext): Promise<StateHandlerResult>;
}

/**
 * Dependencies injected into state handlers.
 */
export interface AgentDependencies {
  browser: import('../../ports/BrowserPort').BrowserPort;
  llm: import('../../ports/LLMPort').LLMPort;
  findingsRepository: import('../../ports/FindingsRepository').FindingsRepository;
  eventBus: import('../../../domain/events/DomainEvent').EventBus;
  tools: Map<string, import('../../../domain/tools/Tool').Tool>;
  config: import('../../../domain/config/AppConfig').AppConfig;

  // Optional services
  personaManager?: import('../../../domain/personas').PersonaManager;
  sessionRepository?: import('../../ports/SessionRepository').SessionRepository;
  humanCallback?: import('../../ports/ExplorationTypes').HumanInteractionCallback;
  progressCallback?: import('../../ports/ExplorationTypes').ProgressCallback;

  // Helper services
  urlDiscovery: import('../URLDiscoveryService').URLDiscoveryService;
  navigationPlanner: import('../NavigationPlanner').NavigationPlanner;
  bugDeduplication: import('../BugDeduplicationService').BugDeduplicationService;
  pageContext: import('../PageExplorationContext').PageExplorationContext;
  loopDetection: import('../LoopDetectionService').LoopDetectionService;
  findingsProcessor: import('../FindingsProcessor').FindingsProcessor;
  progressReporter: import('../ProgressReporter').ProgressReporter;
}

/**
 * Abstract base class for state handlers.
 * Provides common functionality and dependencies.
 */
export abstract class BaseStateHandler implements StateHandler {
  constructor(protected readonly deps: AgentDependencies) {}

  abstract handle(context: AgentContext): Promise<StateHandlerResult>;

  /**
   * Helper to create a result with state transition.
   */
  protected result(context: AgentContext, nextState: ExplorationState): StateHandlerResult {
    return { context: { ...context, currentState: nextState }, nextState };
  }

  /**
   * Helper to create an error result.
   */
  protected errorResult(context: AgentContext, error: Error): StateHandlerResult {
    return {
      context: {
        ...context,
        currentState: ExplorationState.ERROR,
        error,
        shouldExit: true,
        exitReason: 'error',
      },
      nextState: ExplorationState.ERROR,
    };
  }

  /**
   * Helper to wait for a specified time.
   */
  protected async wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
