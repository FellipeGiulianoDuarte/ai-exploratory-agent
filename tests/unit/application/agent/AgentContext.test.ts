import {
  createInitialContext,
  updateContext,
} from '../../../../src/application/services/agent/AgentContext';
import { ExplorationState } from '../../../../src/domain/exploration/ExplorationState';
import {
  ExplorationSession,
  ExplorationSessionConfig,
} from '../../../../src/domain/exploration/ExplorationSession';

describe('AgentContext', () => {
  const createMockSession = (): ExplorationSession => {
    const config: ExplorationSessionConfig = {
      targetUrl: 'https://example.com',
      maxSteps: 100,
      checkpointInterval: 10,
      minConfidenceThreshold: 0.5,
      checkpointOnToolFindings: true,
    };
    return ExplorationSession.create(config);
  };

  describe('createInitialContext', () => {
    it('should create context with correct agentId', () => {
      const session = createMockSession();
      const context = createInitialContext('agent-1', session);

      expect(context.agentId).toBe('agent-1');
    });

    it('should create context with session reference', () => {
      const session = createMockSession();
      const context = createInitialContext('agent-1', session);

      expect(context.session).toBe(session);
    });

    it('should create context in INIT state', () => {
      const session = createMockSession();
      const context = createInitialContext('agent-1', session);

      expect(context.currentState).toBe(ExplorationState.INIT);
    });

    it('should create context with null page data', () => {
      const session = createMockSession();
      const context = createInitialContext('agent-1', session);

      expect(context.pageState).toBeNull();
      expect(context.llmPageContext).toBeNull();
      expect(context.personaAnalysis).toBeNull();
      expect(context.decision).toBeNull();
      expect(context.stepResult).toBeNull();
    });

    it('should create context with empty collections', () => {
      const session = createMockSession();
      const context = createInitialContext('agent-1', session);

      expect(context.findings).toEqual([]);
      expect(context.recentActions).toEqual([]);
      expect(context.visitedUrls.size).toBe(0);
    });

    it('should create context with zero token usage', () => {
      const session = createMockSession();
      const context = createInitialContext('agent-1', session);

      expect(context.tokenUsage.promptTokens).toBe(0);
      expect(context.tokenUsage.completionTokens).toBe(0);
      expect(context.tokenUsage.totalTokens).toBe(0);
    });

    it('should create context with no exit signals', () => {
      const session = createMockSession();
      const context = createInitialContext('agent-1', session);

      expect(context.shouldExit).toBe(false);
      expect(context.exitReason).toBeNull();
      expect(context.error).toBeNull();
    });

    it('should create context with startTime set', () => {
      const before = Date.now();
      const session = createMockSession();
      const context = createInitialContext('agent-1', session);
      const after = Date.now();

      expect(context.startTime).toBeGreaterThanOrEqual(before);
      expect(context.startTime).toBeLessThanOrEqual(after);
    });
  });

  describe('updateContext', () => {
    it('should update specific fields', () => {
      const session = createMockSession();
      const context = createInitialContext('agent-1', session);

      const updated = updateContext(context, {
        currentState: ExplorationState.EXTRACTING_PAGE,
        stepsOnCurrentUrl: 5,
      });

      expect(updated.currentState).toBe(ExplorationState.EXTRACTING_PAGE);
      expect(updated.stepsOnCurrentUrl).toBe(5);
    });

    it('should preserve unchanged fields', () => {
      const session = createMockSession();
      const context = createInitialContext('agent-1', session);

      const updated = updateContext(context, {
        currentState: ExplorationState.EXTRACTING_PAGE,
      });

      expect(updated.agentId).toBe('agent-1');
      expect(updated.session).toBe(session);
    });

    it('should deep clone tokenUsage', () => {
      const session = createMockSession();
      const context = createInitialContext('agent-1', session);
      context.tokenUsage.promptTokens = 100;

      const updated = updateContext(context, {});

      // Should have cloned tokenUsage
      expect(updated.tokenUsage).not.toBe(context.tokenUsage);
      expect(updated.tokenUsage.promptTokens).toBe(100);
    });

    it('should deep clone visitedUrls', () => {
      const session = createMockSession();
      const context = createInitialContext('agent-1', session);
      context.visitedUrls.add('https://example.com');

      const updated = updateContext(context, {});

      // Should have cloned set
      expect(updated.visitedUrls).not.toBe(context.visitedUrls);
      expect(updated.visitedUrls.has('https://example.com')).toBe(true);
    });

    it('should deep clone recentActions', () => {
      const session = createMockSession();
      const context = createInitialContext('agent-1', session);
      context.recentActions.push('click');

      const updated = updateContext(context, {});

      // Should have cloned array
      expect(updated.recentActions).not.toBe(context.recentActions);
      expect(updated.recentActions).toContain('click');
    });

    it('should deep clone findings', () => {
      const session = createMockSession();
      const context = createInitialContext('agent-1', session);

      const updated = updateContext(context, {});

      // Should have cloned array
      expect(updated.findings).not.toBe(context.findings);
    });

    it('should update exit signals', () => {
      const session = createMockSession();
      const context = createInitialContext('agent-1', session);

      const updated = updateContext(context, {
        shouldExit: true,
        exitReason: 'completed',
      });

      expect(updated.shouldExit).toBe(true);
      expect(updated.exitReason).toBe('completed');
    });
  });
});
