import type { ConsumerConfig, KafkaConfig } from 'kafkajs';
import { kafkaEventsConfig } from './kafka-events.config';

const DEFAULT_MAX_BYTES = 256 * 1024;
const IDENTIFIER = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,248}$/;

export type ReportingKafkaConsumerConfig =
  | { enabled: false }
  | {
      enabled: true;
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

export function reportingKafkaConsumerConfig(
  env: Record<string, unknown> = process.env,
): ReportingKafkaConsumerConfig {
  const enabled = booleanSetting(
    env,
    'REPORTING_KAFKA_CONSUMER_ENABLED',
    false,
  );
  if (!enabled) return { enabled: false };

  const clientId = identifier(
    env,
    'REPORTING_KAFKA_CLIENT_ID',
    'blujet-reporting',
  );
  const groupId = identifier(
    env,
    'REPORTING_KAFKA_GROUP_ID',
    'blujet-reporting-v1',
  );
  const maxBytesValue = env.REPORTING_KAFKA_MAX_BYTES ?? `${DEFAULT_MAX_BYTES}`;
  if (
    typeof maxBytesValue !== 'string' ||
    !/^\d+$/.test(maxBytesValue) ||
    Number(maxBytesValue) < 1024 ||
    Number(maxBytesValue) > DEFAULT_MAX_BYTES
  ) {
    throw new Error(
      `REPORTING_KAFKA_MAX_BYTES must be between 1024 and ${DEFAULT_MAX_BYTES}`,
    );
  }
  if (
    env.NODE_ENV === 'production' &&
    (!env.REPORTING_KAFKA_SASL_MECHANISM ||
      !env.REPORTING_KAFKA_SASL_USERNAME ||
      !env.REPORTING_KAFKA_SASL_PASSWORD)
  ) {
    throw new Error(
      'Production Reporting Kafka requires dedicated SCRAM credentials',
    );
  }

  const shared = kafkaEventsConfig({
    ...env,
    KAFKA_EVENTS_ENABLED: 'true',
    KAFKA_CLIENT_ID: clientId,
    KAFKA_SASL_MECHANISM: env.REPORTING_KAFKA_SASL_MECHANISM,
    KAFKA_SASL_USERNAME: env.REPORTING_KAFKA_SASL_USERNAME,
    KAFKA_SASL_PASSWORD: env.REPORTING_KAFKA_SASL_PASSWORD,
  });
  if (!shared.enabled) throw new Error('Reporting Kafka configuration failed');
  const maxBytes = Number(maxBytesValue);
  return {
    enabled: true,
    topic: shared.topic,
    fromBeginning: booleanSetting(env, 'REPORTING_KAFKA_FROM_BEGINNING', true),
    maxBytes,
    client: shared.client,
    consumer: {
      groupId,
      allowAutoTopicCreation: false,
      maxBytesPerPartition: maxBytes,
      retry: { retries: 5 },
    },
  };
}
