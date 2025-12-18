import { Entity } from '../shared/Entity';
import { ActionDecision } from '../../application/ports/LLMPort';

/**
 * Properties for an ExplorationStep.
 */
export interface ExplorationStepProps {
  /** Step number in the session */
  stepNumber: number;
  /** Action decided by the LLM */
  action: ActionDecision;
  /** Whether the action succeeded */
  success: boolean;
  /** URL after the action */
  resultingUrl: string;
  /** Error message if action failed */
  error?: string;
  /** Screenshot path if taken */
  screenshotPath?: string;
  /** Findings discovered in this step */
  findingIds: string[];
  /** Duration of the step in ms */
  duration: number;
  /** When the step was executed */
  executedAt: Date;
}

/**
 * Entity representing a single exploration step.
 */
export class ExplorationStep extends Entity<ExplorationStepProps> {
  private constructor(props: ExplorationStepProps, id?: string) {
    super(props, id);
  }

  static create(props: Omit<ExplorationStepProps, 'executedAt'>, id?: string): ExplorationStep {
    return new ExplorationStep(
      {
        ...props,
        executedAt: new Date(),
      },
      id
    );
  }

  /**
   * Reconstruct an ExplorationStep from JSON data.
   */
  static fromJSON(data: ExplorationStepProps & { id: string }): ExplorationStep {
    return new ExplorationStep(
      {
        stepNumber: data.stepNumber,
        action: data.action,
        success: data.success,
        resultingUrl: data.resultingUrl,
        error: data.error,
        screenshotPath: data.screenshotPath,
        findingIds: data.findingIds || [],
        duration: data.duration,
        executedAt: new Date(data.executedAt),
      },
      data.id
    );
  }

  get stepNumber(): number {
    return this.props.stepNumber;
  }

  get action(): ActionDecision {
    return this.props.action;
  }

  get success(): boolean {
    return this.props.success;
  }

  get resultingUrl(): string {
    return this.props.resultingUrl;
  }

  get error(): string | undefined {
    return this.props.error;
  }

  get screenshotPath(): string | undefined {
    return this.props.screenshotPath;
  }

  get findingIds(): string[] {
    return [...this.props.findingIds];
  }

  get duration(): number {
    return this.props.duration;
  }

  get executedAt(): Date {
    return this.props.executedAt;
  }

  /**
   * Add a finding ID to this step.
   */
  addFinding(findingId: string): void {
    if (!this.props.findingIds.includes(findingId)) {
      this.props.findingIds.push(findingId);
    }
  }

  /**
   * Set the screenshot path.
   */
  setScreenshot(path: string): void {
    this.props.screenshotPath = path;
  }

  /**
   * Check if step was a navigation action.
   */
  isNavigation(): boolean {
    return this.props.action.action === 'navigate' || this.props.action.action === 'back';
  }

  /**
   * Check if step was a tool invocation.
   */
  isToolInvocation(): boolean {
    return this.props.action.action === 'tool';
  }

  /**
   * Get a summary of this step.
   */
  summarize(): string {
    const actionDesc = this.props.action.action === 'tool'
      ? `tool:${this.props.action.toolName}`
      : this.props.action.action;
    
    const target = this.props.action.selector || this.props.action.value || '';
    const status = this.props.success ? '✓' : '✗';
    
    return `Step ${this.props.stepNumber} [${status}]: ${actionDesc}${target ? ` on ${target}` : ''} → ${this.props.resultingUrl}`;
  }

  toJSON(): ExplorationStepProps & { id: string } {
    return {
      id: this.id,
      ...this.props,
    };
  }
}
