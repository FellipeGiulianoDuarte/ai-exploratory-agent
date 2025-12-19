import { BaseStateHandler, StateHandlerResult, AgentDependencies } from '../StateHandler';
import { AgentContext, updateContext } from '../AgentContext';
import { ExplorationState } from '../../../../domain/exploration/ExplorationState';

/**
 * Handler for CHECKING_EXIT state.
 * Checks if exploration should continue or exit.
 */
export class CheckExitHandler extends BaseStateHandler {
  constructor(deps: AgentDependencies) {
    super(deps);
  }

  async handle(context: AgentContext): Promise<StateHandlerResult> {
    try {
      // Check if max steps reached
      if (context.session.hasReachedMaxSteps()) {
        const updatedContext = updateContext(context, {
          shouldExit: true,
          exitReason: 'max_steps_reached',
        });
        return this.result(updatedContext, ExplorationState.DONE);
      }

      // Check if session was stopped
      if (!context.session.isRunning && !context.session.isPaused) {
        const updatedContext = updateContext(context, {
          shouldExit: true,
          exitReason: context.session.hasEnded ? 'stopped_by_user' : 'completed',
        });
        return this.result(updatedContext, ExplorationState.DONE);
      }

      // Clear state for next iteration
      const updatedContext = updateContext(context, {
        pageState: null,
        llmPageContext: null,
        personaAnalysis: null,
        decision: null,
        originalDecision: null,
        stepResult: null,
      });

      // Continue to next iteration
      return this.result(updatedContext, ExplorationState.EXTRACTING_PAGE);
    } catch (error) {
      return this.errorResult(context, error instanceof Error ? error : new Error(String(error)));
    }
  }
}
