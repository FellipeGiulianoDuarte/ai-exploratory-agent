import { ValueObject } from '../shared/ValueObject';
import { InteractiveElement } from './InteractiveElement';

/**
 * Properties for the PageState value object.
 */
export interface PageStateProps {
  /** Current URL of the page */
  url: string;
  /** Page title */
  title: string;
  /** Hash of the page content for change detection */
  contentHash: string;
  /** Timestamp when this state was captured */
  timestamp: Date;
  /** List of interactive elements found on the page */
  interactiveElements: InteractiveElement[];
  /** Visible text content (truncated for large pages) */
  visibleText: string;
  /** Whether the page is currently loading */
  isLoading: boolean;
  /** Any console errors detected on the page */
  consoleErrors: string[];
  /** Network errors (failed requests) */
  networkErrors: string[];
  /** Page viewport dimensions */
  viewport: {
    width: number;
    height: number;
  };
}

/**
 * Value object representing the current state of a web page.
 * Captures all relevant information for the exploration agent to make decisions.
 */
export class PageState extends ValueObject<PageStateProps> {
  private constructor(props: PageStateProps) {
    super(props);
  }

  /**
   * Creates a new PageState.
   */
  public static create(props: PageStateProps): PageState {
    return new PageState(props);
  }

  public get url(): string {
    return this.props.url;
  }

  public get title(): string {
    return this.props.title;
  }

  public get contentHash(): string {
    return this.props.contentHash;
  }

  public get timestamp(): Date {
    return this.props.timestamp;
  }

  public get interactiveElements(): InteractiveElement[] {
    return [...this.props.interactiveElements];
  }

  public get visibleText(): string {
    return this.props.visibleText;
  }

  public get isLoading(): boolean {
    return this.props.isLoading;
  }

  public get consoleErrors(): string[] {
    return [...this.props.consoleErrors];
  }

  public get networkErrors(): string[] {
    return [...this.props.networkErrors];
  }

  public get viewport(): PageStateProps['viewport'] {
    return { ...this.props.viewport };
  }

  /**
   * Returns the count of interactive elements.
   */
  public get elementCount(): number {
    return this.props.interactiveElements.length;
  }

  /**
   * Checks if there are any errors on the page.
   */
  public hasErrors(): boolean {
    return this.props.consoleErrors.length > 0 || this.props.networkErrors.length > 0;
  }

  /**
   * Gets elements by type.
   */
  public getElementsByType(type: string): InteractiveElement[] {
    return this.props.interactiveElements.filter(el => el.type === type);
  }

  /**
   * Finds an element by selector.
   */
  public findElement(selector: string): InteractiveElement | undefined {
    return this.props.interactiveElements.find(el => el.selector === selector);
  }

  /**
   * Returns a summary of the page state.
   */
  public summarize(): string {
    const lines: string[] = [
      `URL: ${this.url}`,
      `Title: ${this.title}`,
      `Elements: ${this.elementCount}`,
      `Loading: ${this.isLoading}`,
      `Console Errors: ${this.consoleErrors.length}`,
      `Network Errors: ${this.networkErrors.length}`,
    ];

    return lines.join('\n');
  }

  /**
   * Serializes the page state to a plain object.
   */
  public toJSON(): Record<string, unknown> {
    return {
      url: this.url,
      title: this.title,
      contentHash: this.contentHash,
      timestamp: this.timestamp.toISOString(),
      elementCount: this.elementCount,
      visibleText: this.visibleText.substring(0, 500),
      isLoading: this.isLoading,
      consoleErrors: this.consoleErrors,
      networkErrors: this.networkErrors,
      viewport: this.viewport,
      interactiveElements: this.props.interactiveElements.map(el => el.toJSON()),
    };
  }
}
