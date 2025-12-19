import { BaseStateHandler, StateHandlerResult, AgentDependencies } from '../StateHandler';
import { AgentContext, updateContext } from '../AgentContext';
import { ExplorationState } from '../../../../domain/exploration/ExplorationState';
import { LLMPageContext } from '../../../ports/LLMPort';
import { PageExtractError } from '../../../../domain/errors/AppErrors';

/**
 * Handler for EXTRACTING_PAGE state.
 * Extracts current page state from browser and builds LLM context.
 */
export class ExtractPageHandler extends BaseStateHandler {
  constructor(deps: AgentDependencies) {
    super(deps);
  }

  async handle(context: AgentContext): Promise<StateHandlerResult> {
    try {
      // Get current page state from browser
      const pageState = await this.deps.browser.extractPageState();

      // Build LLM-friendly page context
      const llmPageContext = this.buildPageContext(pageState);

      // Track visited URL
      const visitedUrls = new Set(context.visitedUrls);
      visitedUrls.add(llmPageContext.url);

      // Check if URL changed - reset steps counter
      let stepsOnCurrentUrl = context.stepsOnCurrentUrl;
      let lastUrl = context.lastUrl;

      // Check if URL changed - reset steps counter
      // Use loose comparison to avoid resetting on minor changes (trailing slash, etc)
      const urlChanged = !this.areUrlsEquivalent(llmPageContext.url, context.lastUrl || '');

      if (urlChanged) {
        if (context.lastUrl) {
          // Log exit from previous page
          this.deps.progressReporter.printPageContextChange(
            context.lastUrl,
            llmPageContext.url,
            'exit'
          );
        }

        // Start fresh context for new page
        const pageTitle = await this.deps.browser.getTitle();
        this.deps.pageContext.startNewPage(llmPageContext.url, pageTitle);
        this.deps.loopDetection.resetActionHistory();
        stepsOnCurrentUrl = 0;
        lastUrl = llmPageContext.url;

        this.deps.progressReporter.printPageContextChange(null, llmPageContext.url, 'start');
      } else {
        stepsOnCurrentUrl++;
      }

      // Update context with extracted page data
      const updatedContext = updateContext(context, {
        pageState,
        llmPageContext,
        visitedUrls,
        stepsOnCurrentUrl,
        lastUrl,
      });

      return this.result(updatedContext, ExplorationState.COLLECTING_SUGGESTIONS);
    } catch (error) {
      const pageError =
        error instanceof Error
          ? new PageExtractError(error.message, error)
          : new PageExtractError(String(error));
      return this.errorResult(context, pageError);
    }
  }

  /**
   * Build page context for LLM from PageState.
   */
  private buildPageContext(
    pageState: import('../../../../domain/browser/PageState').PageState
  ): LLMPageContext {
    return {
      url: pageState.url,
      title: pageState.title,
      visibleText:
        pageState.visibleText?.substring(0, this.deps.config.pageAnalysis.maxVisibleText) || '',
      elements: pageState.interactiveElements
        .slice(0, this.deps.config.pageAnalysis.maxInteractiveElements)
        .map((el: { selector: string; type: string; text?: string; isVisible: boolean }) => ({
          selector: el.selector,
          type: el.type,
          text: el.text || '',
          isVisible: el.isVisible,
        })),
      consoleErrors: pageState.consoleErrors || [],
      networkErrors: pageState.networkErrors || [],
      elementInteractions: this.deps.pageContext.getInteractions(),
    };
  }

  /**
   * Check if two URLs are equivalent (ignoring trailing slashes).
   */
  private areUrlsEquivalent(url1: string, url2: string): boolean {
    if (url1 === url2) return true;

    // Normalize string: lower case, remove trailing slash
    const normalize = (u: string) => {
      let normalized = u.toLowerCase();
      if (normalized.endsWith('/')) {
        normalized = normalized.slice(0, -1);
      }
      return normalized;
    };

    return normalize(url1) === normalize(url2);
  }
}
