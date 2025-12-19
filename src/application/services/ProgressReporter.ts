/**
 * Progress Reporter Service
 *
 * Handles progress reporting and formatted output during exploration.
 */

import { getLogger, Logger } from '../../infrastructure/logging/Logger';

const logger = getLogger('Progress');

export interface ProgressData {
  url: string;
  pagesVisited: number;
  findings: number;
  recentActions: string[];
}

export interface PersonaSuggestion {
  personaName: string;
  reasoning: string;
  priority?: number;
}

export interface ProgressReportOptions {
  /** Include persona suggestions in output */
  includePersonaSuggestions?: boolean;
  /** Maximum number of recent actions to show */
  maxRecentActions?: number;
  /** Maximum number of suggestions to show */
  maxSuggestions?: number;
}

const DEFAULT_OPTIONS: ProgressReportOptions = {
  includePersonaSuggestions: true,
  maxRecentActions: 3,
  maxSuggestions: 3,
};

/**
 * Service for reporting exploration progress.
 */
export class ProgressReporter {
  private readonly options: ProgressReportOptions;
  private readonly logger: Logger;

  constructor(options: Partial<ProgressReportOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.logger = logger;
  }

  /**
   * Print a formatted progress summary.
   */
  printProgressSummary(
    currentStep: number,
    maxSteps: number,
    data: ProgressData,
    suggestionQueue?: PersonaSuggestion[],
    topSuggestionsForPage?: PersonaSuggestion[]
  ): void {
    this.logger.progress(currentStep, maxSteps, data);

    // Add persona suggestions if available
    if (this.options.includePersonaSuggestions && suggestionQueue && suggestionQueue.length > 0) {
      this.printPersonaSuggestions(suggestionQueue, topSuggestionsForPage);
    }
  }

  /**
   * Print exploration start message.
   */
  printStart(url: string, objective: string): void {
    const separator = `────────────────────────────────────────────────────────────`;
    // eslint-disable-next-line no-console
    console.log(`\n${separator}`);
    // eslint-disable-next-line no-console
    console.log(`🚀 Starting Exploration`);
    // eslint-disable-next-line no-console
    console.log(`   Target: ${url}`);
    // eslint-disable-next-line no-console
    console.log(`   Objective: ${objective}`);
    // eslint-disable-next-line no-console
    console.log(`${separator}\n`);

    this.logger.info(`Starting exploration of ${url} with objective: ${objective}`);
  }

  /**
   * Print exploration end message.
   */
  printEnd(result: {
    totalSteps: number;
    findings: number;
    duration: number;
    reason: string;
  }): void {
    const separator = `────────────────────────────────────────────────────────────`;
    // eslint-disable-next-line no-console
    console.log(`\n${separator}`);
    // eslint-disable-next-line no-console
    console.log(`✅ Exploration Complete`);
    // eslint-disable-next-line no-console
    console.log(`   Total steps: ${result.totalSteps}`);
    // eslint-disable-next-line no-console
    console.log(`   Findings: ${result.findings}`);
    // eslint-disable-next-line no-console
    console.log(`   Duration: ${Math.round(result.duration / 1000)}s`);
    // eslint-disable-next-line no-console
    console.log(`   Stopped: ${result.reason}`);
    // eslint-disable-next-line no-console
    console.log(`${separator}\n`);

    this.logger.info(`Exploration completed: ${JSON.stringify(result)}`);
  }

  /**
   * Print persona suggestion information.
   */
  private printPersonaSuggestions(
    suggestionQueue: PersonaSuggestion[],
    topSuggestionsForPage?: PersonaSuggestion[]
  ): void {
    // eslint-disable-next-line no-console
    console.log(`\n🎯 Persona suggestions queued: ${suggestionQueue.length}`);

    if (topSuggestionsForPage && topSuggestionsForPage.length > 0) {
      const maxSuggestions = this.options.maxSuggestions ?? 3;
      // eslint-disable-next-line no-console
      console.log(`   Top suggestions for this page:`);
      topSuggestionsForPage.slice(0, maxSuggestions).forEach(s => {
        const truncatedReasoning =
          s.reasoning.length > 60 ? s.reasoning.substring(0, 60) + '...' : s.reasoning;
        // eslint-disable-next-line no-console
        console.log(`   • [${s.personaName}] ${truncatedReasoning}`);
      });
    }
  }

