import { BaseStateHandler, StateHandlerResult, AgentDependencies } from '../StateHandler';
import { AgentContext, updateContext } from '../AgentContext';
import { ExplorationState } from '../../../../domain/exploration/ExplorationState';
import { ToolDefinition } from '../../../../domain/tools/Tool';

/**
 * Handler for GETTING_LLM_DECISION state.
 * Requests next action decision from LLM with retry logic.
 */
export class GetDecisionHandler extends BaseStateHandler {
  constructor(deps: AgentDependencies) {
    super(deps);
  }

  async handle(context: AgentContext): Promise<StateHandlerResult> {
    try {
      if (!context.llmPageContext) {
        throw new Error('Missing page context');
      }

      // Check max steps before getting decision
      if (context.session.hasReachedMaxSteps()) {
        const updatedContext = updateContext(context, {
          shouldExit: true,
          exitReason: 'max_steps_reached',
        });
        return this.result(updatedContext, ExplorationState.DONE);
      }

      // Get URL queue context for LLM
      const urlQueueContext = this.deps.navigationPlanner.getPlanContextForLLM();

      // Get already reported bugs summary for LLM
      const reportedBugsSummary = this.deps.bugDeduplication.getReportedBugsSummary();

      // Get LLM decision with retry logic
      const llmResponse = await this.executeWithRetry(
        () =>
          this.deps.llm.decideNextAction({
            pageContext: context.llmPageContext!,
            history: context.session.getHistoryForLLM(),
            tools: this.getToolDefinitions(),
            objective: context.session.config.objective,
            personaAnalysis: context.personaAnalysis || undefined,
            urlQueueContext,
            reportedBugsSummary,
          }),
        3,
        1000
      );

      // Track token usage
      const tokenUsage = {
        promptTokens: context.tokenUsage.promptTokens + llmResponse.usage.promptTokens,
        completionTokens: context.tokenUsage.completionTokens + llmResponse.usage.completionTokens,
        totalTokens: context.tokenUsage.totalTokens + llmResponse.usage.totalTokens,
      };

      const decision = llmResponse.decision;

      // Check if LLM says we're done
      if (decision.action === 'done') {
        const updatedContext = updateContext(context, {
          decision,
          tokenUsage,
          shouldExit: true,
          exitReason: 'completed',
        });
        return this.result(updatedContext, ExplorationState.DONE);
      }

      // Check if checkpoint is needed
      const checkpointReason = context.session.shouldCheckpoint(decision);
      if (checkpointReason && this.deps.humanCallback) {
        const updatedContext = updateContext(context, {
          decision,
          originalDecision: decision,
          tokenUsage,
          checkpointReason,
          waitingForHuman: true,
        });
        return this.result(updatedContext, ExplorationState.WAITING_CHECKPOINT);
      }

      const updatedContext = updateContext(context, {
        decision,
        originalDecision: decision,
        tokenUsage,
      });

      return this.result(updatedContext, ExplorationState.VALIDATING_DECISION);
    } catch (error) {
      return this.errorResult(context, error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Get tool definitions for LLM.
   */
  private getToolDefinitions(): ToolDefinition[] {
    return Array.from(this.deps.tools.values()).map(tool => tool.getDefinition());
  }

  /**
   * Execute with retry logic.
   */
  private async executeWithRetry<T>(
    fn: () => Promise<T>,
    maxRetries: number,
    initialDelay: number
  ): Promise<T> {
    let lastError: Error | null = null;
    let delay = initialDelay;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < maxRetries) {
          await this.wait(delay);
          delay *= 2; // Exponential backoff
        }
      }
    }

    throw lastError;
  }
}
