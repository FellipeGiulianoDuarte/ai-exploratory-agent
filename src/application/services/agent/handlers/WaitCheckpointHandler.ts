import { BaseStateHandler, StateHandlerResult, AgentDependencies } from '../StateHandler';
import { AgentContext, updateContext } from '../AgentContext';
import { ExplorationState } from '../../../../domain/exploration/ExplorationState';

/**
 * Handler for WAITING_CHECKPOINT state.
 * Waits for human input at checkpoints.
 */
export class WaitCheckpointHandler extends BaseStateHandler {
  constructor(deps: AgentDependencies) {
    super(deps);
  }

  async handle(context: AgentContext): Promise<StateHandlerResult> {
    try {
      if (!context.checkpointReason) {
        // No checkpoint needed, continue
        return this.result(context, ExplorationState.VALIDATING_DECISION);
      }

      if (!this.deps.humanCallback) {
        // No human callback, continue without checkpoint
        const updatedContext = updateContext(context, {
          checkpointReason: null,
          waitingForHuman: false,
        });
        return this.result(updatedContext, ExplorationState.VALIDATING_DECISION);
      }

      // Trigger checkpoint in session
      await context.session.triggerCheckpoint(
        context.checkpointReason as import('../../../../domain/exploration/ExplorationSession').CheckpointReason
      );

      // Auto-save session at checkpoint
      if (this.deps.sessionRepository) {
        await this.deps.sessionRepository.save(context.session);
        this.deps.progressReporter.printSessionSaved(context.session.id, 'checkpoint');
      }

      // Get human guidance
      const guidance = await this.deps.humanCallback.onCheckpoint(
        context.session,
        context.checkpointReason as import('../../../../domain/exploration/ExplorationSession').CheckpointReason,
        context.decision || undefined
      );

      // Apply guidance
      await context.session.applyGuidance(guidance);

      // Check if user wants to stop
      if (guidance.action === 'stop') {
        const updatedContext = updateContext(context, {
          shouldExit: true,
          exitReason: 'stopped_by_user',
          checkpointReason: null,
          waitingForHuman: false,
        });
        return this.result(updatedContext, ExplorationState.DONE);
      }

      // Clear checkpoint state and continue
      const updatedContext = updateContext(context, {
        checkpointReason: null,
        waitingForHuman: false,
      });

      return this.result(updatedContext, ExplorationState.VALIDATING_DECISION);
    } catch (error) {
      return this.errorResult(context, error instanceof Error ? error : new Error(String(error)));
    }
  }
}
