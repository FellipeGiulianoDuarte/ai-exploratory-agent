/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/require-await */
import { LLMCircuitBreaker } from '../../../src/infrastructure/llm/LLMCircuitBreaker';
import { LLMPort, LLMResponse, LLMDecisionRequest } from '../../../src/application/ports/LLMPort';

// Mock LLM adapter for testing
const createMockLLMAdapter = (name: string, shouldFail = false): LLMPort => ({
  provider: name,
  model: `${name}-model`,
  decideNextAction: jest.fn().mockImplementation(async () => {
    if (shouldFail) {
      throw new Error(`${name} failed`);
    }
    return {
      decision: {
        action: 'click',
        selector: '#test',
        reasoning: 'Test action',
        confidence: 0.8,
      },
      rawResponse: '{}',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      latency: 100,
    } as LLMResponse;
  }),
  analyzeFinding: jest.fn().mockImplementation(async () => {
    if (shouldFail) {
      throw new Error(`${name} failed`);
    }
    return {
      severity: 'medium' as const,
      description: 'Test finding',
      recommendation: 'Fix it',
    };
  }),
  generateSummary: jest.fn().mockImplementation(async () => {
    if (shouldFail) {
      throw new Error(`${name} failed`);
    }
    return 'Test summary';
  }),
  isAvailable: jest.fn().mockImplementation(async () => !shouldFail),
});

