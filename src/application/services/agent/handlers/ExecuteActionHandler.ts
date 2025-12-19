import { BaseStateHandler, StateHandlerResult, AgentDependencies } from '../StateHandler';
import { AgentContext, updateContext, StepResult } from '../AgentContext';
import { ExplorationState } from '../../../../domain/exploration/ExplorationState';
import { ActionDecision } from '../../../ports/LLMPort';
import { Finding } from '../../../../domain/exploration/Finding';
import { ActionExecutionError } from '../../../../domain/errors/AppErrors';

/**
 * Handler for EXECUTING_ACTION state.
 * Executes the decided action in the browser.
 */
export class ExecuteActionHandler extends BaseStateHandler {
  constructor(deps: AgentDependencies) {
    super(deps);
  }

  async handle(context: AgentContext): Promise<StateHandlerResult> {
    try {
      if (!context.decision || !context.llmPageContext) {
        throw new Error('Missing decision or page context');
      }

      const stepStartTime = Date.now();
      const stepResult = await this.executeStep(context.decision, context.llmPageContext);
      const stepDuration = Date.now() - stepStartTime;

      // Record action in page context
      this.deps.pageContext.recordAction(
        context.decision,
        stepResult.success,
        stepResult.error || ''
      );

      // Track the action for progress summaries
      const actionDescription = this.describeAction(context.decision);
      const recentActions = [...context.recentActions, actionDescription];
      if (recentActions.length > 10) recentActions.shift();

      // If navigation occurred, wait for page load and scan for URLs
      if (
        context.decision.action === 'navigate' ||
        context.decision.action === 'click' ||
        stepResult.resultingUrl !== context.llmPageContext.url
      ) {
        await this.wait(this.deps.config.navigation.waitTime);

        // Mark new URL as visited
        const visitedUrls = new Set(context.visitedUrls);
        visitedUrls.add(stepResult.resultingUrl);

        // Record the step
        await context.session.recordStep(
          context.decision,
          stepResult.success,
          stepResult.resultingUrl,
          stepDuration,
          stepResult.error
        );

        const updatedContext = updateContext(context, {
          stepResult,
          recentActions,
          visitedUrls,
          findings: [...context.findings, ...stepResult.findings],
        });

        return this.result(updatedContext, ExplorationState.PROCESSING_FINDINGS);
      }

      // Record the step
      await context.session.recordStep(
        context.decision,
        stepResult.success,
        stepResult.resultingUrl,
        stepDuration,
        stepResult.error
      );

      const updatedContext = updateContext(context, {
        stepResult,
        recentActions,
        findings: [...context.findings, ...stepResult.findings],
      });

      return this.result(updatedContext, ExplorationState.PROCESSING_FINDINGS);
    } catch (error) {
      const actionError =
        error instanceof Error
          ? new ActionExecutionError(context.decision?.action || 'unknown', error.message)
          : new ActionExecutionError(context.decision?.action || 'unknown', String(error));
      return this.errorResult(context, actionError);
    }
  }

  /**
   * Execute a single exploration step.
   */
  private async executeStep(
    decision: ActionDecision,
    _pageContext: import('../../../ports/LLMPort').LLMPageContext
  ): Promise<StepResult> {
    const findings: Finding[] = [];
    let success = true;
    let error: string | undefined;

    try {
      switch (decision.action) {
        case 'navigate':
          if (decision.value) {
            const result = await this.deps.browser.navigate(decision.value);
            success = result.success;
            error = result.error;
          }
          break;

        case 'click':
          if (decision.selector) {
            const result = await this.deps.browser.click(decision.selector);
            success = result.success;
            error = result.error;
          }
          break;

        case 'fill':
          if (decision.selector && decision.value) {
            const result = await this.deps.browser.fill(decision.selector, decision.value);
            success = result.success;
            error = result.error;
          }
          break;

        case 'select':
          if (decision.selector && decision.value) {
            const result = await this.deps.browser.select(decision.selector, decision.value);
            success = result.success;
            error = result.error;
          }
          break;

        case 'hover':
          if (decision.selector) {
            const result = await this.deps.browser.hover(decision.selector);
            success = result.success;
            error = result.error;
          }
          break;

        case 'scroll':
          await this.deps.browser.evaluate(
            (amount: number) => window.scrollBy(0, amount),
            this.deps.config.navigation.scrollAmount
          );
          break;

        case 'back':
          await this.deps.browser.goBack();
          break;

        case 'refresh':
          await this.deps.browser.refresh();
          break;

        case 'tool':
          if (decision.toolName) {
            const tool = this.deps.tools.get(decision.toolName);
            if (tool) {
              const toolContext = {
                browser: this.deps.browser,
                currentUrl: await this.deps.browser.getCurrentUrl(),
              };
              const toolResult = await tool.execute({}, toolContext);
              // Tool results are in data property - extract findings if available
              const toolData = toolResult.data as
                | { findings?: import('../../../../domain/exploration/Finding').Finding[] }
                | undefined;
              if (toolData?.findings) {
                findings.push(...toolData.findings);
              }
            }
          }
          break;
      }
    } catch (e) {
      success = false;
      error = e instanceof Error ? e.message : String(e);
    }

    return {
      success,
      error,
      resultingUrl: await this.deps.browser.getCurrentUrl(),
      findings,
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
      case 'fill': {
        const val = decision.value || '';
        const displayVal = val.length > 20 ? val.substring(0, 20) + '...' : val;
        return `Fill ${decision.selector} with "${displayVal}"`;
      }
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
}
