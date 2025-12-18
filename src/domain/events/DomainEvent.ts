/**
 * Base interface for all domain events.
 */
export interface DomainEvent {
  /** Unique event type identifier */
  readonly type: string;
  /** When the event occurred */
  readonly timestamp: Date;
  /** Unique event ID */
  readonly eventId: string;
  /** Aggregate ID that raised the event */
  readonly aggregateId: string;
}

/**
 * Base class for domain events with common properties.
 */
export abstract class BaseDomainEvent implements DomainEvent {
  readonly timestamp: Date;
  readonly eventId: string;

  constructor(
    public readonly type: string,
    public readonly aggregateId: string
  ) {
    this.timestamp = new Date();
    this.eventId = `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Event handler function type.
 */
export type EventHandler<T extends DomainEvent = DomainEvent> = (event: T) => void | Promise<void>;

/**
 * Event bus interface for publishing and subscribing to domain events.
 */
export interface EventBus {
  /**
   * Publish an event to all subscribers.
   */
  publish<T extends DomainEvent>(event: T): Promise<void>;

  /**
   * Subscribe to events of a specific type.
   */
  subscribe<T extends DomainEvent>(eventType: string, handler: EventHandler<T>): void;

  /**
   * Unsubscribe a handler from an event type.
   */
  unsubscribe(eventType: string, handler: EventHandler): void;

  /**
   * Clear all subscriptions.
   */
  clear(): void;
}
