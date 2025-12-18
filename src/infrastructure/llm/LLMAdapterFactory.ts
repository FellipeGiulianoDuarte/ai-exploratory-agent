import { LLMPort } from '../../application/ports/LLMPort';
import { AnthropicAdapter } from './AnthropicAdapter';
import { GeminiAdapter } from './GeminiAdapter';
import { OpenAIAdapter } from './OpenAIAdapter';

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
   * Create an LLM adapter from environment variables.
   */
  static createFromEnv(): LLMPort {
    const provider = (process.env.LLM_PROVIDER ?? 'gemini') as LLMProvider;

    let apiKey: string;
    switch (provider) {
      case 'anthropic':
        apiKey = process.env.ANTHROPIC_API_KEY ?? '';
        if (!apiKey) {
          throw new Error('ANTHROPIC_API_KEY environment variable is required');
        }
        break;

      case 'gemini':
        apiKey = process.env.GEMINI_API_KEY ?? '';
        if (!apiKey) {
          throw new Error('GEMINI_API_KEY environment variable is required');
        }
        break;

      case 'openai':
        apiKey = process.env.OPENAI_API_KEY ?? '';
        if (!apiKey) {
          throw new Error('OPENAI_API_KEY environment variable is required');
        }
        break;

      default:
        throw new Error(`Unknown LLM provider: ${provider}`);
    }

    return LLMAdapterFactory.create({
      provider,
      apiKey,
      model: process.env.LLM_MODEL,
      maxTokens: process.env.LLM_MAX_TOKENS ? parseInt(process.env.LLM_MAX_TOKENS, 10) : undefined,
      temperature: process.env.LLM_TEMPERATURE ? parseFloat(process.env.LLM_TEMPERATURE) : undefined,
    });
  }
}
