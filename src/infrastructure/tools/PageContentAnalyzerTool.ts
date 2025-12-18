import { BaseTool } from '../../domain/tools/BaseTool';
import { ToolContext, ToolParameterSchema } from '../../domain/tools/Tool';

/**
 * Parameters for the PageContentAnalyzerTool.
 */
export interface PageContentAnalyzerParams {
  /** Whether to check for placeholder text */
  checkPlaceholders?: boolean;
  /** Whether to check for developer artifacts */
  checkDevArtifacts?: boolean;
}

/**
 * Detected content issue.
 */
export interface ContentIssue {
  type:
    | 'undefined_value'
    | 'null_value'
    | 'object_object'
    | 'placeholder'
    | 'dev_artifact'
    | 'broken_text';
  severity: 'critical' | 'high' | 'medium' | 'low';
  text: string;
  context: string;
  count: number;
}

/**
 * Page content analysis report.
 */
export interface PageContentReport {
  pageUrl: string;
  pageTitle: string;
  timestamp: Date;
  totalIssues: number;
  issuesByType: {
    undefinedValues: number;
    nullValues: number;
    objectObject: number;
    placeholders: number;
    devArtifacts: number;
    brokenText: number;
  };
  issues: ContentIssue[];
  summary: string;
}

/**
 * Tool that analyzes page content for common UI bugs.
 *
 * Detects:
 * - "undefined" text (missing data binding)
 * - "null" text (uninitialized values)
 * - "[object Object]" (incorrect toString())
 * - Placeholder text (Lorem ipsum, TODO, FIXME)
 * - Developer artifacts (console.log output, debug text)
 * - Broken formatting (NaN, malformed dates)
 */
export class PageContentAnalyzerTool extends BaseTool<
  PageContentAnalyzerParams,
  PageContentReport
