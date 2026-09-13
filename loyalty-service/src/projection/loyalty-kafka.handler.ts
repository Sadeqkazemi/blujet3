import { Inject, Injectable } from '@nestjs/common';
import type {
  Consumer,
  ConsumerRunConfig,
  EachMessagePayload,
  KafkaMessage,
} from 'kafkajs';
import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';
import {
  LOYALTY_DLQ_CONFIG,
  type LoyaltyDlqConfig,
} from '../loyalty-dlq.config';
import {
  LoyaltyKafkaFailureStage,
  type LoyaltyKafkaFailureStage as LoyaltyFailureStage,
} from '../database/entities/loyalty-kafka-processing-failure.entity';
import {
  type LoyaltyFailedDelivery,
  LoyaltyDlqStore,
} from './loyalty-dlq.store';
import {
  parseLoyaltyProjectionEvent,
  type LoyaltyProjectionEvent,
} from './loyalty-projection-event';
import { LoyaltyProjectionConsumer } from './loyalty-projection.consumer';

export interface LoyaltyKafkaSubscription {
  topic: string;
  maxBytes?: number;
  consumerGroup?: string;
  requireSchemaId?: boolean;
}

interface ValidatedSubscription {
  readonly topic: string;
  readonly maxBytes: number;
  readonly consumerGroup?: string;
  readonly requireSchemaId: boolean;
}

interface ParsedDelivery {
  readonly event: LoyaltyProjectionEvent;
  readonly offset: {
    readonly topic: string;
    readonly partition: number;
    readonly offset: string;
  };
  readonly highWatermark?: string;
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
    typeof requireSchemaId !== 'boolean' ||
    (subscription.consumerGroup !== undefined &&
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(subscription.consumerGroup))
  )
    invalidSubscription();
  return Object.freeze({
    topic: subscription.topic,
    maxBytes,
    consumerGroup: subscription.consumerGroup,
    requireSchemaId,
  });
}

function parseDelivery(
  subscription: ValidatedSubscription,
  payload: EachMessagePayload,
): ParsedDelivery {
  const { message } = payload;
  const highWatermarkCandidate =
    'highWatermark' in message ? message.highWatermark : undefined;
  if (
    highWatermarkCandidate !== undefined &&
    typeof highWatermarkCandidate !== 'string'
  )
    invalidDelivery();
  const highWatermark = highWatermarkCandidate;
  if (
    payload.topic !== subscription.topic ||
    !Number.isSafeInteger(payload.partition) ||
    payload.partition < 0 ||
    !message.value ||
    message.value.length > subscription.maxBytes ||
    !/^(0|[1-9][0-9]{0,18})$/.test(message.offset) ||
    BigInt(message.offset) >= MAX_KAFKA_OFFSET ||
    (highWatermark !== undefined &&
      (!/^(0|[1-9][0-9]{0,18})$/.test(highWatermark) ||
        BigInt(highWatermark) > MAX_KAFKA_OFFSET ||
        BigInt(highWatermark) < BigInt(message.offset) + 1n))
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
    ...(highWatermark === undefined ? {} : { highWatermark }),
  };
}

@Injectable()
export class LoyaltyKafkaHandler {
  constructor(
    private readonly loyalty: LoyaltyProjectionConsumer,
    private readonly dlq: LoyaltyDlqStore,
    @Inject(LOYALTY_DLQ_CONFIG)
    private readonly dlqConfig: LoyaltyDlqConfig,
  ) {}

