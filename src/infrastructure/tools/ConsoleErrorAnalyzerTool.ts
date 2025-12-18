import { BaseTool } from '../../domain/tools/BaseTool';
import { ToolContext, ToolParameterSchema } from '../../domain/tools/Tool';

/**
 * Parameters for the ConsoleErrorAnalyzerTool.
 */
export interface ConsoleErrorAnalyzerParams {
  /** Whether to include stack traces in analysis */
  includeStackTraces?: boolean;
  /** Minimum severity to report (info, warning, error, critical) */
  minSeverity?: 'info' | 'warning' | 'error' | 'critical';
}

/**
 * Categorized console error.
 */
export interface CategorizedError {
  message: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  count: number;
  examples: string[];
}

/**
 * Console error analysis report.
 */
export interface ConsoleErrorReport {
  pageUrl: string;
  pageTitle: string;
  timestamp: Date;
  totalErrors: number;
  errorsBySeverity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  categorizedErrors: CategorizedError[];
  rawErrors: string[];
  summary: string;
}

/**
 * Tool that analyzes console errors and categorizes them by severity.
 *
 * Helps identify:
 * - Critical errors (unhandled exceptions, security issues)
 * - High severity errors (failed requests, JavaScript errors)
 * - Medium severity (warnings, deprecations, 404s)
 * - Low severity (info, debug messages)
 */
export class ConsoleErrorAnalyzerTool extends BaseTool<
  ConsoleErrorAnalyzerParams,
  ConsoleErrorReport
