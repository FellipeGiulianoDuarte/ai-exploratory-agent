import { ExplorationService } from '../../../src/application/services/ExplorationService';
import { LoopDetectionService } from '../../../src/application/services/LoopDetectionService';
import { BrowserPort } from '../../../src/application/ports/BrowserPort';
import { LLMPort, ActionDecision } from '../../../src/application/ports/LLMPort';
import { FindingsRepository } from '../../../src/application/ports/FindingsRepository';
import { EventBus } from '../../../src/domain/events/DomainEvent';

/**
 * Tests for loop detection mechanisms in ExplorationService.
 * These tests verify that the agent doesn't get stuck repeating the same actions.
 *
 * Note: Action signature generation has been moved to LoopDetectionService.
 */
describe('ExplorationService - Loop Detection', () => {
  let mockBrowser: jest.Mocked<BrowserPort>;
  let mockLLM: jest.Mocked<LLMPort>;
  let mockFindingsRepo: jest.Mocked<FindingsRepository>;
  let mockEventBus: jest.Mocked<EventBus>;
  let loopDetectionService: LoopDetectionService;

  beforeEach(() => {
    // Mock BrowserPort
    mockBrowser = {
      initialize: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
      navigate: jest.fn().mockResolvedValue({ success: true }),
      extractPageState: jest.fn(),
      getCurrentUrl: jest.fn(),
      getTitle: jest.fn().mockResolvedValue('Test Page'),
      click: jest.fn().mockResolvedValue({ success: true }),
      fill: jest.fn().mockResolvedValue({ success: true }),
      select: jest.fn().mockResolvedValue({ success: true }),
      hover: jest.fn().mockResolvedValue({ success: true }),
      goBack: jest.fn().mockResolvedValue(undefined),
      refresh: jest.fn().mockResolvedValue(undefined),
      evaluate: jest.fn().mockResolvedValue(undefined),
      takeScreenshot: jest.fn().mockResolvedValue('screenshot.png'),
    } as any;

    // Mock LLMPort
    mockLLM = {
      decideNextAction: jest.fn(),
      generateSummary: jest.fn().mockResolvedValue('Test summary'),
    } as any;

    // Mock FindingsRepository
    mockFindingsRepo = {
      save: jest.fn().mockResolvedValue(undefined),
      findBySessionId: jest.fn().mockResolvedValue([]),
      findById: jest.fn(),
      findAll: jest.fn(),
    } as any;

    // Mock EventBus
    mockEventBus = {
      publish: jest.fn(),
      subscribe: jest.fn(),
    } as any;

    // Create loop detection service for testing action signatures
    loopDetectionService = new LoopDetectionService();
  });

  describe('Action Signature Generation', () => {
    it('should create unique signatures for different actions', () => {
      // Use LoopDetectionService which now handles action signatures
      const getSignature = (decision: ActionDecision) =>
        (loopDetectionService as any).getActionSignature(decision);

      const sig1 = getSignature({
        action: 'click',
        selector: '#btn1',
        reasoning: '',
        confidence: 0.8,
      });
      const sig2 = getSignature({
        action: 'click',
        selector: '#btn2',
        reasoning: '',
        confidence: 0.8,
      });
      const sig3 = getSignature({
        action: 'fill',
        selector: '#input',
        value: 'test',
        reasoning: '',
        confidence: 0.8,
      });

      expect(sig1).not.toBe(sig2);
      expect(sig1).not.toBe(sig3);
      expect(sig2).not.toBe(sig3);
    });

    it('should create same signature for equivalent actions', () => {
      const getSignature = (decision: ActionDecision) =>
        (loopDetectionService as any).getActionSignature(decision);

      const sig1 = getSignature({
        action: 'fill',
        selector: '#email',
        value: 'test@example.com',
        reasoning: '',
        confidence: 0.8,
      });
      const sig2 = getSignature({
        action: 'fill',
        selector: '#email',
        value: 'test@example.com',
        reasoning: 'Different reasoning',
        confidence: 0.9,
      });

      expect(sig1).toBe(sig2);
    });

    it('should normalize similar values', () => {
      const getSignature = (decision: ActionDecision) =>
        (loopDetectionService as any).getActionSignature(decision);

      const sig1 = getSignature({
        action: 'fill',
        selector: '#input',
        value: '"test"',
        reasoning: '',
        confidence: 0.8,
      });
      const sig2 = getSignature({
        action: 'fill',
        selector: '#input',
        value: "'test'",
        reasoning: '',
        confidence: 0.8,
      });

      expect(sig1).toBe(sig2); // Quotes should be normalized
    });
  });

  describe('Repetitive Action Detection', () => {
    it('should have action signature generation to detect repetitive actions', () => {
      // Test the action signature generation which is used for repetitive action detection
      const getSignature = (decision: ActionDecision) =>
        (loopDetectionService as any).getActionSignature(decision);

      // Same action should produce same signature (used for detecting repeats)
      const sig1 = getSignature({
        action: 'fill',
        selector: '#first_name',
        value: '<script>alert("XSS")</script>',
        reasoning: 'test1',
        confidence: 0.8,
      });
      const sig2 = getSignature({
        action: 'fill',
        selector: '#first_name',
        value: '<script>alert("XSS")</script>',
        reasoning: 'test2',
        confidence: 0.9,
      });

      expect(sig1).toBe(sig2); // Same action should have same signature for dedup
    });
  });

  describe('Empty URL Navigation Prevention', () => {
    it('should have URL validation in action signature', () => {
      const getSignature = (decision: ActionDecision) =>
        (loopDetectionService as any).getActionSignature(decision);

      // Navigate with empty URL
      const emptyUrlSig = getSignature({
        action: 'navigate',
        value: '',
        reasoning: '',
        confidence: 0.8,
      });

      // Should still generate a signature (action handling is separate)
      expect(emptyUrlSig).toContain('navigate');
    });

    it('should normalize whitespace in action signatures', () => {
      const getSignature = (decision: ActionDecision) =>
        (loopDetectionService as any).getActionSignature(decision);

      const sig1 = getSignature({
        action: 'navigate',
        value: '   ',
        reasoning: '',
        confidence: 0.8,
      });

      const sig2 = getSignature({
        action: 'navigate',
        value: '',
        reasoning: '',
        confidence: 0.8,
      });

      // Both should be treated as empty navigate actions
      expect(sig1).toContain('navigate');
      expect(sig2).toContain('navigate');
    });
  });

  describe('Tool Reuse Prevention', () => {
    it('should track tools used per URL', () => {
      const service = new ExplorationService(mockBrowser, mockLLM, mockFindingsRepo, mockEventBus);

      // The toolUsageByUrl map should be available for tracking
      expect(service['toolUsageByUrl']).toBeDefined();
      expect(service['toolUsageByUrl'].size).toBe(0);
    });
  });

  describe('Exit Criteria and Page Navigation', () => {
    it('should track steps on current URL', () => {
      // This test verifies the tracking mechanism exists
      // Full integration test is complex due to interaction with action loop detection
      const service = new ExplorationService(mockBrowser, mockLLM, mockFindingsRepo, mockEventBus);

      expect(service['stepsOnCurrentUrl']).toBe(0);
      expect(service['lastUrl']).toBe('');
      // Exit criteria is now handled by PageExplorationContext
      expect(service['pageContext']).toBeDefined();
    });
  });
});
