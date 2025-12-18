import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { createHash } from 'crypto';
import * as path from 'path';
import * as fs from 'fs';
import {
  BrowserPort,
  NavigateOptions,
  ClickOptions,
  FillOptions,
  ScreenshotOptions,
  ActionResult,
} from '../../application/ports/BrowserPort';
import { PageState } from '../../domain/browser/PageState';
import {
  InteractiveElement,
  InteractiveElementProps,
  ElementType,
} from '../../domain/browser/InteractiveElement';

/**
 * Configuration for the PlaywrightBrowserAdapter.
 */
export interface PlaywrightBrowserConfig {
  /** Run browser in headless mode */
  headless?: boolean;
  /** Default timeout for actions in milliseconds */
  timeout?: number;
  /** Directory to save screenshots */
  screenshotDir?: string;
  /** Viewport width */
  viewportWidth?: number;
  /** Viewport height */
  viewportHeight?: number;
  /** Maximum retry attempts for failed actions */
  maxRetries?: number;
  /** Base delay for exponential backoff in milliseconds */
  retryBaseDelay?: number;
}

const DEFAULT_CONFIG: Required<PlaywrightBrowserConfig> = {
  headless: true,
  timeout: 30000,
  screenshotDir: './screenshots',
  viewportWidth: 1280,
  viewportHeight: 720,
  maxRetries: 3,
  retryBaseDelay: 1000,
};

/**
 * Playwright implementation of the BrowserPort interface.
 * Provides browser automation capabilities for the exploration agent.
 */
export class PlaywrightBrowserAdapter implements BrowserPort {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private config: Required<PlaywrightBrowserConfig>;
  private consoleErrors: string[] = [];
  private networkErrors: string[] = [];

  constructor(config: PlaywrightBrowserConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initializes the browser instance.
   */
  async initialize(): Promise<void> {
    // Ensure screenshot directory exists
    if (!fs.existsSync(this.config.screenshotDir)) {
      fs.mkdirSync(this.config.screenshotDir, { recursive: true });
    }

    this.browser = await chromium.launch({
      headless: this.config.headless,
    });

    this.context = await this.browser.newContext({
      viewport: {
        width: this.config.viewportWidth,
        height: this.config.viewportHeight,
      },
    });

    this.page = await this.context.newPage();

    // Set default timeout
    this.page.setDefaultTimeout(this.config.timeout);

    // Capture console errors
    this.page.on('console', msg => {
      if (msg.type() === 'error') {
        this.consoleErrors.push(msg.text());
      }
    });

    // Capture network errors
    this.page.on('requestfailed', request => {
      const failure = request.failure();
      this.networkErrors.push(`${request.url()} - ${failure?.errorText ?? 'Unknown error'}`);
    });
  }

  /**
   * Closes the browser instance.
   */
  async close(): Promise<void> {
    if (this.page) {
      await this.page.close();
      this.page = null;
    }
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Checks if the browser is ready.
   */
  isReady(): boolean {
    return this.browser !== null && this.page !== null;
  }

  /**
   * Executes an action with retry logic and exponential backoff.
   */
  private async withRetry<T>(
    action: () => Promise<T>,
    actionName: string
  ): Promise<{ result: T | null; error: string | null; duration: number }> {
    const startTime = Date.now();
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        const result = await action();
        return {
          result,
          error: null,
          duration: Date.now() - startTime,
        };
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < this.config.maxRetries) {
          const delay = this.config.retryBaseDelay * Math.pow(2, attempt - 1);
          await this.sleep(delay);
        }
      }
    }

