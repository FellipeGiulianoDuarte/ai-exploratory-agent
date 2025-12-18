import { Entity } from '../shared/Entity';
import { ExplorationStep } from './ExplorationStep';
import { ActionDecision, ExplorationHistoryEntry } from './ActionTypes';
import { EventBus } from '../events/DomainEvent';
import {
  SessionStartedEvent,
  SessionEndedEvent,
  StepCompletedEvent,
  CheckpointTriggeredEvent,
  GuidanceReceivedEvent,
} from '../events/ExplorationEvents';

/**
 * Session status.
 */
export type SessionStatus = 'idle' | 'running' | 'paused' | 'completed' | 'stopped' | 'error';

/**
 * Checkpoint trigger reasons.
 */
export type CheckpointReason =
  | 'step_count'
  | 'tool_finding'
  | 'low_confidence'
  | 'natural_breakpoint';

/**
 * Human guidance from checkpoint.
 */
export interface HumanGuidance {
  action: 'continue' | 'stop' | 'redirect';
  guidance?: string;
  focusAreas?: string[];
}

/**
 * Configuration for exploration session.
 */
export interface ExplorationSessionConfig {
  /** Target URL to explore */
  targetUrl: string;
  /** Exploration objective */
  objective?: string;
  /** Maximum steps before stopping */
  maxSteps: number;
  /** Steps between checkpoints */
  checkpointInterval: number;
  /** Minimum confidence threshold for checkpoint */
  minConfidenceThreshold: number;
  /** Whether to checkpoint after tool findings */
  checkpointOnToolFindings: boolean;
}

/**
 * Properties for ExplorationSession.
 */
export interface ExplorationSessionProps {
  config: ExplorationSessionConfig;
  status: SessionStatus;
  steps: ExplorationStep[];
  findingIds: string[];
  visitedUrls: Set<string>;
  currentUrl: string;
  humanGuidance: HumanGuidance | null;
  lastCheckpointStep: number;
  startedAt: Date | null;
  endedAt: Date | null;
  endReason?: 'completed' | 'stopped_by_user' | 'max_steps_reached' | 'error';
}

/**
 * Aggregate root for an exploration session.
 */
export class ExplorationSession extends Entity<ExplorationSessionProps> {
  private eventBus: EventBus | null = null;

  private constructor(props: ExplorationSessionProps, id?: string) {
    super(props, id);
  }

  static create(config: ExplorationSessionConfig, id?: string): ExplorationSession {
    return new ExplorationSession(
      {
        config,
        status: 'idle',
        steps: [],
        findingIds: [],
        visitedUrls: new Set<string>(),
        currentUrl: config.targetUrl,
        humanGuidance: null,
        lastCheckpointStep: 0,
        startedAt: null,
        endedAt: null,
      },
      id
    );
  }

  /**
   * Reconstruct an ExplorationSession from JSON data.
   */
  static fromJSON(data: Record<string, unknown>): ExplorationSession {
    const config = data.config as ExplorationSessionConfig;
    const stepsData = data.steps as Array<Record<string, unknown>>;
    const steps = stepsData.map(stepData => {
      // Type-safe conversion for ExplorationStep.fromJSON
      const stepProps = {
        id: stepData.id as string,
        stepNumber: stepData.stepNumber as number,
        action: stepData.action as ActionDecision,
        success: stepData.success as boolean,
        resultingUrl: stepData.resultingUrl as string,
        error: stepData.error as string | undefined,
        screenshotPath: stepData.screenshotPath as string | undefined,
        findingIds: (stepData.findingIds as string[]) || [],
        duration: stepData.duration as number,
        executedAt: stepData.executedAt as Date,
      };
      return ExplorationStep.fromJSON(stepProps);
    });

    const session = new ExplorationSession(
      {
        config,
        status: data.status as SessionStatus,
        steps,
        findingIds: data.findingIds as string[],
        visitedUrls: new Set<string>(data.visitedUrls as string[]),
        currentUrl: data.currentUrl as string,
        humanGuidance: data.humanGuidance as HumanGuidance | null,
        lastCheckpointStep: data.lastCheckpointStep as number,
        startedAt: data.startedAt ? new Date(data.startedAt as string) : null,
        endedAt: data.endedAt ? new Date(data.endedAt as string) : null,
        endReason: data.endReason as ExplorationSessionProps['endReason'],
      },
      data.id as string
    );

    return session;
  }