  /**
   * Print a finding with severity formatting.
   */
  printFinding(severity: 'critical' | 'high' | 'medium' | 'low', issue: string): void {
    this.logger.finding(severity, issue);
  }

  /**
   * Print session save notification.
   */
  printSessionSaved(sessionId: string, reason: 'auto' | 'checkpoint' | 'final' | 'error'): void {
    const reasonText = {
      auto: 'Auto-saved',
      checkpoint: 'Checkpoint save',
      final: 'Final save completed',
      error: 'Saved after error',
    };

    this.logger.info(`${reasonText[reason]} (session: ${sessionId})`);
  }

  /**
   * Print page context transition.
   */
  printPageContextChange(fromUrl: string | null, toUrl: string, reason: 'exit' | 'start'): void {
    if (reason === 'exit' && fromUrl) {
      const fromPath = this.getUrlPath(fromUrl);
      const toPath = this.getUrlPath(toUrl);
      this.logger.info(`Exiting ${fromPath}, moving to ${toPath}`);
    } else if (reason === 'start') {
      this.logger.info(`Starting fresh context for: ${toUrl}`);
    }
  }

  /**
   * Print exit criteria notification.
   */
  printExitCriteria(reason: string): void {
    this.logger.info(`${reason} - considering navigation`);
  }

  /**
   * Print navigation validation result.
   */
  printNavigationValidation(url: string, isValid: boolean, reason?: string): void {
    if (isValid) {
      this.logger.debug(`Navigation validated: ${url}`);
    } else {
      this.logger.info(`Navigation skipped: ${url} - ${reason || 'invalid'}`);
    }
  }

  /**
   * Print a completed step.
   */
  printStepResult(stepNumber: number, action: string, success: boolean): void {
    const status = success ? '✓' : '✗';
    // eslint-disable-next-line no-console
    console.log(`[Step ${stepNumber}] ${status} ${action}`);
  }

  /**
   * Print loop detection result.
   */
  printLoopDetected(type: 'tool' | 'action', pattern: string, count: number): void {
    this.logger.warn(
      `${type === 'tool' ? 'Tool' : 'Action'} loop detected: ${pattern} (${count}x)`
    );
  }

  /**
   * Print retry notification.
   */
  printRetry(attempt: number, delay: number): void {
    this.logger.warn(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
  }

  /**
   * Print URL discovery results.
   */
  printUrlDiscoveryResults(
    newUrls: Array<{ category: string; normalizedUrl: string; linkText: string }>,
    totalUnvisited: number
  ): void {
    if (newUrls.length === 0) {
      return;
    }

    this.logger.info(`Found ${newUrls.length} new URLs (${totalUnvisited} total in queue)`);

    // Log first few new URLs
    const maxToShow = 3;
    for (const url of newUrls.slice(0, maxToShow)) {
      const path = this.getUrlPath(url.normalizedUrl);
      const truncatedText =
        url.linkText.length > 40 ? url.linkText.substring(0, 40) + '...' : url.linkText;
      // eslint-disable-next-line no-console
      console.log(`   + [${url.category}] ${path} - "${truncatedText}"`);
    }

    if (newUrls.length > maxToShow) {
      // eslint-disable-next-line no-console
      console.log(`   ... and ${newUrls.length - maxToShow} more`);
    }
  }

  /**
   * Print URL discovery error (non-critical).
   */
  printUrlDiscoveryError(error: Error | unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.warn(`Scan error (non-critical): ${message}`);
  }

  /**
   * Extract path from URL for display.
   */
  private getUrlPath(url: string): string {
    try {
      const u = new URL(url);
      return u.pathname + u.search + u.hash;
    } catch {
      return url;
    }
  }
}