    return {
      result: null,
      error: `${actionName} failed after ${this.config.maxRetries} attempts: ${lastError?.message}`,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Sleep helper for retry delays.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Ensures the page is initialized.
   */
  private ensurePage(): Page {
    if (!this.page) {
      throw new Error('Browser not initialized. Call initialize() first.');
    }
    return this.page;
  }

  /**
   * Navigates to the specified URL.
   */
  async navigate(url: string, options: NavigateOptions = {}): Promise<ActionResult> {
    const page = this.ensurePage();
    
    // Clear errors before navigation
    this.consoleErrors = [];
    this.networkErrors = [];

    const { result, error, duration } = await this.withRetry(async () => {
      await page.goto(url, {
        waitUntil: options.waitUntil ?? 'domcontentloaded',
        timeout: options.timeout ?? this.config.timeout,
      });
      return true;
    }, 'Navigate');

    return {
      success: result !== null,
      error: error ?? undefined,
      duration,
    };
  }

  /**
   * Clicks on an element.
   */
  async click(selector: string, options: ClickOptions = {}): Promise<ActionResult> {
    const page = this.ensurePage();

    const { result, error, duration } = await this.withRetry(async () => {
      await page.click(selector, {
        delay: options.delay,
        clickCount: options.clickCount,
        button: options.button,
        force: options.force,
        timeout: options.timeout ?? this.config.timeout,
      });
      return true;
    }, 'Click');

    return {
      success: result !== null,
      error: error ?? undefined,
      duration,
    };
  }

  /**
   * Fills a form field.
   */
  async fill(selector: string, value: string, options: FillOptions = {}): Promise<ActionResult> {
    const page = this.ensurePage();

    const { result, error, duration } = await this.withRetry(async () => {
      if (options.clear) {
        await page.fill(selector, '');
      }
      await page.fill(selector, value, {
        timeout: options.timeout ?? this.config.timeout,
      });
      return true;
    }, 'Fill');

    return {
      success: result !== null,
      error: error ?? undefined,
      duration,
    };
  }

  /**
   * Selects an option from a dropdown.
   */
  async select(selector: string, value: string): Promise<ActionResult> {
    const page = this.ensurePage();

    const { result, error, duration } = await this.withRetry(async () => {
      await page.selectOption(selector, value);
      return true;
    }, 'Select');

    return {
      success: result !== null,
      error: error ?? undefined,
      duration,
    };
  }

  /**
   * Hovers over an element.
   */
  async hover(selector: string): Promise<ActionResult> {
    const page = this.ensurePage();

    const { result, error, duration } = await this.withRetry(async () => {
      await page.hover(selector);
      return true;
    }, 'Hover');

    return {
      success: result !== null,
      error: error ?? undefined,
      duration,
    };
  }

  /**
   * Takes a screenshot.
   */
  async screenshot(options: ScreenshotOptions = {}): Promise<string> {
    const page = this.ensurePage();

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = options.path ?? `screenshot-${timestamp}.${options.type ?? 'png'}`;
    const filepath = path.isAbsolute(filename)
      ? filename
      : path.join(this.config.screenshotDir, filename);

    await page.screenshot({
      path: filepath,
      fullPage: options.fullPage ?? false,
      type: options.type ?? 'png',
      quality: options.type === 'jpeg' ? options.quality : undefined,
    });

    return filepath;
  }

  /**
   * Extracts the current page state.
   */
  async extractPageState(): Promise<PageState> {
    const page = this.ensurePage();

    const [url, title, interactiveElements, visibleText] = await Promise.all([
      page.url(),
      page.title(),
      this.getInteractiveElements(),
      page.evaluate(() => document.body.innerText.substring(0, 5000)),
    ]);

    const contentHash = createHash('md5')
      .update(url + title + visibleText.substring(0, 1000))
      .digest('hex');

    return PageState.create({
      url,
      title,
      contentHash,
      timestamp: new Date(),
      interactiveElements,
      visibleText,
      isLoading: false,
      consoleErrors: [...this.consoleErrors],
      networkErrors: [...this.networkErrors],
      viewport: {
        width: this.config.viewportWidth,
        height: this.config.viewportHeight,
      },
    });
  }

  /**
   * Gets all interactive elements on the page.
   */
  async getInteractiveElements(): Promise<InteractiveElement[]> {
    const page = this.ensurePage();

    const elementsData = await page.evaluate(() => {
      const elements: Array<{
        selector: string;
        type: string;
        text: string;
        tagName: string;
        attributes: Record<string, string>;
        boundingBox: { x: number; y: number; width: number; height: number } | null;
        isVisible: boolean;
        isEnabled: boolean;
        ariaLabel?: string;
        placeholder?: string;
        value?: string;
      }> = [];

      // Selectors for interactive elements
      const selectors = [
        'a[href]',
        'button',
        'input',
        'select',
        'textarea',
        '[role="button"]',
        '[role="link"]',
        '[onclick]',
        '[tabindex]:not([tabindex="-1"])',
      ];

      const seen = new Set<Element>();
      let elementIndex = 0;

      selectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => {
          if (seen.has(el)) return;
          seen.add(el);

          const element = el as HTMLElement;
          const rect = element.getBoundingClientRect();
          
          // Check visibility
          const style = window.getComputedStyle(element);
          const isVisible =
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            style.opacity !== '0' &&
            rect.width > 0 &&
            rect.height > 0;

          // Get attributes
          const attributes: Record<string, string> = {};
          for (let i = 0; i < element.attributes.length; i++) {
            const attr = element.attributes[i];
            attributes[attr.name] = attr.value;
          }

          // Determine element type
          let type = 'other';
          const tagName = element.tagName.toLowerCase();
          
          if (tagName === 'a') type = 'link';
          else if (tagName === 'button' || element.getAttribute('role') === 'button') type = 'button';
          else if (tagName === 'input') {
            const inputType = (element as HTMLInputElement).type;
            if (inputType === 'checkbox') type = 'checkbox';
            else if (inputType === 'radio') type = 'radio';
            else type = 'input';
          }
          else if (tagName === 'select') type = 'select';
          else if (tagName === 'textarea') type = 'textarea';
          else if (tagName === 'img') type = 'image';
          else if (tagName === 'form') type = 'form';

          // Generate unique selector
          let uniqueSelector = '';
          if (attributes['id']) {
            uniqueSelector = `#${attributes['id']}`;
          } else if (attributes['data-test']) {
            uniqueSelector = `[data-test="${attributes['data-test']}"]`;
          } else if (attributes['name']) {
            uniqueSelector = `${tagName}[name="${attributes['name']}"]`;
          } else {
            uniqueSelector = `${tagName}:nth-of-type(${++elementIndex})`;
          }

          // Get element text
          const text = element.innerText?.trim().substring(0, 100) || '';

          elements.push({
            selector: uniqueSelector,
            type,
            text,
            tagName,
            attributes,
            boundingBox: isVisible
              ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
              : null,
            isVisible,
            isEnabled: !(element as HTMLInputElement).disabled,
            ariaLabel: element.getAttribute('aria-label') || undefined,
            placeholder: (element as HTMLInputElement).placeholder || undefined,
            value: (element as HTMLInputElement).value || undefined,
          });
        });
      });

      return elements;
    });

    return elementsData.map(data =>
      InteractiveElement.create({
        ...data,
        type: data.type as ElementType,
      } as InteractiveElementProps)
    );
  }

  /**
   * Waits for a selector.
   */
  async waitForSelector(
    selector: string,
    options: { timeout?: number; state?: 'visible' | 'hidden' | 'attached' } = {}
  ): Promise<ActionResult> {
    const page = this.ensurePage();

    const { result, error, duration } = await this.withRetry(async () => {
      await page.waitForSelector(selector, {
        timeout: options.timeout ?? this.config.timeout,
        state: options.state ?? 'visible',
      });
      return true;
    }, 'WaitForSelector');

    return {
      success: result !== null,
      error: error ?? undefined,
      duration,
    };
  }

  /**
   * Evaluates JavaScript in the page context.
   */
  async evaluate<T>(script: string | (() => T)): Promise<T> {
    const page = this.ensurePage();
    return await page.evaluate(script as () => T);
  }

  /**
   * Gets the current URL.
   */
  async getCurrentUrl(): Promise<string> {
    const page = this.ensurePage();
    return page.url();
  }

  /**
   * Gets the page title.
   */
  async getTitle(): Promise<string> {
    const page = this.ensurePage();
    return page.title();
  }

  /**
   * Goes back in browser history.
   */
  async goBack(): Promise<ActionResult> {
    const page = this.ensurePage();

    const { result, error, duration } = await this.withRetry(async () => {
      await page.goBack();
      return true;
    }, 'GoBack');

    return {
      success: result !== null,
      error: error ?? undefined,
      duration,
    };
  }

  /**
   * Refreshes the current page.
   */
  async refresh(): Promise<ActionResult> {
    const page = this.ensurePage();

    const { result, error, duration } = await this.withRetry(async () => {
      await page.reload();
      return true;
    }, 'Refresh');

    return {
      success: result !== null,
      error: error ?? undefined,
      duration,
    };
  }
}
