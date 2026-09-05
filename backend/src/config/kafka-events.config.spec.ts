import { kafkaEventsConfig } from './kafka-events.config';

describe('kafkaEventsConfig', () => {
  const enabled = {
    KAFKA_EVENTS_ENABLED: 'true',
    KAFKA_BROKERS: 'localhost:9092',
  };
  it('is disabled by default without requiring broker configuration', () => {
    expect(kafkaEventsConfig({})).toEqual({ enabled: false });
    expect(
      kafkaEventsConfig({
        KAFKA_EVENTS_ENABLED: 'false',
        KAFKA_BROKERS: 'bad',
      }),
    ).toEqual({ enabled: false });
  });
  it.each(['yes', '1', '', 'TRUE'])('rejects an ambiguous flag %s', (flag) => {
    expect(() => kafkaEventsConfig({ KAFKA_EVENTS_ENABLED: flag })).toThrow(
      'KAFKA_EVENTS_ENABLED',
    );
  });
  it.each([
    '',
    'localhost',
    'host:0',
    'host:65536',
    'host:9092,',
    'https://host:9092',
  ])('rejects malformed brokers %s', (brokers) => {
    expect(() =>
      kafkaEventsConfig({ ...enabled, KAFKA_BROKERS: brokers }),
    ).toThrow('KAFKA_BROKERS');
  });
  it('requires TLS and authentication in production', () => {
    expect(() =>
      kafkaEventsConfig({ ...enabled, NODE_ENV: 'production' }),
    ).toThrow('Production Kafka');
    expect(() =>
      kafkaEventsConfig({
        ...enabled,
        NODE_ENV: 'production',
        KAFKA_TLS_ENABLED: 'true',
      }),
    ).toThrow('Production Kafka');
  });
  it('configures verified TLS, SCRAM and finite retries', () => {
    const config = kafkaEventsConfig({
      ...enabled,
      NODE_ENV: 'production',
      KAFKA_TLS_ENABLED: 'true',
      KAFKA_SASL_MECHANISM: 'scram-sha-512',
      KAFKA_SASL_USERNAME: 'test-user',
      KAFKA_SASL_PASSWORD: 'test-only',
    });
    expect(config).toMatchObject({
      enabled: true,
      client: {
        ssl: { rejectUnauthorized: true },
        sasl: { mechanism: 'scram-sha-512' },
        retry: { retries: 0 },
        enforceRequestTimeout: true,
      },
    });
  });
  it.each([
    { KAFKA_SASL_MECHANISM: 'plain' },
    {
      KAFKA_SASL_MECHANISM: 'scram-sha-256',
      KAFKA_SASL_USERNAME: 'test',
      KAFKA_SASL_PASSWORD: 'test',
    },
    { KAFKA_SASL_USERNAME: 'test' },
    { KAFKA_TLS_ENABLED: 'yes' },
    { KAFKA_EVENTS_TOPIC: '../invalid' },
    { KAFKA_TLS_ENABLED: 'true', KAFKA_TLS_CA_PEM: 'not-pem' },
    { KAFKA_TLS_ENABLED: 'true', KAFKA_SASL_MECHANISM: 'scram-sha-256' },
  ])('rejects incomplete or unsafe security configuration %j', (invalid) => {
    expect(() => kafkaEventsConfig({ ...enabled, ...invalid })).toThrow();
  });
});
