import { ExplorationService } from '../../src/application/services/ExplorationService';
import { BrowserPort } from '../../src/application/ports/BrowserPort';
import { LLMPort, LLMResponse } from '../../src/application/ports/LLMPort';
import { FindingsRepository } from '../../src/application/ports/FindingsRepository';
import { EventBus } from '../../src/domain/events/DomainEvent';
import { PageState } from '../../src/domain/browser/PageState';
import { AppConfig } from '../../src/domain/config/AppConfig';

/**
 * Integration tests for Multi-Agent Architecture.
 * Tests the new exploreWithStateMachine() and exploreMultiple() methods.
 */
describe('ExplorationService Multi-Agent Integration', () => {
  // Mock implementations
  const createMockBrowser = () =>
    ({
      initialize: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
      navigate: jest.fn().mockResolvedValue({ success: true, duration: 100 }),
      click: jest.fn().mockResolvedValue({ success: true, duration: 50 }),
      fill: jest.fn().mockResolvedValue({ success: true, duration: 50 }),
      select: jest.fn().mockResolvedValue({ success: true, duration: 50 }),
      hover: jest.fn().mockResolvedValue({ success: true, duration: 50 }),
      screenshot: jest.fn().mockResolvedValue('/path/to/screenshot.png'),
      extractPageState: jest.fn().mockResolvedValue({
        url: 'https://example.com',
        title: 'Test Page',
        visibleText: 'Test content',
        consoleErrors: [],
        networkErrors: [],
        contentHash: 'abc123',
        timestamp: new Date(),
        interactiveElements: [],
        isLoading: false,
        viewport: { width: 1280, height: 720 },
      } as unknown as PageState),
      getInteractiveElements: jest.fn().mockResolvedValue([]),
      waitForSelector: jest.fn().mockResolvedValue({ success: true, duration: 50 }),
      evaluate: jest.fn().mockResolvedValue(null),
      isReady: jest.fn().mockReturnValue(true),
      getCurrentUrl: jest.fn().mockResolvedValue('https://example.com'),
      getTitle: jest.fn().mockResolvedValue('Test Page'),
      goBack: jest.fn().mockResolvedValue({ success: true, duration: 50 }),
      refresh: jest.fn().mockResolvedValue({ success: true, duration: 50 }),
    }) as unknown as jest.Mocked<BrowserPort>;

  const createMockLLM = () =>
    ({
      decideNextAction: jest.fn().mockResolvedValue({
        decision: {
          action: 'done',
          reasoning: 'Exploration complete',
          confidence: 1.0,
        },
        usage: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
        },
      } as LLMResponse),
    }) as unknown as jest.Mocked<LLMPort>;

  const createMockFindingsRepository = () =>
    ({
      save: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn().mockResolvedValue(null),
      findBySessionId: jest.fn().mockResolvedValue([]),
      findBySeverity: jest.fn().mockResolvedValue([]),
      findByType: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue(undefined),
      findAll: jest.fn().mockResolvedValue([]),
      deleteBySessionId: jest.fn().mockResolvedValue(undefined),
      countBySessionId: jest.fn().mockResolvedValue(0),
      getStatsBySessionId: jest.fn().mockResolvedValue({}),
    }) as unknown as jest.Mocked<FindingsRepository>;

  const createMockEventBus = () =>
    ({
      publish: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn(),
      unsubscribe: jest.fn(),
      clear: jest.fn(),
    }) as unknown as jest.Mocked<EventBus>;

  const createMockConfig = (): AppConfig => ({
    exploration: {
      url: 'https://example.com',
      objective: 'Test exploration',
      maxSteps: 5,
      checkpointInterval: 1,
      exitAfterBugsFound: 3,
      requiredTools: [],
      checkpointOnToolFindings: true,
      progressSummaryInterval: 5,
    },
    navigation: {
      waitTime: 100,
      timeout: 1000,
      maxQueueSize: 10,
      scrollAmount: 100,
    },
    llm: {
      provider: 'openai',
      apiKey: 'test',
      model: 'gpt-4',
      minConfidence: 0.5,
      temperature: 0.7,
    },
    browser: {
      headless: true,
      width: 1280,
      height: 720,
    },
    pageAnalysis: {
      maxVisibleText: 5000,
      maxInteractiveElements: 50,
      maxLinkTextLength: 40,
      minActionableWords: 3,
      excludeSelectors: [],
    },
    personas: {
      enabled: false,
      maxSuggestions: 5,
      enableSecurity: false,
      enableMonitor: false,
      enableValidation: false,
      enableChaos: false,
      enableEdgeCase: false,
    },
    deduplication: {
      threshold: 0.6,
      patternMatching: true,
      semanticMatching: true,
    },
  });

  describe('explore', () => {
    it('should explore using the state machine architecture', async () => {
      const browser = createMockBrowser();
      const llm = createMockLLM();
      const findings = createMockFindingsRepository();
      const eventBus = createMockEventBus();

      const config = createMockConfig();

      const service = new ExplorationService(browser, llm, findings, eventBus, config);

      const result = await service.explore('https://example.com', 'Test exploration');

      expect(result).toBeDefined();
      expect(result.sessionId).toBeDefined();
      expect(result.stoppedReason).toBe('completed');
      expect(browser.initialize).toHaveBeenCalled();
      expect(browser.navigate).toHaveBeenCalledWith('https://example.com');
      expect(browser.close).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      const browser = createMockBrowser();
      const llm = createMockLLM();
      const findings = createMockFindingsRepository();
      const eventBus = createMockEventBus();

      browser.initialize.mockRejectedValue(new Error('Browser failed'));

      const config = createMockConfig();
      const service = new ExplorationService(browser, llm, findings, eventBus, config);

      await expect(service.explore('https://example.com')).rejects.toThrow('Browser failed');
    });

    it('should track token usage', async () => {
      const browser = createMockBrowser();
      const llm = createMockLLM();
      const findings = createMockFindingsRepository();
      const eventBus = createMockEventBus();

      const config = createMockConfig();
      config.exploration.maxSteps = 2; // Override specific field

      const service = new ExplorationService(browser, llm, findings, eventBus, config);

      const result = await service.explore('https://example.com');

      expect(result.tokenUsage).toBeDefined();
      expect(typeof result.tokenUsage.promptTokens).toBe('number');
      expect(typeof result.tokenUsage.completionTokens).toBe('number');
      expect(typeof result.tokenUsage.totalTokens).toBe('number');
    });
  });

  describe('exploreMultiple API', () => {
    it('should expose exploreMultiple method', () => {
      const browser = createMockBrowser();
      const llm = createMockLLM();
      const findings = createMockFindingsRepository();
      const eventBus = createMockEventBus();
      const config = createMockConfig();

      const service = new ExplorationService(browser, llm, findings, eventBus, config);

      expect(typeof service.exploreMultiple).toBe('function');
    });
  });
});