  runConfig(
    client: Pick<Consumer, 'commitOffsets'>,
    subscription: LoyaltyKafkaSubscription,
  ): ConsumerRunConfig {
    const trusted = validateSubscription(subscription);
    if (this.dlqConfig.enabled && trusted.consumerGroup === undefined) {
      throw new Error('Loyalty DLQ requires a consumer group');
    }
    return {
      autoCommit: false,
      partitionsConsumedConcurrently: 1,
      eachMessage: async (payload) => {
        let failedDelivery: LoyaltyFailedDelivery | undefined;
        let eventId: string | null = null;
        let stage: LoyaltyFailureStage = LoyaltyKafkaFailureStage.TRANSPORT;
        let projectionCompleted = false;
        let recordFailure = false;
        try {
          if (this.dlqConfig.enabled) {
            failedDelivery = this.describeDelivery(
              trusted.consumerGroup!,
              trusted.topic,
              payload,
            );
            const action = await this.dlq.actionFor(failedDelivery);
            if (action === 'block') {
              throw new Error('Loyalty delivery is quarantined');
            }
            if (action === 'skip') {
              await payload.heartbeat();
              await this.dlq.markSkipped(failedDelivery);
              await payload.heartbeat();
              await client.commitOffsets([
                {
                  topic: failedDelivery.topic,
                  partition: failedDelivery.partition,
                  offset: failedDelivery.nextOffset,
                },
              ]);
              return;
            }
            recordFailure = true;
          }
          const delivery = parseDelivery(trusted, payload);
          eventId = delivery.event.eventId;
          await payload.heartbeat();
          stage = LoyaltyKafkaFailureStage.PROJECTION;
          if (trusted.consumerGroup === undefined) {
            await this.loyalty.consume(delivery.event);
          } else {
            await this.loyalty.consume(delivery.event, {
              consumerGroup: trusted.consumerGroup,
              topic: delivery.offset.topic,
              partition: delivery.offset.partition,
              nextOffset: delivery.offset.offset,
              highWatermark: delivery.highWatermark,
            });
          }
          projectionCompleted = true;
          if (failedDelivery) await this.dlq.markResolved(failedDelivery);
          await payload.heartbeat();
          await client.commitOffsets([delivery.offset]);
        } catch {
          if (
            this.dlqConfig.enabled &&
            failedDelivery &&
            recordFailure &&
            !projectionCompleted
          ) {
            try {
              await this.dlq.recordFailure(
                failedDelivery,
                stage,
                eventId,
                this.dlqConfig.maxAttempts,
              );
            } catch {
              // Keep processing fail-closed if the failure registry is down.
            }
          }
          throw new Error('Loyalty Kafka processing failed');
        }
      },
    };
  }

  private describeDelivery(
    consumerGroup: string,
    trustedTopic: string,
    payload: EachMessagePayload,
  ): LoyaltyFailedDelivery {
    const { topic, partition, message } = payload;
    if (
      topic !== trustedTopic ||
      !Number.isSafeInteger(partition) ||
      partition < 0 ||
      !/^(0|[1-9][0-9]{0,18})$/.test(message.offset) ||
      BigInt(message.offset) >= MAX_KAFKA_OFFSET
    ) {
      throw new Error('Invalid Loyalty delivery coordinates');
    }
    const nextOffset = BigInt(message.offset) + 1n;
    const highWatermarkCandidate =
      'highWatermark' in message ? message.highWatermark : undefined;
    if (
      highWatermarkCandidate !== undefined &&
      typeof highWatermarkCandidate !== 'string'
    ) {
      throw new Error('Invalid Loyalty delivery high watermark');
    }
    const highWatermark = highWatermarkCandidate;
    if (
      highWatermark !== undefined &&
      (!/^(0|[1-9][0-9]{0,18})$/.test(highWatermark) ||
        BigInt(highWatermark) > MAX_KAFKA_OFFSET ||
        BigInt(highWatermark) < nextOffset)
    ) {
      throw new Error('Invalid Loyalty delivery high watermark');
    }
    return {
      consumerGroup,
      topic,
      partition,
      offset: message.offset,
      nextOffset: nextOffset.toString(),
      ...(highWatermark === undefined ? {} : { highWatermark }),
      fingerprint: createHash('sha256')
        .update(message.value ?? Buffer.alloc(0))
        .digest('hex'),
    };
  }
}
