import { BaseTool } from '../../domain/tools/BaseTool';
import { ToolContext, ToolParameterSchema } from '../../domain/tools/Tool';

/**
 * Parameters for the DropdownValidatorTool.
 */
export interface DropdownValidatorParams {
  /** Whether to check for empty options */
  checkEmptyOptions?: boolean;
  /** Whether to check option values */
  checkValues?: boolean;
}

/**
 * Dropdown issue.
 */
export interface DropdownIssue {
  selector: string;
  label: string;
  type: 'undefined_option' | 'null_option' | 'empty_option' | 'invalid_value' | 'nan_option' | 'object_option';
  severity: 'critical' | 'high' | 'medium' | 'low';
  problematicOptions: Array<{
    text: string;
    value: string;
    index: number;
  }>;
  totalOptions: number;
}

/**
 * Dropdown validation report.
 */
export interface DropdownValidationReport {
  pageUrl: string;
  pageTitle: string;
  timestamp: Date;
  totalDropdowns: number;
  dropdownsWithIssues: number;
  issues: DropdownIssue[];
  summary: string;
}

/**
 * Raw select data extracted from the page.
 */
interface RawSelectData {
  selector: string;
  label: string;
  options: Array<{
    text: string;
    value: string;
    index: number;
  }>;
}

/**
 * Tool that validates dropdown/select elements for common bugs.
 *
 * Detects:
 * - Options with "undefined" text
 * - Options with "null" text
 * - Options with "[object Object]" text
 * - Options with "NaN" text
 * - Empty option text
 * - Invalid option values
 */
export class DropdownValidatorTool extends BaseTool<
  DropdownValidatorParams,
  DropdownValidationReport
