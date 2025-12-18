import { InputValidator, ValidationError } from '../../../src/application/services/InputValidator';

describe('InputValidator', () => {
  describe('validateURL', () => {
    it('should accept valid HTTP URLs', () => {
      const result = InputValidator.validateURL('http://example.com');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept valid HTTPS URLs', () => {
      const result = InputValidator.validateURL('https://example.com');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept localhost URLs by default', () => {
      const result = InputValidator.validateURL('http://localhost:3000');
      expect(result.valid).toBe(true);
    });

    it('should accept 127.0.0.1 URLs by default', () => {
      const result = InputValidator.validateURL('http://127.0.0.1:8080');
      expect(result.valid).toBe(true);
    });

    it('should reject empty URLs', () => {
      const result = InputValidator.validateURL('');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('URL is required');
    });

    it('should reject invalid URL format', () => {
      const result = InputValidator.validateURL('not-a-valid-url');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid URL format');
    });

    it('should reject disallowed protocols', () => {
      const result = InputValidator.validateURL('ftp://example.com');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Protocol ftp: not allowed');
    });

    it('should require HTTPS when configured', () => {
      const result = InputValidator.validateURL('http://example.com', { requireHttps: true });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('HTTPS is required');
    });

    it('should reject localhost when configured', () => {
      const result = InputValidator.validateURL('http://localhost:3000', { allowLocalhost: false });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Localhost URLs are not allowed');
    });

    it('should accept URLs with paths', () => {
      const result = InputValidator.validateURL('https://example.com/path/to/page');
      expect(result.valid).toBe(true);
    });

    it('should accept URLs with query strings', () => {
      const result = InputValidator.validateURL('https://example.com?foo=bar');
      expect(result.valid).toBe(true);
    });
  });

  describe('validateExplorationConfig', () => {
    it('should accept valid configuration', () => {
      const result = InputValidator.validateExplorationConfig({
        maxSteps: 100,
        checkpointInterval: 10,
        minConfidenceThreshold: 0.5,
        stepTimeout: 30000,
        navigationWaitTime: 2000,
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept empty configuration', () => {
      const result = InputValidator.validateExplorationConfig({});
      expect(result.valid).toBe(true);
    });

    it('should reject invalid maxSteps', () => {
      expect(InputValidator.validateExplorationConfig({ maxSteps: 0 }).valid).toBe(false);
      expect(InputValidator.validateExplorationConfig({ maxSteps: -1 }).valid).toBe(false);
      expect(InputValidator.validateExplorationConfig({ maxSteps: 1001 }).valid).toBe(false);
    });

    it('should reject invalid checkpointInterval', () => {
      const result = InputValidator.validateExplorationConfig({ checkpointInterval: 0 });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('checkpointInterval');
    });

    it('should reject invalid minConfidenceThreshold', () => {
      expect(InputValidator.validateExplorationConfig({ minConfidenceThreshold: -0.1 }).valid).toBe(
        false
      );
      expect(InputValidator.validateExplorationConfig({ minConfidenceThreshold: 1.1 }).valid).toBe(
        false
      );
    });

    it('should reject invalid stepTimeout', () => {
      const result = InputValidator.validateExplorationConfig({ stepTimeout: 500 });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('stepTimeout');
    });

    it('should reject invalid navigationWaitTime', () => {
      const result = InputValidator.validateExplorationConfig({ navigationWaitTime: -100 });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('navigationWaitTime');
    });

    it('should reject invalid maxActionsPerPage', () => {
      const result = InputValidator.validateExplorationConfig({ maxActionsPerPage: 0 });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('maxActionsPerPage');
    });

    it('should reject invalid similarityThreshold', () => {
      expect(InputValidator.validateExplorationConfig({ similarityThreshold: -0.1 }).valid).toBe(
        false
      );
      expect(InputValidator.validateExplorationConfig({ similarityThreshold: 1.5 }).valid).toBe(
        false
      );
    });
  });

  describe('validateObjective', () => {
    it('should accept valid objective', () => {
      const result = InputValidator.validateObjective('Test the login functionality');
      expect(result.valid).toBe(true);
    });

    it('should accept undefined objective', () => {
      const result = InputValidator.validateObjective(undefined);
      expect(result.valid).toBe(true);
    });

    it('should reject very long objectives', () => {
      const longObjective = 'a'.repeat(5001);
      const result = InputValidator.validateObjective(longObjective);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('5000 characters');
    });
  });

  describe('validateExplorationInputs', () => {
    it('should validate all inputs together', () => {
      const result = InputValidator.validateExplorationInputs(
        'https://example.com',
        { maxSteps: 50 },
        'Test the app'
      );
      expect(result.valid).toBe(true);
    });

    it('should collect errors from all validations', () => {
      const result = InputValidator.validateExplorationInputs(
        'invalid-url',
        { maxSteps: 0, stepTimeout: 100 },
        'a'.repeat(6000)
      );

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
      expect(result.errors.some(e => e.includes('URL'))).toBe(true);
      expect(result.errors.some(e => e.includes('maxSteps'))).toBe(true);
    });
  });

  describe('ValidationError', () => {
    it('should create error with message and errors array', () => {
      const errors = ['Error 1', 'Error 2'];
      const error = new ValidationError(errors);

      expect(error.name).toBe('ValidationError');
      expect(error.message).toContain('Error 1');
      expect(error.message).toContain('Error 2');
      expect(error.errors).toEqual(errors);
    });
  });
});
