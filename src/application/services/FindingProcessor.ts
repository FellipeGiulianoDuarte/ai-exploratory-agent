/**
 * Finding Processor Service
 *
 * Handles the processing of findings: false positive filtering,
 * severity classification, and issue type classification.
 */

import { getLogger } from '../../infrastructure/logging/Logger';
import { FindingType } from '../../domain/exploration/Finding';

const logger = getLogger('FindingProcessor');

export interface ProcessedIssue {
  issue: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  type: FindingType;
  isFalsePositive: boolean;
  filterReason?: string;
}

/**
 * Service for processing and classifying exploration findings.
 */
export class FindingProcessor {
  /**
   * Process a list of observed issues.
   * Filters false positives and classifies severity/type.
   */
  processIssues(issues: string[]): ProcessedIssue[] {
    return issues.map(issue => this.processIssue(issue));
  }

  /**
   * Process a single observed issue.
   */
  processIssue(issue: string): ProcessedIssue {
    const filterResult = this.checkFalsePositive(issue);

    return {
      issue,
      severity: this.classifyIssueSeverity(issue),
      type: this.classifyIssueType(issue),
      isFalsePositive: filterResult.isFalsePositive,
      filterReason: filterResult.reason,
    };
  }

  /**
   * Get valid (non-false-positive) issues from a list.
   */
  getValidIssues(issues: string[]): ProcessedIssue[] {
    const processed = this.processIssues(issues);
    const valid = processed.filter(p => !p.isFalsePositive);

    logger.debug(`Processed ${issues.length} issues, ${valid.length} valid`, {
      total: issues.length,
      valid: valid.length,
      filtered: issues.length - valid.length,
    });

    return valid;
  }

  /**
   * Check if an observed issue is a false positive (not a real bug).
   * Filters out:
   * - "No bugs found" type messages
   * - Navigation descriptions
   * - Status updates without actual issues
   * - Contradictory or vague statements
   */
  private checkFalsePositive(issue: string): { isFalsePositive: boolean; reason?: string } {
    const lowerIssue = issue.toLowerCase();

    // Filter out "no bugs/issues" messages - comprehensive patterns
    const noBugPatterns = [
      'no immediate bugs',
      'no bugs found',
      'no issues found',
      'no errors found',
      'no issues detected',
      'no bugs detected',
      'no issues on',
      'no bugs on',
      'no visible issues',
      'no apparent bugs',
      'no bugs observed',
      'no issues observed',
      'page looks good',
      'everything looks fine',
      'everything looks good',
      'looks correct',
      'appears correct',
      'working correctly',
      'works as expected',
      'functioning properly',
      'not yet tested',
      'none are visible',
      'but none are',
      'if any',
    ];

    for (const pattern of noBugPatterns) {
      if (lowerIssue.includes(pattern)) {
        return { isFalsePositive: true, reason: 'no_bug_pattern' };
      }
    }

    // Filter out navigation/status descriptions (not bugs)
    const navigationPatterns = [
      'navigating to',
      'navigating away',
      'navigate to',
      'navigation to',
      'page is focused',
      'currently on',
      'currently focused',
      'now on',
      'successfully loaded',
      'loaded successfully',
      'moving to',
      'going to',
      'proceeding to',
    ];

    for (const pattern of navigationPatterns) {
      if (lowerIssue.includes(pattern)) {
        return { isFalsePositive: true, reason: 'navigation_description' };
      }
    }

    // Filter out speculative statements (not confirmed bugs)
    const speculativePatterns = [
      'actual outcome requires',
      'requires submission',
      'requires server',
      'server response unknown',
      'outcome requires',
      'may affect',
      'might affect',
      'could affect',
      'may impact',
      'might impact',
      'could impact',
      'potential issue if',
      'would need to',
      'needs further',
      'requires further',
    ];

    for (const pattern of speculativePatterns) {
      if (lowerIssue.includes(pattern)) {
        return { isFalsePositive: true, reason: 'speculative_statement' };
      }
    }

    // Filter out expected behavior descriptions
    const expectedBehaviorPatterns = [
      'accepts text',
      'accepts input',
      'accepts special characters',
      'field works',
      'input works',
      'button works',
      'link works',
      'as expected',
    ];

    for (const pattern of expectedBehaviorPatterns) {
      if (lowerIssue.includes(pattern)) {
        return { isFalsePositive: true, reason: 'expected_behavior' };
      }
    }

    // Filter out vague or contradictory statements
    // e.g., "No issues on current page; the page contains a broken image"
    if (lowerIssue.includes('no issues') || lowerIssue.includes('no bugs')) {
      return { isFalsePositive: true, reason: 'contradictory_statement' };
    }

    // Must have some actionable content - reject very short or vague issues
    const words = issue.split(/\s+/).filter(w => w.length > 2);
    if (words.length < 3) {
      return { isFalsePositive: true, reason: 'too_vague' };
    }

    return { isFalsePositive: false };
  }

