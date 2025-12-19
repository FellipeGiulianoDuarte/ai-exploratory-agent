import {
  ExplorationState,
  isTerminalState,
  isValidTransition,
} from '../../../domain/exploration/ExplorationState';
import { AgentContext, createInitialContext } from './AgentContext';
import {
  StateHandler,
  AgentDependencies,
  BaseStateHandler,
  StateHandlerResult,
} from './StateHandler';
import {
  ExtractPageHandler,
  CollectSuggestionsHandler,
  GetDecisionHandler,
  ValidateDecisionHandler,
  ExecuteActionHandler,
  ProcessFindingsHandler,
  CheckExitHandler,
  WaitCheckpointHandler,
} from './handlers';
import { ExplorationSession } from '../../../domain/exploration/ExplorationSession';

/**
 * Handler for INIT state - transitions to EXTRACTING_PAGE.
 */
class InitHandler extends BaseStateHandler {
  async handle(context: AgentContext): Promise<StateHandlerResult> {
    return this.result(context, ExplorationState.EXTRACTING_PAGE);
  }
}

/**
 * Exploration State Machine.
 * Manages state transitions and delegates to appropriate handlers.
 */
export class ExplorationStateMachine {
  private state: ExplorationState = ExplorationState.INIT;
  private readonly stateHandlers: Map<ExplorationState, StateHandler>;

  constructor(deps: AgentDependencies) {
    this.stateHandlers = new Map<ExplorationState, StateHandler>([
      [ExplorationState.INIT, new InitHandler(deps)],
      [ExplorationState.EXTRACTING_PAGE, new ExtractPageHandler(deps)],
      [ExplorationState.COLLECTING_SUGGESTIONS, new CollectSuggestionsHandler(deps)],
      [ExplorationState.GETTING_LLM_DECISION, new GetDecisionHandler(deps)],
      [ExplorationState.VALIDATING_DECISION, new ValidateDecisionHandler(deps)],
      [ExplorationState.EXECUTING_ACTION, new ExecuteActionHandler(deps)],
      [ExplorationState.PROCESSING_FINDINGS, new ProcessFindingsHandler(deps)],
      [ExplorationState.CHECKING_EXIT, new CheckExitHandler(deps)],
      [ExplorationState.WAITING_CHECKPOINT, new WaitCheckpointHandler(deps)],
    ]);
  }

  /**
   * Execute a single state transition.
   */
  async step(context: AgentContext): Promise<AgentContext> {
    const handler = this.stateHandlers.get(this.state);

    if (!handler) {
      throw new Error(`No handler registered for state: ${this.state}`);
    }

    const result = await handler.handle(context);

    // Validate transition
    if (!isValidTransition(this.state, result.nextState)) {
      throw new Error(`Invalid state transition: ${this.state} -> ${result.nextState}`);
    }

    this.state = result.nextState;
    return result.context;
  }

  /**
   * Run the state machine until terminal state.
   */
  async run(context: AgentContext): Promise<AgentContext> {
    let currentContext = context;

    while (!this.isTerminal()) {
      currentContext = await this.step(currentContext);

      // Check for external exit signal
      if (currentContext.shouldExit) {
        break;
      }
    }

    return currentContext;
  }

  /**
   * Get current state.
   */
  get currentState(): ExplorationState {
    return this.state;
  }

  /**
   * Check if in terminal state.
   */
  isTerminal(): boolean {
    return isTerminalState(this.state);
  }

  /**
   * Reset state machine to initial state.
   */
  reset(): void {
    this.state = ExplorationState.INIT;
  }

  /**
   * Create initial context for exploration.
   */
  static createContext(agentId: string, session: ExplorationSession): AgentContext {
    return createInitialContext(agentId, session);
  }
}