  /**
   * Set the event bus for publishing events.
   */
  setEventBus(eventBus: EventBus): void {
    this.eventBus = eventBus;
  }

  // Getters
  get config(): ExplorationSessionConfig {
    return this.props.config;
  }

  get status(): SessionStatus {
    return this.props.status;
  }

  get steps(): ReadonlyArray<ExplorationStep> {
    return this.props.steps;
  }

  get currentStep(): number {
    return this.props.steps.length;
  }

  get findingIds(): ReadonlyArray<string> {
    return [...this.props.findingIds];
  }

  get visitedUrls(): ReadonlyArray<string> {
    return Array.from(this.props.visitedUrls);
  }

  get currentUrl(): string {
    return this.props.currentUrl;
  }

  get humanGuidance(): HumanGuidance | null {
    return this.props.humanGuidance;
  }

  get isRunning(): boolean {
    return this.props.status === 'running';
  }

  get isPaused(): boolean {
    return this.props.status === 'paused';
  }

  get hasEnded(): boolean {
    return ['completed', 'stopped', 'error'].includes(this.props.status);
  }

  /**
   * Start the exploration session.
   */
  async start(): Promise<void> {
    if (this.props.status !== 'idle') {
      throw new Error(`Cannot start session in status: ${this.props.status}`);
    }

    this.props.status = 'running';
    this.props.startedAt = new Date();
    this.props.visitedUrls.add(this.props.config.targetUrl);

    await this.publishEvent(
      new SessionStartedEvent(this.id, this.props.config.targetUrl, this.props.config.objective)
    );
  }

  /**
   * Record a completed step.
   */
  async recordStep(
    action: ActionDecision,
    success: boolean,
    resultingUrl: string,
    duration: number,
    error?: string
  ): Promise<ExplorationStep> {
    if (!this.isRunning && !this.isPaused) {
      throw new Error(`Cannot record step in status: ${this.props.status}`);
    }

    const step = ExplorationStep.create({
      stepNumber: this.props.steps.length + 1,
      action,
      success,
      resultingUrl,
      duration,
      error,
      findingIds: [],
    });

    this.props.steps.push(step);
    this.props.currentUrl = resultingUrl;
    this.props.visitedUrls.add(resultingUrl);

    // Clear guidance after it's been used
    if (this.props.humanGuidance) {
      this.props.humanGuidance = null;
    }

    await this.publishEvent(
      new StepCompletedEvent(this.id, step.stepNumber, action, success, resultingUrl, error)
    );

    return step;
  }

  /**
   * Add a finding to the session.
   */
  addFinding(findingId: string): void {
    if (!this.props.findingIds.includes(findingId)) {
      this.props.findingIds.push(findingId);
    }

    // Also add to current step if exists
    const currentStep = this.props.steps[this.props.steps.length - 1];
    if (currentStep) {
      currentStep.addFinding(findingId);
    }
  }

  /**
   * Check if a checkpoint should be triggered.
   */
  shouldCheckpoint(lastAction?: ActionDecision): CheckpointReason | null {
    // Check step count
    const stepsSinceCheckpoint = this.currentStep - this.props.lastCheckpointStep;
    if (stepsSinceCheckpoint >= this.props.config.checkpointInterval) {
      return 'step_count';
    }

    // Check for tool findings
    if (
      this.props.config.checkpointOnToolFindings &&
      lastAction?.action === 'tool' &&
      this.props.steps[this.props.steps.length - 1]?.findingIds.length > 0
    ) {
      return 'tool_finding';
    }

    // Check confidence
    if (lastAction && lastAction.confidence < this.props.config.minConfidenceThreshold) {
      return 'low_confidence';
    }

    return null;
  }

  /**
   * Trigger a checkpoint pause.
   */
  async triggerCheckpoint(reason: CheckpointReason): Promise<void> {
    this.props.status = 'paused';
    this.props.lastCheckpointStep = this.currentStep;

    await this.publishEvent(
      new CheckpointTriggeredEvent(this.id, reason, this.currentStep, this.getSummary())
    );
  }

