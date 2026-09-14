import { opsAdminKafkaConsumerConfig } from './ops-admin-kafka-consumer.config';

describe('opsAdminKafkaConsumerConfig', () => {
  const enabled = {
    OPS_ADMIN_KAFKA_CONSUMER_ENABLED: 'true',
    KAFKA_BROKERS: 'localhost:9092',
  };

  it('is disabled by default without validating unused broker settings', () => {
    expect(opsAdminKafkaConsumerConfig({})).toEqual({ enabled: false });
    expect(
      opsAdminKafkaConsumerConfig({
        OPS_ADMIN_KAFKA_CONSUMER_ENABLED: 'false',
        KAFKA_BROKERS: 'invalid',
      }),
    ).toEqual({ enabled: false });
  });

  it.each(['', 'yes', '1', 'TRUE'])('rejects ambiguous flag %s', (flag) => {
    expect(() =>
      opsAdminKafkaConsumerConfig({
        OPS_ADMIN_KAFKA_CONSUMER_ENABLED: flag,
      }),
    ).toThrow('OPS_ADMIN_KAFKA_CONSUMER_ENABLED');
  });

  it('builds an independent exact-topic consumer configuration', () => {
    expect(opsAdminKafkaConsumerConfig(enabled)).toMatchObject({
      enabled: true,
      requireSchemaId: false,
      topic: 'blujet.events.v1',
      fromBeginning: true,
      maxBytes: 262144,
      client: { clientId: 'blujet-ops-admin-projection' },
      consumer: {
        groupId: 'blujet-ops-admin-projection-v1',
        allowAutoTopicCreation: false,
        maxBytesPerPartition: 262144,
        retry: { retries: 5 },
      },
    });
  });

  it('accepts explicit bounded replay and identity settings', () => {
    expect(
      opsAdminKafkaConsumerConfig({
        ...enabled,
        KAFKA_EVENTS_TOPIC: 'core.events.v1',
        OPS_ADMIN_KAFKA_CLIENT_ID: 'ops-projection',
        OPS_ADMIN_KAFKA_GROUP_ID: 'ops-projection-v2',
        OPS_ADMIN_KAFKA_FROM_BEGINNING: 'false',
        OPS_ADMIN_KAFKA_MAX_BYTES: '4096',
        CORE_EVENT_SCHEMA_HEADER_REQUIRED: 'true',
      }),
    ).toMatchObject({
      enabled: true,
      requireSchemaId: true,
      topic: 'core.events.v1',
      fromBeginning: false,
      maxBytes: 4096,
      client: { clientId: 'ops-projection' },
      consumer: {
        groupId: 'ops-projection-v2',
        maxBytesPerPartition: 4096,
      },
    });
  });

  it.each([
    { OPS_ADMIN_KAFKA_CLIENT_ID: '../client' },
    { OPS_ADMIN_KAFKA_GROUP_ID: '' },
    { OPS_ADMIN_KAFKA_FROM_BEGINNING: 'yes' },
    { OPS_ADMIN_KAFKA_MAX_BYTES: '1023' },
    { OPS_ADMIN_KAFKA_MAX_BYTES: '262145' },
    { OPS_ADMIN_KAFKA_MAX_BYTES: '1.5' },
    { KAFKA_BROKERS: 'invalid' },
    { CORE_EVENT_SCHEMA_HEADER_REQUIRED: 'yes' },
  ])('rejects unsafe setting %j', (invalid) => {
    expect(() =>
      opsAdminKafkaConsumerConfig({ ...enabled, ...invalid }),
    ).toThrow();
  });

  it('requires a dedicated verified identity in production', () => {
    expect(() =>
      opsAdminKafkaConsumerConfig({
        ...enabled,
        NODE_ENV: 'production',
        KAFKA_TLS_ENABLED: 'true',
        KAFKA_SASL_MECHANISM: 'scram-sha-512',
        KAFKA_SASL_USERNAME: 'publisher',
        KAFKA_SASL_PASSWORD: 'publisher-secret',
      }),
    ).toThrow('dedicated SCRAM credentials');

    expect(
      opsAdminKafkaConsumerConfig({
        ...enabled,
        NODE_ENV: 'production',
        KAFKA_TLS_ENABLED: 'true',
        OPS_ADMIN_KAFKA_SASL_MECHANISM: 'scram-sha-512',
        OPS_ADMIN_KAFKA_SASL_USERNAME: 'ops-projection',
        OPS_ADMIN_KAFKA_SASL_PASSWORD: 'ops-secret',
      }),
    ).toMatchObject({
      enabled: true,
      client: {
        ssl: { rejectUnauthorized: true },
        sasl: {
          mechanism: 'scram-sha-512',
          username: 'ops-projection',
        },
      },
    });
  });
});
