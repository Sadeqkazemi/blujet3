import { reportingKafkaConsumerConfig } from './reporting-kafka-consumer.config';

describe('reportingKafkaConsumerConfig', () => {
  const enabled = {
    REPORTING_KAFKA_CONSUMER_ENABLED: 'true',
    KAFKA_BROKERS: 'localhost:9092',
  };

  it('is disabled by default without validating unused broker settings', () => {
    expect(reportingKafkaConsumerConfig({})).toEqual({ enabled: false });
    expect(
      reportingKafkaConsumerConfig({
        REPORTING_KAFKA_CONSUMER_ENABLED: 'false',
        KAFKA_BROKERS: 'invalid',
      }),
    ).toEqual({ enabled: false });
  });

  it.each(['', 'yes', '1', 'TRUE'])('rejects ambiguous flag %s', (flag) => {
    expect(() =>
      reportingKafkaConsumerConfig({
        REPORTING_KAFKA_CONSUMER_ENABLED: flag,
      }),
    ).toThrow('REPORTING_KAFKA_CONSUMER_ENABLED');
  });

  it('builds an independent exact-topic consumer configuration', () => {
    expect(reportingKafkaConsumerConfig(enabled)).toMatchObject({
      enabled: true,
      topic: 'blujet.events.v1',
      fromBeginning: true,
      maxBytes: 262144,
      client: { clientId: 'blujet-reporting' },
      consumer: {
        groupId: 'blujet-reporting-v1',
        allowAutoTopicCreation: false,
        maxBytesPerPartition: 262144,
        retry: { retries: 5 },
      },
    });
  });

  it('accepts explicit bounded replay and identity settings', () => {
    expect(
      reportingKafkaConsumerConfig({
        ...enabled,
        KAFKA_EVENTS_TOPIC: 'core.events.v1',
        REPORTING_KAFKA_CLIENT_ID: 'reporting-reader',
        REPORTING_KAFKA_GROUP_ID: 'reporting-reader-v2',
        REPORTING_KAFKA_FROM_BEGINNING: 'false',
        REPORTING_KAFKA_MAX_BYTES: '4096',
      }),
    ).toMatchObject({
      enabled: true,
      topic: 'core.events.v1',
      fromBeginning: false,
      maxBytes: 4096,
      client: { clientId: 'reporting-reader' },
      consumer: {
        groupId: 'reporting-reader-v2',
        maxBytesPerPartition: 4096,
      },
    });
  });

  it('keeps schema-header enforcement off by default and allows explicit enablement', () => {
    expect(reportingKafkaConsumerConfig(enabled)).toMatchObject({
      requireSchemaId: false,
    });
    expect(
      reportingKafkaConsumerConfig({
        ...enabled,
        CORE_EVENT_SCHEMA_HEADER_REQUIRED: 'true',
      }),
    ).toMatchObject({ requireSchemaId: true });
  });

  it.each([
    { REPORTING_KAFKA_CLIENT_ID: '../client' },
    { REPORTING_KAFKA_GROUP_ID: '' },
    { REPORTING_KAFKA_FROM_BEGINNING: 'yes' },
    { REPORTING_KAFKA_MAX_BYTES: '1023' },
    { REPORTING_KAFKA_MAX_BYTES: '262145' },
    { REPORTING_KAFKA_MAX_BYTES: '1.5' },
    { KAFKA_BROKERS: 'invalid' },
    { CORE_EVENT_SCHEMA_HEADER_REQUIRED: 'yes' },
  ])('rejects unsafe setting %j', (invalid) => {
    expect(() =>
      reportingKafkaConsumerConfig({ ...enabled, ...invalid }),
    ).toThrow();
  });

  it('requires dedicated verified credentials in production', () => {
    expect(() =>
      reportingKafkaConsumerConfig({
        ...enabled,
        NODE_ENV: 'production',
        KAFKA_TLS_ENABLED: 'true',
        KAFKA_SASL_MECHANISM: 'scram-sha-512',
        KAFKA_SASL_USERNAME: 'publisher',
        KAFKA_SASL_PASSWORD: 'publisher-secret',
      }),
    ).toThrow('dedicated SCRAM credentials');

    expect(
      reportingKafkaConsumerConfig({
        ...enabled,
        NODE_ENV: 'production',
        KAFKA_TLS_ENABLED: 'true',
        REPORTING_KAFKA_SASL_MECHANISM: 'scram-sha-512',
        REPORTING_KAFKA_SASL_USERNAME: 'reporting-reader',
        REPORTING_KAFKA_SASL_PASSWORD: 'reporting-secret',
      }),
    ).toMatchObject({
      enabled: true,
      client: {
        ssl: { rejectUnauthorized: true },
        sasl: {
          mechanism: 'scram-sha-512',
          username: 'reporting-reader',
        },
      },
    });
  });
});
