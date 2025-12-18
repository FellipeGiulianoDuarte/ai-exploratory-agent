/**
 * ActionExecutor
 *
 * Handles execution of browser actions:
 * - Navigate, click, fill, select, hover, scroll, back, refresh
 * - Tool execution
 * - Console error detection
 */

import { BrowserPort } from '../ports/BrowserPort';
import { LLMPageContext } from '../ports/LLMPort';
import { ActionDecision } from '../../domain/exploration/ActionTypes';
import { Finding } from '../../domain/exploration/Finding';
import { ExplorationSession } from '../../domain/exploration/ExplorationSession';
import { Tool, ToolContext } from '../../domain/tools/Tool';
import { Logger, getLogger } from '../../infrastructure/logging';

export interface ActionResult {
  success: boolean;
  error?: string;
  resultingUrl: string;
  findings: Finding[];
}

export interface ActionExecutorDeps {
  browser: BrowserPort;
  tools: Map<string, Tool>;
}

/**
 * Executes browser actions for exploration.
 */
export class ActionExecutor {
  private logger: Logger;
  private browser: BrowserPort;
  private tools: Map<string, Tool>;

  constructor(deps: ActionExecutorDeps) {
    this.logger = getLogger('ActionExecutor');
    this.browser = deps.browser;
    this.tools = deps.tools;
  }

  /**
   * Execute a single exploration action.
   */
  async executeAction(
    session: ExplorationSession,
    decision: ActionDecision,
    pageContext: LLMPageContext
  ): Promise<ActionResult> {
    const findings: Finding[] = [];
    let success = true;
    let error: string | undefined;

    try {
      switch (decision.action) {
        case 'navigate':
          if (decision.value) {
            const result = await this.browser.navigate(decision.value);
            success = result.success;
            error = result.error;
          }
          break;

        case 'click':
          if (decision.selector) {
            const result = await this.browser.click(decision.selector);
            success = result.success;
            error = result.error;
          }
          break;

        case 'fill':
          if (decision.selector && decision.value) {
            const result = await this.browser.fill(decision.selector, decision.value);
            success = result.success;
            error = result.error;
          }
          break;

        case 'select':
          if (decision.selector && decision.value) {
            const result = await this.browser.select(decision.selector, decision.value);
            success = result.success;
            error = result.error;
          }
          break;

        case 'hover':
          if (decision.selector) {
            const result = await this.browser.hover(decision.selector);
            success = result.success;
            error = result.error;
          }
          break;

        case 'scroll':
          await this.browser.evaluate(() => window.scrollBy(0, 500));
          break;

        case 'back':
          await this.browser.goBack();
          break;

        case 'refresh':
          await this.browser.refresh();
          break;

        case 'tool':
          if (decision.toolName) {
            const toolFindings = await this.executeTool(
              session,
              decision.toolName,
              decision.toolParams || {},
              pageContext
            );
            findings.push(...toolFindings);
          }
          break;
      }

      // Check for new console errors after action
      const newPageState = await this.browser.extractPageState();
      const newConsoleErrors = newPageState.consoleErrors.filter(
        err => !pageContext.consoleErrors.includes(err)
      );

      if (newConsoleErrors.length > 0) {
        const consoleFinding = Finding.fromConsoleErrors(
          session.id,
          session.currentStep + 1,
          newPageState.url,
          newPageState.title,
          newConsoleErrors
        );
        findings.push(consoleFinding);
      }

      const resultingUrl = await this.browser.getCurrentUrl();

      return {
        success,
        error,
        resultingUrl,
        findings,
      };
    } catch (err) {
      const resultingUrl = await this.browser.getCurrentUrl();
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        resultingUrl,
        findings,
      };
    }
  }

  /**
   * Execute a tool and return any findings.
   */
  private async executeTool(
    session: ExplorationSession,
    toolName: string,
    params: Record<string, unknown>,
    pageContext: LLMPageContext
  ): Promise<Finding[]> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      this.logger.warn(`Tool not found: ${toolName}`);
      return [];
    }

    const context: ToolContext = {
      browser: this.browser,
      currentUrl: pageContext.url,
    };

    const result = await tool.execute(params, context);
    const findings: Finding[] = [];

    if (result.success && result.data) {
      // Handle broken image detector results
      if (toolName === 'broken_image_detector') {
        const data = result.data as {
          brokenImages: Array<{ src: string; reason: string }>;
          totalImages: number;
        };
        if (data.brokenImages && data.brokenImages.length > 0) {
          const details = data.brokenImages.map(img => `${img.src}: ${img.reason}`).join('\n');
          const finding = Finding.fromBrokenImages(
            session.id,
            session.currentStep + 1,
            pageContext.url,
            pageContext.title,
            data.brokenImages.length,
            data.totalImages,
            details
          );
          findings.push(finding);
        }
      }

      // More tool handlers can be added here
    }

    return findings;
  }

  /**
   * Describe an action for progress tracking.
   */
  describeAction(decision: ActionDecision): string {
    switch (decision.action) {
      case 'navigate':
        return `Navigate to ${decision.value}`;
      case 'click':
        return `Click on ${decision.selector}`;
      case 'fill':
        return `Fill ${decision.selector} with "${decision.value?.substring(0, 20)}..."`;
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