> {
  readonly name = 'analyze_page_content';
  readonly description =
    'Analyzes page content for common UI bugs like "undefined", "null", "[object Object]", placeholder text, and developer artifacts.';

  // Patterns for detecting broken UI
  private readonly brokenUIPatterns = {
    undefined_value: [/\bundefined\b/gi, /\{undefined\}/gi],
    null_value: [/\bnull\b/gi, /\{null\}/gi],
    object_object: [/\[object Object\]/gi, /\{object Object\}/gi],
    nan_value: [/\bNaN\b/g],
  };

  private readonly placeholderPatterns = [
    /lorem ipsum/gi,
    /dolor sit amet/gi,
    /placeholder/gi,
    /example\.com/gi,
    /test@test\.com/gi,
    /xxx+/gi,
  ];

  private readonly devArtifactPatterns = [
    /\bTODO\b/g,
    /\bFIXME\b/g,
    /\bHACK\b/g,
    /\bXXX\b/g,
    /\bDEBUG\b/g,
    /console\.log/gi,
  ];

  protected getParameterSchema(): Record<string, ToolParameterSchema> {
    return {
      checkPlaceholders: {
        type: 'boolean',
        description: 'Whether to check for placeholder text (Lorem ipsum, etc.)',
        required: false,
        default: true,
      },
      checkDevArtifacts: {
        type: 'boolean',
        description: 'Whether to check for developer artifacts (TODO, FIXME, etc.)',
        required: false,
        default: true,
      },
    };
  }

  protected async executeInternal(
    params: PageContentAnalyzerParams,
    context: ToolContext
  ): Promise<PageContentReport> {
    // Get page info and content
    const [pageUrl, pageTitle, pageState] = await Promise.all([
      context.browser.getCurrentUrl(),
      context.browser.getTitle(),
      context.browser.extractPageState(),
    ]);

    const visibleText = pageState.visibleText || '';

    // Analyze content for issues
    const issues: ContentIssue[] = [];

    // Check for broken UI patterns
    this.checkBrokenUIPatterns(visibleText, issues);

    // Check for placeholders
    if (params.checkPlaceholders ?? true) {
      this.checkPlaceholders(visibleText, issues);
    }

    // Check for dev artifacts
    if (params.checkDevArtifacts ?? true) {
      this.checkDevArtifacts(visibleText, issues);
    }

    // Count by type
    const issuesByType = {
      undefinedValues: issues.filter(i => i.type === 'undefined_value').length,
      nullValues: issues.filter(i => i.type === 'null_value').length,
      objectObject: issues.filter(i => i.type === 'object_object').length,
      placeholders: issues.filter(i => i.type === 'placeholder').length,
      devArtifacts: issues.filter(i => i.type === 'dev_artifact').length,
      brokenText: issues.filter(i => i.type === 'broken_text').length,
    };

    // Generate summary
    const summary = this.generateSummary(issues.length, issuesByType, issues);

    return {
      pageUrl,
      pageTitle,
      timestamp: new Date(),
      totalIssues: issues.length,
      issuesByType,
      issues,
      summary,
    };
  }

  /**
   * Check for broken UI patterns (undefined, null, [object Object]).
   */
  private checkBrokenUIPatterns(text: string, issues: ContentIssue[]): void {
    // Check for "undefined"
    for (const pattern of this.brokenUIPatterns.undefined_value) {
      const matches = text.match(pattern);
      if (matches && matches.length > 0) {
        const context = this.extractContext(text, matches[0]);
        issues.push({
          type: 'undefined_value',
          severity: 'high',
          text: matches[0],
          context,
          count: matches.length,
        });
        break; // Only add once per pattern type
      }
    }

    // Check for "null"
    for (const pattern of this.brokenUIPatterns.null_value) {
      const matches = text.match(pattern);
      if (matches && matches.length > 0) {
        const context = this.extractContext(text, matches[0]);
        issues.push({
          type: 'null_value',
          severity: 'high',
          text: matches[0],
          context,
          count: matches.length,
        });
        break;
      }
    }

    // Check for "[object Object]"
    for (const pattern of this.brokenUIPatterns.object_object) {
      const matches = text.match(pattern);
      if (matches && matches.length > 0) {
        const context = this.extractContext(text, matches[0]);
        issues.push({
          type: 'object_object',
          severity: 'critical',
          text: matches[0],
          context,
          count: matches.length,
        });
        break;
      }
    }

    // Check for "NaN"
    for (const pattern of this.brokenUIPatterns.nan_value) {
      const matches = text.match(pattern);
      if (matches && matches.length > 0) {
        const context = this.extractContext(text, matches[0]);
        issues.push({
          type: 'broken_text',
          severity: 'high',
          text: 'NaN',
          context,
          count: matches.length,
        });
        break;
      }
    }
  }

  /**
   * Check for placeholder text.
   */
  private checkPlaceholders(text: string, issues: ContentIssue[]): void {
    for (const pattern of this.placeholderPatterns) {
      const matches = text.match(pattern);
      if (matches && matches.length > 0) {
        const context = this.extractContext(text, matches[0]);
        issues.push({
          type: 'placeholder',
          severity: 'medium',
          text: matches[0],
          context,
          count: matches.length,
        });
      }
    }
  }

  /**
   * Check for developer artifacts.
   */
  private checkDevArtifacts(text: string, issues: ContentIssue[]): void {
    for (const pattern of this.devArtifactPatterns) {
      const matches = text.match(pattern);
      if (matches && matches.length > 0) {
        const context = this.extractContext(text, matches[0]);
        issues.push({
          type: 'dev_artifact',
          severity: 'low',
          text: matches[0],
          context,
          count: matches.length,
        });
      }
    }
  }

  /**
   * Extract context around a matched text.
   */
  private extractContext(text: string, match: string, contextLength = 50): string {
    const index = text.indexOf(match);
    if (index === -1) return '';

    const start = Math.max(0, index - contextLength);
    const end = Math.min(text.length, index + match.length + contextLength);

    let context = text.substring(start, end);

    // Add ellipsis if truncated
    if (start > 0) context = '...' + context;
    if (end < text.length) context = context + '...';

    return context.trim();
  }

  /**
   * Generate summary text.
   */
  private generateSummary(
    total: number,
    byType: {
      undefinedValues: number;
      nullValues: number;
      objectObject: number;
      placeholders: number;
      devArtifacts: number;
      brokenText: number;
    },
    issues: ContentIssue[]
  ): string {
    if (total === 0) {
      return 'No content issues detected on this page.';
    }

    const lines: string[] = [];
    lines.push(`Found ${total} content issue(s):`);

    if (byType.objectObject > 0) {
      lines.push(`  - ${byType.objectObject} [object Object] rendering issue(s) [CRITICAL]`);
    }
    if (byType.undefinedValues > 0) {
      lines.push(`  - ${byType.undefinedValues} "undefined" value(s) [HIGH]`);
    }
    if (byType.nullValues > 0) {
      lines.push(`  - ${byType.nullValues} "null" value(s) [HIGH]`);
    }
    if (byType.brokenText > 0) {
      lines.push(`  - ${byType.brokenText} broken text (NaN, etc.) [HIGH]`);
    }
    if (byType.placeholders > 0) {
      lines.push(`  - ${byType.placeholders} placeholder text [MEDIUM]`);
    }
    if (byType.devArtifacts > 0) {
      lines.push(`  - ${byType.devArtifacts} developer artifact(s) [LOW]`);
    }

    // Add top critical/high issues
    const criticalIssues = issues.filter(i => i.severity === 'critical' || i.severity === 'high');
    if (criticalIssues.length > 0) {
      lines.push('\nCritical/High severity issues:');
      for (const issue of criticalIssues.slice(0, 3)) {
        lines.push(`  - "${issue.text}" appears ${issue.count}x`);
        lines.push(`    Context: ${issue.context.substring(0, 60)}...`);
      }
    }

    return lines.join('\n');
  }
}
