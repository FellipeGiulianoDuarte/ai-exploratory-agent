import { EventBus, DomainEvent, EventHandler } from '../../domain/events/DomainEvent';
import { loggers } from '../logging';

/**
 * In-memory implementation of EventBus.
 * Suitable for single-process applications.
 */
export class InMemoryEventBus implements EventBus {
  private handlers: Map<string, Set<EventHandler>> = new Map();
  private eventHistory: DomainEvent[] = [];
  private maxHistorySize: number;

  constructor(options?: { maxHistorySize?: number }) {
    this.maxHistorySize = options?.maxHistorySize ?? 1000;
  }

  async publish<T extends DomainEvent>(event: T): Promise<void> {
    // Store in history
    this.eventHistory.push(event);
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }

    // Get handlers for this event type
    const typeHandlers = this.handlers.get(event.type);
    if (!typeHandlers || typeHandlers.size === 0) {
      return;
    }

    // Execute all handlers (in parallel)
    const handlerPromises = Array.from(typeHandlers).map(async handler => {
      try {
        await handler(event);
      } catch (error) {
        loggers.event.error(`Error in event handler for ${event.type}: ${error}`);
      }
    });

    await Promise.all(handlerPromises);
  }

  subscribe<T extends DomainEvent>(eventType: string, handler: EventHandler<T>): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler as EventHandler);
  }

  unsubscribe(eventType: string, handler: EventHandler): void {
    const typeHandlers = this.handlers.get(eventType);
    if (typeHandlers) {
      typeHandlers.delete(handler);
    }
  }

  clear(): void {
    this.handlers.clear();
    this.eventHistory = [];
  }

  /**
   * Get event history (for debugging/testing).
   * Optionally filter by event type.
   */
  getHistory(eventType?: string): ReadonlyArray<DomainEvent> {
    if (eventType) {
      return this.eventHistory.filter(e => e.type === eventType);
    }
    return [...this.eventHistory];
  }

  /**
   * Clear event history.
   */
  clearHistory(): void {
    this.eventHistory = [];
  }

  /**
   * Get events of a specific type from history.
   */
  getEventsByType<T extends DomainEvent>(eventType: string): T[] {
    return this.eventHistory.filter(e => e.type === eventType) as T[];
  }
}

// Singleton instance
let defaultEventBus: InMemoryEventBus | null = null;

/**
 * Get the default event bus instance.
 */
export function getDefaultEventBus(): InMemoryEventBus {
  if (!defaultEventBus) {
    defaultEventBus = new InMemoryEventBus();
  }
  return defaultEventBus;
}

/**
 * Reset the default event bus (for testing).
 */
export function resetDefaultEventBus(): void {
  if (defaultEventBus) {
    defaultEventBus.clear();
  }
  defaultEventBus = null;
}
