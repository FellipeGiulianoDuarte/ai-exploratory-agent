import { PageContext as LLMPageContext } from '../exploration/PageContext';
import { ActionDecision } from '../exploration/ActionTypes';
import { TestingPersona, PersonaSuggestion } from './TestingPersona';

/**
 * The Monitor Agent - Watches logs, network requests, and console messages
 *
 * Focuses on analyzing runtime behavior, failed requests, console errors,
 * performance issues, and other behind-the-scenes problems.
 */
export class MonitorPersona implements TestingPersona {
  readonly id = 'monitor';
  readonly name = 'Monitor Agent';
  readonly description = 'Monitors console logs, network requests, and runtime errors';
  readonly priority = 9;

  // Error severity classification
  private severityPatterns = {
    critical: [/unhandled.*exception/i, /fatal/i, /crash/i, /security/i, /unauthorized/i],
    high: [/error/i, /failed/i, /500/i, /503/i, /timeout/i],
    medium: [/warning/i, /deprecated/i, /404/i, /not found/i],
    low: [/info/i, /debug/i, /notice/i],
  };

  analyzeAndSuggest(
    context: LLMPageContext,
    _history: Array<{ action: ActionDecision; success: boolean }>
  ): PersonaSuggestion[] {
    const suggestions: PersonaSuggestion[] = [];

    // Analyze console errors
    const consoleAnalysis = this.analyzeConsoleErrors(context.consoleErrors || []);

    if (consoleAnalysis.critical.length > 0) {
      suggestions.push({
        action: {
          action: 'tool',
          toolName: 'report_finding',
          toolParams: {
            type: 'console_error',
            severity: 'critical',
            details: consoleAnalysis.critical,
          },
        },
        reasoning: `Critical errors detected in console: ${consoleAnalysis.critical.length}`,
        intent: 'Report critical application failures',
        verification: 'Check finding reported successfully',
        riskLevel: 'safe',
        expectedFindingType: 'critical_console_error',
        confidence: 0.95,
      });
    }

    if (consoleAnalysis.high.length > 0) {
      suggestions.push({
        action: {
          action: 'tool',
          toolName: 'report_finding',
          toolParams: {
            type: 'console_error',
            severity: 'high',
            details: consoleAnalysis.high,
          },
        },
        reasoning: `High severity errors in console: ${consoleAnalysis.high.length}`,
        intent: 'Report high-severity operational errors',
        verification: 'Check finding reported successfully',
        riskLevel: 'safe',
        expectedFindingType: 'high_console_error',
        confidence: 0.9,
      });
    }

    // Analyze network errors
    const networkAnalysis = this.analyzeNetworkErrors(context.networkErrors || []);

    if (networkAnalysis.serverErrors.length > 0) {
      suggestions.push({
        action: {
          action: 'tool',
          toolName: 'report_finding',
          toolParams: {
            type: 'network_error',
            severity: 'high',
            details: networkAnalysis.serverErrors,
          },
        },
        reasoning: `Server errors (5xx) detected: ${networkAnalysis.serverErrors.length}`,
        intent: 'Report backend server failures',
        verification: 'Check finding reported successfully',
        riskLevel: 'safe',
        expectedFindingType: 'server_error',
        confidence: 0.95,
      });
    }

    if (networkAnalysis.clientErrors.length > 0) {
      suggestions.push({
        action: {
          action: 'tool',
          toolName: 'report_finding',
          toolParams: {
            type: 'network_error',
            severity: 'medium',
            details: networkAnalysis.clientErrors,
          },
        },
        reasoning: `Client errors (4xx) detected: ${networkAnalysis.clientErrors.length}`,
        intent: 'Report client-side request errors',
        verification: 'Check finding reported successfully',
        riskLevel: 'safe',
        expectedFindingType: 'client_error',
        confidence: 0.85,
      });
    }

    if (networkAnalysis.corsErrors.length > 0) {
      suggestions.push({
        action: {
          action: 'tool',
          toolName: 'report_finding',
          toolParams: {
            type: 'cors_error',
            severity: 'medium',
            details: networkAnalysis.corsErrors,
          },
        },
        reasoning: `CORS errors detected: ${networkAnalysis.corsErrors.length}`,
        intent: 'Report cross-origin resource sharing violations',
        verification: 'Check finding reported successfully',
        riskLevel: 'safe',
        expectedFindingType: 'cors_error',
        confidence: 0.9,
      });
    }

    // Suggest refreshing to see if errors persist
    if (consoleAnalysis.total > 0 || networkAnalysis.total > 0) {
      suggestions.push({
        action: {
          action: 'refresh',
        },
        reasoning: 'Refresh page to verify if errors are consistent or intermittent',
        intent: 'Determine reproducibility of errors',
        verification: 'Compare error counts before and after refresh',
        riskLevel: 'safe',
        expectedFindingType: 'intermittent_error',
        confidence: 0.6,
      });
    }

    // Look for performance issues in console
    const perfIssues = this.detectPerformanceIssues(context.consoleErrors || []);
    if (perfIssues.length > 0) {
      suggestions.push({
        action: {
          action: 'tool',
          toolName: 'report_finding',
          toolParams: {
            type: 'performance_issue',
            severity: 'medium',
            details: perfIssues,
          },
        },
        reasoning: 'Performance warnings detected',
        intent: 'Report client-side performance bottlenecks',
        verification: 'Check finding reported successfully',
        riskLevel: 'safe',
        expectedFindingType: 'performance_issue',
        confidence: 0.8,
      });
    }

    return suggestions;
  }

