/**
 * Screenshot options for browser tools.
 */
export interface ToolScreenshotOptions {
  /** File path to save the screenshot */
  path?: string;
  /** Whether to capture full page */
  fullPage?: boolean;
  /** Image type */
  type?: 'png' | 'jpeg';
  /** Quality for JPEG (0-100) */
  quality?: number;
}

/**
 * Minimal page state interface for tools.
 * Keeps domain layer independent from application layer.
 */
export interface ToolPageState {
  url: string;
  title: string;
  visibleText?: string;
  consoleErrors?: string[];
  networkErrors?: string[];
}

/**
 * Minimal browser interface for tool execution.
 * This avoids importing from application layer (BrowserPort) to maintain
 * domain layer independence per DDD principles.
 */
export interface ToolBrowserAdapter {
  /** Navigate to a URL */
  navigate(url: string): Promise<{ success: boolean; duration: number }>;
  /** Get current page URL */
  getCurrentUrl(): Promise<string>;
  /** Get the page title */
  getTitle(): Promise<string>;
  /** Take a screenshot */
  screenshot(options?: ToolScreenshotOptions): Promise<string>;
  /** Evaluate JavaScript in the page context */
  evaluate<T>(fn: string | (() => T)): Promise<T>;
  /** Extract minimal page state for tool analysis */
  extractPageState(): Promise<ToolPageState>;
}

/**
 * Context provided to tools during execution.
 * Contains all dependencies a tool might need.
 */
export interface ToolContext {
  /** Browser adapter for page interactions */
  browser: ToolBrowserAdapter;
  /** Current page URL */
  currentUrl: string;
  /** Optional additional context data */
  metadata?: Record<string, unknown>;
}

/**
 * Result returned by tool execution.
 */
export interface ToolResult<T = unknown> {
  /** Whether the tool executed successfully */
  success: boolean;
  /** The data returned by the tool */
  data?: T;
  /** Error message if execution failed */
  error?: string;
  /** Execution duration in milliseconds */
  duration: number;
  /** Tool name for identification */
  toolName: string;
}

/**
 * Schema definition for tool parameters.
 */
export interface ToolParameterSchema {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required?: boolean;
  default?: unknown;
  enum?: unknown[];
}

/**
 * Tool definition for LLM function calling.
 */
export interface ToolDefinition {
  /** Unique name of the tool */
  name: string;
  /** Description of what the tool does */
  description: string;
  /** Parameter schema for the tool */
  parameters: Record<string, ToolParameterSchema>;
}

/**
 * Interface that all tools must implement.
 */
export interface Tool<TParams = unknown, TResult = unknown> {
  /** Unique name identifying this tool */
  readonly name: string;

  /** Human-readable description of what the tool does */
  readonly description: string;

  /** Get the tool definition for LLM function calling */
  getDefinition(): ToolDefinition;

  /** Validate the parameters before execution */
  validateParams(params: TParams): { valid: boolean; errors: string[] };

  /** Execute the tool with given parameters and context */
  execute(params: TParams, context: ToolContext): Promise<ToolResult<TResult>>;
}
