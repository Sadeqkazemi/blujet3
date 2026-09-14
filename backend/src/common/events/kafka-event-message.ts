import { BadRequestException } from '@nestjs/common';
import { TextDecoder } from 'node:util';
import type { EachMessagePayload, KafkaMessage } from 'kafkajs';
import { ErrorCode } from '../errors';
import { isCanonicalEvent, type CanonicalEvent } from './canonical-events';
import { knownEventSchema } from './event-schema';

export interface KafkaEventSubscription {
  topic: string;
  expectedProducer: string;
  additionalProducerSchemaDomains?: Readonly<Record<string, string>>;
  maxBytes?: number;
  requireSchemaId?: boolean;
}

export interface ValidatedKafkaEventSubscription {
  readonly topic: string;
  readonly expectedProducer: string;
  readonly additionalProducerSchemaDomains: Readonly<Record<string, string>>;
  readonly maxBytes: number;
  readonly requireSchemaId: boolean;
}

export interface ParsedKafkaEventDelivery {
  event: CanonicalEvent;
  offset: { topic: string; partition: number; offset: string };
  highWatermark?: string;
}

function invalid(): BadRequestException {
  return new BadRequestException({
    code: ErrorCode.VALIDATION_FAILED,
    message: 'پیام Kafka معتبر نیست.',
  });
}

function header(message: KafkaMessage, name: string): string | undefined {
  const value = message.headers?.[name];
  if (value === undefined || Array.isArray(value) || !Buffer.isBuffer(value))
    return undefined;
  return new TextDecoder('utf-8', { fatal: true }).decode(value);
}

export function validateKafkaEventSubscription(
  subscription: KafkaEventSubscription,
): ValidatedKafkaEventSubscription {
  const maxBytes = subscription.maxBytes ?? 256 * 1024;
  const requireSchemaId = subscription.requireSchemaId ?? false;
  const additionalProducerEntries = Object.entries(
    subscription.additionalProducerSchemaDomains ?? {},
  );
  if (
    !/^[a-zA-Z0-9._-]{1,249}$/.test(subscription.topic) ||
    ['.', '..'].includes(subscription.topic) ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(subscription.expectedProducer) ||
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 1 ||
    maxBytes > 256 * 1024 ||
    typeof requireSchemaId !== 'boolean' ||
    additionalProducerEntries.length > 16 ||
    additionalProducerEntries.some(
      ([producer, schemaDomain]) =>
        producer === subscription.expectedProducer ||
        !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(producer) ||
        !/^[a-z][a-z0-9-]{0,63}$/.test(schemaDomain),
    )
  )
    throw invalid();
  const additionalProducerSchemaDomains: Record<string, string> = {};
  for (const [producer, schemaDomain] of additionalProducerEntries)
    additionalProducerSchemaDomains[producer] = schemaDomain;
  return Object.freeze({
    topic: subscription.topic,
    expectedProducer: subscription.expectedProducer,
    additionalProducerSchemaDomains: Object.freeze(
      additionalProducerSchemaDomains,
    ),
    maxBytes,
    requireSchemaId,
  });
}

export function parseKafkaEventDelivery(
  subscription: ValidatedKafkaEventSubscription,
  payload: EachMessagePayload,
): ParsedKafkaEventDelivery {
  const message = payload.message;
  if (
    payload.topic !== subscription.topic ||
    !message.value ||
    !Number.isSafeInteger(payload.partition) ||
    payload.partition < 0 ||
    !/^(0|[1-9][0-9]{0,18})$/.test(message.offset) ||
    BigInt(message.offset) >= 9223372036854775807n ||
    message.value.length > subscription.maxBytes
  )
    throw invalid();
  const highWatermarkCandidate =
    'highWatermark' in message ? message.highWatermark : undefined;
  if (
    highWatermarkCandidate !== undefined &&
    typeof highWatermarkCandidate !== 'string'
  )
    throw invalid();
  const highWatermark =
    typeof highWatermarkCandidate === 'string'
      ? highWatermarkCandidate
      : undefined;
  if (
    highWatermark !== undefined &&
    (!/^(0|[1-9][0-9]{0,18})$/.test(highWatermark) ||
      BigInt(highWatermark) > 9223372036854775807n)
  )
    throw invalid();
  const parsed: unknown = (() => {
    try {
      return JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(message.value),
      ) as unknown;
    } catch {
      throw invalid();
    }
  })();
  if (!isCanonicalEvent(parsed)) throw invalid();
  const expectedProducer = parsed.producer === subscription.expectedProducer;
  const additionalSchemaDomain = Object.prototype.hasOwnProperty.call(
    subscription.additionalProducerSchemaDomains,
    parsed.producer,
  )
    ? subscription.additionalProducerSchemaDomains[parsed.producer]
    : undefined;
  if (!expectedProducer && additionalSchemaDomain === undefined)
    throw invalid();
  const rawSchemaId = message.headers?.['event-schema-id'];
  const schemaId = header(message, 'event-schema-id');
  const expectedSchemaId = expectedProducer
    ? knownEventSchema(parsed)?.schemaId
    : `blujet.${additionalSchemaDomain}.${parsed.eventType}.v1`;
  const schemaHeaderRequired =
    subscription.requireSchemaId &&
    (!expectedProducer || expectedSchemaId !== undefined);
  if (schemaHeaderRequired && schemaId === undefined) throw invalid();
  if (
    rawSchemaId !== undefined &&
    (schemaId === undefined ||
      expectedSchemaId === undefined ||
      schemaId !== expectedSchemaId)
  )
    throw invalid();
  const expectedKey = `${parsed.producer}:${parsed.aggregateType}:${parsed.aggregateId}`;
  if (!message.key?.equals(Buffer.from(expectedKey, 'utf8'))) throw invalid();
  if (
    header(message, 'event-id') !== parsed.eventId ||
    header(message, 'correlation-id') !== parsed.correlationId ||
    header(message, 'event-version') !== '1'
  )
    throw invalid();
  return {
    event: parsed,
    offset: {
      topic: payload.topic,
      partition: payload.partition,
      offset: (BigInt(message.offset) + 1n).toString(),
    },
    highWatermark,
  };
}
