import { PageState } from '../../domain/browser/PageState';
import { InteractiveElement } from '../../domain/browser/InteractiveElement';

/**
 * Options for browser navigation.
 */
export interface NavigateOptions {
  /** Wait for navigation to complete */
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
  /** Timeout in milliseconds */
  timeout?: number;
}

/**
 * Options for click actions.
 */
export interface ClickOptions {
  /** Delay before clicking in milliseconds */
  delay?: number;
  /** Number of clicks */
  clickCount?: number;
  /** Mouse button to use */
  button?: 'left' | 'right' | 'middle';
  /** Force click even if element is not visible */
  force?: boolean;
  /** Timeout in milliseconds */
  timeout?: number;
}

/**
 * Options for fill actions.
 */
export interface FillOptions {
  /** Clear the field before filling */
  clear?: boolean;
  /** Timeout in milliseconds */
  timeout?: number;
}

/**
 * Options for screenshot capture.
 */
export interface ScreenshotOptions {
  /** Full page screenshot or viewport only */
  fullPage?: boolean;
  /** File path to save the screenshot */
  path?: string;
  /** Image type */
  type?: 'png' | 'jpeg';
  /** Quality for JPEG (0-100) */
  quality?: number;
}

/**
 * Result of a browser action.
 */
export interface ActionResult {
  /** Whether the action succeeded */
  success: boolean;
  /** Error message if action failed */
  error?: string;
  /** Duration of the action in milliseconds */
  duration: number;
  /** Any additional data from the action */
  data?: unknown;
}

/**
 * Port interface for browser automation operations.
 * Defines the contract for browser interactions that the application layer depends on.
 */
export interface BrowserPort {
  /**
   * Initializes the browser instance.
   * Must be called before any other operations.
   */
  initialize(): Promise<void>;

  /**
   * Closes the browser instance and releases resources.
   */
  close(): Promise<void>;

  /**
   * Navigates to the specified URL.
   * @param url - The URL to navigate to
   * @param options - Navigation options
   */
  navigate(url: string, options?: NavigateOptions): Promise<ActionResult>;

  /**
   * Clicks on an element identified by selector.
   * @param selector - CSS selector or element reference
   * @param options - Click options
   */
  click(selector: string, options?: ClickOptions): Promise<ActionResult>;

  /**
   * Fills a form field with the specified value.
   * @param selector - CSS selector for the input field
   * @param value - Value to fill
   * @param options - Fill options
   */
  fill(selector: string, value: string, options?: FillOptions): Promise<ActionResult>;

  /**
   * Selects an option from a dropdown.
   * @param selector - CSS selector for the select element
   * @param value - Value or label to select
   */
  select(selector: string, value: string): Promise<ActionResult>;

  /**
   * Hovers over an element.
   * @param selector - CSS selector for the element
   */
  hover(selector: string): Promise<ActionResult>;

  /**
   * Takes a screenshot of the current page.
   * @param options - Screenshot options
   * @returns Path to the saved screenshot
   */
  screenshot(options?: ScreenshotOptions): Promise<string>;

  /**
   * Extracts the current state of the page.
   * Includes URL, title, visible content, and page metadata.
   */
  extractPageState(): Promise<PageState>;

  /**
   * Gets all interactive elements on the current page.
   * @returns Array of interactive elements
   */
  getInteractiveElements(): Promise<InteractiveElement[]>;

  /**
   * Waits for a specific condition.
   * @param selector - CSS selector to wait for
   * @param options - Wait options
   */
  waitForSelector(selector: string, options?: { timeout?: number; state?: 'visible' | 'hidden' | 'attached' }): Promise<ActionResult>;

  /**
   * Executes JavaScript in the page context.
   * @param script - JavaScript code to execute
   * @returns Result of the script execution
   */
  evaluate<T>(script: string | (() => T)): Promise<T>;

  /**
   * Checks if the browser is initialized and ready.
   */
  isReady(): boolean;

  /**
   * Gets the current URL.
   */
  getCurrentUrl(): Promise<string>;

  /**
   * Gets the page title.
   */
  getTitle(): Promise<string>;

  /**
   * Goes back in browser history.
   */
  goBack(): Promise<ActionResult>;

  /**
   * Refreshes the current page.
   */
  refresh(): Promise<ActionResult>;
}
