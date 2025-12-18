import { EventBus, EventHandler, DomainEvent } from '../../domain/events/DomainEvent';
import {
  SessionStartedEvent,
  SessionEndedEvent,
  StepCompletedEvent,
  FindingDiscoveredEvent,
  BrokenImagesDetectedEvent,
  CheckpointTriggeredEvent,
  GuidanceReceivedEvent,
} from '../../domain/events/ExplorationEvents';
import { CLIInteractionAdapter } from '../cli/CLIInteractionAdapter';
import { loggers } from '../logging';

// Type alias for exploration event types
type ExplorationEventHandler<T extends DomainEvent> = EventHandler<T>;

/**
 * Event handlers for exploration events.
 * Connects domain events to side effects like logging and CLI display.
 */
export class ExplorationEventHandlers {
  private cli: CLIInteractionAdapter;
  private eventBus: EventBus;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handlers: Map<string, EventHandler<any>> = new Map();
  private verbose: boolean;

  constructor(eventBus: EventBus, cli: CLIInteractionAdapter, verbose: boolean = false) {
    this.eventBus = eventBus;
    this.cli = cli;
    this.verbose = verbose;
  }

  /**
   * Register all event handlers.
   */
  register(): void {
    this.registerHandler('SessionStartedEvent', this.handleSessionStarted.bind(this));
    this.registerHandler('SessionEndedEvent', this.handleSessionEnded.bind(this));
    this.registerHandler('StepCompletedEvent', this.handleStepCompleted.bind(this));
    this.registerHandler('FindingDiscoveredEvent', this.handleFindingDiscovered.bind(this));
    this.registerHandler('BrokenImagesDetectedEvent', this.handleBrokenImagesDetected.bind(this));
    this.registerHandler('CheckpointTriggeredEvent', this.handleCheckpointTriggered.bind(this));
    this.registerHandler('GuidanceReceivedEvent', this.handleGuidanceReceived.bind(this));
  }

  /**
   * Unregister all event handlers.
   */
  unregister(): void {
    for (const [eventType, handler] of this.handlers) {
      this.eventBus.unsubscribe(eventType, handler);
    }
    this.handlers.clear();
  }

  /**
   * Helper to register a handler and track it.
   */
  private registerHandler<T extends DomainEvent>(
    eventType: string,
    handler: ExplorationEventHandler<T>
  ): void {
    this.eventBus.subscribe(eventType, handler);
    this.handlers.set(eventType, handler);
  }

  /**
   * Handle session started event.
   */
  private handleSessionStarted(event: SessionStartedEvent): void {
    this.cli.displayStart(event.targetUrl, event.objective || 'General exploration');

    if (this.verbose) {
      loggers.event.info(`Session ${event.aggregateId} started`);
    }
  }

  /**
   * Handle session ended event.
   */
  private handleSessionEnded(event: SessionEndedEvent): void {
    this.cli.displayEnd({
      totalSteps: event.totalSteps,
      findings: event.totalFindings,
      duration: Date.now() - event.timestamp.getTime(), // Approximate
      reason: event.reason,
    });

    if (this.verbose) {
      loggers.event.info(`Session ${event.aggregateId} ended: ${event.reason}`);
    }
  }

  /**
   * Handle step completed event.
   */
  private handleStepCompleted(event: StepCompletedEvent): void {
    if (this.verbose) {
      this.cli.displayStep(event.stepNumber, event.action);
      loggers.event.info(
        `Step ${event.stepNumber} completed: ${event.success ? 'success' : 'failed'}`
      );
    }
  }

  /**
   * Handle finding discovered event.
   */
  private handleFindingDiscovered(event: FindingDiscoveredEvent): void {
    this.cli.displayFinding(event.findingType, event.severity, event.description);

    if (this.verbose) {
      loggers.event.info(`Finding discovered: ${event.findingType} - ${event.description}`);
    }
  }

  /**
   * Handle broken images detected event.
   */
  private handleBrokenImagesDetected(event: BrokenImagesDetectedEvent): void {
    if (this.verbose) {
      loggers.event.info(`${event.brokenImages.length} broken images detected`);
    }
  }

  /**
   * Handle checkpoint triggered event.
   */
  private handleCheckpointTriggered(event: CheckpointTriggeredEvent): void {
    if (this.verbose) {
      loggers.event.info(`Checkpoint triggered: ${event.reason}`);
    }
  }

  /**
   * Handle guidance received event.
   */
  private handleGuidanceReceived(event: GuidanceReceivedEvent): void {
    if (this.verbose) {
      loggers.event.info(`Guidance received: ${event.guidance}`);
    }
  }
}

/**
 * Create and wire up all event handlers.
 */
export function wireUpEventHandlers(
  eventBus: EventBus,
  cli: CLIInteractionAdapter,
  verbose: boolean = false
): ExplorationEventHandlers {
  const handlers = new ExplorationEventHandlers(eventBus, cli, verbose);
  handlers.register();
  return handlers;
}
