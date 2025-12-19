import { BaseStateHandler, StateHandlerResult, AgentDependencies } from '../StateHandler';
import { AgentContext } from '../AgentContext';
import { ExplorationState } from '../../../../domain/exploration/ExplorationState';

/**
 * Handler for PROCESSING_FINDINGS state.
 * Processes and saves findings from step execution.
 */
export class ProcessFindingsHandler extends BaseStateHandler {
  constructor(deps: AgentDependencies) {
    super(deps);
  }

  async handle(context: AgentContext): Promise<StateHandlerResult> {
    try {
      if (!context.stepResult || !context.llmPageContext || !context.decision) {
        throw new Error('Missing step result, page context, or decision');
      }

      // Process findings from step (tool results)
      for (const finding of context.stepResult.findings) {
        const duplicateId = this.deps.bugDeduplication.isDuplicate(
          finding.title,
          context.llmPageContext.url
        );

        if (!duplicateId) {
          await this.deps.findingsRepository.save(finding);
          context.session.addFinding(finding.id);
          this.deps.bugDeduplication.registerBug(
            finding.id,
            finding.title,
            finding.description,
            finding.severity,
            context.llmPageContext.url,
            this.deps.pageContext.getStepsToReproduce()
          );
          this.deps.pageContext.recordBugFound();
        }
      }

      // Check for observed issues in the decision
      if (context.decision.observedIssues && context.decision.observedIssues.length > 0) {
        const processedFindings = this.deps.findingsProcessor.processObservedIssues(
          context.decision,
          context.session.id,
          context.session.currentStep,
          context.llmPageContext
        );

        for (const processed of processedFindings) {
          if (!processed.isDuplicate) {
            await this.deps.findingsRepository.save(processed.finding);
            context.session.addFinding(processed.finding.id);
            this.deps.pageContext.recordBugFound();
          }
        }
      }

      // Print progress summary at intervals
      if (
        context.session.currentStep > 0 &&
        context.session.currentStep %
          (this.deps.config.exploration.progressSummaryInterval ?? 5) ===
          0
      ) {
        this.printProgressSummary(context);

        // Periodic auto-save
        if (this.deps.sessionRepository) {
          await this.deps.sessionRepository.save(context.session);
          this.deps.progressReporter.printSessionSaved(context.session.id, 'auto');
        }
      }

      return this.result(context, ExplorationState.CHECKING_EXIT);
    } catch (error) {
      return this.errorResult(context, error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Print progress summary.
   */
  private printProgressSummary(context: AgentContext): void {
    if (!context.llmPageContext) return;

    if (this.deps.progressCallback) {
      this.deps.progressCallback.onProgress({
        currentStep: context.session.currentStep,
        totalSteps: this.deps.config.exploration.maxSteps,
        currentUrl: context.llmPageContext.url,
        pagesVisited: Array.from(context.visitedUrls),
        findingsCount: context.session.findingIds.length,
        recentActions: context.recentActions,
        plannedActions: [],
        personaSuggestionQueue: [],
      });
    } else {
      this.deps.progressReporter.printProgressSummary(
        context.session.currentStep,
        this.deps.config.exploration.maxSteps,
        {
          url: context.llmPageContext.url,
          pagesVisited: context.visitedUrls.size,
          findings: context.session.findingIds.length,
          recentActions: context.recentActions.slice(-3),
        },
        [],
        []
      );
    }
  }
}
