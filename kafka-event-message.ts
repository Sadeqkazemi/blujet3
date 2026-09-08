import { BadRequestException } from '@nestjs/common';
import { TextDecoder } from 'node:util';
import type { EachMessagePayload, KafkaMessage } from 'kafkajs';
import { ErrorCode } from '../errors';
import { isCanonicalEvent, type CanonicalEvent } from './canonical-events';

export interface KafkaEventSubscription {
  topic: string;
  expectedProducer: string;
  maxBytes?: number;
}

export interface ValidatedKafkaEventSubscription {
  readonly topic: string;
  readonly expectedProducer: string;
  readonly maxBytes: number;
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
  if (
    !/^[a-zA-Z0-9._-]{1,249}$/.test(subscription.topic) ||
    ['.', '..'].includes(subscription.topic) ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(subscription.expectedProducer) ||
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 1 ||
    maxBytes > 256 * 1024
  )
    throw invalid();
  return Object.freeze({
    topic: subscription.topic,
    expectedProducer: subscription.expectedProducer,
    maxBytes,
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
  if (
    !isCanonicalEvent(parsed) ||
    parsed.producer !== subscription.expectedProducer
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
