import { BaseStateHandler, StateHandlerResult, AgentDependencies } from '../StateHandler';
import { AgentContext, updateContext } from '../AgentContext';
import { ExplorationState } from '../../../../domain/exploration/ExplorationState';
import { PersonaAnalysis } from '../../../../domain/personas';

/**
 * Suggestion queue item from personas.
 */
export interface SuggestionQueueItem {
  personaName: string;
  action: Partial<import('../../../ports/LLMPort').ActionDecision>;
  reasoning: string;
  targetUrl: string;
  priority: number;
}

/**
 * Handler for COLLECTING_SUGGESTIONS state.
 * Collects suggestions from personas if enabled.
 */
export class CollectSuggestionsHandler extends BaseStateHandler {
  private suggestionQueue: SuggestionQueueItem[] = [];

  constructor(deps: AgentDependencies) {
    super(deps);
  }

  async handle(context: AgentContext): Promise<StateHandlerResult> {
    try {
      if (!context.llmPageContext) {
        throw new Error('Missing page context - EXTRACTING_PAGE must run first');
      }

      let personaAnalysis: PersonaAnalysis[] | null = null;

      // Collect persona suggestions if enabled
      if (this.deps.personaManager) {
        personaAnalysis = this.deps.personaManager.collectSuggestions(context.llmPageContext, []);

        // Update suggestion queue
        this.updateSuggestionQueue(personaAnalysis, context.llmPageContext.url);
      }

      const updatedContext = updateContext(context, {
        personaAnalysis,
      });

      return this.result(updatedContext, ExplorationState.GETTING_LLM_DECISION);
    } catch (error) {
      return this.errorResult(context, error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Add suggestions to the queue, limiting per persona and prioritizing by current page.
   */
  private updateSuggestionQueue(personaAnalyses: PersonaAnalysis[], currentUrl: string): void {
    this.suggestionQueue = [];
    const maxSuggestionsPerPersona = this.deps.config.personas.maxSuggestions ?? 5;

    for (const analysis of personaAnalyses) {
      if (!analysis.isRelevant) continue;

      const limitedSuggestions = analysis.suggestions
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, maxSuggestionsPerPersona);

      for (const suggestion of limitedSuggestions) {
        const targetUrl =
          suggestion.action.value && suggestion.action.action === 'navigate'
            ? suggestion.action.value
            : currentUrl;

        const samePage = targetUrl === currentUrl;
        const priority = samePage
          ? suggestion.confidence * 10 + (analysis.suggestions.indexOf(suggestion) < 3 ? 5 : 0)
          : suggestion.confidence;

        this.suggestionQueue.push({
          personaName: analysis.personaName,
          action: suggestion.action,
          reasoning: suggestion.reasoning,
          targetUrl,
          priority,
        });
      }
    }

    this.suggestionQueue.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Get suggestion queue for external access.
   */
  getSuggestionQueue(): SuggestionQueueItem[] {
    return this.suggestionQueue;
  }
}
