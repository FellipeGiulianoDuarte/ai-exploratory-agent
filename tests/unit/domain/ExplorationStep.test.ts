import { ExplorationStep } from '../../../src/domain/exploration/ExplorationStep';
import { ActionDecision } from '../../../src/application/ports/LLMPort';

describe('ExplorationStep', () => {
  const createMockAction = (overrides: Partial<ActionDecision> = {}): ActionDecision => ({
    action: 'click',
    selector: '#submit-btn',
    reasoning: 'Testing button click',
    confidence: 0.9,
    ...overrides,
  });

  describe('create', () => {
    it('should create a step with required properties', () => {
      const step = ExplorationStep.create({
        stepNumber: 1,
        action: createMockAction(),
        success: true,
        resultingUrl: 'https://example.com/page',
        findingIds: [],
        duration: 1000,
      });

      expect(step.id).toBeDefined();
      expect(step.stepNumber).toBe(1);
      expect(step.action).toEqual(createMockAction());
      expect(step.success).toBe(true);
      expect(step.resultingUrl).toBe('https://example.com/page');
      expect(step.duration).toBe(1000);
    });

    it('should create a step with a provided ID', () => {
      const step = ExplorationStep.create({
        stepNumber: 1,
        action: createMockAction(),
        success: true,
        resultingUrl: 'https://example.com/page',
        findingIds: [],
        duration: 1000,
      }, 'custom-id');

      expect(step.id).toBe('custom-id');
    });

    it('should handle optional properties', () => {
      const step = ExplorationStep.create({
        stepNumber: 1,
        action: createMockAction(),
        success: false,
        resultingUrl: 'https://example.com/page',
        findingIds: ['finding-1', 'finding-2'],
        duration: 1500,
        error: 'Some error',
        screenshotPath: 'screenshot.png',
      });

      expect(step.error).toBe('Some error');
      expect(step.screenshotPath).toBe('screenshot.png');
      expect(step.findingIds).toEqual(['finding-1', 'finding-2']);
      expect(step.duration).toBe(1500);
    });
  });

  describe('addFinding', () => {
    it('should add a finding ID', () => {
      const step = ExplorationStep.create({
        stepNumber: 1,
        action: createMockAction(),
        success: true,
        resultingUrl: 'https://example.com/page',
        findingIds: [],
        duration: 1000,
      });
      step.addFinding('finding-1');

      expect(step.findingIds).toContain('finding-1');
    });

    it('should add multiple findings', () => {
      const step = ExplorationStep.create({
        stepNumber: 1,
        action: createMockAction(),
        success: true,
        resultingUrl: 'https://example.com/page',
        findingIds: [],
        duration: 1000,
      });
      step.addFinding('finding-1');
      step.addFinding('finding-2');

      expect(step.findingIds).toHaveLength(2);
      expect(step.findingIds).toContain('finding-1');
      expect(step.findingIds).toContain('finding-2');
    });

    it('should not add duplicate findings', () => {
      const step = ExplorationStep.create({
        stepNumber: 1,
        action: createMockAction(),
        success: true,
        resultingUrl: 'https://example.com/page',
        findingIds: [],
        duration: 1000,
      });
      step.addFinding('finding-1');
      step.addFinding('finding-1');

      expect(step.findingIds).toHaveLength(1);
    });
  });

  describe('setScreenshot', () => {
    it('should set the screenshot path', () => {
      const step = ExplorationStep.create({
        stepNumber: 1,
        action: createMockAction(),
        success: true,
        resultingUrl: 'https://example.com/page',
        findingIds: [],
        duration: 1000,
      });
      step.setScreenshot('/screenshots/step-1.png');

      expect(step.screenshotPath).toBe('/screenshots/step-1.png');
    });
  });

  describe('isNavigation', () => {
    it('should return true for navigate action', () => {
      const step = ExplorationStep.create({
        stepNumber: 1,
        action: createMockAction({ action: 'navigate', value: 'https://example.com' }),
        success: true,
        resultingUrl: 'https://example.com',
        findingIds: [],
        duration: 1000,
      });

      expect(step.isNavigation()).toBe(true);
    });

    it('should return true for back action', () => {
      const step = ExplorationStep.create({
        stepNumber: 1,
        action: createMockAction({ action: 'back' }),
        success: true,
        resultingUrl: 'https://example.com',
        findingIds: [],
        duration: 1000,
      });

      expect(step.isNavigation()).toBe(true);
    });

    it('should return false for click action', () => {
      const step = ExplorationStep.create({
        stepNumber: 1,
        action: createMockAction({ action: 'click' }),
        success: true,
        resultingUrl: 'https://example.com',
        findingIds: [],
        duration: 1000,
      });

      expect(step.isNavigation()).toBe(false);
    });
  });

  describe('isToolInvocation', () => {
    it('should return true for tool action', () => {
      const step = ExplorationStep.create({
        stepNumber: 1,
        action: createMockAction({ action: 'tool', toolName: 'broken_image_detector' }),
        success: true,
        resultingUrl: 'https://example.com',
        findingIds: [],
        duration: 1000,
      });

      expect(step.isToolInvocation()).toBe(true);
    });

    it('should return false for non-tool action', () => {
      const step = ExplorationStep.create({
        stepNumber: 1,
        action: createMockAction({ action: 'click' }),
        success: true,
        resultingUrl: 'https://example.com',
        findingIds: [],
        duration: 1000,
      });

      expect(step.isToolInvocation()).toBe(false);
    });
  });

  describe('summarize', () => {
    it('should return a human-readable summary for successful step', () => {
      const step = ExplorationStep.create({
        stepNumber: 1,
        action: createMockAction({ action: 'click', selector: '#login-btn' }),
        success: true,
        resultingUrl: 'https://example.com/page',
        findingIds: [],
        duration: 1000,
      });

      const summary = step.summarize();

      expect(summary).toContain('Step 1');
      expect(summary).toContain('click');
    });

    it('should return a summary for failed step', () => {
      const step = ExplorationStep.create({
        stepNumber: 1,
        action: createMockAction({ action: 'click' }),
        success: false,
        resultingUrl: 'https://example.com/page',
        findingIds: [],
        duration: 1000,
        error: 'Element not found',
      });

      const summary = step.summarize();

      expect(summary).toContain('Step 1');
    });
  });

  describe('toJSON', () => {
    it('should serialize step to JSON', () => {
      const step = ExplorationStep.create({
        stepNumber: 1,
        action: createMockAction(),
        success: true,
        resultingUrl: 'https://example.com/page',
        findingIds: ['f1'],
        duration: 1000,
      }, 'test-id');

      const json = step.toJSON();

      expect(json.id).toBe('test-id');
      expect(json.stepNumber).toBe(1);
      expect(json.success).toBe(true);
      expect(json.findingIds).toEqual(['f1']);
      expect(json.duration).toBe(1000);
    });
  });
});
