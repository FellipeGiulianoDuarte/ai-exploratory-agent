/**
 * Tests for LoopDetectionService
 */

import {
  LoopDetectionService,
  DEFAULT_LOOP_DETECTION_CONFIG,
} from '../../../src/application/services/LoopDetectionService';
import { ActionDecision } from '../../../src/domain/exploration/ActionTypes';

// Helper to create ActionDecision objects
const createAction = (overrides: Partial<ActionDecision> = {}): ActionDecision => ({
  action: 'click',
  reasoning: 'Test action',
  confidence: 0.8,
  ...overrides,
});

describe('LoopDetectionService', () => {
  let service: LoopDetectionService;

  beforeEach(() => {
    service = new LoopDetectionService();
  });

  describe('constructor', () => {
    it('should use default config when no config provided', () => {
      const stats = service.getStats();
      expect(stats.toolCalls).toBe(0);
      expect(stats.actions).toBe(0);
    });

    it('should accept custom config', () => {
      const customService = new LoopDetectionService({
        toolHistorySize: 5,
        toolLoopThreshold: 2,
      });
      expect(customService).toBeDefined();
    });
  });

  describe('recordToolCall', () => {
    it('should record tool calls', () => {
      service.recordToolCall('broken_image_detector');
      const stats = service.getStats();
      expect(stats.toolCalls).toBe(1);
    });

    it('should limit history to configured size', () => {
      const smallHistoryService = new LoopDetectionService({ toolHistorySize: 3 });

      smallHistoryService.recordToolCall('tool1');
      smallHistoryService.recordToolCall('tool2');
      smallHistoryService.recordToolCall('tool3');
      smallHistoryService.recordToolCall('tool4');

      const stats = smallHistoryService.getStats();
      expect(stats.toolCalls).toBe(3);
    });
  });

  describe('recordAction', () => {
    it('should record actions', () => {
      const decision = createAction({
        selector: '#button',
      });

      service.recordAction(decision);
      const stats = service.getStats();
      expect(stats.actions).toBe(1);
    });

    it('should limit history to configured size', () => {
      const smallHistoryService = new LoopDetectionService({ actionHistorySize: 3 });

      for (let i = 0; i < 5; i++) {
        const decision = createAction({
          selector: `#button${i}`,
        });
        smallHistoryService.recordAction(decision);
      }

      const stats = smallHistoryService.getStats();
      expect(stats.actions).toBe(3);
    });
  });

  describe('detectToolLoop', () => {
    it('should not detect loop for first occurrence', () => {
      const result = service.detectToolLoop('broken_image_detector');
      expect(result.isLoop).toBe(false);
    });

    it('should detect loop when threshold reached', () => {
      // Record 2 calls (default threshold is 3)
      service.recordToolCall('broken_image_detector');
      service.recordToolCall('broken_image_detector');

      // Third call should trigger detection
      const result = service.detectToolLoop('broken_image_detector');
      expect(result.isLoop).toBe(true);
      expect(result.type).toBe('tool');
      expect(result.count).toBe(3);
    });

    it('should not detect loop for different tools', () => {
      service.recordToolCall('tool1');
      service.recordToolCall('tool2');

      const result = service.detectToolLoop('tool3');
      expect(result.isLoop).toBe(false);
    });

    it('should include params in signature', () => {
      service.recordToolCall('tool', { param: 'value1' });
      service.recordToolCall('tool', { param: 'value1' });

      // Different params should not trigger loop
      const result1 = service.detectToolLoop('tool', { param: 'value2' });
      expect(result1.isLoop).toBe(false);

      // Same params should trigger loop
      const result2 = service.detectToolLoop('tool', { param: 'value1' });
      expect(result2.isLoop).toBe(true);
    });
  });

  describe('detectActionLoop', () => {
    it('should not detect loop for first occurrence', () => {
      const decision = createAction({
        selector: '#button',
      });

      const result = service.detectActionLoop(decision);
      expect(result.isLoop).toBe(false);
    });

    it('should handle non-string value types without throwing', () => {
      // Test with value as object (LLM might return wrong type)
      const decision = createAction({
        action: 'fill',
        selector: '#input',
        value: { foo: 'bar' } as any, // Simulate LLM returning wrong type
      });

      // Should not throw error
      expect(() => service.recordAction(decision)).not.toThrow();
      expect(() => service.detectActionLoop(decision)).not.toThrow();

      // Test with value as number
      const decision2 = createAction({
        action: 'fill',
        selector: '#input',
        value: 123 as any,
      });

      expect(() => service.recordAction(decision2)).not.toThrow();
      expect(() => service.detectActionLoop(decision2)).not.toThrow();

      // Test with value as array
      const decision3 = createAction({
        action: 'fill',
        selector: '#input',
        value: ['test'] as any,
      });

      expect(() => service.recordAction(decision3)).not.toThrow();
      expect(() => service.detectActionLoop(decision3)).not.toThrow();
    });

    it('should detect loop when threshold reached', () => {
      const decision = createAction({
        selector: '#button',
      });

      // Record 3 actions (default threshold is 4)
      service.recordAction(decision);
      service.recordAction(decision);
      service.recordAction(decision);

      // Fourth should trigger detection
      const result = service.detectActionLoop(decision);
      expect(result.isLoop).toBe(true);
      expect(result.type).toBe('action');
      expect(result.count).toBe(4);
    });

    it('should not detect loop for different actions', () => {
      for (let i = 0; i < 3; i++) {
        const decision = createAction({
          selector: `#button${i}`,
        });
        service.recordAction(decision);
      }

      const newDecision = createAction({
        selector: '#differentButton',
      });

      const result = service.detectActionLoop(newDecision);
      expect(result.isLoop).toBe(false);
    });

    it('should distinguish fill actions with different values', () => {
      // Record fill with "value1"
      service.recordAction(createAction({ action: 'fill', selector: '#input', value: 'value1' }));
      service.recordAction(createAction({ action: 'fill', selector: '#input', value: 'value1' }));
      service.recordAction(createAction({ action: 'fill', selector: '#input', value: 'value1' }));

      // 4th action with "value2" should NOT be a loop (assuming threshold 4)
      const diffValueResult = service.detectActionLoop(
        createAction({
          action: 'fill',
          selector: '#input',
          value: 'value2',
        })
      );
      expect(diffValueResult.isLoop).toBe(false);

      // 4th action with empty string "" should NOT be a loop
      const emptyValueResult = service.detectActionLoop(
        createAction({
          action: 'fill',
          selector: '#input',
          value: '',
        })
      );
      expect(emptyValueResult.isLoop).toBe(false);
    });
  });

  describe('detectLoop', () => {
    it('should check tool loops for tool actions', () => {
      // Record tool calls
      service.recordToolCall('broken_image_detector');
      service.recordToolCall('broken_image_detector');

      const decision = createAction({
        action: 'tool',
        toolName: 'broken_image_detector',
      });

      const result = service.detectLoop(decision);
      expect(result.isLoop).toBe(true);
      expect(result.type).toBe('tool');
    });

    it('should check action loops for non-tool actions', () => {
      const decision = createAction({
        selector: '#button',
      });

      // Record 3 actions
      service.recordAction(decision);
      service.recordAction(decision);
      service.recordAction(decision);

      const result = service.detectLoop(decision);
      expect(result.isLoop).toBe(true);
      expect(result.type).toBe('action');
    });
  });

  describe('reset', () => {
    it('should clear all history', () => {
      service.recordToolCall('tool');
      service.recordAction(createAction({ selector: '#btn' }));

      service.reset();

      const stats = service.getStats();
      expect(stats.toolCalls).toBe(0);
      expect(stats.actions).toBe(0);
    });
  });

  describe('resetActionHistory', () => {
    it('should clear only action history', () => {
      service.recordToolCall('tool');
      service.recordAction(createAction({ selector: '#btn' }));

      service.resetActionHistory();

      const stats = service.getStats();
      expect(stats.toolCalls).toBe(1);
      expect(stats.actions).toBe(0);
    });
  });

  describe('DEFAULT_LOOP_DETECTION_CONFIG', () => {
    it('should have expected default values', () => {
      expect(DEFAULT_LOOP_DETECTION_CONFIG.toolHistorySize).toBe(10);
      expect(DEFAULT_LOOP_DETECTION_CONFIG.toolLoopThreshold).toBe(3);
      expect(DEFAULT_LOOP_DETECTION_CONFIG.actionHistorySize).toBe(20);
      expect(DEFAULT_LOOP_DETECTION_CONFIG.actionLoopThreshold).toBe(4);
    });
  });
});