  /**
   * Classify severity based on issue content.
   *
   * SEVERITY GUIDELINES:
   * - CRITICAL: Security vulnerabilities, data loss, crashes
   * - HIGH: Functional bugs that break core features, undefined values in UI
   * - MEDIUM: Console errors, broken images, validation issues
   * - LOW: Typos, minor text issues, cosmetic problems
   */
  classifyIssueSeverity(issue: string): 'critical' | 'high' | 'medium' | 'low' {
    const lowerIssue = issue.toLowerCase();

    // LOW: Typos and text issues (check first to avoid false HIGH classification)
    if (
      lowerIssue.includes('typo') ||
      lowerIssue.includes('misspell') ||
      lowerIssue.includes('spelling') ||
      lowerIssue.includes('contakt') || // Specific known typo
      (lowerIssue.includes('should be') && !lowerIssue.includes('error'))
    ) {
      return 'low';
    }

    // CRITICAL: Security issues, data loss, crash
    if (
      lowerIssue.includes('security') ||
      lowerIssue.includes('injection') ||
      lowerIssue.includes('xss') ||
      lowerIssue.includes('unauthorized') ||
      lowerIssue.includes('crash') ||
      lowerIssue.includes('data loss') ||
      lowerIssue.includes('password exposed') ||
      lowerIssue.includes('credential')
    ) {
      return 'critical';
    }

    // HIGH: Functional issues that break features
    if (
      lowerIssue.includes('undefined') ||
      lowerIssue.includes('null') ||
      lowerIssue.includes('[object object]') ||
      lowerIssue.includes('nan') ||
      lowerIssue.includes("doesn't work") ||
      lowerIssue.includes('not working') ||
      lowerIssue.includes('fails to') ||
      lowerIssue.includes('cannot') ||
      lowerIssue.includes('unable to') ||
      lowerIssue.includes('500') ||
      lowerIssue.includes('exception')
    ) {
      return 'high';
    }

    // MEDIUM: Console errors, broken images, validation issues, 404s
    if (
      lowerIssue.includes('error') ||
      lowerIssue.includes('console') ||
      lowerIssue.includes('broken image') ||
      lowerIssue.includes('image not') ||
      lowerIssue.includes('404') ||
      lowerIssue.includes('validation') ||
      lowerIssue.includes('missing') ||
      lowerIssue.includes('incorrect')
    ) {
      return 'medium';
    }

    // Low: Minor issues, suggestions
    return 'low';
  }

  /**
   * Classify issue type based on content.
   */
  classifyIssueType(issue: string): FindingType {
    const lowerIssue = issue.toLowerCase();

    if (
      lowerIssue.includes('typo') ||
      lowerIssue.includes('misspell') ||
      lowerIssue.includes('spelling')
    ) {
      return 'text_issue';
    }
    if (lowerIssue.includes('console') || lowerIssue.includes('javascript error')) {
      return 'console_error';
    }
    if (lowerIssue.includes('image') || lowerIssue.includes('img')) {
      return 'broken_image';
    }
    if (
      lowerIssue.includes('security') ||
      lowerIssue.includes('xss') ||
      lowerIssue.includes('injection')
    ) {
      return 'security';
    }
    if (
      lowerIssue.includes('usability') ||
      lowerIssue.includes('ux') ||
      lowerIssue.includes('confusing')
    ) {
      return 'usability';
    }
    if (
      lowerIssue.includes('layout') ||
      lowerIssue.includes('display') ||
      lowerIssue.includes('ui')
    ) {
      return 'ui_issue';
    }
    if (
      lowerIssue.includes('network') ||
      lowerIssue.includes('404') ||
      lowerIssue.includes('500')
    ) {
      return 'network_error';
    }

    return 'observed_bug';
  }

  /**
   * Get title prefix based on finding type.
   */
  getIssueTitlePrefix(type: FindingType): string {
    const prefixes: Record<FindingType, string> = {
      broken_image: 'Broken Image',
      console_error: 'Console Error',
      network_error: 'Network Error',
      accessibility: 'Accessibility Issue',
      usability: 'Usability Issue',
      functional: 'Functional Bug',
      performance: 'Performance Issue',
      security: 'Security Issue',
      observed_bug: 'Bug Found',
      text_issue: 'Text Issue',
      ui_issue: 'UI Issue',
      other: 'Issue',
    };
    return prefixes[type] || 'Issue';
  }
}
