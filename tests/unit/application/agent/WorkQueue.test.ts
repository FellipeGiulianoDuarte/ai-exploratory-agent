import { WorkQueue } from '../../../../src/application/services/supervisor/WorkQueue';

describe('WorkQueue', () => {
  let queue: WorkQueue;

  beforeEach(() => {
    queue = new WorkQueue();
  });

  describe('enqueue', () => {
    it('should add a task to the queue', () => {
      queue.enqueue({
        url: 'https://example.com',
        priority: 5,
        source: 'initial',
        addedAt: Date.now(),
      });
      expect(queue.size()).toBe(1);
    });

    it('should not add duplicate URLs', () => {
      queue.enqueue({
        url: 'https://example.com',
        priority: 5,
        source: 'initial',
        addedAt: Date.now(),
      });
      queue.enqueue({
        url: 'https://example.com',
        priority: 10,
        source: 'discovered',
        addedAt: Date.now(),
      });
      expect(queue.size()).toBe(1);
    });

    it('should sort tasks by priority (higher first)', () => {
      queue.enqueue({
        url: 'https://low.com',
        priority: 1,
        source: 'initial',
        addedAt: Date.now(),
      });
      queue.enqueue({
        url: 'https://high.com',
        priority: 10,
        source: 'initial',
        addedAt: Date.now(),
      });
      queue.enqueue({
        url: 'https://medium.com',
        priority: 5,
        source: 'initial',
        addedAt: Date.now(),
      });

      const first = queue.dequeue();
      expect(first?.url).toBe('https://high.com');

      const second = queue.dequeue();
      expect(second?.url).toBe('https://medium.com');

      const third = queue.dequeue();
      expect(third?.url).toBe('https://low.com');
    });
  });

  describe('dequeue', () => {
    it('should return null when queue is empty', () => {
      expect(queue.dequeue()).toBeNull();
    });

    it('should return and remove the highest priority task', () => {
      queue.enqueue({
        url: 'https://example.com',
        priority: 5,
        source: 'initial',
        addedAt: Date.now(),
      });
      const task = queue.dequeue();
      expect(task?.url).toBe('https://example.com');
      expect(queue.size()).toBe(0);
    });

    it('should mark task as processing', () => {
      queue.enqueue({
        url: 'https://example.com',
        priority: 5,
        source: 'initial',
        addedAt: Date.now(),
      });
      queue.dequeue();
      expect(queue.processingCount()).toBe(1);
    });
  });

  describe('complete', () => {
    it('should mark task as complete and remove from processing', () => {
      queue.enqueue({
        url: 'https://example.com',
        priority: 5,
        source: 'initial',
        addedAt: Date.now(),
      });
      queue.dequeue();
      queue.complete('https://example.com');
      expect(queue.processingCount()).toBe(0);
      expect(queue.completedCount()).toBe(1);
    });

    it('should prevent re-adding completed URLs', () => {
      queue.enqueue({
        url: 'https://example.com',
        priority: 5,
        source: 'initial',
        addedAt: Date.now(),
      });
      queue.dequeue();
      queue.complete('https://example.com');
      queue.enqueue({
        url: 'https://example.com',
        priority: 10,
        source: 'discovered',
        addedAt: Date.now(),
      });
      expect(queue.size()).toBe(0);
    });
  });

  describe('fail', () => {
    it('should re-add failed task with lower priority', () => {
      queue.enqueue({
        url: 'https://example.com',
        priority: 5,
        source: 'initial',
        addedAt: Date.now(),
      });
      queue.dequeue();
      queue.fail('https://example.com');
      expect(queue.processingCount()).toBe(0);
      expect(queue.size()).toBe(1);
    });
  });

  describe('isEmpty and isAllDone', () => {
    it('should return true when queue is empty and nothing processing', () => {
      expect(queue.isEmpty()).toBe(true);
      expect(queue.isAllDone()).toBe(true);
    });

    it('should return false when queue has items', () => {
      queue.enqueue({
        url: 'https://example.com',
        priority: 5,
        source: 'initial',
        addedAt: Date.now(),
      });
      expect(queue.isEmpty()).toBe(false);
      expect(queue.isAllDone()).toBe(false);
    });

    it('should return isEmpty true but isAllDone false when processing', () => {
      queue.enqueue({
        url: 'https://example.com',
        priority: 5,
        source: 'initial',
        addedAt: Date.now(),
      });
      queue.dequeue();
      expect(queue.isEmpty()).toBe(true);
      expect(queue.isAllDone()).toBe(false);
    });
  });

  describe('getters', () => {
    it('should return pending URLs', () => {
      queue.enqueue({ url: 'https://a.com', priority: 5, source: 'initial', addedAt: Date.now() });
      queue.enqueue({ url: 'https://b.com', priority: 5, source: 'initial', addedAt: Date.now() });
      queue.dequeue(); // https://a.com is now processing

      const pending = queue.getPendingUrls();
      expect(pending).toContain('https://a.com');
      expect(pending).toContain('https://b.com');
    });

    it('should return completed URLs', () => {
      queue.enqueue({
        url: 'https://example.com',
        priority: 5,
        source: 'initial',
        addedAt: Date.now(),
      });
      queue.dequeue();
      queue.complete('https://example.com');

      expect(queue.getCompletedUrls()).toContain('https://example.com');
    });
  });

  describe('clear', () => {
    it('should clear all state', () => {
      queue.enqueue({
        url: 'https://example.com',
        priority: 5,
        source: 'initial',
        addedAt: Date.now(),
      });
      queue.dequeue();
      queue.clear();

      expect(queue.size()).toBe(0);
      expect(queue.processingCount()).toBe(0);
      expect(queue.completedCount()).toBe(0);
    });
  });
});