> {
  readonly name = 'check_dropdowns';
  readonly description =
    'Validates dropdown/select elements for common bugs like "undefined", "null", "NaN", or empty options.';

  // Patterns for problematic option text
  private readonly problemPatterns = {
    undefined_option: /^undefined$/i,
    null_option: /^null$/i,
    nan_option: /^NaN$/i,
    object_option: /\[object Object\]/i,
    empty_option: /^\s*$/,
  };

  protected getParameterSchema(): Record<string, ToolParameterSchema> {
    return {
      checkEmptyOptions: {
        type: 'boolean',
        description: 'Whether to check for empty option text',
        required: false,
        default: true,
      },
      checkValues: {
        type: 'boolean',
        description: 'Whether to check option values for issues',
        required: false,
        default: true,
      },
    };
  }

  protected async executeInternal(
    params: DropdownValidatorParams,
    context: ToolContext
  ): Promise<DropdownValidationReport> {
    // Get page info
    const [pageUrl, pageTitle] = await Promise.all([
      context.browser.getCurrentUrl(),
      context.browser.getTitle(),
    ]);

    // Extract all select elements from the page
    const selects = await this.extractSelects(context);

    // Validate each select
    const issues: DropdownIssue[] = [];
    for (const select of selects) {
      const selectIssues = this.validateSelect(select, params);
      issues.push(...selectIssues);
    }

    // Generate summary
    const summary = this.generateSummary(selects.length, issues);

    return {
      pageUrl,
      pageTitle,
      timestamp: new Date(),
      totalDropdowns: selects.length,
      dropdownsWithIssues: issues.length,
      issues,
      summary,
    };
  }

  /**
   * Extract all select elements from the current page.
   */
  private async extractSelects(context: ToolContext): Promise<RawSelectData[]> {
    return context.browser.evaluate<RawSelectData[]>(() => {
      const selects = document.querySelectorAll('select');
      const result: RawSelectData[] = [];

      selects.forEach((select, selectIndex) => {
        // Generate selector
        let selector = '';
        if (select.id) {
          selector = `#${select.id}`;
        } else if (select.name) {
          selector = `select[name="${select.name}"]`;
        } else if (select.className) {
          selector = `select.${select.className.split(' ').join('.')}`;
        } else {
          selector = `select:nth-of-type(${selectIndex + 1})`;
        }

        // Get label
        let label = '';
        if (select.id) {
          const labelElement = document.querySelector(`label[for="${select.id}"]`);
          label = labelElement?.textContent?.trim() || '';
        }
        if (!label) {
          label = select.getAttribute('aria-label') || select.getAttribute('placeholder') || '';
        }
        if (!label) {
          label = selector;
        }

        // Extract options
        const options = Array.from(select.options).map((option, index) => ({
          text: option.text.trim(),
          value: option.value,
          index,
        }));

        result.push({
          selector,
          label,
          options,
        });
      });

      return result;
    });
  }

  /**
   * Validate a single select element.
   */
  private validateSelect(
    select: RawSelectData,
    params: DropdownValidatorParams
  ): DropdownIssue[] {
    const issues: DropdownIssue[] = [];
    const problematicOptionsByType = new Map<string, Array<{ text: string; value: string; index: number }>>();

    for (const option of select.options) {
      // Check option text
      for (const [type, pattern] of Object.entries(this.problemPatterns)) {
        if (pattern.test(option.text)) {
          // Skip empty option check if disabled
          if (type === 'empty_option' && !(params.checkEmptyOptions ?? true)) {
            continue;
          }

          const existing = problematicOptionsByType.get(type) || [];
          existing.push(option);
          problematicOptionsByType.set(type, existing);
        }
      }

      // Check option value if enabled
      if (params.checkValues ?? true) {
        if (this.problemPatterns.undefined_option.test(option.value)) {
          const existing = problematicOptionsByType.get('invalid_value') || [];
          existing.push(option);
          problematicOptionsByType.set('invalid_value', existing);
        }
      }
    }

    // Create issues for each problem type found
    for (const [type, options] of problematicOptionsByType.entries()) {
      const severity = this.determineSeverity(type as any);
      issues.push({
        selector: select.selector,
        label: select.label,
        type: type as any,
        severity,
        problematicOptions: options,
        totalOptions: select.options.length,
      });
    }

    return issues;
  }

  /**
   * Determine severity based on issue type.
   */
  private determineSeverity(
    type: 'undefined_option' | 'null_option' | 'empty_option' | 'invalid_value' | 'nan_option' | 'object_option'
  ): 'critical' | 'high' | 'medium' | 'low' {
    switch (type) {
      case 'object_option':
        return 'critical';
      case 'undefined_option':
      case 'null_option':
      case 'nan_option':
        return 'high';
      case 'invalid_value':
        return 'medium';
      case 'empty_option':
        return 'low';
      default:
        return 'medium';
    }
  }

  /**
   * Generate summary text.
   */
  private generateSummary(totalDropdowns: number, issues: DropdownIssue[]): string {
    if (totalDropdowns === 0) {
      return 'No dropdown elements found on this page.';
    }

    if (issues.length === 0) {
      return `All ${totalDropdowns} dropdown(s) validated successfully - no issues found.`;
    }

    const lines: string[] = [];
    lines.push(`Found issues in ${issues.length} of ${totalDropdowns} dropdown(s):`);

    // Count by type
    const byType = {
      object: issues.filter(i => i.type === 'object_option').length,
      undefined: issues.filter(i => i.type === 'undefined_option').length,
      null: issues.filter(i => i.type === 'null_option').length,
      nan: issues.filter(i => i.type === 'nan_option').length,
      empty: issues.filter(i => i.type === 'empty_option').length,
      invalid: issues.filter(i => i.type === 'invalid_value').length,
    };

    if (byType.object > 0) {
      lines.push(`  - ${byType.object} with "[object Object]" options [CRITICAL]`);
    }
    if (byType.undefined > 0) {
      lines.push(`  - ${byType.undefined} with "undefined" options [HIGH]`);
    }
    if (byType.null > 0) {
      lines.push(`  - ${byType.null} with "null" options [HIGH]`);
    }
    if (byType.nan > 0) {
      lines.push(`  - ${byType.nan} with "NaN" options [HIGH]`);
    }
    if (byType.empty > 0) {
      lines.push(`  - ${byType.empty} with empty options [LOW]`);
    }
    if (byType.invalid > 0) {
      lines.push(`  - ${byType.invalid} with invalid values [MEDIUM]`);
    }

    // Add specific dropdown info
    const criticalIssues = issues.filter(i => i.severity === 'critical' || i.severity === 'high');
    if (criticalIssues.length > 0) {
      lines.push('\nCritical/High severity dropdowns:');
      for (const issue of criticalIssues.slice(0, 3)) {
        lines.push(`  - "${issue.label}" (${issue.selector})`);
        lines.push(`    Problem: ${issue.problematicOptions.length} options with ${issue.type.replace('_', ' ')}`);
      }
    }

    return lines.join('\n');
  }
}
