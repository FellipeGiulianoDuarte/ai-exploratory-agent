import { ExplorationSession, ExplorationSessionConfig } from '../../../src/domain/exploration/ExplorationSession';
import { ActionDecision } from '../../../src/application/ports/LLMPort';

describe('ExplorationSession', () => {
  const createMockAction = (overrides: Partial<ActionDecision> = {}): ActionDecision => ({
    action: 'click',
    selector: '#test-btn',
    reasoning: 'Testing',
    confidence: 0.85,
    ...overrides,
  });

  const createConfig = (overrides: Partial<ExplorationSessionConfig> = {}): ExplorationSessionConfig => ({
    targetUrl: 'https://example.com',
    maxSteps: 100,
    checkpointInterval: 10,
    minConfidenceThreshold: 0.5,
    checkpointOnToolFindings: true,
    ...overrides,
  });

  describe('create', () => {
    it('should create a session with idle status', () => {
      const session = ExplorationSession.create(createConfig());

      expect(session.id).toBeDefined();
      expect(session.config.targetUrl).toBe('https://example.com');
      expect(session.status).toBe('idle');
      expect(session.currentStep).toBe(0);
    });

    it('should create a session with custom config', () => {
      const session = ExplorationSession.create(createConfig({
        checkpointInterval: 20,
        minConfidenceThreshold: 0.6,
      }));

      expect(session.config.checkpointInterval).toBe(20);
      expect(session.config.minConfidenceThreshold).toBe(0.6);
    });
  });

  describe('start', () => {
    it('should start the session', async () => {
      const session = ExplorationSession.create(createConfig({ objective: 'Find all bugs' }));
      await session.start();

      expect(session.status).toBe('running');
      expect(session.isRunning).toBe(true);
    });

    it('should throw if session is already running', async () => {
      const session = ExplorationSession.create(createConfig());
      await session.start();

      await expect(session.start()).rejects.toThrow();
    });
  });

  describe('recordStep', () => {
    it('should record a successful step', async () => {
      const session = ExplorationSession.create(createConfig());
      await session.start();

      const step = await session.recordStep(
        createMockAction(),
        true,
        'https://example.com/page1',
        1000
      );

      expect(step).toBeDefined();
      expect(step.stepNumber).toBe(1);
      expect(step.success).toBe(true);
      expect(session.currentStep).toBe(1);
    });

    it('should record multiple steps with incrementing numbers', async () => {
      const session = ExplorationSession.create(createConfig());
      await session.start();

      await session.recordStep(
        createMockAction(),
        true,
        'https://example.com/page1',
        1000
      );

      const step2 = await session.recordStep(
        createMockAction({ action: 'fill', value: 'test' }),
        true,
        'https://example.com/page1',
        1000
      );

      expect(step2.stepNumber).toBe(2);
      expect(session.currentStep).toBe(2);
    });

    it('should track the current URL', async () => {
      const session = ExplorationSession.create(createConfig());
      await session.start();

      await session.recordStep(
        createMockAction({ action: 'navigate', value: 'https://new.com' }),
        true,
        'https://new.com',
        1000
      );

      expect(session.currentUrl).toBe('https://new.com');
    });

    it('should throw if session is not running', async () => {
      const session = ExplorationSession.create(createConfig());

      await expect(
        session.recordStep(createMockAction(), true, 'https://example.com', 1000)
      ).rejects.toThrow();
    });
  });

  describe('shouldCheckpoint', () => {
    it('should return step_count when interval reached', async () => {
      const session = ExplorationSession.create(createConfig({ checkpointInterval: 2 }));
      await session.start();

      await session.recordStep(createMockAction(), true, 'https://example.com', 1000);
      await session.recordStep(createMockAction(), true, 'https://example.com', 1000);

      expect(session.shouldCheckpoint()).toBe('step_count');
    });

    it('should return null before reaching interval', async () => {
      const session = ExplorationSession.create(createConfig({ checkpointInterval: 10 }));
      await session.start();

      await session.recordStep(createMockAction(), true, 'https://example.com', 1000);

      expect(session.shouldCheckpoint()).toBeNull();
    });

    it('should return low_confidence for low confidence action', async () => {
      const session = ExplorationSession.create(createConfig({ minConfidenceThreshold: 0.7 }));
      await session.start();

      const lowConfidenceAction = createMockAction({ confidence: 0.4 });
      expect(session.shouldCheckpoint(lowConfidenceAction)).toBe('low_confidence');
    });
  });

  describe('triggerCheckpoint', () => {
    it('should pause session with checkpoint', async () => {
      const session = ExplorationSession.create(createConfig());
      await session.start();

      await session.triggerCheckpoint('step_count');

      expect(session.status).toBe('paused');
      expect(session.isPaused).toBe(true);
    });
  });

  describe('applyGuidance', () => {
    it('should apply guidance and resume session', async () => {
      const session = ExplorationSession.create(createConfig());
      await session.start();
      await session.triggerCheckpoint('step_count');

      await session.applyGuidance({
        action: 'continue',
        guidance: 'Focus on form validation',
      });

      expect(session.status).toBe('running');
      expect(session.humanGuidance?.guidance).toBe('Focus on form validation');
    });

    it('should stop session if guidance action is stop', async () => {
      const session = ExplorationSession.create(createConfig());
      await session.start();
      await session.triggerCheckpoint('step_count');

      await session.applyGuidance({ action: 'stop' });

      expect(session.hasEnded).toBe(true);
    });
  });

  describe('resume', () => {
    it('should resume from paused state', async () => {
      const session = ExplorationSession.create(createConfig());
      await session.start();
      await session.triggerCheckpoint('step_count');
      
      session.resume();

      expect(session.status).toBe('running');
    });

    it('should throw if not paused', async () => {
      const session = ExplorationSession.create(createConfig());
      await session.start();

      expect(() => session.resume()).toThrow();
    });
  });

  describe('stop', () => {
    it('should stop the session with completed reason', async () => {
      const session = ExplorationSession.create(createConfig());
      await session.start();

      await session.stop('completed');

      expect(session.status).toBe('completed');
      expect(session.hasEnded).toBe(true);
    });

    it('should stop with stopped_by_user reason', async () => {
      const session = ExplorationSession.create(createConfig());
      await session.start();

      await session.stop('stopped_by_user');

      expect(session.status).toBe('stopped');
    });
  });

  describe('hasReachedMaxSteps', () => {
    it('should return true when max steps reached', async () => {
      const session = ExplorationSession.create(createConfig({ maxSteps: 2 }));
      await session.start();

      await session.recordStep(createMockAction(), true, 'https://example.com', 1000);
      await session.recordStep(createMockAction(), true, 'https://example.com', 1000);

      expect(session.hasReachedMaxSteps()).toBe(true);
    });

    it('should return false before max steps', async () => {
      const session = ExplorationSession.create(createConfig({ maxSteps: 10 }));
      await session.start();

      await session.recordStep(createMockAction(), true, 'https://example.com', 1000);

      expect(session.hasReachedMaxSteps()).toBe(false);
    });
  });

  describe('getHistoryForLLM', () => {
    it('should return history entries for LLM', async () => {
      const session = ExplorationSession.create(createConfig());
      await session.start();

      await session.recordStep(
        createMockAction({ action: 'click' }),
        true,
        'https://example.com/page1',
        1000
      );

      const history = session.getHistoryForLLM();

      expect(history).toHaveLength(1);
      expect(history[0].step).toBe(1);
      expect(history[0].action.action).toBe('click');
      expect(history[0].success).toBe(true);
    });
  });

  describe('getStats', () => {
    it('should return session statistics', async () => {
      const session = ExplorationSession.create(createConfig());
      await session.start();

      await session.recordStep(createMockAction(), true, 'https://example.com/page1', 1000);
      await session.recordStep(createMockAction(), false, 'https://example.com/page1', 1000, 'Error');
      await session.recordStep(createMockAction(), true, 'https://example.com/page2', 1000);

      const stats = session.getStats();

      expect(stats.totalSteps).toBe(3);
      expect(stats.successfulSteps).toBe(2);
      expect(stats.failedSteps).toBe(1);
      expect(stats.uniqueUrls).toBe(3); // target + page1 + page2
    });
  });

  describe('getSummary', () => {
    it('should return session summary string', async () => {
      const session = ExplorationSession.create(createConfig({ objective: 'Find bugs' }));
      await session.start();

      await session.recordStep(createMockAction(), true, 'https://example.com/page1', 1000);

      const summary = session.getSummary();

      expect(summary).toContain('Exploration Session Summary');
      expect(summary).toContain('running');
      expect(summary).toContain('Find bugs');
    });
  });

  describe('addFinding', () => {
    it('should add finding to session', async () => {
      const session = ExplorationSession.create(createConfig());
      await session.start();
      await session.recordStep(createMockAction(), true, 'https://example.com', 1000);

      session.addFinding('finding-1');

      expect(session.findingIds).toContain('finding-1');
    });

    it('should not add duplicate findings', async () => {
      const session = ExplorationSession.create(createConfig());
      await session.start();
      await session.recordStep(createMockAction(), true, 'https://example.com', 1000);

      session.addFinding('finding-1');
      session.addFinding('finding-1');

      expect(session.findingIds.filter(f => f === 'finding-1')).toHaveLength(1);
    });
  });
});
