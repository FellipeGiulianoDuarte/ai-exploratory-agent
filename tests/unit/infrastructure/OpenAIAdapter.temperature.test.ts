/**
 * Tests for OpenAIAdapter temperature handling with different models
 */

import { OpenAIAdapter } from '../../../src/infrastructure/llm/OpenAIAdapter';

describe('OpenAIAdapter - Temperature Support', () => {
  describe('supportsTemperature', () => {
    it('should return false for o1 models', () => {
      const adapter = new OpenAIAdapter({
        apiKey: 'test-key',
        model: 'o1-preview',
      });

      // Use reflection to test private method behavior
      // We can verify by checking if temperature is included in the config
      const tempConfig = (adapter as any).getTemperatureConfig(0.7);
      expect(tempConfig).toEqual({});
    });

    it('should return false for o3 models', () => {
      const adapter = new OpenAIAdapter({
        apiKey: 'test-key',
        model: 'o3-mini',
      });

      const tempConfig = (adapter as any).getTemperatureConfig(0.7);
      expect(tempConfig).toEqual({});
    });

    it('should return false for gpt-5 models', () => {
      const adapter = new OpenAIAdapter({
        apiKey: 'test-key',
        model: 'gpt-5.1',
      });

      const tempConfig = (adapter as any).getTemperatureConfig(0.7);
      expect(tempConfig).toEqual({});
    });

    it('should return true for gpt-4 models', () => {
      const adapter = new OpenAIAdapter({
        apiKey: 'test-key',
        model: 'gpt-4-turbo',
      });

      const tempConfig = (adapter as any).getTemperatureConfig(0.7);
      expect(tempConfig).toEqual({ temperature: 0.7 });
    });

    it('should return true for gpt-3.5 models', () => {
      const adapter = new OpenAIAdapter({
        apiKey: 'test-key',
        model: 'gpt-3.5-turbo',
      });

      const tempConfig = (adapter as any).getTemperatureConfig(0.5);
      expect(tempConfig).toEqual({ temperature: 0.5 });
    });

    it('should return true for gpt-4o models', () => {
      const adapter = new OpenAIAdapter({
        apiKey: 'test-key',
        model: 'gpt-4o-mini',
      });

      const tempConfig = (adapter as any).getTemperatureConfig(0.3);
      expect(tempConfig).toEqual({ temperature: 0.3 });
    });
  });

  describe('getTokenConfig', () => {
    it('should use max_completion_tokens for o1 models', () => {
      const adapter = new OpenAIAdapter({
        apiKey: 'test-key',
        model: 'o1-preview',
      });

      const tokenConfig = (adapter as any).getTokenConfig(4096);
      expect(tokenConfig).toEqual({ max_completion_tokens: 4096 });
    });

    it('should use max_completion_tokens for gpt-5 models', () => {
      const adapter = new OpenAIAdapter({
        apiKey: 'test-key',
        model: 'gpt-5.1',
      });

      const tokenConfig = (adapter as any).getTokenConfig(2048);
      expect(tokenConfig).toEqual({ max_completion_tokens: 2048 });
    });

    it('should use max_tokens for gpt-4 models', () => {
      const adapter = new OpenAIAdapter({
        apiKey: 'test-key',
        model: 'gpt-4-turbo',
      });

      const tokenConfig = (adapter as any).getTokenConfig(1024);
      expect(tokenConfig).toEqual({ max_tokens: 1024 });
    });

    it('should use max_tokens for gpt-4o models', () => {
      const adapter = new OpenAIAdapter({
        apiKey: 'test-key',
        model: 'gpt-4o-mini',
      });

      const tokenConfig = (adapter as any).getTokenConfig(512);
      expect(tokenConfig).toEqual({ max_tokens: 512 });
    });
  });
});
