/**
 * Base class for all domain errors.
 */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error thrown when page extraction fails.
 */
export class PageExtractError extends DomainError {
  constructor(
    message: string,
    public readonly originalError?: unknown
  ) {
    super(`Failed to extract page content: ${message}`);
  }
}

/**
 * Error thrown when LLM communication fails.
 */
export class LLMClientError extends DomainError {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly isRetryable: boolean = true
  ) {
    super(`LLM Error (${provider}): ${message}`);
  }
}

/**
 * Error thrown when an action execution fails.
 */
export class ActionExecutionError extends DomainError {
  constructor(action: string, error: string) {
    super(`Failed to execute action '${action}': ${error}`);
  }
}

/**
 * Error thrown when configuration is invalid.
 */
export class ConfigurationError extends DomainError {
  constructor(message: string) {
    super(`Configuration Error: ${message}`);
  }
}
