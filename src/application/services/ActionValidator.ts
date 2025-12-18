/**
 * ActionValidator
 *
 * Validates and filters actions:
 * - Loop detection
 * - Empty URL validation
 * - Tool usage tracking
 * - Action signature creation
 */

import { ActionDecision } from '../../domain/exploration/ActionTypes';
import { LLMPageContext, LLMPort } from '../ports/LLMPort';
import { ExplorationSession } from '../../domain/exploration/ExplorationSession';
import { ToolDefinition } from '../../domain/tools/Tool';
import { URLDiscoveryService } from './URLDiscoveryService';
import { Logger, getLogger } from '../../infrastructure/logging';
import { LOOP_DETECTION, URL_DISCOVERY } from '../config/ExplorationConfig';

export interface ActionValidatorConfig {
  /** Maximum repetitions before forcing alternative */
  actionLoopMaxRepetitions: number;
}

export interface ActionValidatorDeps {
  llm: LLMPort;
  urlDiscovery: URLDiscoveryService;
}

const DEFAULT_CONFIG: ActionValidatorConfig = {
  actionLoopMaxRepetitions: LOOP_DETECTION.DEFAULT_MAX_ACTION_REPETITIONS,
};

/**
 * Validates actions and detects loops.
 */
export class ActionValidator {
  private logger: Logger;
  private config: ActionValidatorConfig;
  private llm: LLMPort;
  private urlDiscovery: URLDiscoveryService;

  // Track tool usage per URL
  private toolUsageByUrl: Map<string, Set<string>> = new Map();

  // Track recent actions for loop detection
  private recentActions: Map<string, number> = new Map();

  constructor(deps: ActionValidatorDeps, config: Partial<ActionValidatorConfig> = {}) {
    this.logger = getLogger('Validation');
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.llm = deps.llm;
    this.urlDiscovery = deps.urlDiscovery;
  }

  /**
   * Validate and potentially fix an action decision.
   * Returns a new decision if the original was invalid.
   */
  async validateAction(
    decision: ActionDecision,
    session: ExplorationSession,
    pageContext: LLMPageContext,
    tools: ToolDefinition[],
    objective: string
  ): Promise<ActionDecision> {
    let validatedDecision = decision;

    // Validate navigate action
    if (validatedDecision.action === 'navigate') {
      validatedDecision = await this.validateNavigateAction(
        validatedDecision,
        session,
        pageContext,
        tools,
        objective
      );
    }

    // Check for tool loop
    if (validatedDecision.action === 'tool' && validatedDecision.toolName) {
      validatedDecision = await this.checkToolLoop(
        validatedDecision,
        session,
        pageContext,
        tools,
        objective
      );
    }

    // Check for action loop
    validatedDecision = await this.checkActionLoop(
      validatedDecision,
      session,
      pageContext,
      tools,
      objective
    );

    return validatedDecision;
  }

  /**
   * Validate navigate action - prevent empty/invalid URLs.
   */
  private async validateNavigateAction(
    decision: ActionDecision,
    session: ExplorationSession,
    pageContext: LLMPageContext,
    tools: ToolDefinition[],
    objective: string
  ): Promise<ActionDecision> {
    if (!decision.value || decision.value.trim() === '') {
      this.logger.info('Invalid navigate action with empty URL, requesting alternative');

      const retryResponse = await this.llm.decideNextAction({
        pageContext,
        history: session.getHistoryForLLM(),
        tools,
        objective: `${objective}\n\nIMPORTANT: Your last navigate action had an empty URL. Please choose a different action.`,
      });

      return retryResponse.decision;
    }

    return decision;
  }

  /**
   * Check for tool loop - prevent calling same tool on same URL.
   */
  private async checkToolLoop(
    decision: ActionDecision,
    session: ExplorationSession,
    pageContext: LLMPageContext,
    _tools: ToolDefinition[],
    objective: string
  ): Promise<ActionDecision> {
    const currentUrl = pageContext.url;
    const urlTools = this.toolUsageByUrl.get(currentUrl) || new Set();

    if (urlTools.has(decision.toolName!)) {
      this.logger.info(
        `Tool '${decision.toolName}' already used on ${currentUrl}, requesting alternative action`
      );

      // Get unvisited URLs to suggest navigation
      const unvisitedUrls = this.urlDiscovery.getUnvisitedURLs();
      const navigationSuggestion =
        unvisitedUrls.length > 0
          ? `\n\nSuggested next URLs to explore:\n${unvisitedUrls
              .slice(0, URL_DISCOVERY.MAX_URLS_TO_SUGGEST)
              .map(u => `- ${u.normalizedUrl} (${u.linkText})`)
              .join('\n')}`
          : '';

      // Request a new decision without tools
      const retryResponse = await this.llm.decideNextAction({
        pageContext,
        history: session.getHistoryForLLM(),
        tools: [], // Remove tools to force navigation/interaction
        objective: `${objective}\n\nIMPORTANT: You already ran all available tools on this page. Please navigate to a new page from the unvisited URLs below or interact with different elements.${navigationSuggestion}`,
      });

      return retryResponse.decision;
    }

    // Mark this tool as used on this URL
    urlTools.add(decision.toolName!);
    this.toolUsageByUrl.set(currentUrl, urlTools);

    return decision;
  }

  /**
   * Check for action loop - prevent repetitive actions.
   */
  private async checkActionLoop(
    decision: ActionDecision,
    session: ExplorationSession,
    pageContext: LLMPageContext,
    tools: ToolDefinition[],
    objective: string
  ): Promise<ActionDecision> {
    const actionSignature = this.getActionSignature(decision);
    const actionCount = this.recentActions.get(actionSignature) || 0;

    if (actionCount >= this.config.actionLoopMaxRepetitions) {
      this.logger.info(
        `Action '${actionSignature}' repeated ${actionCount} times, requesting alternative`
      );

      const retryResponse = await this.llm.decideNextAction({
        pageContext,
        history: session.getHistoryForLLM(),
        tools,
        objective: `${objective}\n\nIMPORTANT: You've tried the same action multiple times. Please choose a DIFFERENT action or navigate to a new page.`,
      });

      this.recentActions.clear(); // Clear to avoid infinite loops
      return retryResponse.decision;
    }

    // Track this action
    this.recentActions.set(actionSignature, actionCount + 1);

    return decision;
  }

  /**
   * Create a unique signature for an action to detect loops.
   */
  getActionSignature(decision: ActionDecision): string {
    const parts: string[] = [decision.action];

    if (decision.selector) {
      parts.push(decision.selector);
    }

    if (decision.value) {
      const normalizedValue = decision.value
        .toLowerCase()
        .replace(/['"]/g, '')
        .substring(0, LOOP_DETECTION.VALUE_SIGNATURE_LENGTH);
      parts.push(normalizedValue);
    }

    if (decision.toolName) {
      parts.push(decision.toolName);
    }

    return parts.join(':');
  }

  /**
   * Clear tracking state for new page.
   */
  clearForNewPage(): void {
    this.recentActions.clear();
  }

  /**
   * Clear all tracking state for new exploration.
   */
  clear(): void {
    this.toolUsageByUrl.clear();
    this.recentActions.clear();
  }
}
