import { SharedExplorationState } from '../../../../src/application/services/supervisor/SharedExplorationState';
import { Finding } from '../../../../src/domain/exploration/Finding';

describe('SharedExplorationState', () => {
  let sharedState: SharedExplorationState;

  beforeEach(() => {
    sharedState = new SharedExplorationState();
  });

  describe('visitedUrls', () => {
    it('should return false for unvisited URL', async () => {
      expect(await sharedState.hasVisited('https://example.com')).toBe(false);
    });

    it('should return true after marking URL as visited', async () => {
      await sharedState.markVisited('https://example.com');
      expect(await sharedState.hasVisited('https://example.com')).toBe(true);
    });

    it('should track multiple URLs', async () => {
      await sharedState.markVisited('https://a.com');
      await sharedState.markVisited('https://b.com');

      expect(await sharedState.hasVisited('https://a.com')).toBe(true);
      expect(await sharedState.hasVisited('https://b.com')).toBe(true);
      expect(await sharedState.hasVisited('https://c.com')).toBe(false);
    });

    it('should return all visited URLs', async () => {
      await sharedState.markVisited('https://a.com');
      await sharedState.markVisited('https://b.com');

      const urls = await sharedState.getVisitedUrls();
      expect(urls).toContain('https://a.com');
      expect(urls).toContain('https://b.com');
    });
  });

  describe('findings', () => {
    const createMockFinding = (title: string, pageUrl: string): Finding => {
      return Finding.create({
        sessionId: 'test-session',
        type: 'functional',
        severity: 'medium',
        title,
        description: 'Test description',
        pageUrl,
        pageTitle: 'Test Page',
        stepNumber: 1,
      });
    };

    it('should add findings', async () => {
      const finding = createMockFinding('Bug 1', 'https://example.com');
      const added = await sharedState.addFinding(finding);

      expect(added).toBe(true);
      expect(await sharedState.getFindingsCount()).toBe(1);
    });

    it('should deduplicate findings with same title and URL', async () => {
      const finding1 = createMockFinding('Bug 1', 'https://example.com');
      const finding2 = createMockFinding('Bug 1', 'https://example.com');

      await sharedState.addFinding(finding1);
      const added = await sharedState.addFinding(finding2);

      expect(added).toBe(false);
      expect(await sharedState.getFindingsCount()).toBe(1);
    });

    it('should allow findings with different titles', async () => {
      const finding1 = createMockFinding('Bug 1', 'https://example.com');
      const finding2 = createMockFinding('Bug 2', 'https://example.com');

      await sharedState.addFinding(finding1);
      await sharedState.addFinding(finding2);

      expect(await sharedState.getFindingsCount()).toBe(2);
    });

    it('should return all findings', async () => {
      const finding1 = createMockFinding('Bug 1', 'https://example.com');
      const finding2 = createMockFinding('Bug 2', 'https://other.com');

      await sharedState.addFinding(finding1);
      await sharedState.addFinding(finding2);

      const findings = await sharedState.getFindings();
      expect(findings).toHaveLength(2);
    });
  });

  describe('urlQueue', () => {
    it('should enqueue URLs', async () => {
      await sharedState.enqueueUrl({ normalizedUrl: 'https://example.com' });
      expect(await sharedState.getUrlQueueSize()).toBe(1);
    });

    it('should not enqueue duplicate URLs', async () => {
      await sharedState.enqueueUrl({ normalizedUrl: 'https://example.com' });
      await sharedState.enqueueUrl({ normalizedUrl: 'https://example.com' });
      expect(await sharedState.getUrlQueueSize()).toBe(1);
    });

    it('should not enqueue already visited URLs', async () => {
      await sharedState.markVisited('https://example.com');
      await sharedState.enqueueUrl({ normalizedUrl: 'https://example.com' });
      expect(await sharedState.getUrlQueueSize()).toBe(0);
    });

    it('should dequeue URLs in order', async () => {
      await sharedState.enqueueUrl({ normalizedUrl: 'https://a.com' });
      await sharedState.enqueueUrl({ normalizedUrl: 'https://b.com' });

      const first = await sharedState.dequeueUrl();
      expect(first?.normalizedUrl).toBe('https://a.com');

      const second = await sharedState.dequeueUrl();
      expect(second?.normalizedUrl).toBe('https://b.com');
    });

    it('should return null when queue is empty', async () => {
      expect(await sharedState.dequeueUrl()).toBeNull();
    });
  });

  describe('clear', () => {
    it('should clear all state', async () => {
      await sharedState.markVisited('https://example.com');
      await sharedState.enqueueUrl({ normalizedUrl: 'https://other.com' });

      await sharedState.clear();

      expect(await sharedState.hasVisited('https://example.com')).toBe(false);
      expect(await sharedState.getUrlQueueSize()).toBe(0);
      expect(await sharedState.getFindingsCount()).toBe(0);
    });
  });

  describe('getSummary', () => {
    it('should return summary of state', async () => {
      await sharedState.markVisited('https://a.com');
      await sharedState.markVisited('https://b.com');
      await sharedState.enqueueUrl({ normalizedUrl: 'https://c.com' });

      const summary = await sharedState.getSummary();

      expect(summary.visitedCount).toBe(2);
      expect(summary.queueSize).toBe(1);
      expect(summary.findingsCount).toBe(0);
    });
  });
});
