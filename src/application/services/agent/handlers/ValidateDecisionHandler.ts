import { BaseStateHandler, StateHandlerResult, AgentDependencies } from '../StateHandler';
import { AgentContext, updateContext } from '../AgentContext';
import { ExplorationState } from '../../../../domain/exploration/ExplorationState';
import { ActionDecision } from '../../../ports/LLMPort';

/**
 * Handler for VALIDATING_DECISION state.
 * Validates and potentially modifies LLM decision (loop detection, URL validation).
 */
export class ValidateDecisionHandler extends BaseStateHandler {
  private toolUsageByUrl: Map<string, Set<string>> = new Map();

  constructor(deps: AgentDependencies) {
    super(deps);
  }

  async handle(context: AgentContext): Promise<StateHandlerResult> {
    try {
      if (!context.decision || !context.llmPageContext) {
        throw new Error('Missing decision or page context');
      }

      let decision = { ...context.decision };
      const currentUrl = context.llmPageContext.url;

      // Check exit criteria for current page
      const exitCriteria = this.deps.pageContext.evaluateExitCriteria();
      if (exitCriteria.shouldExit && context.stepsOnCurrentUrl > 2) {
        this.deps.progressReporter.printExitCriteria(exitCriteria.reason);

        const unvisitedUrls = this.deps.urlDiscovery.getUnvisitedURLs();
        if (unvisitedUrls.length > 0) {
          const targetUrl = this.findPriorityUrl(unvisitedUrls);
          decision = {
            action: 'navigate',
            value: targetUrl.normalizedUrl,
            reasoning: `Exit criteria met. Moving to: ${targetUrl.linkText || targetUrl.normalizedUrl}`,
            confidence: 0.8,
          };
        }
      }

      // Validate navigate action - prevent empty/invalid URLs
      if (decision.action === 'navigate') {
        if (!decision.value || decision.value.trim() === '') {
          this.deps.progressReporter.printNavigationValidation('', false, 'empty URL');
          decision = await this.requestAlternativeDecision(
            context,
            'Your last navigate action had an empty URL. Please choose a different action.'
          );
        }
      }

      // Validate fill/select action - prevent empty values
      if ((decision.action === 'fill' || decision.action === 'select') && !decision.value) {
        decision = await this.requestAlternativeDecision(
          context,
          `Your last ${decision.action} action on ${decision.selector} had no value. Please provide a value.`
        );
      }

      // Loop detection: prevent calling the same tool on the same URL
      if (decision.action === 'tool' && decision.toolName) {
        const urlTools = this.toolUsageByUrl.get(currentUrl) || new Set();

        if (urlTools.has(decision.toolName)) {
          this.deps.progressReporter.printLoopDetected('tool', decision.toolName, 1);
          decision = await this.requestNavigationDecision(context);
        } else {
          urlTools.add(decision.toolName);
          this.toolUsageByUrl.set(currentUrl, urlTools);
        }
      }

      // Action loop detection
      this.deps.loopDetection.recordAction(decision);
      const loopResult = this.deps.loopDetection.detectLoop(decision);

      if (loopResult.isLoop) {
        this.deps.progressReporter.printLoopDetected(
          loopResult.type || 'action',
          loopResult.pattern || 'unknown',
          loopResult.count || 0
        );

        decision = await this.requestAlternativeDecision(
          context,
          "You've tried the same action multiple times. Please choose a DIFFERENT action."
        );
        this.deps.loopDetection.resetActionHistory();
      }

      const updatedContext = updateContext(context, { decision });
      return this.result(updatedContext, ExplorationState.EXECUTING_ACTION);
    } catch (error) {
      return this.errorResult(context, error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Find highest priority URL from unvisited list.
   */
  private findPriorityUrl(
    urls: Array<{ normalizedUrl: string; linkText?: string; category?: string }>
  ) {
    const priorityOrder = ['auth', 'product', 'cart', 'user', 'info', 'other'];
    for (const category of priorityOrder) {
      const found = urls.find(u => u.category === category);
      if (found) return found;
    }
    return urls[0];
  }

  /**
   * Request alternative decision from LLM.
   */
  private async requestAlternativeDecision(
    context: AgentContext,
    instruction: string
  ): Promise<ActionDecision> {
    const response = await this.deps.llm.decideNextAction({
      pageContext: context.llmPageContext!,
      history: context.session.getHistoryForLLM(),
      tools: Array.from(this.deps.tools.values()).map(t => t.getDefinition()),
      objective: `${context.session.config.objective}\n\nIMPORTANT: ${instruction}`,
    });
    return response.decision;
  }

  /**
   * Request navigation-focused decision from LLM.
   */
  private async requestNavigationDecision(context: AgentContext): Promise<ActionDecision> {
    const unvisitedUrls = this.deps.urlDiscovery.getUnvisitedURLs();
    const navigationSuggestion =
      unvisitedUrls.length > 0
        ? `\n\nSuggested URLs:\n${unvisitedUrls
            .slice(0, 5)
            .map(u => `- ${u.normalizedUrl} (${u.linkText})`)
            .join('\n')}`
        : '';

    const response = await this.deps.llm.decideNextAction({
      pageContext: context.llmPageContext!,
      history: context.session.getHistoryForLLM(),
      tools: [], // Remove tools to force navigation
      objective: `${context.session.config.objective}\n\nIMPORTANT: All tools used on this page. Navigate to a new page.${navigationSuggestion}`,
    });
    return response.decision;
  }

  /**
   * Reset tool usage tracking (for new exploration).
   */
  resetToolUsage(): void {
    this.toolUsageByUrl.clear();
  }
}
