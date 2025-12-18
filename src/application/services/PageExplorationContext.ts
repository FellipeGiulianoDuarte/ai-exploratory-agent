/**
 * Page Exploration Context
 *
 * Manages fresh context for each page visit.
 * Each page gets:
 * - Clean action history
 * - Exit criteria to decide when to move on
 * - Steps-to-reproduce tracking
 * - Page-specific tool usage
 */

import { ActionDecision, LLMPageContext } from '../ports/LLMPort';

/**
 * Exit criteria evaluation result.
 */
export interface ExitCriteriaResult {
  shouldExit: boolean;
  reason: string;
  completedCriteria: string[];
  pendingCriteria: string[];
  confidence: number;
}

/**
 * Tracked action with context for steps-to-reproduce.
 */
export interface TrackedAction {
  action: ActionDecision;
  timestamp: Date;
  pageUrl: string;
  pageTitle: string;
  success: boolean;
  resultDescription: string;
}

/**
 * Page exploration stats.
 */
export interface PageExplorationStats {
  url: string;
  actionsPerformed: number;
  toolsRun: string[];
  elementsInteracted: string[];
  formsSubmitted: number;
  bugsFound: number;
  timeSpent: number;
  exitReason: string;
}

/**
 * Configuration for page exploration.
 */
export interface PageExplorationConfig {
  /** Max actions per page before forcing move */
  maxActionsPerPage: number;
  /** Max time per page in ms */
  maxTimePerPage: number;
  /** Required tools to run on each page */
  requiredTools: string[];
  /** Min elements to interact with */
  minElementInteractions: number;
  /** Exit after finding N bugs on page */
  exitAfterBugsFound: number;
}

const DEFAULT_CONFIG: PageExplorationConfig = {
  maxActionsPerPage: 8,
  maxTimePerPage: 60000, // 1 minute
  requiredTools: ['broken_image_detector'],
  minElementInteractions: 3,
  exitAfterBugsFound: 3,
};

export class PageExplorationContext {
  private currentUrl: string = '';
  private currentTitle: string = '';
  private startTime: Date = new Date();
  private actions: TrackedAction[] = [];
  private toolsRun: Set<string> = new Set();
  private elementsInteracted: Set<string> = new Set();
  private formsSubmitted: number = 0;
  private bugsFoundOnPage: number = 0;
  private exitReason: string = '';
  private config: PageExplorationConfig;

