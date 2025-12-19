import { LLMPort } from '../../application/ports/LLMPort';
import { AnthropicAdapter } from './AnthropicAdapter';
import { GeminiAdapter } from './GeminiAdapter';
import { OpenAIAdapter } from './OpenAIAdapter';
import { LLMCircuitBreaker, CircuitBreakerConfig } from './LLMCircuitBreaker';
import { loggers } from '../logging';

/**
 * Supported LLM providers.
 */
export type LLMProvider = 'anthropic' | 'openai' | 'gemini';

/**
 * Configuration for creating an LLM adapter.
 */
export interface LLMAdapterFactoryConfig {
  /** Provider to use */
  provider: LLMProvider;
  /** API key */
  apiKey: string;
  /** Model override */
  model?: string;
  /** Max tokens override */
  maxTokens?: number;
  /** Temperature override */
  temperature?: number;
}

/**
 * Factory for creating LLM adapters based on configuration.
 */
export class LLMAdapterFactory {
  /**
   * Create an LLM adapter based on configuration.
   */
  static create(config: LLMAdapterFactoryConfig): LLMPort {
    switch (config.provider) {
      case 'anthropic':
        return new AnthropicAdapter({
          apiKey: config.apiKey,
          model: config.model,
          defaultMaxTokens: config.maxTokens,
          defaultTemperature: config.temperature,
        });

      case 'gemini':
        return new GeminiAdapter({
          apiKey: config.apiKey,
          model: config.model,
        });

      case 'openai':
        return new OpenAIAdapter({
          apiKey: config.apiKey,
          model: config.model,
        });

      default:
        throw new Error(`Unknown LLM provider: ${config.provider}`);
    }
  }

  /**
   * Create an LLM adapter with advanced resilience features.
   */
  static createAdvanced(config: {
    provider: LLMProvider;
    apiKey: string;
    model?: string;
    minConfidence?: number;
    temperature?: number;
    fallbacks?: LLMProvider[];
    circuitBreaker?: {
      enabled: boolean;
      failureThreshold?: number;
      resetTimeoutMs?: number;
      successThreshold?: number;
    };
  }): LLMPort {
    const primaryProvider = config.provider;
    const fallbackProviders = (config.fallbacks || []).filter(p => p !== primaryProvider); // Ensure primary not in fallback

    const providerList = [primaryProvider, ...fallbackProviders];
    const adapters: { name: string; adapter: LLMPort }[] = [];

    for (const provider of providerList) {
      // Logic to get API key for specific provider if not the primary one
      // For fallback providers, we need to know where to get their keys if not passed explicitly in a unified config.
      // The current AppConfig passes a SINGLE apiKey (for the primary provider).
      // However, ConfigFactory.load() logic for `apiKey` property does:
      // apiKey: process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY || ...
      // This is a "first found" logic, which is bad for fallbacks because fallbacks need THEIR specific key.

      // OPTION: We should read env vars for keys here inside `createAdvanced` if we want to support multi-provider fallbacks properly,
      // OR we assume `config` object carries all keys (which it definitely does NOT in current AppConfig schema).

      // So we MUST fall back to reading process.env for specific keys for fallbacks.
      // This is a trade-off but necessary since `AppConfig` structure is biased towards single provider.

      let apiKey: string = '';
      if (provider === primaryProvider) {
        apiKey = config.apiKey;
      } else {
        // Fallback key lookup
        if (provider === 'openai') apiKey = process.env.OPENAI_API_KEY || '';
        if (provider === 'gemini') apiKey = process.env.GEMINI_API_KEY || '';
        if (provider === 'anthropic') apiKey = process.env.ANTHROPIC_API_KEY || '';
      }

      if (!apiKey) {
        loggers.llm.warn(`${provider} API key not found, skipping.`);
        continue;
      }

      const adapter = LLMAdapterFactory.create({
        provider,
        apiKey,
        model: provider === primaryProvider ? config.model : undefined, // Model is usually provider specific so pass undefined for fallbacks to use default
        temperature: config.temperature,
      });

      adapters.push({ name: provider, adapter });
    }

    if (adapters.length === 0) {
      throw new Error(`No valid LLM adapters could be created.`);
    }

    // If only one adapter and circuit breaker disabled, return it directly
    if (adapters.length === 1 && !config.circuitBreaker?.enabled) {
      return adapters[0].adapter;
    }

    // Wrap with circuit breaker
    return new LLMCircuitBreaker(adapters, {
      enabled: config.circuitBreaker?.enabled ?? true,
      failureThreshold: config.circuitBreaker?.failureThreshold,
      resetTimeoutMs: config.circuitBreaker?.resetTimeoutMs,
      successThreshold: config.circuitBreaker?.successThreshold,
    });
  }

