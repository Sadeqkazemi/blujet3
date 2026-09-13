import { agencyKafkaConsumerConfig } from './agency-kafka.config';

describe('agencyKafkaConsumerConfig', () => {
  const enabled = {
    AGENCY_KAFKA_CONSUMER_ENABLED: 'true',
    KAFKA_BROKERS: 'localhost:9092',
  };

  it('is disabled by default without validating unused broker settings', () => {
    expect(agencyKafkaConsumerConfig({})).toEqual({ enabled: false });
    expect(
      agencyKafkaConsumerConfig({
        AGENCY_KAFKA_CONSUMER_ENABLED: 'false',
        KAFKA_BROKERS: 'invalid',
      }),
    ).toEqual({ enabled: false });
  });

  it.each(['', 'yes', '1', 'TRUE'])('rejects ambiguous flag %s', (flag) => {
    expect(() =>
      agencyKafkaConsumerConfig({
        AGENCY_KAFKA_CONSUMER_ENABLED: flag,
      }),
    ).toThrow('AGENCY_KAFKA_CONSUMER_ENABLED');
  });

  it('builds a bounded independent consumer configuration', () => {
    expect(agencyKafkaConsumerConfig(enabled)).toMatchObject({
      enabled: true,
      topic: 'blujet.events.v1',
      fromBeginning: true,
      requireSchemaId: false,
      maxBytes: 262144,
      client: {
        clientId: 'blujet-agency',
        brokers: ['localhost:9092'],
        ssl: false,
      },
      consumer: {
        groupId: 'blujet-agency-projection-v1',
        allowAutoTopicCreation: false,
        maxBytesPerPartition: 262144,
        retry: { retries: 5 },
      },
    });
  });

  it('accepts explicit replay, schema and identity settings', () => {
    expect(
      agencyKafkaConsumerConfig({
        ...enabled,
        AGENCY_KAFKA_TOPIC: 'core.events.v1',
        AGENCY_KAFKA_CLIENT_ID: 'agency-reader',
        AGENCY_KAFKA_GROUP_ID: 'agency-reader-v2',
        AGENCY_KAFKA_FROM_BEGINNING: 'false',
        AGENCY_EVENT_SCHEMA_HEADER_REQUIRED: 'true',
        AGENCY_KAFKA_MAX_BYTES: '4096',
      }),
    ).toMatchObject({
      enabled: true,
      topic: 'core.events.v1',
      fromBeginning: false,
      requireSchemaId: true,
      maxBytes: 4096,
      client: { clientId: 'agency-reader' },
      consumer: {
        groupId: 'agency-reader-v2',
        maxBytesPerPartition: 4096,
      },
    });
  });

  it.each([
    { AGENCY_KAFKA_CLIENT_ID: '../client' },
    { AGENCY_KAFKA_GROUP_ID: '' },
    { AGENCY_KAFKA_TOPIC: '..' },
    { AGENCY_KAFKA_FROM_BEGINNING: 'yes' },
    { AGENCY_EVENT_SCHEMA_HEADER_REQUIRED: 'yes' },
    { AGENCY_KAFKA_MAX_BYTES: '1023' },
    { AGENCY_KAFKA_MAX_BYTES: '262145' },
    { AGENCY_KAFKA_MAX_BYTES: '1.5' },
    { KAFKA_BROKERS: 'invalid' },
    { KAFKA_BROKERS: 'localhost:0' },
    { AGENCY_KAFKA_TLS_ENABLED: 'yes' },
  ])('rejects unsafe setting %j', (invalid) => {
    expect(() =>
      agencyKafkaConsumerConfig({ ...enabled, ...invalid }),
    ).toThrow();
  });

  it('requires Agency-specific TLS and SCRAM credentials in production', () => {
    expect(() =>
      agencyKafkaConsumerConfig({
        ...enabled,
        NODE_ENV: 'production',
        KAFKA_TLS_ENABLED: 'true',
        KAFKA_SASL_MECHANISM: 'scram-sha-512',
        KAFKA_SASL_USERNAME: 'publisher',
        KAFKA_SASL_PASSWORD: 'publisher-secret',
      }),
    ).toThrow('dedicated SCRAM credentials');

    expect(
      agencyKafkaConsumerConfig({
        ...enabled,
        NODE_ENV: 'production',
        AGENCY_KAFKA_TLS_ENABLED: 'true',
        AGENCY_KAFKA_SASL_MECHANISM: 'scram-sha-512',
        AGENCY_KAFKA_SASL_USERNAME: 'agency-reader',
        AGENCY_KAFKA_SASL_PASSWORD: 'agency-secret',
      }),
    ).toMatchObject({
      enabled: true,
      client: {
        ssl: { rejectUnauthorized: true },
        sasl: {
          mechanism: 'scram-sha-512',
          username: 'agency-reader',
        },
      },
    });
  });
});
