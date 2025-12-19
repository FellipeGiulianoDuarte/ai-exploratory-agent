import { ExplorationStateMachine, AgentDependencies, createInitialContext } from '../agent';
import {
  ExplorationSession,
  ExplorationSessionConfig,
} from '../../../domain/exploration/ExplorationSession';
import { Finding } from '../../../domain/exploration/Finding';
import { WorkQueue, PageTask } from './WorkQueue';
import { SharedExplorationState, DiscoveredURL } from './SharedExplorationState';
import { EventBus } from '../../../domain/events/DomainEvent';

/**
 * Result from a single agent exploration.
 */
export interface AgentResult {
  agentId: string;
  url: string;
  steps: number;
  findings: Finding[];
  discoveredUrls: DiscoveredURL[];
  success: boolean;
  error?: string;
}

/**
 * Result from multi-agent exploration.
 */
export interface MultiAgentResult {
  totalSteps: number;
  findings: Finding[];
  pagesVisited: string[];
  duration: number;
  agentResults: AgentResult[];
  stoppedReason: 'completed' | 'max_steps_reached' | 'error';
}

/**
 * Configuration for AgentSupervisor.
 */
export interface SupervisorConfig {
  /** Maximum concurrent agents */
  maxConcurrency: number;
  /** Maximum steps per agent */
  maxStepsPerAgent: number;
  /** Global maximum steps across all agents */
  globalMaxSteps: number;
  /** Navigation wait time in ms */
  navigationWaitTime: number;
}

/**
 * Dependencies for the supervisor.
 */
export interface SupervisorDependencies {
  createAgentDependencies: (agentId: string) => AgentDependencies;
  sessionConfig: ExplorationSessionConfig;
  eventBus: EventBus;
}

/**
 * Agent Supervisor - orchestrates multiple exploration agents.
 * Uses Supervisor Pattern to coordinate parallel page exploration.
 */
export class AgentSupervisor {
  private workQueue: WorkQueue;
  private sharedState: SharedExplorationState;
  private totalSteps = 0;
  private agentResults: AgentResult[] = [];
  private activeAgents = 0;
  private startTime = 0;
  private isRunning = false;

  constructor(
    private readonly config: SupervisorConfig,
    private readonly deps: SupervisorDependencies
  ) {
    this.workQueue = new WorkQueue();
    this.sharedState = new SharedExplorationState();
  }

  /**
   * Start multi-agent exploration.
   */
  async explore(startUrls: string[]): Promise<MultiAgentResult> {
    this.startTime = Date.now();
    this.isRunning = true;
    this.totalSteps = 0;
    this.agentResults = [];

    // Seed initial URLs
    for (let i = 0; i < startUrls.length; i++) {
      this.workQueue.enqueue({
        url: startUrls[i],
        priority: 10 - i, // First URLs have highest priority
        source: 'initial',
        addedAt: Date.now(),
      });
    }

    // Spawn workers up to max concurrency
    const workerCount = Math.min(this.config.maxConcurrency, startUrls.length);
    const workers = Array(workerCount)
      .fill(null)
      .map((_, i) => this.runWorker(i));

    try {
      await Promise.all(workers);
    } catch (error) {
      console.error('Supervisor error:', error);
    }

    this.isRunning = false;

    // Build final result
    return this.buildResult();
  }

