import { InMemoryEventBus, getDefaultEventBus, resetDefaultEventBus } from '../../../src/infrastructure/events/InMemoryEventBus';
import { BaseDomainEvent } from '../../../src/domain/events/DomainEvent';

// Test event classes
class TestEvent extends BaseDomainEvent {
  constructor(
    public readonly data: string,
    aggregateId: string = 'test-aggregate'
  ) {
    super('TestEvent', aggregateId);
  }
}

class AnotherEvent extends BaseDomainEvent {
  constructor(
    public readonly value: number,
    aggregateId: string = 'test-aggregate'
  ) {
    super('AnotherEvent', aggregateId);
  }
}

describe('InMemoryEventBus', () => {
  let eventBus: InMemoryEventBus;

  beforeEach(() => {
    eventBus = new InMemoryEventBus();
  });

  describe('subscribe and publish', () => {
    it('should deliver event to subscribed handler', async () => {
      const receivedEvents: TestEvent[] = [];
      const handler = (event: TestEvent): void => {
        receivedEvents.push(event);
      };

      eventBus.subscribe('TestEvent', handler);
      await eventBus.publish(new TestEvent('hello'));

      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0].data).toBe('hello');
    });

    it('should deliver event to multiple handlers', async () => {
      let count = 0;
      const handler1 = (): void => { count += 1; };
      const handler2 = (): void => { count += 10; };

      eventBus.subscribe('TestEvent', handler1);
      eventBus.subscribe('TestEvent', handler2);
      await eventBus.publish(new TestEvent('test'));

      expect(count).toBe(11);
    });

    it('should not deliver event to wrong type handlers', async () => {
      let called = false;
      const handler = (): void => { called = true; };

      eventBus.subscribe('AnotherEvent', handler);
      await eventBus.publish(new TestEvent('test'));

      expect(called).toBe(false);
    });

    it('should handle events of different types independently', async () => {
      const testEvents: TestEvent[] = [];
      const anotherEvents: AnotherEvent[] = [];

      eventBus.subscribe('TestEvent', (e: TestEvent): void => { testEvents.push(e); });
      eventBus.subscribe('AnotherEvent', (e: AnotherEvent): void => { anotherEvents.push(e); });

      await eventBus.publish(new TestEvent('hello'));
      await eventBus.publish(new AnotherEvent(42));
      await eventBus.publish(new TestEvent('world'));

      expect(testEvents).toHaveLength(2);
      expect(anotherEvents).toHaveLength(1);
      expect(anotherEvents[0].value).toBe(42);
    });
  });

  describe('unsubscribe', () => {
    it('should stop delivering events after unsubscribe', async () => {
      let count = 0;
      const handler = (): void => { count++; };

      eventBus.subscribe('TestEvent', handler);
      await eventBus.publish(new TestEvent('1'));
      
      eventBus.unsubscribe('TestEvent', handler);
      await eventBus.publish(new TestEvent('2'));

      expect(count).toBe(1);
    });

    it('should only remove the specific handler', async () => {
      let count1 = 0;
      let count2 = 0;
      const handler1 = (): void => { count1++; };
      const handler2 = (): void => { count2++; };

      eventBus.subscribe('TestEvent', handler1);
      eventBus.subscribe('TestEvent', handler2);
      
      eventBus.unsubscribe('TestEvent', handler1);
      await eventBus.publish(new TestEvent('test'));

      expect(count1).toBe(0);
      expect(count2).toBe(1);
    });
  });

  describe('getHistory', () => {
    it('should track published events', async () => {
      await eventBus.publish(new TestEvent('first'));
      await eventBus.publish(new TestEvent('second'));
      await eventBus.publish(new AnotherEvent(123));

      const history = eventBus.getHistory();

      expect(history).toHaveLength(3);
      expect(history[0].type).toBe('TestEvent');
      expect(history[2].type).toBe('AnotherEvent');
    });

    it('should filter history by event type', async () => {
      await eventBus.publish(new TestEvent('1'));
      await eventBus.publish(new AnotherEvent(1));
      await eventBus.publish(new TestEvent('2'));

      const testHistory = eventBus.getHistory('TestEvent');

      expect(testHistory).toHaveLength(2);
      expect(testHistory.every(e => e.type === 'TestEvent')).toBe(true);
    });
  });

  describe('clearHistory', () => {
    it('should clear the event history', async () => {
      await eventBus.publish(new TestEvent('test'));
      expect(eventBus.getHistory()).toHaveLength(1);

      eventBus.clearHistory();

      expect(eventBus.getHistory()).toHaveLength(0);
    });
  });

  describe('clear', () => {
    it('should clear handlers and history', async () => {
      let callCount = 0;
      eventBus.subscribe('TestEvent', () => { callCount++; });
      await eventBus.publish(new TestEvent('test'));
      expect(callCount).toBe(1);
      expect(eventBus.getHistory()).toHaveLength(1);
      
      eventBus.clear();
      
      // History should be cleared
      expect(eventBus.getHistory()).toHaveLength(0);
      
      // Publish new event - handler shouldn't be called since it was cleared
      await eventBus.publish(new TestEvent('test2'));
      expect(callCount).toBe(1); // Still 1 because handler was cleared
    });
  });

  describe('error handling', () => {
    it('should continue with other handlers if one throws', async () => {
      const results: string[] = [];
      
      eventBus.subscribe('TestEvent', (): void => { results.push('first'); });
      eventBus.subscribe('TestEvent', (): void => { throw new Error('Handler error'); });
      eventBus.subscribe('TestEvent', (): void => { results.push('third'); });

      // Should not throw
      await eventBus.publish(new TestEvent('test'));

      expect(results).toContain('first');
      expect(results).toContain('third');
    });
  });
});

describe('getDefaultEventBus', () => {
  beforeEach(() => {
    resetDefaultEventBus();
  });

  it('should return the same instance', () => {
    const bus1 = getDefaultEventBus();
    const bus2 = getDefaultEventBus();

    expect(bus1).toBe(bus2);
  });

  it('should share state across calls', async () => {
    const bus1 = getDefaultEventBus();
    await bus1.publish(new TestEvent('shared'));

    const bus2 = getDefaultEventBus();
    const history = bus2.getHistory();

    expect(history).toHaveLength(1);
  });
});
