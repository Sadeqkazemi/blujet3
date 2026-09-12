import type { ConsumerConfig, KafkaConfig } from 'kafkajs';

const DEFAULT_MAX_BYTES = 256 * 1024;
const IDENTIFIER = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,248}$/;
const BROKER = /^[a-zA-Z0-9.-]+:[0-9]{1,5}$/;

export type LoyaltyKafkaConsumerConfig =
  | { enabled: false }
  | {
      enabled: true;
      requireSchemaId: boolean;
      topic: string;
      fromBeginning: boolean;
      maxBytes: number;
      client: KafkaConfig;
      consumer: ConsumerConfig;
    };

function booleanSetting(
  env: Record<string, unknown>,
  key: string,
  fallback: boolean,
): boolean {
  const value = env[key];
  if (value === undefined) return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${key} must be true or false`);
}

function required(env: Record<string, unknown>, key: string): string {
  const value = env[key];
  if (typeof value !== 'string' || value.trim() === '')
    throw new Error(`${key} is required`);
  return value;
}

function identifier(
  env: Record<string, unknown>,
  key: string,
  fallback: string,
): string {
  const value = env[key] ?? fallback;
  if (typeof value !== 'string' || !IDENTIFIER.test(value))
    throw new Error(`${key} is invalid`);
  return value;
}

export function loyaltyKafkaConsumerConfig(
  env: Record<string, unknown> = process.env,
): LoyaltyKafkaConsumerConfig {
  const enabled = booleanSetting(env, 'LOYALTY_KAFKA_CONSUMER_ENABLED', false);
  if (!enabled) return { enabled: false };

  const brokers = required(env, 'KAFKA_BROKERS')
    .split(',')
    .map((value) => value.trim());
  if (
    brokers.length === 0 ||
    brokers.some((value) => {
      if (!BROKER.test(value)) return true;
      const port = Number(value.slice(value.lastIndexOf(':') + 1));
      return port < 1 || port > 65_535;
    })
  ) {
    throw new Error('KAFKA_BROKERS must contain host:port entries');
  }

  const topic = identifier(env, 'LOYALTY_KAFKA_TOPIC', 'blujet.events.v1');
  const clientId = identifier(env, 'LOYALTY_KAFKA_CLIENT_ID', 'blujet-loyalty');
  const groupId = identifier(
    env,
    'LOYALTY_KAFKA_GROUP_ID',
    'blujet-loyalty-projection-v1',
  );
  const maxBytesValue = env.LOYALTY_KAFKA_MAX_BYTES ?? `${DEFAULT_MAX_BYTES}`;
  if (
    typeof maxBytesValue !== 'string' ||
    !/^\d+$/.test(maxBytesValue) ||
    Number(maxBytesValue) < 1024 ||
    Number(maxBytesValue) > DEFAULT_MAX_BYTES
  ) {
    throw new Error(
      `LOYALTY_KAFKA_MAX_BYTES must be between 1024 and ${DEFAULT_MAX_BYTES}`,
    );
  }

  const tls = booleanSetting(env, 'LOYALTY_KAFKA_TLS_ENABLED', false);
  const mechanism = env.LOYALTY_KAFKA_SASL_MECHANISM;
  let sasl: KafkaConfig['sasl'];
  if (mechanism !== undefined && mechanism !== '') {
    if (mechanism !== 'scram-sha-256' && mechanism !== 'scram-sha-512') {
      throw new Error(
        'LOYALTY_KAFKA_SASL_MECHANISM must be scram-sha-256 or scram-sha-512',
      );
    }
    if (!tls) throw new Error('Loyalty Kafka SASL requires TLS');
    const credentials = {
      username: required(env, 'LOYALTY_KAFKA_SASL_USERNAME'),
      password: required(env, 'LOYALTY_KAFKA_SASL_PASSWORD'),
    };
    sasl =
      mechanism === 'scram-sha-256'
        ? { mechanism, ...credentials }
        : { mechanism, ...credentials };
  } else if (
    env.LOYALTY_KAFKA_SASL_USERNAME ||
    env.LOYALTY_KAFKA_SASL_PASSWORD
  ) {
    throw new Error(
      'LOYALTY_KAFKA_SASL_MECHANISM is required with credentials',
    );
  }

  if (env.NODE_ENV === 'production' && (!tls || !sasl)) {
    throw new Error(
      'Production Loyalty Kafka requires TLS and dedicated SCRAM credentials',
    );
  }
  const ca = env.LOYALTY_KAFKA_TLS_CA_PEM;
  if (
    ca !== undefined &&
    (typeof ca !== 'string' ||
      !tls ||
      !ca.includes('-----BEGIN CERTIFICATE-----'))
  ) {
    throw new Error(
      'LOYALTY_KAFKA_TLS_CA_PEM requires TLS and a PEM certificate',
    );
  }

  const maxBytes = Number(maxBytesValue);
  return {
    enabled: true,
    requireSchemaId: booleanSetting(
      env,
      'LOYALTY_EVENT_SCHEMA_HEADER_REQUIRED',
      false,
    ),
    topic,
    fromBeginning: booleanSetting(env, 'LOYALTY_KAFKA_FROM_BEGINNING', true),
    maxBytes,
    client: {
      clientId,
      brokers,
      ssl: tls
        ? { rejectUnauthorized: true, ...(ca ? { ca: [ca] } : {}) }
        : false,
      sasl,
      connectionTimeout: 3000,
      authenticationTimeout: 5000,
      requestTimeout: 10000,
      enforceRequestTimeout: true,
      retry: { retries: 0 },
    },
    consumer: {
      groupId,
      allowAutoTopicCreation: false,
      maxBytesPerPartition: maxBytes,
      retry: { retries: 5 },
    },
  };
}
