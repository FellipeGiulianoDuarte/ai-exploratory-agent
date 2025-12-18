/**
 * Domain types for page context.
 *
 * These represent the page state for exploration purposes.
 */

/**
 * Simplified page state for exploration context.
 */
export interface PageContext {
  /** Current URL */
  url: string;
  /** Page title */
  title: string;
  /** Visible text content (truncated) */
  visibleText: string;
  /** Interactive elements summary */
  elements: Array<{
    selector: string;
    type: string;
    text: string;
    isVisible: boolean;
  }>;
  /** Console errors if any */
  consoleErrors: string[];
  /** Network errors if any */
  networkErrors: string[];
}
