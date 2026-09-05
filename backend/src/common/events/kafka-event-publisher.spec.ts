import { KafkaEventPublisher } from './kafka-event-publisher';
import { CanonicalEventType, createCanonicalEvent } from './canonical-events';

describe('KafkaEventPublisher', () => {
  it('does not connect while disabled', async () => {
    delete process.env.KAFKA_EVENTS_ENABLED;
    const publisher = new KafkaEventPublisher();
    const event = createCanonicalEvent({ eventType: CanonicalEventType.ORDER_CREATED, producer: 'test', aggregateType: 'Order', aggregateId: 'order-1', correlationId: 'request-1', idempotencyKey: 'order-1-created', payload: {} });
    await expect(publisher.publish(event)).resolves.toBe(false);
    await expect(publisher.disconnect()).resolves.toBeUndefined();
  });

  it('fails closed without brokers when enabled', () => {
    process.env.KAFKA_EVENTS_ENABLED = 'true';
    delete process.env.KAFKA_BROKERS;
    expect(() => new KafkaEventPublisher()).toThrow('KAFKA_BROKERS');
    delete process.env.KAFKA_EVENTS_ENABLED;
  });
});
