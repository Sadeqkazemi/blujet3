import type { KafkaConfig } from 'kafkajs';

export function kafkaEventsConfig(
  env: Record<string, unknown> = process.env,
): { enabled: false } | { enabled: true; topic: string; client: KafkaConfig } {
  if (
    env.KAFKA_EVENTS_ENABLED !== undefined &&
    env.KAFKA_EVENTS_ENABLED !== 'true' &&
    env.KAFKA_EVENTS_ENABLED !== 'false'
  ) {
    throw new Error('KAFKA_EVENTS_ENABLED must be true or false');
  }
  if (env.KAFKA_EVENTS_ENABLED !== 'true') return { enabled: false };
  const required = (key: string): string => {
    const value = env[key];
    if (typeof value !== 'string' || !value.trim())
      throw new Error(`${key} is required`);
    return value;
  };
  const brokers = required('KAFKA_BROKERS')
    .split(',')
    .map((v) => v.trim());
  if (
    brokers.some(
      (v) =>
        !/^[a-zA-Z0-9.-]+:[0-9]{1,5}$/.test(v) ||
        Number(v.split(':')[1]) < 1 ||
        Number(v.split(':')[1]) > 65535,
    )
  ) {
    throw new Error('KAFKA_BROKERS must contain host:port entries');
  }
  const topic = env.KAFKA_EVENTS_TOPIC ?? 'blujet.events.v1';
  const clientId = env.KAFKA_CLIENT_ID ?? 'blujet-core';
  for (const [key, value] of [
    ['KAFKA_EVENTS_TOPIC', topic],
    ['KAFKA_CLIENT_ID', clientId],
  ] as const) {
    if (
      typeof value !== 'string' ||
      !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,248}$/.test(value)
    ) {
      throw new Error(`${key} is invalid`);
    }
  }
  if (
    env.KAFKA_TLS_ENABLED !== undefined &&
    env.KAFKA_TLS_ENABLED !== 'true' &&
    env.KAFKA_TLS_ENABLED !== 'false'
  ) {
    throw new Error('KAFKA_TLS_ENABLED must be true or false');
  }
  const tls = env.KAFKA_TLS_ENABLED === 'true';
  const mechanism = env.KAFKA_SASL_MECHANISM;
  let sasl: KafkaConfig['sasl'];
  if (mechanism !== undefined && mechanism !== '') {
    if (mechanism !== 'scram-sha-256' && mechanism !== 'scram-sha-512') {
      throw new Error(
        'KAFKA_SASL_MECHANISM must be scram-sha-256 or scram-sha-512',
      );
    }
    if (!tls) throw new Error('Kafka SASL requires TLS');
    const credentials = {
      username: required('KAFKA_SASL_USERNAME'),
      password: required('KAFKA_SASL_PASSWORD'),
    };
    sasl =
      mechanism === 'scram-sha-256'
        ? { mechanism, ...credentials }
        : { mechanism, ...credentials };
  } else if (env.KAFKA_SASL_USERNAME || env.KAFKA_SASL_PASSWORD) {
    throw new Error('KAFKA_SASL_MECHANISM is required with credentials');
  }
  if (env.NODE_ENV === 'production' && (!tls || !sasl)) {
    throw new Error('Production Kafka requires TLS and SCRAM credentials');
  }
  const ca = env.KAFKA_TLS_CA_PEM;
  if (
    ca &&
    (!tls ||
      typeof ca !== 'string' ||
      !ca.includes('-----BEGIN CERTIFICATE-----'))
  ) {
    throw new Error('KAFKA_TLS_CA_PEM requires TLS and a PEM certificate');
  }
  return {
    enabled: true,
    topic: topic as string,
    client: {
      clientId: clientId as string,
      brokers,
      ssl: tls
        ? { rejectUnauthorized: true, ...(ca ? { ca: [ca as string] } : {}) }
        : false,
      sasl,
      connectionTimeout: 3000,
      authenticationTimeout: 5000,
      requestTimeout: 10000,
      enforceRequestTimeout: true,
      retry: { retries: 0 },
    },
  };
}
