import { Finding } from '../../../domain/exploration/Finding';

/**
 * Discovered URL from exploration.
 */
export interface DiscoveredURL {
  normalizedUrl: string;
  linkText?: string;
  sourceUrl?: string;
  category?: string;
}

/**
 * Shared state for multi-agent coordination.
 * Provides thread-safe access to shared exploration data.
 */
export class SharedExplorationState {
  private visitedUrls: Set<string> = new Set();
  private findings: Finding[] = [];
  private urlQueue: DiscoveredURL[] = [];
  private bugHashes: Set<string> = new Set();

  // Simple lock mechanism for async operations
  private locks: Map<string, Promise<void>> = new Map();

  /**
   * Acquire a lock for a resource.
   */
  private async acquireLock(resource: string): Promise<() => void> {
    // Wait for existing lock to release
    while (this.locks.has(resource)) {
      await this.locks.get(resource);
    }

    // Create new lock
    let releaseFn: () => void;
    const lockPromise = new Promise<void>(resolve => {
      releaseFn = resolve;
    });

    this.locks.set(resource, lockPromise);

    return () => {
      this.locks.delete(resource);
      releaseFn!();
    };
  }

  /**
   * Check if URL has been visited.
   */
  async hasVisited(url: string): Promise<boolean> {
    const release = await this.acquireLock('visitedUrls');
    try {
      return this.visitedUrls.has(url);
    } finally {
      release();
    }
  }

  /**
   * Mark URL as visited.
   */
  async markVisited(url: string): Promise<void> {
    const release = await this.acquireLock('visitedUrls');
    try {
      this.visitedUrls.add(url);
    } finally {
      release();
    }
  }

  /**
   * Get all visited URLs.
   */
  async getVisitedUrls(): Promise<string[]> {
    const release = await this.acquireLock('visitedUrls');
    try {
      return Array.from(this.visitedUrls);
    } finally {
      release();
    }
  }

  /**
   * Add a finding (with deduplication).
   */
  async addFinding(finding: Finding): Promise<boolean> {
    const release = await this.acquireLock('findings');
    try {
      // Simple hash for deduplication
      const hash = `${finding.title}:${finding.pageUrl || ''}`;
      if (this.bugHashes.has(hash)) {
        return false; // Duplicate
      }

      this.bugHashes.add(hash);
      this.findings.push(finding);
      return true;
    } finally {
      release();
    }
  }

  /**
   * Get all findings.
   */
  async getFindings(): Promise<Finding[]> {
    const release = await this.acquireLock('findings');
    try {
      return [...this.findings];
    } finally {
      release();
    }
  }

  /**
   * Get findings count.
   */
  async getFindingsCount(): Promise<number> {
    const release = await this.acquireLock('findings');
    try {
      return this.findings.length;
    } finally {
      release();
    }
  }

  /**
   * Add URL to discovery queue.
   */
  async enqueueUrl(url: DiscoveredURL): Promise<void> {
    const release = await this.acquireLock('urlQueue');
    try {
      // Check if already visited or in queue
      if (this.visitedUrls.has(url.normalizedUrl)) {
        return;
      }
      if (this.urlQueue.some(u => u.normalizedUrl === url.normalizedUrl)) {
        return;
      }
      this.urlQueue.push(url);
    } finally {
      release();
    }
  }

  /**
   * Get next URL from queue.
   */
  async dequeueUrl(): Promise<DiscoveredURL | null> {
    const release = await this.acquireLock('urlQueue');
    try {
      return this.urlQueue.shift() || null;
    } finally {
      release();
    }
  }

  /**
   * Get URL queue size.
   */
  async getUrlQueueSize(): Promise<number> {
    const release = await this.acquireLock('urlQueue');
    try {
      return this.urlQueue.length;
    } finally {
      release();
    }
  }

  /**
   * Clear all state.
   */
  async clear(): Promise<void> {
    const r1 = await this.acquireLock('visitedUrls');
    const r2 = await this.acquireLock('findings');
    const r3 = await this.acquireLock('urlQueue');
    try {
      this.visitedUrls.clear();
      this.findings = [];
      this.urlQueue = [];
      this.bugHashes.clear();
    } finally {
      r1();
      r2();
      r3();
    }
  }

  /**
   * Get summary of shared state.
   */
  async getSummary(): Promise<{
    visitedCount: number;
    findingsCount: number;
    queueSize: number;
  }> {
    return {
      visitedCount: this.visitedUrls.size,
      findingsCount: this.findings.length,
      queueSize: this.urlQueue.length,
    };
  }
}
