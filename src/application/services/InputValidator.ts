/**
 * InputValidator
 *
 * Validates input parameters for the exploration system:
 * - URL validation
 * - Configuration validation
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * URL validation options.
 */
export interface URLValidationOptions {
  /** Require HTTPS */
  requireHttps?: boolean;
  /** Allow localhost */
  allowLocalhost?: boolean;
  /** Allowed protocols */
  allowedProtocols?: string[];
}

const DEFAULT_URL_OPTIONS: URLValidationOptions = {
  requireHttps: false,
  allowLocalhost: true,
  allowedProtocols: ['http:', 'https:'],
};

/**
 * Validates exploration inputs.
 */
export class InputValidator {
  /**
   * Validate a URL.
   */
  static validateURL(
    url: string,
    options: URLValidationOptions = DEFAULT_URL_OPTIONS
  ): ValidationResult {
    const errors: string[] = [];

    // Check if URL is provided
    if (!url || url.trim() === '') {
      return { valid: false, errors: ['URL is required'] };
    }

    // Try to parse URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return { valid: false, errors: ['Invalid URL format'] };
    }

    // Check protocol
    const allowedProtocols = options.allowedProtocols || DEFAULT_URL_OPTIONS.allowedProtocols!;
    if (!allowedProtocols.includes(parsedUrl.protocol)) {
      errors.push(
        `Protocol ${parsedUrl.protocol} not allowed. Allowed: ${allowedProtocols.join(', ')}`
      );
    }

    // Check HTTPS requirement
    if (options.requireHttps && parsedUrl.protocol !== 'https:') {
      errors.push('HTTPS is required');
    }

    // Check localhost
    const isLocalhost =
      parsedUrl.hostname === 'localhost' ||
      parsedUrl.hostname === '127.0.0.1' ||
      parsedUrl.hostname === '::1';

    if (!options.allowLocalhost && isLocalhost) {
      errors.push('Localhost URLs are not allowed');
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate exploration configuration.
   */
  static validateExplorationConfig(config: Record<string, unknown>): ValidationResult {
    const errors: string[] = [];

    // Validate maxSteps
    if (config.maxSteps !== undefined) {
      const maxSteps = config.maxSteps as number;
      if (typeof maxSteps !== 'number' || maxSteps < 1) {
        errors.push('maxSteps must be a positive number');
      }
      if (maxSteps > 1000) {
        errors.push('maxSteps cannot exceed 1000');
      }
    }

    // Validate checkpointInterval
    if (config.checkpointInterval !== undefined) {
      const interval = config.checkpointInterval as number;
      if (typeof interval !== 'number' || interval < 1) {
        errors.push('checkpointInterval must be a positive number');
      }
    }

    // Validate minConfidenceThreshold
    if (config.minConfidenceThreshold !== undefined) {
      const threshold = config.minConfidenceThreshold as number;
      if (typeof threshold !== 'number' || threshold < 0 || threshold > 1) {
        errors.push('minConfidenceThreshold must be between 0 and 1');
      }
    }

    // Validate stepTimeout
    if (config.stepTimeout !== undefined) {
      const timeout = config.stepTimeout as number;
      if (typeof timeout !== 'number' || timeout < 1000) {
        errors.push('stepTimeout must be at least 1000ms');
      }
    }

    // Validate navigationWaitTime
    if (config.navigationWaitTime !== undefined) {
      const waitTime = config.navigationWaitTime as number;
      if (typeof waitTime !== 'number' || waitTime < 0) {
        errors.push('navigationWaitTime must be a non-negative number');
      }
    }

    // Validate maxActionsPerPage
    if (config.maxActionsPerPage !== undefined) {
      const maxActions = config.maxActionsPerPage as number;
      if (typeof maxActions !== 'number' || maxActions < 1) {
        errors.push('maxActionsPerPage must be a positive number');
      }
    }

    // Validate similarityThreshold
    if (config.similarityThreshold !== undefined) {
      const threshold = config.similarityThreshold as number;
      if (typeof threshold !== 'number' || threshold < 0 || threshold > 1) {
        errors.push('similarityThreshold must be between 0 and 1');
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate objective string.
   */
  static validateObjective(objective: string | undefined): ValidationResult {
    const errors: string[] = [];

    if (objective !== undefined) {
      if (typeof objective !== 'string') {
        errors.push('objective must be a string');
      } else if (objective.length > 5000) {
        errors.push('objective cannot exceed 5000 characters');
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate all exploration inputs.
   */
  static validateExplorationInputs(
    url: string,
    config: Record<string, unknown>,
    objective?: string
  ): ValidationResult {
    const allErrors: string[] = [];

    const urlResult = this.validateURL(url);
    allErrors.push(...urlResult.errors);

    const configResult = this.validateExplorationConfig(config);
    allErrors.push(...configResult.errors);

    const objectiveResult = this.validateObjective(objective);
    allErrors.push(...objectiveResult.errors);

    return { valid: allErrors.length === 0, errors: allErrors };
  }
}

/**
 * Validation error class.
 */
export class ValidationError extends Error {
  public readonly errors: string[];

  constructor(errors: string[]) {
    super(`Validation failed: ${errors.join(', ')}`);
    this.name = 'ValidationError';
    this.errors = errors;
  }
}
