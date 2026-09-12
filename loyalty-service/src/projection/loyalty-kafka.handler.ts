import { Injectable } from '@nestjs/common';
import type {
  Consumer,
  ConsumerRunConfig,
  EachMessagePayload,
  KafkaMessage,
} from 'kafkajs';
import { TextDecoder } from 'node:util';
import {
  parseLoyaltyProjectionEvent,
  type LoyaltyProjectionEvent,
} from './loyalty-projection-event';
import { LoyaltyProjectionConsumer } from './loyalty-projection.consumer';

export interface LoyaltyKafkaSubscription {
  topic: string;
  maxBytes?: number;
  requireSchemaId?: boolean;
}

interface ValidatedSubscription {
  readonly topic: string;
  readonly maxBytes: number;
  readonly requireSchemaId: boolean;
}

interface ParsedDelivery {
  readonly event: LoyaltyProjectionEvent;
  readonly offset: {
    readonly topic: string;
    readonly partition: number;
    readonly offset: string;
  };
}

const MAX_EVENT_BYTES = 256 * 1024;
const MAX_KAFKA_OFFSET = 9_223_372_036_854_775_807n;

function invalidSubscription(): never {
  throw new Error('Invalid Loyalty Kafka subscription');
}

function invalidDelivery(): never {
  throw new Error('Invalid Loyalty Kafka delivery');
}

function header(message: KafkaMessage, name: string): string | undefined {
  const value = message.headers?.[name];
  if (value === undefined || Array.isArray(value) || !Buffer.isBuffer(value))
    return undefined;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(value);
  } catch {
    return undefined;
  }
}

function validateSubscription(
  subscription: LoyaltyKafkaSubscription,
): ValidatedSubscription {
  const maxBytes = subscription.maxBytes ?? MAX_EVENT_BYTES;
  const requireSchemaId = subscription.requireSchemaId ?? false;
  if (
    !/^[A-Za-z0-9._-]{1,249}$/.test(subscription.topic) ||
    subscription.topic === '.' ||
    subscription.topic === '..' ||
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 1 ||
    maxBytes > MAX_EVENT_BYTES ||
    typeof requireSchemaId !== 'boolean'
  )
    invalidSubscription();
  return Object.freeze({
    topic: subscription.topic,
    maxBytes,
    requireSchemaId,
  });
}

function parseDelivery(
  subscription: ValidatedSubscription,
  payload: EachMessagePayload,
): ParsedDelivery {
  const { message } = payload;
  if (
    payload.topic !== subscription.topic ||
    !Number.isSafeInteger(payload.partition) ||
    payload.partition < 0 ||
    !message.value ||
    message.value.length > subscription.maxBytes ||
    !/^(0|[1-9][0-9]{0,18})$/.test(message.offset) ||
    BigInt(message.offset) >= MAX_KAFKA_OFFSET
  )
    invalidDelivery();

  let input: unknown;
  try {
    input = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(message.value),
    ) as unknown;
  } catch {
    invalidDelivery();
  }

  let event: LoyaltyProjectionEvent;
  try {
    event = parseLoyaltyProjectionEvent(input);
  } catch {
    invalidDelivery();
  }

  const expectedKey = `${event.producer}:${event.aggregateType}:${event.aggregateId}`;
  const expectedSchemaId = `blujet.loyalty.${event.eventType}.v1`;
  const schemaId = header(message, 'event-schema-id');
  const rawSchemaId = message.headers?.['event-schema-id'];
  if (
    !message.key?.equals(Buffer.from(expectedKey, 'utf8')) ||
    header(message, 'event-id') !== event.eventId ||
    header(message, 'correlation-id') !== event.correlationId ||
    header(message, 'event-version') !== '1' ||
    (subscription.requireSchemaId && schemaId === undefined) ||
    (rawSchemaId !== undefined && schemaId !== expectedSchemaId)
  )
    invalidDelivery();

  return {
    event,
    offset: {
      topic: payload.topic,
      partition: payload.partition,
      offset: (BigInt(message.offset) + 1n).toString(),
    },
  };
}

@Injectable()
export class LoyaltyKafkaHandler {
  constructor(private readonly loyalty: LoyaltyProjectionConsumer) {}

  runConfig(
    client: Pick<Consumer, 'commitOffsets'>,
    subscription: LoyaltyKafkaSubscription,
  ): ConsumerRunConfig {
    const trusted = validateSubscription(subscription);
    return {
      autoCommit: false,
      partitionsConsumedConcurrently: 1,
      eachMessage: async (payload) => {
        try {
          const delivery = parseDelivery(trusted, payload);
          await payload.heartbeat();
          await this.loyalty.consume(delivery.event);
          await payload.heartbeat();
          await client.commitOffsets([delivery.offset]);
        } catch {
          throw new Error('Loyalty Kafka processing failed');
        }
      },
    };
  }
}
