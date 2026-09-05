import { KafkaEventPublisher } from './kafka-event-publisher';

// Real KafkaJS constructor, no broker/network and no mocked vendor module.
describe('Kafka publisher vendor configuration', () => {
  it('constructs and disconnects an enabled idempotent producer without connecting', async () => {
    const original = process.env;
    process.env = {
      NODE_ENV: 'test',
      KAFKA_EVENTS_ENABLED: 'true',
      KAFKA_BROKERS: '127.0.0.1:1',
    };
    try {
      const publisher = new KafkaEventPublisher();
      expect(publisher.enabled()).toBe(true);
      await publisher.disconnect();
      expect(publisher.enabled()).toBe(false);
    } finally {
      process.env = original;
    }
  });
});
