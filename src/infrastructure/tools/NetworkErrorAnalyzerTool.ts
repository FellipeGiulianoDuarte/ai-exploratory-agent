import { BaseTool } from '../../domain/tools/BaseTool';
import { ToolContext, ToolParameterSchema } from '../../domain/tools/Tool';

/**
 * Parameters for the NetworkErrorAnalyzerTool.
 */
export interface NetworkErrorAnalyzerParams {
  /** Whether to group similar errors */
  groupSimilar?: boolean;
}

/**
 * Categorized network error.
 */
export interface CategorizedNetworkError {
  url: string;
  errorType: 'server_error' | 'client_error' | 'cors_error' | 'timeout' | 'other';
  statusCode?: number;
  message: string;
  count: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

/**
 * Network error analysis report.
 */
export interface NetworkErrorReport {
  pageUrl: string;
  pageTitle: string;
  timestamp: Date;
  totalErrors: number;
  errorsByType: {
    serverErrors: number;
    clientErrors: number;
    corsErrors: number;
    timeouts: number;
    other: number;
  };
  categorizedErrors: CategorizedNetworkError[];
  rawErrors: string[];
  summary: string;
}

/**
 * Tool that analyzes network errors and categorizes them.
 *
 * Helps identify:
 * - Server errors (5xx)
 * - Client errors (4xx)
 * - CORS issues
 * - Timeout issues
 * - Failed API calls
 */
export class NetworkErrorAnalyzerTool extends BaseTool<
  NetworkErrorAnalyzerParams,
  NetworkErrorReport
> {
  readonly name = 'analyze_network_errors';
  readonly description =
    'Analyzes network errors including failed requests, 4xx/5xx errors, CORS issues, and timeouts. Helps identify broken APIs and connectivity problems.';

  protected getParameterSchema(): Record<string, ToolParameterSchema> {
    return {
      groupSimilar: {
        type: 'boolean',
        description: 'Whether to group similar errors together',
        required: false,
        default: true,
      },
    };
  }

  protected async executeInternal(
    params: NetworkErrorAnalyzerParams,
    context: ToolContext
  ): Promise<NetworkErrorReport> {
    // Get page info
    const [pageUrl, pageTitle] = await Promise.all([
      context.browser.getCurrentUrl(),
      context.browser.getTitle(),
    ]);

    // Extract network errors from browser (stored in PageState)
    const pageState = await context.browser.extractPageState();
    const rawErrors = pageState.networkErrors || [];

    // Categorize errors
    const categorizedErrors = this.categorizeErrors(rawErrors, params.groupSimilar ?? true);

    // Count by type
    const errorsByType = {
      serverErrors: categorizedErrors.filter(e => e.errorType === 'server_error').length,
      clientErrors: categorizedErrors.filter(e => e.errorType === 'client_error').length,
      corsErrors: categorizedErrors.filter(e => e.errorType === 'cors_error').length,
      timeouts: categorizedErrors.filter(e => e.errorType === 'timeout').length,
      other: categorizedErrors.filter(e => e.errorType === 'other').length,
    };

    // Generate summary
    const summary = this.generateSummary(rawErrors.length, errorsByType, categorizedErrors);

    return {
      pageUrl,
      pageTitle,
      timestamp: new Date(),
      totalErrors: rawErrors.length,
      errorsByType,
      categorizedErrors,
      rawErrors,
      summary,
    };
  }

  /**
   * Categorize network errors by type and severity.
   */
  private categorizeErrors(errors: string[], groupSimilar: boolean): CategorizedNetworkError[] {
    const errorMap = new Map<string, CategorizedNetworkError>();

    for (const error of errors) {
      const { url, errorType, statusCode, message } = this.parseNetworkError(error);
      const severity = this.determineSeverity(errorType, statusCode);

      // Create grouping key
      const key = groupSimilar ? `${errorType}-${url}` : `${errorType}-${url}-${Date.now()}`;

      const existing = errorMap.get(key);
      if (existing) {
        existing.count++;
      } else {
        errorMap.set(key, {
          url,
          errorType,
          statusCode,
          message,
          count: 1,
          severity,
        });
      }
    }

    // Sort by severity then by count
    return Array.from(errorMap.values()).sort((a, b) => {
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      if (a.severity !== b.severity) {
        return severityOrder[a.severity] - severityOrder[b.severity];
      }
      return b.count - a.count;
    });
  }

  /**
   * Parse a network error string to extract details.
   */
  private parseNetworkError(error: string): {
    url: string;
    errorType: 'server_error' | 'client_error' | 'cors_error' | 'timeout' | 'other';
    statusCode?: number;
    message: string;
  } {
    // Extract URL (usually before " - ")
    const urlMatch = error.match(/^([^\s]+)\s*-\s*/);
    const url = urlMatch ? urlMatch[1] : error.split(' ')[0];

    // Extract status code
    const statusMatch = error.match(/\b(4\d{2}|5\d{2})\b/);
    const statusCode = statusMatch ? parseInt(statusMatch[1], 10) : undefined;

    // Determine error type
    let errorType: 'server_error' | 'client_error' | 'cors_error' | 'timeout' | 'other';
    if (statusCode && statusCode >= 500) {
      errorType = 'server_error';
    } else if (statusCode && statusCode >= 400) {
      errorType = 'client_error';
    } else if (/cors/i.test(error) || /cross-origin/i.test(error)) {
      errorType = 'cors_error';
    } else if (/timeout/i.test(error)) {
      errorType = 'timeout';
    } else {
      errorType = 'other';
    }

    return {
      url,
      errorType,
      statusCode,
      message: error,
    };
  }

  /**
   * Determine severity based on error type and status code.
   */
  private determineSeverity(
    errorType: string,
    statusCode?: number
  ): 'critical' | 'high' | 'medium' | 'low' {
    // Server errors are critical
    if (errorType === 'server_error') {
      return statusCode === 500 ? 'critical' : 'high';
    }

    // CORS errors are high priority (usually blocking functionality)
    if (errorType === 'cors_error') {
      return 'high';
    }

    // Timeouts are high priority
    if (errorType === 'timeout') {
      return 'high';
    }

    // Client errors vary
    if (errorType === 'client_error') {
      if (statusCode === 401 || statusCode === 403) {
        return 'high'; // Auth issues
      }
      if (statusCode === 404) {
        return 'medium'; // Not found
      }
      return 'medium';
    }

    return 'low';
  }

  /**
   * Generate summary text.
   */
  private generateSummary(
    total: number,
    byType: {
      serverErrors: number;
      clientErrors: number;
      corsErrors: number;
      timeouts: number;
      other: number;
    },
    categorized: CategorizedNetworkError[]
  ): string {
    if (total === 0) {
      return 'No network errors detected on this page.';
    }

    const lines: string[] = [];
    lines.push(`Found ${total} network error(s):`);

    if (byType.serverErrors > 0) {
      lines.push(`  - ${byType.serverErrors} Server error(s) (5xx)`);
    }
    if (byType.clientErrors > 0) {
      lines.push(`  - ${byType.clientErrors} Client error(s) (4xx)`);
    }
    if (byType.corsErrors > 0) {
      lines.push(`  - ${byType.corsErrors} CORS error(s)`);
    }
    if (byType.timeouts > 0) {
      lines.push(`  - ${byType.timeouts} Timeout(s)`);
    }
    if (byType.other > 0) {
      lines.push(`  - ${byType.other} Other error(s)`);
    }

    // Add top errors
    const criticalErrors = categorized.filter(
      e => e.severity === 'critical' || e.severity === 'high'
    );
    if (criticalErrors.length > 0) {
      lines.push('\nCritical/High severity errors:');
      for (const error of criticalErrors.slice(0, 3)) {
        const status = error.statusCode ? `[${error.statusCode}]` : '';
        lines.push(`  - ${status} ${error.url} (${error.count}x)`);
      }
    }

    return lines.join('\n');
  }
}
