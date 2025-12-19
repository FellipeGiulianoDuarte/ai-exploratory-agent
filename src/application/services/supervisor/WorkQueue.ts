/**
 * Page task for work queue.
 */
export interface PageTask {
  /** URL to explore */
  url: string;
  /** Priority (higher = more important) */
  priority: number;
  /** Source of the task */
  source: 'initial' | 'discovered' | 'persona';
  /** Optional metadata */
  metadata?: Record<string, unknown>;
  /** Timestamp when added */
  addedAt: number;
}

/**
 * Priority-based work queue for page exploration tasks.
 * Manages task distribution to agents.
 */
export class WorkQueue {
  private queue: PageTask[] = [];
  private processing: Map<string, PageTask> = new Map();
  private completed: Set<string> = new Set();

  /**
   * Add a task to the queue.
   */
  enqueue(task: PageTask): void {
    // Skip if already processed or in queue
    if (this.completed.has(task.url) || this.processing.has(task.url)) {
      return;
    }

    // Skip if already in queue
    if (this.queue.some(t => t.url === task.url)) {
      return;
    }

    this.queue.push({
      ...task,
      addedAt: task.addedAt || Date.now(),
    });

    // Sort by priority (higher first), then by addedAt (older first)
    this.queue.sort((a, b) => {
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      return a.addedAt - b.addedAt;
    });
  }

  /**
   * Get next task from queue (marks as processing).
   */
  dequeue(): PageTask | null {
    const task = this.queue.shift();
    if (task) {
      this.processing.set(task.url, task);
    }
    return task || null;
  }

  /**
   * Mark a task as complete.
   */
  complete(url: string): void {
    this.processing.delete(url);
    this.completed.add(url);
  }

  /**
   * Mark a task as failed (returns to queue with lower priority).
   */
  fail(url: string): void {
    const task = this.processing.get(url);
    if (task) {
      this.processing.delete(url);
      // Re-add with lower priority
      this.enqueue({
        ...task,
        priority: Math.max(0, task.priority - 2),
      });
    }
  }

  /**
   * Check if queue is empty.
   */
  isEmpty(): boolean {
    return this.queue.length === 0;
  }

  /**
   * Get queue size.
   */
  size(): number {
    return this.queue.length;
  }

  /**
   * Get number of tasks being processed.
   */
  processingCount(): number {
    return this.processing.size;
  }

  /**
   * Get number of completed tasks.
   */
  completedCount(): number {
    return this.completed.size;
  }

  /**
   * Check if all work is done.
   */
  isAllDone(): boolean {
    return this.queue.length === 0 && this.processing.size === 0;
  }

  /**
   * Get all pending URLs (queue + processing).
   */
  getPendingUrls(): string[] {
    return [...this.queue.map(t => t.url), ...Array.from(this.processing.keys())];
  }

  /**
   * Get completed URLs.
   */
  getCompletedUrls(): string[] {
    return Array.from(this.completed);
  }

  /**
   * Clear the queue.
   */
  clear(): void {
    this.queue = [];
    this.processing.clear();
    this.completed.clear();
  }
}