  /**
   * @deprecated Use createAdvanced with config object instead.
   * Create an LLM adapter from environment variables.
   * Supports primary provider with optional fallback providers.
   * If ENABLE_LLM_CIRCUIT_BREAKER=true, wraps adapter(s) with circuit breaker.
   */
  static createFromEnv(): LLMPort {
    const primaryProvider = (process.env.LLM_PROVIDER ?? 'gemini') as LLMProvider;
    const fallbackProviders = (process.env.LLM_FALLBACK_PROVIDERS ?? '')
      .split(',')
      .map(s => s.trim())
      .filter(s => s && s !== primaryProvider) as LLMProvider[];

    // Build list of providers to try (primary first, then fallbacks)
    const providerList = [primaryProvider, ...fallbackProviders];

    // Create adapters for each provider
    const adapters: { name: string; adapter: LLMPort }[] = [];

    for (const provider of providerList) {
      let apiKey: string;
      switch (provider) {
        case 'anthropic':
          apiKey = process.env.ANTHROPIC_API_KEY ?? '';
          if (!apiKey) {
            loggers.llm.warn('ANTHROPIC_API_KEY not provided, skipping anthropic fallback');
            continue;
          }
          break;

        case 'gemini':
          apiKey = process.env.GEMINI_API_KEY ?? '';
          if (!apiKey) {
            loggers.llm.warn('GEMINI_API_KEY not provided, skipping gemini fallback');
            continue;
          }
          break;

        case 'openai':
          apiKey = process.env.OPENAI_API_KEY ?? '';
          if (!apiKey) {
            loggers.llm.warn('OPENAI_API_KEY not provided, skipping openai fallback');
            continue;
          }
          break;

        default:
          loggers.llm.warn(`Unknown LLM provider: ${provider}`);
          continue;
      }

      const adapter = LLMAdapterFactory.create({
        provider,
        apiKey,
        model: process.env.LLM_MODEL,
        maxTokens: process.env.LLM_MAX_TOKENS
          ? parseInt(process.env.LLM_MAX_TOKENS, 10)
          : undefined,
        temperature: process.env.LLM_TEMPERATURE
          ? parseFloat(process.env.LLM_TEMPERATURE)
          : undefined,
      });

      adapters.push({ name: provider, adapter });
    }

    if (adapters.length === 0) {
      throw new Error(
        `No LLM providers configured. Check your API keys for: ${providerList.join(', ')}`
      );
    }

    // If only one adapter and circuit breaker disabled, return it directly
    const enableCircuitBreaker = process.env.ENABLE_LLM_CIRCUIT_BREAKER !== 'false';
    if (adapters.length === 1 && !enableCircuitBreaker) {
      return adapters[0].adapter;
    }

    // Wrap with circuit breaker for resilience
    const circuitBreakerConfig: Partial<CircuitBreakerConfig> = {
      enabled: enableCircuitBreaker,
      failureThreshold: process.env.LLM_CIRCUIT_BREAKER_FAILURE_THRESHOLD
        ? parseInt(process.env.LLM_CIRCUIT_BREAKER_FAILURE_THRESHOLD, 10)
        : 5,
      resetTimeoutMs: process.env.LLM_CIRCUIT_BREAKER_RESET_MS
        ? parseInt(process.env.LLM_CIRCUIT_BREAKER_RESET_MS, 10)
        : 60000,
      successThreshold: process.env.LLM_CIRCUIT_BREAKER_SUCCESS_THRESHOLD
        ? parseInt(process.env.LLM_CIRCUIT_BREAKER_SUCCESS_THRESHOLD, 10)
        : 2,
    };

    return new LLMCircuitBreaker(adapters, circuitBreakerConfig);
  }
}