  private analyzeConsoleErrors(errors: string[]): {
    critical: string[];
    high: string[];
    medium: string[];
    low: string[];
    total: number;
  } {
    const result = {
      critical: [] as string[],
      high: [] as string[],
      medium: [] as string[],
      low: [] as string[],
      total: errors.length,
    };

    for (const error of errors) {
      let classified = false;

      for (const pattern of this.severityPatterns.critical) {
        if (pattern.test(error)) {
          result.critical.push(error);
          classified = true;
          break;
        }
      }

      if (!classified) {
        for (const pattern of this.severityPatterns.high) {
          if (pattern.test(error)) {
            result.high.push(error);
            classified = true;
            break;
          }
        }
      }

      if (!classified) {
        for (const pattern of this.severityPatterns.medium) {
          if (pattern.test(error)) {
            result.medium.push(error);
            classified = true;
            break;
          }
        }
      }

      if (!classified) {
        result.low.push(error);
      }
    }

    return result;
  }

  private analyzeNetworkErrors(errors: string[]): {
    serverErrors: string[];
    clientErrors: string[];
    corsErrors: string[];
    timeouts: string[];
    total: number;
  } {
    const result = {
      serverErrors: [] as string[],
      clientErrors: [] as string[],
      corsErrors: [] as string[],
      timeouts: [] as string[],
      total: errors.length,
    };

    for (const error of errors) {
      if (/5\d{2}/.test(error)) {
        result.serverErrors.push(error);
      } else if (/4\d{2}/.test(error)) {
        result.clientErrors.push(error);
      } else if (/cors/i.test(error) || /cross-origin/i.test(error)) {
        result.corsErrors.push(error);
      } else if (/timeout/i.test(error)) {
        result.timeouts.push(error);
      }
    }

    return result;
  }

  private detectPerformanceIssues(errors: string[]): string[] {
    const perfPatterns = [/slow/i, /performance/i, /memory/i, /leak/i, /long task/i, /blocking/i];

    return errors.filter(error => perfPatterns.some(pattern => pattern.test(error)));
  }

  getSystemPromptAddition(): string {
    return `You are in MONITOR MODE. Your goal is to watch for runtime issues.

## Console Errors
- JavaScript errors indicate bugs that need fixing
- Unhandled promise rejections are often critical
- Deprecation warnings may indicate future breaking changes
- Look for stack traces pointing to application code

## Network Monitoring
- 500 errors indicate server-side bugs
- 401/403 errors may indicate auth issues
- 404 errors indicate broken links or missing resources
- CORS errors indicate misconfiguration
- Timeout errors indicate performance problems

## What to Report
- Any JavaScript exception
- Failed API calls
- Missing resources (404s)
- Security-related errors
- Performance warnings`;
  }

  isRelevant(context: LLMPageContext): boolean {
    // Monitor is always relevant but especially when errors exist
    return (
      (context.consoleErrors && context.consoleErrors.length > 0) ||
      (context.networkErrors && context.networkErrors.length > 0) ||
      true // Always run monitor persona
    );
  }
}
