import { loyaltyKafkaConsumerConfig } from './loyalty-kafka.config';

describe('loyaltyKafkaConsumerConfig', () => {
  const enabled = {
    LOYALTY_KAFKA_CONSUMER_ENABLED: 'true',
    KAFKA_BROKERS: 'localhost:9092',
  };

  it('is disabled by default without validating unused broker settings', () => {
    expect(loyaltyKafkaConsumerConfig({})).toEqual({ enabled: false });
    expect(
      loyaltyKafkaConsumerConfig({
        LOYALTY_KAFKA_CONSUMER_ENABLED: 'false',
        KAFKA_BROKERS: 'invalid',
      }),
    ).toEqual({ enabled: false });
  });

  it.each(['', 'yes', '1', 'TRUE'])('rejects ambiguous flag %s', (flag) => {
    expect(() =>
      loyaltyKafkaConsumerConfig({
        LOYALTY_KAFKA_CONSUMER_ENABLED: flag,
      }),
    ).toThrow('LOYALTY_KAFKA_CONSUMER_ENABLED');
  });

  it('builds a bounded independent consumer configuration', () => {
    expect(loyaltyKafkaConsumerConfig(enabled)).toMatchObject({
      enabled: true,
      topic: 'blujet.events.v1',
      fromBeginning: true,
      requireSchemaId: false,
      maxBytes: 262144,
      client: {
        clientId: 'blujet-loyalty',
        brokers: ['localhost:9092'],
        ssl: false,
      },
      consumer: {
        groupId: 'blujet-loyalty-projection-v1',
        allowAutoTopicCreation: false,
        maxBytesPerPartition: 262144,
        retry: { retries: 5 },
      },
    });
  });

  it('accepts explicit replay, schema and identity settings', () => {
    expect(
      loyaltyKafkaConsumerConfig({
        ...enabled,
        LOYALTY_KAFKA_TOPIC: 'core.events.v1',
        LOYALTY_KAFKA_CLIENT_ID: 'loyalty-reader',
        LOYALTY_KAFKA_GROUP_ID: 'loyalty-reader-v2',
        LOYALTY_KAFKA_FROM_BEGINNING: 'false',
        LOYALTY_EVENT_SCHEMA_HEADER_REQUIRED: 'true',
        LOYALTY_KAFKA_MAX_BYTES: '4096',
      }),
    ).toMatchObject({
      enabled: true,
      topic: 'core.events.v1',
      fromBeginning: false,
      requireSchemaId: true,
      maxBytes: 4096,
      client: { clientId: 'loyalty-reader' },
      consumer: {
        groupId: 'loyalty-reader-v2',
        maxBytesPerPartition: 4096,
      },
    });
  });

  it.each([
    { LOYALTY_KAFKA_CLIENT_ID: '../client' },
    { LOYALTY_KAFKA_GROUP_ID: '' },
    { LOYALTY_KAFKA_TOPIC: '..' },
    { LOYALTY_KAFKA_FROM_BEGINNING: 'yes' },
    { LOYALTY_EVENT_SCHEMA_HEADER_REQUIRED: 'yes' },
    { LOYALTY_KAFKA_MAX_BYTES: '1023' },
    { LOYALTY_KAFKA_MAX_BYTES: '262145' },
    { LOYALTY_KAFKA_MAX_BYTES: '1.5' },
    { KAFKA_BROKERS: 'invalid' },
    { KAFKA_BROKERS: 'localhost:0' },
    { LOYALTY_KAFKA_TLS_ENABLED: 'yes' },
  ])('rejects unsafe setting %j', (invalid) => {
    expect(() =>
      loyaltyKafkaConsumerConfig({ ...enabled, ...invalid }),
    ).toThrow();
  });

  it('requires Loyalty-specific TLS and SCRAM credentials in production', () => {
    expect(() =>
      loyaltyKafkaConsumerConfig({
        ...enabled,
        NODE_ENV: 'production',
        KAFKA_TLS_ENABLED: 'true',
        KAFKA_SASL_MECHANISM: 'scram-sha-512',
        KAFKA_SASL_USERNAME: 'publisher',
        KAFKA_SASL_PASSWORD: 'publisher-secret',
      }),
    ).toThrow('dedicated SCRAM credentials');

    expect(
      loyaltyKafkaConsumerConfig({
        ...enabled,
        NODE_ENV: 'production',
        LOYALTY_KAFKA_TLS_ENABLED: 'true',
        LOYALTY_KAFKA_SASL_MECHANISM: 'scram-sha-512',
        LOYALTY_KAFKA_SASL_USERNAME: 'loyalty-reader',
        LOYALTY_KAFKA_SASL_PASSWORD: 'loyalty-secret',
      }),
    ).toMatchObject({
      enabled: true,
      client: {
        ssl: { rejectUnauthorized: true },
        sasl: {
          mechanism: 'scram-sha-512',
          username: 'loyalty-reader',
        },
      },
    });
  });
});