> {
  readonly name = 'analyze_console_errors';
  readonly description =
    'Analyzes console errors and categorizes them by severity, type, and impact. Helps identify critical bugs, failed requests, and warnings.';

  // Severity classification patterns
  private readonly severityPatterns = {
    critical: [
      /unhandled.*exception/i,
      /fatal/i,
      /crash/i,
      /security/i,
      /unauthorized/i,
      /access.*denied/i,
      /cors.*error/i,
    ],
    high: [
      /error/i,
      /failed/i,
      /exception/i,
      /500/i,
      /503/i,
      /timeout/i,
      /cannot.*read/i,
      /undefined.*is.*not/i,
      /null.*is.*not/i,
    ],
    medium: [
      /warning/i,
      /deprecated/i,
      /404/i,
      /not.*found/i,
      /missing/i,
    ],
    low: [
      /info/i,
      /debug/i,
      /notice/i,
      /log/i,
    ],
  };

  // Error category patterns
  private readonly categoryPatterns = {
    'Network Error': [/fetch/i, /xhr/i, /network/i, /http/i, /ajax/i, /request/i],
    'CORS Error': [/cors/i, /cross-origin/i, /access-control/i],
    'Security Error': [/security/i, /unauthorized/i, /forbidden/i, /csrf/i],
    'JavaScript Error': [/undefined/i, /null/i, /is not a function/i, /cannot read/i, /syntax/i],
    'Resource Loading': [/404/i, /not found/i, /failed to load/i, /missing/i],
    'Deprecation Warning': [/deprecated/i, /legacy/i],
    'Performance': [/slow/i, /performance/i, /timeout/i, /memory/i],
  };

  protected getParameterSchema(): Record<string, ToolParameterSchema> {
    return {
      includeStackTraces: {
        type: 'boolean',
        description: 'Whether to include stack traces in analysis',
        required: false,
        default: false,
      },
      minSeverity: {
        type: 'string',
        description: 'Minimum severity to report',
        required: false,
        default: 'low',
      },
    };
  }

  protected async executeInternal(
    _params: ConsoleErrorAnalyzerParams,
    context: ToolContext
  ): Promise<ConsoleErrorReport> {
    // Get page info
    const [pageUrl, pageTitle] = await Promise.all([
      context.browser.getCurrentUrl(),
      context.browser.getTitle(),
    ]);

    // Extract console errors from browser (stored in PageState)
    const pageState = await context.browser.extractPageState();
    const rawErrors = pageState.consoleErrors || [];

    // Categorize errors
    const categorizedErrors = this.categorizeErrors(rawErrors);

    // Count by severity
    const errorsBySeverity = {
      critical: categorizedErrors.filter(e => e.severity === 'critical').length,
      high: categorizedErrors.filter(e => e.severity === 'high').length,
      medium: categorizedErrors.filter(e => e.severity === 'medium').length,
      low: categorizedErrors.filter(e => e.severity === 'low').length,
    };

    // Generate summary
    const summary = this.generateSummary(rawErrors.length, errorsBySeverity, categorizedErrors);

    return {
      pageUrl,
      pageTitle,
      timestamp: new Date(),
      totalErrors: rawErrors.length,
      errorsBySeverity,
      categorizedErrors,
      rawErrors,
      summary,
    };
  }

  /**
   * Categorize errors by severity and type.
   */
  private categorizeErrors(errors: string[]): CategorizedError[] {
    const errorMap = new Map<string, CategorizedError>();

    for (const error of errors) {
      const severity = this.classifySeverity(error);
      const category = this.classifyCategory(error);
      const key = `${severity}-${category}`;

      const existing = errorMap.get(key);
      if (existing) {
        existing.count++;
        if (existing.examples.length < 3) {
          existing.examples.push(error.substring(0, 100));
        }
      } else {
        errorMap.set(key, {
          message: this.extractErrorMessage(error),
          severity,
          category,
          count: 1,
          examples: [error.substring(0, 100)],
        });
      }
    }

    // Sort by severity (critical first) then by count
    return Array.from(errorMap.values()).sort((a, b) => {
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      if (a.severity !== b.severity) {
        return severityOrder[a.severity] - severityOrder[b.severity];
      }
      return b.count - a.count;
    });
  }

  /**
   * Classify error severity.
   */
  private classifySeverity(error: string): 'critical' | 'high' | 'medium' | 'low' {
    for (const pattern of this.severityPatterns.critical) {
      if (pattern.test(error)) {
        return 'critical';
      }
    }
    for (const pattern of this.severityPatterns.high) {
      if (pattern.test(error)) {
        return 'high';
      }
    }
    for (const pattern of this.severityPatterns.medium) {
      if (pattern.test(error)) {
        return 'medium';
      }
    }
    return 'low';
  }

  /**
   * Classify error category.
   */
  private classifyCategory(error: string): string {
    for (const [category, patterns] of Object.entries(this.categoryPatterns)) {
      for (const pattern of patterns) {
        if (pattern.test(error)) {
          return category;
        }
      }
    }
    return 'Other';
  }

  /**
   * Extract clean error message from raw error.
   */
  private extractErrorMessage(error: string): string {
    // Remove common prefixes
    let message = error
      .replace(/^(Error|Warning|Info|Debug):\s*/i, '')
      .replace(/^console\.(error|warn|log|info):\s*/i, '');

    // Truncate at first newline (to avoid long stack traces)
    const newlineIndex = message.indexOf('\n');
    if (newlineIndex > 0) {
      message = message.substring(0, newlineIndex);
    }

    // Limit length
    return message.length > 150 ? message.substring(0, 150) + '...' : message;
  }

  /**
   * Generate summary text.
   */
  private generateSummary(
    total: number,
    bySeverity: { critical: number; high: number; medium: number; low: number },
    categorized: CategorizedError[]
  ): string {
    if (total === 0) {
      return 'No console errors detected on this page.';
    }

    const lines: string[] = [];
    lines.push(`Found ${total} console error(s):`);

    if (bySeverity.critical > 0) {
      lines.push(`  - ${bySeverity.critical} CRITICAL error(s)`);
    }
    if (bySeverity.high > 0) {
      lines.push(`  - ${bySeverity.high} HIGH severity error(s)`);
    }
    if (bySeverity.medium > 0) {
      lines.push(`  - ${bySeverity.medium} MEDIUM severity error(s)`);
    }
    if (bySeverity.low > 0) {
      lines.push(`  - ${bySeverity.low} LOW severity error(s)`);
    }

    // Add top categories
    const topCategories = categorized.slice(0, 3);
    if (topCategories.length > 0) {
      lines.push('\nTop issues:');
      for (const error of topCategories) {
        lines.push(`  - ${error.category}: ${error.message} (${error.count}x)`);
      }
    }

    return lines.join('\n');
  }
}
