import { BaseDomainEvent } from './DomainEvent';
import { ActionDecision } from '../../application/ports/LLMPort';
import { BrokenImage } from '../findings/BrokenImage';

/**
 * Event raised when an exploration step is completed.
 */
export class StepCompletedEvent extends BaseDomainEvent {
  static readonly TYPE = 'exploration.step_completed';

  constructor(
    sessionId: string,
    public readonly stepNumber: number,
    public readonly action: ActionDecision,
    public readonly success: boolean,
    public readonly resultingUrl: string,
    public readonly error?: string
  ) {
    super(StepCompletedEvent.TYPE, sessionId);
  }
}

/**
 * Event raised when a finding is discovered during exploration.
 */
export class FindingDiscoveredEvent extends BaseDomainEvent {
  static readonly TYPE = 'exploration.finding_discovered';

  constructor(
    sessionId: string,
    public readonly findingId: string,
    public readonly findingType: string,
    public readonly severity: 'critical' | 'high' | 'medium' | 'low',
    public readonly description: string,
    public readonly pageUrl: string,
    public readonly evidence?: Record<string, unknown>
  ) {
    super(FindingDiscoveredEvent.TYPE, sessionId);
  }
}

/**
 * Event raised when broken images are detected on a page.
 */
export class BrokenImagesDetectedEvent extends BaseDomainEvent {
  static readonly TYPE = 'exploration.broken_images_detected';

  constructor(
    sessionId: string,
    public readonly pageUrl: string,
    public readonly pageTitle: string,
    public readonly brokenImages: BrokenImage[],
    public readonly totalImages: number
  ) {
    super(BrokenImagesDetectedEvent.TYPE, sessionId);
  }

  get brokenCount(): number {
    return this.brokenImages.length;
  }
}

/**
 * Event raised when a checkpoint is triggered.
 */
export class CheckpointTriggeredEvent extends BaseDomainEvent {
  static readonly TYPE = 'exploration.checkpoint_triggered';

  constructor(
    sessionId: string,
    public readonly reason: 'step_count' | 'tool_finding' | 'low_confidence' | 'natural_breakpoint',
    public readonly stepNumber: number,
    public readonly summary: string
  ) {
    super(CheckpointTriggeredEvent.TYPE, sessionId);
  }
}

/**
 * Event raised when human guidance is received.
 */
export class GuidanceReceivedEvent extends BaseDomainEvent {
  static readonly TYPE = 'exploration.guidance_received';

  constructor(
    sessionId: string,
    public readonly guidance: string,
    public readonly action: 'continue' | 'stop' | 'redirect'
  ) {
    super(GuidanceReceivedEvent.TYPE, sessionId);
  }
}

/**
 * Event raised when exploration session starts.
 */
export class SessionStartedEvent extends BaseDomainEvent {
  static readonly TYPE = 'exploration.session_started';

  constructor(
    sessionId: string,
    public readonly targetUrl: string,
    public readonly objective?: string
  ) {
    super(SessionStartedEvent.TYPE, sessionId);
  }
}

/**
 * Event raised when exploration session ends.
 */
export class SessionEndedEvent extends BaseDomainEvent {
  static readonly TYPE = 'exploration.session_ended';

  constructor(
    sessionId: string,
    public readonly reason: 'completed' | 'stopped_by_user' | 'max_steps_reached' | 'error',
    public readonly totalSteps: number,
    public readonly totalFindings: number
  ) {
    super(SessionEndedEvent.TYPE, sessionId);
  }
}

// Export all event types for convenience
export const ExplorationEventTypes = {
  STEP_COMPLETED: StepCompletedEvent.TYPE,
  FINDING_DISCOVERED: FindingDiscoveredEvent.TYPE,
  BROKEN_IMAGES_DETECTED: BrokenImagesDetectedEvent.TYPE,
  CHECKPOINT_TRIGGERED: CheckpointTriggeredEvent.TYPE,
  GUIDANCE_RECEIVED: GuidanceReceivedEvent.TYPE,
  SESSION_STARTED: SessionStartedEvent.TYPE,
  SESSION_ENDED: SessionEndedEvent.TYPE,
} as const;