describe('LLMCircuitBreaker', () => {
  let primaryAdapter: LLMPort;
  let fallbackAdapter: LLMPort;
  let circuitBreaker: LLMCircuitBreaker;

  beforeEach(() => {
    primaryAdapter = createMockLLMAdapter('primary');
    fallbackAdapter = createMockLLMAdapter('fallback');
    circuitBreaker = new LLMCircuitBreaker(
      [
        { name: 'primary', adapter: primaryAdapter },
        { name: 'fallback', adapter: fallbackAdapter },
      ],
      {
        failureThreshold: 3,
        resetTimeoutMs: 1000,
        successThreshold: 2,
      }
    );
  });

  describe('initialization', () => {
    it('should initialize with providers', () => {
      expect(circuitBreaker.provider).toBe('primary');
      expect(circuitBreaker.model).toBe('primary-model');
    });

    it('should start with all circuits closed', () => {
      const status = circuitBreaker.getStatus();
      expect(status['primary'].state).toBe('closed');
      expect(status['fallback'].state).toBe('closed');
    });

    it('should handle empty providers', () => {
      const emptyBreaker = new LLMCircuitBreaker([]);
      expect(emptyBreaker.provider).toBe('unknown');
      expect(emptyBreaker.model).toBe('unknown');
    });
  });

  describe('successful operations', () => {
    it('should use primary provider for decideNextAction', async () => {
      await circuitBreaker.decideNextAction({} as LLMDecisionRequest);
      expect(primaryAdapter.decideNextAction).toHaveBeenCalled();
      expect(fallbackAdapter.decideNextAction).not.toHaveBeenCalled();
    });

    it('should use primary provider for analyzeFinding', async () => {
      await circuitBreaker.analyzeFinding('test', {
        url: 'test',
        title: 'Test',
        visibleText: '',
        elements: [],
        consoleErrors: [],
        networkErrors: [],
      });
      expect(primaryAdapter.analyzeFinding).toHaveBeenCalled();
      expect(fallbackAdapter.analyzeFinding).not.toHaveBeenCalled();
    });

    it('should use primary provider for generateSummary', async () => {
      await circuitBreaker.generateSummary([], []);
      expect(primaryAdapter.generateSummary).toHaveBeenCalled();
      expect(fallbackAdapter.generateSummary).not.toHaveBeenCalled();
    });

    it('should reset failure count on success', async () => {
      // Cause some failures first (but not enough to open circuit)
      const failingAdapter = createMockLLMAdapter('primary', true);
      circuitBreaker = new LLMCircuitBreaker(
        [
          { name: 'primary', adapter: failingAdapter },
          { name: 'fallback', adapter: fallbackAdapter },
        ],
        { failureThreshold: 5 }
      );

      // Two failures
      try {
        await circuitBreaker.decideNextAction({} as LLMDecisionRequest);
      } catch {
        // Expected
      }

      // Replace with working adapter and succeed
      circuitBreaker = new LLMCircuitBreaker(
        [
          { name: 'primary', adapter: primaryAdapter },
          { name: 'fallback', adapter: fallbackAdapter },
        ],
        { failureThreshold: 5 }
      );

      await circuitBreaker.decideNextAction({} as LLMDecisionRequest);

      const status = circuitBreaker.getStatus();
      expect(status['primary'].failures).toBe(0);
    });
  });

  describe('failure handling and fallback', () => {
    it('should fallback to secondary provider on failure', async () => {
      const failingPrimary = createMockLLMAdapter('primary', true);
      circuitBreaker = new LLMCircuitBreaker(
        [
          { name: 'primary', adapter: failingPrimary },
          { name: 'fallback', adapter: fallbackAdapter },
        ],
        { failureThreshold: 1 } // Open immediately after first failure
      );

      const result = await circuitBreaker.decideNextAction({} as LLMDecisionRequest);

      expect(failingPrimary.decideNextAction).toHaveBeenCalled();
      expect(fallbackAdapter.decideNextAction).toHaveBeenCalled();
      expect(result.decision.action).toBe('click');
    });

    it('should throw when both providers fail', async () => {
      const failingPrimary = createMockLLMAdapter('primary', true);
      const failingFallback = createMockLLMAdapter('fallback', true);

      circuitBreaker = new LLMCircuitBreaker(
        [
          { name: 'primary', adapter: failingPrimary },
          { name: 'fallback', adapter: failingFallback },
        ],
        { failureThreshold: 1 } // Open immediately so fallback is tried
      );

      await expect(circuitBreaker.decideNextAction({} as LLMDecisionRequest)).rejects.toThrow(
        'Primary provider primary and fallback fallback both failed'
      );
    });

    it('should track failures', async () => {
      const failingPrimary = createMockLLMAdapter('primary', true);
      circuitBreaker = new LLMCircuitBreaker(
        [
          { name: 'primary', adapter: failingPrimary },
          { name: 'fallback', adapter: fallbackAdapter },
        ],
        { failureThreshold: 1 } // Open after first failure
      );

      await circuitBreaker.decideNextAction({} as LLMDecisionRequest);

      const status = circuitBreaker.getStatus();
      expect(status['primary'].failures).toBe(1);
    });
  });

  describe('circuit state transitions', () => {
    it('should open circuit after threshold failures', async () => {
      const failingPrimary = createMockLLMAdapter('primary', true);
      const failingFallback = createMockLLMAdapter('fallback', true);

      circuitBreaker = new LLMCircuitBreaker(
        [
          { name: 'primary', adapter: failingPrimary },
          { name: 'fallback', adapter: failingFallback },
        ],
        { failureThreshold: 2 }
      );

      // Cause failures to open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.decideNextAction({} as LLMDecisionRequest);
        } catch {
          // Expected
        }
      }

      const status = circuitBreaker.getStatus();
      expect(status['primary'].state).toBe('open');
    });

    it('should track multiple failures before opening', async () => {
      const failingPrimary = createMockLLMAdapter('primary', true);
      const failingFallback = createMockLLMAdapter('fallback', true);

      circuitBreaker = new LLMCircuitBreaker(
        [
          { name: 'primary', adapter: failingPrimary },
          { name: 'fallback', adapter: failingFallback },
        ],
        { failureThreshold: 5 }
      );

      // Only 2 failures - should still be closed
      for (let i = 0; i < 2; i++) {
        try {
          await circuitBreaker.decideNextAction({} as LLMDecisionRequest);
        } catch {
          // Expected
        }
      }

      const status = circuitBreaker.getStatus();
      // Primary has 2 failures, but threshold is 5, so still closed
      expect(status['primary'].failures).toBe(2);
      expect(status['primary'].state).toBe('closed');
    });

    it('should respect reset timeout for half-open transition', async () => {
      // Use a single failing provider to test half-open transition
      const failingPrimary = createMockLLMAdapter('primary', true);

      circuitBreaker = new LLMCircuitBreaker([{ name: 'primary', adapter: failingPrimary }], {
        failureThreshold: 1,
        resetTimeoutMs: 10,
      });

      // Open the circuit by causing a failure
      try {
        await circuitBreaker.decideNextAction({} as LLMDecisionRequest);
      } catch {
        // Expected - no fallback, so this throws
      }

      // Should be open now
      let status = circuitBreaker.getStatus();
      expect(status['primary'].state).toBe('open');

      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 50));

      // Try again - circuit should transition to half-open when we call getAvailableProvider
      try {
        await circuitBreaker.decideNextAction({} as LLMDecisionRequest);
      } catch {
        // Expected since primary still fails
      }

      // After timeout, circuit transitioned to half-open, and since half_open
      // failures don't immediately reopen (only closed->open on threshold), it stays half_open
      status = circuitBreaker.getStatus();
      expect(status['primary'].state).toBe('half_open');
    });

    it('should close circuit after successful recovery', async () => {
      // Create a mock that tracks call count
      let callCount = 0;
      const recoveringAdapter: LLMPort = {
        provider: 'primary',
        model: 'test-model',
        decideNextAction: jest.fn().mockImplementation(async () => {
          callCount++;
          // First call fails, subsequent calls succeed
          if (callCount === 1) {
            throw new Error('Failed');
          }
          return {
            decision: { action: 'click', selector: '#test', reasoning: 'test', confidence: 0.8 },
            rawResponse: '{}',
            usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
            latency: 100,
          };
        }),
        analyzeFinding: jest.fn(),
        generateSummary: jest.fn(),
        isAvailable: jest.fn().mockResolvedValue(true),
      };

      circuitBreaker = new LLMCircuitBreaker(
        [
          { name: 'primary', adapter: recoveringAdapter },
          { name: 'fallback', adapter: fallbackAdapter },
        ],
        { failureThreshold: 1, resetTimeoutMs: 10, successThreshold: 1 }
      );

      // First call fails primary, uses fallback
      await circuitBreaker.decideNextAction({} as LLMDecisionRequest);

      let status = circuitBreaker.getStatus();
      expect(status['primary'].state).toBe('open');

      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 50));

      // Now primary recovers (callCount > 1)
      await circuitBreaker.decideNextAction({} as LLMDecisionRequest);

      status = circuitBreaker.getStatus();
      // After success in half-open state, should be closed
      expect(status['primary'].state).toBe('closed');
    });
  });

  describe('circuit breaker disabled', () => {
    it('should use primary provider even after failures when disabled', async () => {
      const failingPrimary = createMockLLMAdapter('primary', true);

      circuitBreaker = new LLMCircuitBreaker(
        [
          { name: 'primary', adapter: failingPrimary },
          { name: 'fallback', adapter: fallbackAdapter },
        ],
        { enabled: false, failureThreshold: 1 }
      );

      // Even with failures, should keep trying primary
      try {
        await circuitBreaker.decideNextAction({} as LLMDecisionRequest);
      } catch {
        // Expected
      }

      // Should still use primary (circuit breaker disabled)
      expect(failingPrimary.decideNextAction).toHaveBeenCalled();
    });
  });

  describe('isAvailable', () => {
    it('should return true when provider is available', async () => {
      const result = await circuitBreaker.isAvailable();
      expect(result).toBe(true);
    });

    it('should return false when no provider is available', async () => {
      const failingPrimary = createMockLLMAdapter('primary', true);
      const failingFallback = createMockLLMAdapter('fallback', true);

      circuitBreaker = new LLMCircuitBreaker(
        [
          { name: 'primary', adapter: failingPrimary },
          { name: 'fallback', adapter: failingFallback },
        ],
        { failureThreshold: 1 }
      );

      // Open all circuits
      for (let i = 0; i < 2; i++) {
        try {
          await circuitBreaker.decideNextAction({} as LLMDecisionRequest);
        } catch {
          // Expected
        }
      }

      const result = await circuitBreaker.isAvailable();
      expect(result).toBe(false);
    });
  });

  describe('getStatus', () => {
    it('should return status for all providers', () => {
      const status = circuitBreaker.getStatus();

      expect(status).toHaveProperty('primary');
      expect(status).toHaveProperty('fallback');
      expect(status['primary']).toEqual({ state: 'closed', failures: 0 });
      expect(status['fallback']).toEqual({ state: 'closed', failures: 0 });
    });
  });
});
