/**
 * FindingsProcessor
 *
 * Handles processing of observed issues and findings:
 * - False positive detection
 * - Severity classification
 * - Issue type classification
 * - Deduplication
 */

import { Finding, FindingType } from '../../domain/exploration/Finding';
import { ActionDecision } from '../../domain/exploration/ActionTypes';
import { LLMPageContext } from '../ports/LLMPort';
import { BugDeduplicationService } from './BugDeduplicationService';
import { PageExplorationContext } from './PageExplorationContext';
import { Logger, getLogger } from '../../infrastructure/logging';
import {
  FINDING_PATTERNS,
  SEVERITY_KEYWORDS,
  ISSUE_TYPE_KEYWORDS,
  FINDING_TYPE_PREFIXES,
} from '../config/ExplorationConfig';

export interface ProcessedFinding {
  finding: Finding;
  isDuplicate: boolean;
  duplicateOfId?: string;
}

export interface FindingsProcessorDeps {
  bugDeduplication: BugDeduplicationService;
  pageContext: PageExplorationContext;
}

/**
 * Processes and classifies findings from exploration.
 */
export class FindingsProcessor {
  private logger: Logger;
  private bugDeduplication: BugDeduplicationService;
  private pageContext: PageExplorationContext;

  constructor(deps: FindingsProcessorDeps) {
    this.logger = getLogger('Finding');
    this.bugDeduplication = deps.bugDeduplication;
    this.pageContext = deps.pageContext;
  }

  /**
   * Update dependencies (for page context changes).
   */
  updateDeps(deps: Partial<FindingsProcessorDeps>): void {
    if (deps.bugDeduplication) {
      this.bugDeduplication = deps.bugDeduplication;
    }
    if (deps.pageContext) {
      this.pageContext = deps.pageContext;
    }
  }

  /**
   * Process observed issues from LLM decision.
   */
  processObservedIssues(
    decision: ActionDecision,
    sessionId: string,
    currentStep: number,
    pageContext: LLMPageContext
  ): ProcessedFinding[] {
    const results: ProcessedFinding[] = [];

    if (!decision.observedIssues || decision.observedIssues.length === 0) {
      return results;
    }

    for (const issue of decision.observedIssues) {
      // Skip false positives
      if (this.isFalsePositive(issue)) {
        this.logger.debug(`Filtered false positive: ${issue.substring(0, 50)}...`);
        continue;
      }

      // Check for duplicates
      const duplicateId = this.bugDeduplication.isDuplicate(issue, pageContext.url);
      if (duplicateId) {
        results.push({
          finding: null as unknown as Finding,
          isDuplicate: true,
          duplicateOfId: duplicateId,
        });
        continue;
      }

      // Create finding
      const severity = this.classifyIssueSeverity(issue);
      const findingType = this.classifyIssueType(issue);
      const stepsToReproduce = this.pageContext.getStepsToReproduce();
      const fullDescription = `${issue}\n\n**Steps to Reproduce:**\n${stepsToReproduce.join('\n')}`;

      const finding = Finding.create({
        sessionId,
        stepNumber: currentStep,
        type: findingType,
        title: `${this.getIssueTitlePrefix(findingType)}: ${issue.substring(0, 50)}`,
        description: fullDescription,
        pageUrl: pageContext.url,
        pageTitle: pageContext.title,
        severity,
        metadata: {
          stepsToReproduce,
          pageActionsCount: this.pageContext.getActionCount(),
        },
      });

      // Register with deduplication service
      this.bugDeduplication.registerBug(
        finding.id,
        finding.title,
        issue,
        severity,
        pageContext.url,
        stepsToReproduce
      );

      // Log finding
      this.logger.finding(severity, issue);

      results.push({
        finding,
        isDuplicate: false,
      });
    }

    return results;
  }

  /**
   * Check if an observed issue is a false positive (not a real bug).
   * Filters out:
   * - "No bugs found" type messages
   * - Navigation descriptions
   * - Status updates without actual issues
   * - Contradictory or vague statements
   */
  isFalsePositive(issue: string): boolean {
    const lowerIssue = issue.toLowerCase();

    // Check no bug patterns
    for (const pattern of FINDING_PATTERNS.NO_BUG_PATTERNS) {
      if (lowerIssue.includes(pattern)) {
        return true;
      }
    }

    // Check navigation patterns
    for (const pattern of FINDING_PATTERNS.NAVIGATION_PATTERNS) {
      if (lowerIssue.includes(pattern)) {
        return true;
      }
    }

    // Check speculative patterns
    for (const pattern of FINDING_PATTERNS.SPECULATIVE_PATTERNS) {
      if (lowerIssue.includes(pattern)) {
        return true;
      }
    }

    // Check expected behavior patterns
    for (const pattern of FINDING_PATTERNS.EXPECTED_BEHAVIOR_PATTERNS) {
      if (lowerIssue.includes(pattern)) {
        return true;
      }
    }

    // Filter vague or contradictory statements
    if (lowerIssue.includes('no issues') || lowerIssue.includes('no bugs')) {
      return true;
    }

    // Must have some actionable content
    const words = issue.split(/\s+/).filter(w => w.length > FINDING_PATTERNS.MIN_WORD_LENGTH);
    if (words.length < FINDING_PATTERNS.MIN_ACTIONABLE_WORDS) {
      return true;
    }

    return false;
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
    for (const keyword of SEVERITY_KEYWORDS.LOW) {
      if (lowerIssue.includes(keyword)) {
        // Special case: "should be" without "error" is low severity
        if (keyword === 'should be' && lowerIssue.includes('error')) {
          continue;
        }
        return 'low';
      }
    }

    // CRITICAL: Security issues, data loss, crash
    for (const keyword of SEVERITY_KEYWORDS.CRITICAL) {
      if (lowerIssue.includes(keyword)) {
        return 'critical';
      }
    }

    // HIGH: Functional issues that break features
    for (const keyword of SEVERITY_KEYWORDS.HIGH) {
      if (lowerIssue.includes(keyword)) {
        return 'high';
      }
    }

    // MEDIUM: Console errors, broken images, validation issues, 404s
    for (const keyword of SEVERITY_KEYWORDS.MEDIUM) {
      if (lowerIssue.includes(keyword)) {
        return 'medium';
      }
    }

    // Default: Low for minor issues
    return 'low';
  }

  /**
   * Classify issue type based on content.
   */
  classifyIssueType(issue: string): FindingType {
    const lowerIssue = issue.toLowerCase();

    for (const [type, keywords] of Object.entries(ISSUE_TYPE_KEYWORDS)) {
      for (const keyword of keywords) {
        if (lowerIssue.includes(keyword)) {
          return type as FindingType;
        }
      }
    }

    return 'observed_bug';
  }

  /**
   * Get title prefix based on finding type.
   */
  getIssueTitlePrefix(type: FindingType): string {
    return FINDING_TYPE_PREFIXES[type] || 'Issue';
  }

  /**
   * Clear state for new exploration.
   */
  clear(): void {
    this.bugDeduplication.clear();
  }

  /**
   * Get reported bugs summary for LLM context.
   */
  getReportedBugsSummary(): string {
    return this.bugDeduplication.getReportedBugsSummary();
  }
}