  constructor(config: Partial<PageExplorationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start fresh context for a new page.
   */
  startNewPage(url: string, title: string): void {
    // Save stats from previous page if any
    this.currentUrl = url;
    this.currentTitle = title;
    this.startTime = new Date();
    this.actions = [];
    this.toolsRun.clear();
    this.elementsInteracted.clear();
    this.formsSubmitted = 0;
    this.bugsFoundOnPage = 0;
    this.exitReason = '';
  }

  /**
   * Record an action performed on the current page.
   */
  recordAction(action: ActionDecision, success: boolean, resultDescription: string = ''): void {
    this.actions.push({
      action,
      timestamp: new Date(),
      pageUrl: this.currentUrl,
      pageTitle: this.currentTitle,
      success,
      resultDescription,
    });

    // Track element interaction
    if (action.selector) {
      this.elementsInteracted.add(action.selector);
    }

    // Track tool usage
    if (action.action === 'tool' && action.toolName) {
      this.toolsRun.add(action.toolName);
    }

    // Track form submissions
    if (
      action.action === 'click' &&
      (action.selector?.includes('submit') ||
        action.selector?.includes('btn') ||
        action.reasoning?.toLowerCase().includes('submit'))
    ) {
      this.formsSubmitted++;
    }
  }

  /**
   * Record a bug found on the current page.
   */
  recordBugFound(): void {
    this.bugsFoundOnPage++;
  }

  /**
   * Get number of bugs found on current page.
   */
  getBugsFoundOnPage(): number {
    return this.bugsFoundOnPage;
  }

  /**
   * Evaluate exit criteria for the current page.
   */
  evaluateExitCriteria(): ExitCriteriaResult {
    const completed: string[] = [];
    const pending: string[] = [];

    // Time limit
    const timeSpent = Date.now() - this.startTime.getTime();
    if (timeSpent >= this.config.maxTimePerPage) {
      return {
        shouldExit: true,
        reason: 'Time limit reached',
        completedCriteria: completed,
        pendingCriteria: pending,
        confidence: 1.0,
      };
    }
    completed.push(
      `Time: ${Math.round(timeSpent / 1000)}s / ${this.config.maxTimePerPage / 1000}s`
    );

    // Action limit
    if (this.actions.length >= this.config.maxActionsPerPage) {
      return {
        shouldExit: true,
        reason: 'Max actions reached',
        completedCriteria: completed,
        pendingCriteria: pending,
        confidence: 1.0,
      };
    }
    completed.push(`Actions: ${this.actions.length} / ${this.config.maxActionsPerPage}`);

    // Bug limit - found enough bugs on this page
    if (this.bugsFoundOnPage >= this.config.exitAfterBugsFound) {
      return {
        shouldExit: true,
        reason: `Found ${this.bugsFoundOnPage} bugs on this page`,
        completedCriteria: completed,
        pendingCriteria: pending,
        confidence: 0.9,
      };
    }

    // Required tools
    const missingTools = this.config.requiredTools.filter(t => !this.toolsRun.has(t));
    if (missingTools.length > 0) {
      pending.push(`Tools to run: ${missingTools.join(', ')}`);
    } else {
      completed.push('All required tools run');
    }

    // Element interactions
    if (this.elementsInteracted.size < this.config.minElementInteractions) {
      pending.push(
        `Elements: ${this.elementsInteracted.size} / ${this.config.minElementInteractions}`
      );
    } else {
      completed.push(`Elements: ${this.elementsInteracted.size} interacted`);
    }

    // Determine if we should exit
    const criteriaComplete =
      missingTools.length === 0 &&
      this.elementsInteracted.size >= this.config.minElementInteractions;

    // Calculate confidence based on completion
    const confidence = criteriaComplete ? 0.8 : 0.4;

    return {
      shouldExit: criteriaComplete,
      reason: criteriaComplete ? 'Exit criteria met' : 'Continue exploring',
      completedCriteria: completed,
      pendingCriteria: pending,
      confidence,
    };
  }

  /**
   * Get the steps to reproduce for the current page exploration.
   * Returns a formatted list of actions taken.
   */
  getStepsToReproduce(): string[] {
    const steps: string[] = [];

    // Start with navigation to the page
    steps.push(`1. Navigate to ${this.currentUrl}`);

    // Add each successful action
    let stepNum = 2;
    for (const tracked of this.actions) {
      if (!tracked.success) continue;

      const action = tracked.action;
      let stepText = '';

      switch (action.action) {
        case 'click':
          stepText = `Click on "${action.selector}"`;
          if (action.reasoning) {
            stepText += ` (${action.reasoning.substring(0, 50)})`;
          }
          break;
        case 'fill':
          stepText = `Enter "${action.value?.substring(0, 30) || ''}" in "${action.selector}"`;
          break;
        case 'select':
          stepText = `Select "${action.value}" from "${action.selector}"`;
          break;
        case 'hover':
          stepText = `Hover over "${action.selector}"`;
          break;
        case 'scroll':
          stepText = 'Scroll down the page';
          break;
        case 'navigate':
          stepText = `Navigate to ${action.value}`;
          break;
        case 'back':
          stepText = 'Click browser back button';
          break;
        case 'refresh':
          stepText = 'Refresh the page';
          break;
        case 'tool':
          // Skip tool actions in steps-to-reproduce
          continue;
        default:
          continue;
      }

      steps.push(`${stepNum}. ${stepText}`);
      stepNum++;
    }

    return steps;
  }

  /**
   * Get recent actions in a format suitable for LLM context.
   */
  getRecentActionsForLLM(limit: number = 5): string {
    const recent = this.actions.slice(-limit);
    if (recent.length === 0) {
      return 'No actions yet on this page.';
    }

    return recent
      .map((tracked, i) => {
        const action = tracked.action;
        const status = tracked.success ? '✓' : '✗';
        let desc = action.action;
        if (action.selector) desc += ` on ${action.selector}`;
        if (action.value) desc += ` = "${action.value.substring(0, 30)}"`;
        return `${i + 1}. [${status}] ${desc}`;
      })
      .join('\n');
  }

  /**
   * Get exploration stats for the current page.
   */
  getStats(): PageExplorationStats {
    return {
      url: this.currentUrl,
      actionsPerformed: this.actions.length,
      toolsRun: Array.from(this.toolsRun),
      elementsInteracted: Array.from(this.elementsInteracted),
      formsSubmitted: this.formsSubmitted,
      bugsFound: this.bugsFoundOnPage,
      timeSpent: Date.now() - this.startTime.getTime(),
      exitReason: this.exitReason,
    };
  }

  /**
   * Get suggestions for what to do next based on pending criteria.
   */
  getNextActionSuggestions(pageContext: LLMPageContext): string[] {
    const suggestions: string[] = [];
    // Exit criteria is used internally for suggestion priority

    // Suggest running missing tools
    const missingTools = this.config.requiredTools.filter(t => !this.toolsRun.has(t));
    for (const tool of missingTools) {
      suggestions.push(`Run ${tool} tool to check for issues`);
    }

    // Suggest interacting with more elements
    if (this.elementsInteracted.size < this.config.minElementInteractions) {
      // Find uninteracted elements
      const uninteracted = pageContext.elements
        .filter(el => !this.elementsInteracted.has(el.selector))
        .slice(0, 3);

      for (const el of uninteracted) {
        if (el.type === 'button' || el.type === 'link') {
          suggestions.push(`Click on ${el.selector} ("${el.text}")`);
        } else if (el.type === 'input') {
          suggestions.push(`Fill ${el.selector} with test data`);
        } else if (el.type === 'select') {
          suggestions.push(`Test dropdown ${el.selector}`);
        }
      }
    }

    return suggestions;
  }

  /**
   * Check if a specific tool has been run on this page.
   */
  hasRunTool(toolName: string): boolean {
    return this.toolsRun.has(toolName);
  }

  /**
   * Get current page URL.
   */
  getCurrentUrl(): string {
    return this.currentUrl;
  }

  /**
   * Get current page title.
   */
  getCurrentTitle(): string {
    return this.currentTitle;
  }

  /**
   * Get number of actions performed on this page.
   */
  getActionCount(): number {
    return this.actions.length;
  }
}
