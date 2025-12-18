/**
 * Configuration for prompt generation and context management.
 * Centralizes all magic numbers and tunable parameters.
 */

export interface PromptConfig {
  context: {
    /** Maximum number of interactive elements to include in prompt */
    maxElements: number;
    /** Maximum number of history steps to include */
    maxHistorySteps: number;
    /** Maximum characters of visible text to include */
    maxVisibleTextChars: number;
    /** Maximum console errors to include */
    maxConsoleErrors: number;
    /** Maximum network errors to include */
    maxNetworkErrors: number;
    /** Maximum persona suggestions per persona */
    maxPersonaSuggestions: number;
  };
  temperature: {
    /** Temperature for decision-making (creative, exploratory) */
    decision: number;
    /** Temperature for finding analysis (precise, deterministic) */
    analysis: number;
    /** Temperature for summary generation (balanced) */
    summary: number;
  };
  tokens: {
    /** Max tokens for decision requests */
    decision: number;
    /** Max tokens for finding analysis */
    analysis: number;
    /** Max tokens for summary generation */
    summary: number;
  };
  logging: {
    /** Whether to log prompts to file */
    enabled: boolean;
    /** Directory for prompt logs */
    directory: string;
  };
}

/**
 * Default prompt configuration.
 * These values are tuned for optimal balance between context richness and token efficiency.
 */
export const DEFAULT_PROMPT_CONFIG: PromptConfig = {
  context: {
    maxElements: 30, // Enough to see main interactive elements without overwhelming context
    maxHistorySteps: 10, // Recent context to avoid repetition and inform next steps
    maxVisibleTextChars: 1500, // First ~300 words of page content
    maxConsoleErrors: 5, // Most recent errors are usually most relevant
    maxNetworkErrors: 5, // Network issues tend to repeat, so 5 is sufficient
    maxPersonaSuggestions: 5, // Top suggestions per persona, more would be noise
  },
  temperature: {
    decision: 0.7, // Higher for creative exploration and diverse action selection
    analysis: 0.3, // Lower for consistent, precise severity assessment
    summary: 0.5, // Balanced for clear but natural language summaries
  },
  tokens: {
    decision: 1024, // Enough for detailed reasoning and alternatives
    analysis: 512, // Shorter, focused analysis
    summary: 1024, // Comprehensive session summary
  },
  logging: {
    enabled: true, // Enable by default for debugging and analysis
    directory: './logs/prompts',
  },
};

/**
 * Current active configuration.
 * Can be overridden via environment variables or programmatically.
 */
let activeConfig: PromptConfig = { ...DEFAULT_PROMPT_CONFIG };

/**
 * Get the current prompt configuration.
 */
export function getPromptConfig(): PromptConfig {
  return activeConfig;
}

/**
 * Update prompt configuration.
 * Useful for testing, A/B testing, or environment-specific tuning.
 */
export function setPromptConfig(config: Partial<PromptConfig>): void {
  activeConfig = {
    ...activeConfig,
    ...config,
    context: { ...activeConfig.context, ...config.context },
    temperature: { ...activeConfig.temperature, ...config.temperature },
    tokens: { ...activeConfig.tokens, ...config.tokens },
    logging: { ...activeConfig.logging, ...config.logging },
  };
}

/**
 * Reset to default configuration.
 */
export function resetPromptConfig(): void {
  activeConfig = { ...DEFAULT_PROMPT_CONFIG };
}