  /**
   * Run a single worker loop.
   */
  private async runWorker(workerId: number): Promise<void> {
    while (this.isRunning && !this.shouldStop()) {
      const task = this.workQueue.dequeue();

      if (!task) {
        // No work available, check if we should wait or exit
        if (this.activeAgents === 0 && this.workQueue.isEmpty()) {
          break; // All done
        }
        // Wait a bit and try again
        await this.wait(100);
        continue;
      }

      // Check if already visited
      if (await this.sharedState.hasVisited(task.url)) {
        this.workQueue.complete(task.url);
        continue;
      }

      // Run agent
      this.activeAgents++;
      try {
        const result = await this.exploreUrl(workerId, task);
        this.agentResults.push(result);

        // Merge discovered URLs
        for (const url of result.discoveredUrls) {
          await this.sharedState.enqueueUrl(url);
          this.workQueue.enqueue({
            url: url.normalizedUrl,
            priority: this.getPriorityForCategory(url.category),
            source: 'discovered',
            addedAt: Date.now(),
          });
        }

        // Update global state
        await this.sharedState.markVisited(task.url);
        this.totalSteps += result.steps;
        this.workQueue.complete(task.url);
      } catch (error) {
        this.workQueue.fail(task.url);
        console.error(`Worker ${workerId} error:`, error);
      } finally {
        this.activeAgents--;
      }
    }
  }

  /**
   * Explore a single URL with an agent.
   */
  private async exploreUrl(workerId: number, task: PageTask): Promise<AgentResult> {
    const agentId = `agent-${workerId}-${Date.now()}`;

    // Create session for this agent
    const session = ExplorationSession.create({
      ...this.deps.sessionConfig,
      targetUrl: task.url,
      maxSteps: Math.min(
        this.deps.sessionConfig.maxSteps,
        this.config.maxStepsPerAgent,
        this.config.globalMaxSteps - this.totalSteps
      ),
    });
    session.setEventBus(this.deps.eventBus);

    // Create agent dependencies
    const agentDeps = this.deps.createAgentDependencies(agentId);

    // Create state machine
    const stateMachine = new ExplorationStateMachine(agentDeps);
    const context = createInitialContext(agentId, session);

    try {
      // Initialize browser and navigate
      await agentDeps.browser.initialize();
      await agentDeps.browser.navigate(task.url);
      await this.wait(this.config.navigationWaitTime);

      // Start session
      await session.start();

      // Run state machine
      const finalContext = await stateMachine.run(context);

      await agentDeps.browser.close();

      return {
        agentId,
        url: task.url,
        steps: session.currentStep,
        findings: finalContext.findings,
        discoveredUrls: agentDeps.urlDiscovery.getUnvisitedURLs
          ? agentDeps.urlDiscovery.getUnvisitedURLs()
          : [],
        success: !finalContext.error,
        error: finalContext.error?.message,
      };
    } catch (error) {
      try {
        await agentDeps.browser.close();
      } catch {
        // Ignore close errors
      }

      return {
        agentId,
        url: task.url,
        steps: session.currentStep,
        findings: [],
        discoveredUrls: [],
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Check if exploration should stop.
   */
  private shouldStop(): boolean {
    return this.totalSteps >= this.config.globalMaxSteps;
  }

  /**
   * Get priority for URL category.
   */
  private getPriorityForCategory(category?: string): number {
    const priorities: Record<string, number> = {
      auth: 8,
      product: 7,
      cart: 6,
      user: 5,
      info: 4,
      other: 3,
    };
    return priorities[category || 'other'] || 3;
  }

  /**
   * Build final result.
   */
  private buildResult(): MultiAgentResult {
    const allFindings: Finding[] = [];
    const seenFindingIds = new Set<string>();

    for (const result of this.agentResults) {
      for (const finding of result.findings) {
        if (!seenFindingIds.has(finding.id)) {
          seenFindingIds.add(finding.id);
          allFindings.push(finding);
        }
      }
    }

    return {
      totalSteps: this.totalSteps,
      findings: allFindings,
      pagesVisited: this.workQueue.getCompletedUrls(),
      duration: Date.now() - this.startTime,
      agentResults: this.agentResults,
      stoppedReason:
        this.totalSteps >= this.config.globalMaxSteps ? 'max_steps_reached' : 'completed',
    };
  }

  /**
   * Helper to wait.
   */
  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get shared state (for external access).
   */
  getSharedState(): SharedExplorationState {
    return this.sharedState;
  }

  /**
   * Get work queue (for external access).
   */
  getWorkQueue(): WorkQueue {
    return this.workQueue;
  }
}
