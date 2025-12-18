import { LLMPort } from '../../application/ports/LLMPort';

/**
 * Circuit breaker state for tracking provider health.
 */
export type CircuitState = 'closed' | 'open' | 'half_open';

/**
 * Configuration for circuit breaker behavior.
 */
export interface CircuitBreakerConfig {
  /** Enable circuit breaker (default: true) */
  enabled: boolean;
  /** Failure threshold before opening circuit (default: 5) */
  failureThreshold: number;
  /** Reset timeout in milliseconds (default: 60000 = 1 minute) */
  resetTimeoutMs: number;
  /** Success threshold in half-open state before closing (default: 2) */
  successThreshold: number;
}

/**
 * Provider health state.
 */
interface ProviderHealth {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime?: number;
  lastOpenTime?: number;
}

/**
 * LLM circuit breaker with fallback support.
 * Tracks provider health and routes requests through available providers.
 */
export class LLMCircuitBreaker implements LLMPort {
  private config: CircuitBreakerConfig;
  private providers: Map<string, LLMPort> = new Map();
  private health: Map<string, ProviderHealth> = new Map();
  private providerOrder: string[]; // Ordered list for fallback

  readonly provider: string;
  readonly model: string;

  constructor(
    providers: { name: string; adapter: LLMPort }[],
    config: Partial<CircuitBreakerConfig> = {}
  ) {
    this.config = {
      enabled: true,
      failureThreshold: 5,
      resetTimeoutMs: 60000,
      successThreshold: 2,
      ...config,
    };

    // Initialize providers and health tracking
    this.providerOrder = [];
    for (const { name, adapter } of providers) {
      this.providers.set(name, adapter);
      this.health.set(name, {
        state: 'closed',
        failureCount: 0,
        successCount: 0,
      });
      this.providerOrder.push(name);
    }

    // Primary provider info
    const primary = providers[0];
    this.provider = primary?.name ?? 'unknown';
    this.model = primary?.adapter.model ?? 'unknown';
  }

  /**
   * Get the next available provider (respecting circuit breaker state).
   */
  private getAvailableProvider(): { name: string; adapter: LLMPort } | null {
    if (!this.config.enabled) {
      // Circuit breaker disabled; use first provider
      const adapter = this.providers.get(this.providerOrder[0]);
      return adapter ? { name: this.providerOrder[0], adapter } : null;
    }

    for (const name of this.providerOrder) {
      const adapter = this.providers.get(name);
      if (!adapter) continue;

      const state = this.health.get(name);
      if (!state) continue;

      // Check if circuit should transition to half-open
      if (state.state === 'open') {
        const timeSinceOpen = Date.now() - (state.lastOpenTime ?? 0);
        if (timeSinceOpen >= this.config.resetTimeoutMs) {
          state.state = 'half_open';
          state.failureCount = 0;
          state.successCount = 0;
        } else {
          // Still open, skip
          continue;
        }
      }

      // Use provider if closed or half-open
      if (state.state === 'closed' || state.state === 'half_open') {
        return { name, adapter };
      }
    }

    return null;
  }

  /**
   * Record a successful call.
   */
  private recordSuccess(providerName: string): void {
    const state = this.health.get(providerName);
    if (!state) return;

    state.failureCount = 0; // Reset failure count on success
    state.successCount++;

    if (state.state === 'half_open' && state.successCount >= this.config.successThreshold) {
      state.state = 'closed';
      state.successCount = 0;
      console.log(`[LLM] Circuit breaker: ${providerName} recovered (CLOSED)`);
    }
  }

  /**
   * Record a failed call.
   */
  private recordFailure(providerName: string): void {
    const state = this.health.get(providerName);
    if (!state) return;

    state.failureCount++;
    state.lastFailureTime = Date.now();
    state.successCount = 0; // Reset success count on failure

    if (state.failureCount >= this.config.failureThreshold && state.state === 'closed') {
      state.state = 'open';
      state.lastOpenTime = Date.now();
      console.warn(
        `[LLM] Circuit breaker: ${providerName} opened after ${state.failureCount} failures`
      );
    }
  }

  /**
   * Get circuit breaker status for monitoring.
   */
  getStatus(): { [key: string]: { state: CircuitState; failures: number } } {
    const status: { [key: string]: { state: CircuitState; failures: number } } = {};
    for (const [name, state] of this.health) {
      status[name] = {
        state: state.state,
        failures: state.failureCount,
      };
    }
    return status;
  }

  async decideNextAction(request: any, options?: any) {
    const provider = this.getAvailableProvider();
    if (!provider) {
      throw new Error(
        'All LLM providers unavailable or circuit breaker open. No fallback available.'
      );
    }

    try {
      const result = await provider.adapter.decideNextAction(request, options);
      this.recordSuccess(provider.name);
      return result;
    } catch (error) {
      this.recordFailure(provider.name);
      console.warn(`[LLM] Provider ${provider.name} failed:`, error);

      // Try next available provider
      const nextProvider = this.getAvailableProvider();
      if (nextProvider && nextProvider.name !== provider.name) {
        console.log(`[LLM] Falling back to ${nextProvider.name}`);
        try {
          const result = await nextProvider.adapter.decideNextAction(request, options);
          this.recordSuccess(nextProvider.name);
          return result;
        } catch (fallbackError) {
          this.recordFailure(nextProvider.name);
          throw new Error(
            `Primary provider ${provider.name} and fallback ${nextProvider.name} both failed`
          );
        }
      }

      throw error;
    }
  }

  async analyzeFinding(finding: string, context: any) {
    const provider = this.getAvailableProvider();
    if (!provider) {
      throw new Error('All LLM providers unavailable or circuit breaker open.');
    }

    try {
      const result = await provider.adapter.analyzeFinding(finding, context);
      this.recordSuccess(provider.name);
      return result;
    } catch (error) {
      this.recordFailure(provider.name);
      console.warn(`[LLM] Provider ${provider.name} failed:`, error);

      const nextProvider = this.getAvailableProvider();
      if (nextProvider && nextProvider.name !== provider.name) {
        console.log(`[LLM] Falling back to ${nextProvider.name}`);
        try {
          const result = await nextProvider.adapter.analyzeFinding(finding, context);
          this.recordSuccess(nextProvider.name);
          return result;
        } catch (fallbackError) {
          this.recordFailure(nextProvider.name);
          throw fallbackError;
        }
      }

      throw error;
    }
  }

  async generateSummary(history: any[], findings: string[]) {
    const provider = this.getAvailableProvider();
    if (!provider) {
      throw new Error('All LLM providers unavailable or circuit breaker open.');
    }

    try {
      const result = await provider.adapter.generateSummary(history, findings);
      this.recordSuccess(provider.name);
      return result;
    } catch (error) {
      this.recordFailure(provider.name);
      console.warn(`[LLM] Provider ${provider.name} failed:`, error);

      const nextProvider = this.getAvailableProvider();
      if (nextProvider && nextProvider.name !== provider.name) {
        console.log(`[LLM] Falling back to ${nextProvider.name}`);
        try {
          const result = await nextProvider.adapter.generateSummary(history, findings);
          this.recordSuccess(nextProvider.name);
          return result;
        } catch (fallbackError) {
          this.recordFailure(nextProvider.name);
          throw fallbackError;
        }
      }

      throw error;
    }
  }

  async isAvailable(): Promise<boolean> {
    const provider = this.getAvailableProvider();
    if (!provider) return false;

    try {
      return await provider.adapter.isAvailable();
    } catch {
      return false;
    }
  }
}