  /**
   * Apply human guidance from checkpoint.
   */
  async applyGuidance(guidance: HumanGuidance): Promise<void> {
    if (guidance.action === 'stop') {
      await this.stop('stopped_by_user');
      return;
    }

    this.props.humanGuidance = guidance;
    this.props.status = 'running';

    await this.publishEvent(
      new GuidanceReceivedEvent(this.id, guidance.guidance || '', guidance.action)
    );
  }

  /**
   * Resume the session after pause.
   */
  resume(): void {
    if (this.props.status !== 'paused') {
      throw new Error(`Cannot resume session in status: ${this.props.status}`);
    }
    this.props.status = 'running';
  }

  /**
   * Stop the exploration session.
   */
  async stop(
    reason: 'completed' | 'stopped_by_user' | 'max_steps_reached' | 'error'
  ): Promise<void> {
    this.props.status =
      reason === 'stopped_by_user' ? 'stopped' : reason === 'error' ? 'error' : 'completed';
    this.props.endedAt = new Date();
    this.props.endReason = reason;

    await this.publishEvent(
      new SessionEndedEvent(this.id, reason, this.props.steps.length, this.props.findingIds.length)
    );
  }

  /**
   * Check if max steps reached.
   */
  hasReachedMaxSteps(): boolean {
    return this.props.steps.length >= this.props.config.maxSteps;
  }

  /**
   * Get exploration history for LLM context.
   */
  getHistoryForLLM(): ExplorationHistoryEntry[] {
    return this.props.steps.map(step => ({
      step: step.stepNumber,
      action: step.action,
      success: step.success,
      error: step.error,
      resultingUrl: step.resultingUrl,
      findings: step.findingIds.length > 0 ? step.findingIds : undefined,
    }));
  }

  /**
   * Get session statistics.
   */
  getStats(): {
    totalSteps: number;
    successfulSteps: number;
    failedSteps: number;
    uniqueUrls: number;
    totalFindings: number;
    duration: number;
  } {
    const now = new Date();
    const startTime = this.props.startedAt || now;
    const endTime = this.props.endedAt || now;

    return {
      totalSteps: this.props.steps.length,
      successfulSteps: this.props.steps.filter(s => s.success).length,
      failedSteps: this.props.steps.filter(s => !s.success).length,
      uniqueUrls: this.props.visitedUrls.size,
      totalFindings: this.props.findingIds.length,
      duration: endTime.getTime() - startTime.getTime(),
    };
  }

  /**
   * Get a summary of the session.
   */
  getSummary(): string {
    const stats = this.getStats();
    const recentSteps = this.props.steps.slice(-5);

    let summary = `Exploration Session Summary
============================
Status: ${this.props.status}
Target: ${this.props.config.targetUrl}
Objective: ${this.props.config.objective || 'General exploration'}

Statistics:
- Total Steps: ${stats.totalSteps}
- Successful: ${stats.successfulSteps}
- Failed: ${stats.failedSteps}
- Unique URLs: ${stats.uniqueUrls}
- Findings: ${stats.totalFindings}
- Duration: ${Math.round(stats.duration / 1000)}s

Recent Actions:
${recentSteps.map(s => s.summarize()).join('\n')}

Current URL: ${this.props.currentUrl}`;

    if (this.props.humanGuidance?.guidance) {
      summary += `\n\nHuman Guidance: ${this.props.humanGuidance.guidance}`;
    }

    return summary;
  }

  /**
   * Publish an event if event bus is set.
   */
  private async publishEvent(
    event:
      | SessionStartedEvent
      | SessionEndedEvent
      | StepCompletedEvent
      | CheckpointTriggeredEvent
      | GuidanceReceivedEvent
  ): Promise<void> {
    if (this.eventBus) {
      await this.eventBus.publish(event);
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      config: this.props.config,
      status: this.props.status,
      steps: this.props.steps.map(s => s.toJSON()),
      findingIds: this.props.findingIds,
      visitedUrls: Array.from(this.props.visitedUrls),
      currentUrl: this.props.currentUrl,
      humanGuidance: this.props.humanGuidance,
      lastCheckpointStep: this.props.lastCheckpointStep,
      startedAt: this.props.startedAt?.toISOString(),
      endedAt: this.props.endedAt?.toISOString(),
      endReason: this.props.endReason,
    };
  }
}
