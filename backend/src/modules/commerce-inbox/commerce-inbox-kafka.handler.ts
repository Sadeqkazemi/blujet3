import { BadRequestException, Injectable } from '@nestjs/common';
import { TextDecoder } from 'node:util';
import type {
  Consumer,
  ConsumerRunConfig,
  EachMessagePayload,
  KafkaMessage,
} from 'kafkajs';
import { ErrorCode } from '../../common/errors';
import {
  isCanonicalEvent,
  type CanonicalEvent,
} from '../../common/events/canonical-events';
import { CommerceInboxService } from './commerce-inbox.service';

export interface CommerceInboxKafkaSubscription {
  topic: string;
  consumer: string;
  expectedProducer: string;
  maxBytes?: number;
}

export type CommerceInboxKafkaApply = Parameters<
  CommerceInboxService['consume']
>[3];

function header(message: KafkaMessage, name: string): string | undefined {
  const value = message.headers?.[name];
  if (value === undefined) return undefined;
  if (Array.isArray(value) || !Buffer.isBuffer(value)) return undefined;
  return new TextDecoder('utf-8', { fatal: true }).decode(value);
}

function invalid(): BadRequestException {
  return new BadRequestException({
    code: ErrorCode.VALIDATION_FAILED,
    message: 'پیام Kafka معتبر نیست.',
  });
}

@Injectable()
export class CommerceInboxKafkaHandler {
  constructor(private readonly inbox: CommerceInboxService) {}

  runConfig(
    client: Pick<Consumer, 'commitOffsets'>,
    subscription: CommerceInboxKafkaSubscription,
    apply: CommerceInboxKafkaApply,
  ): ConsumerRunConfig {
    const maxBytes = subscription.maxBytes ?? 256 * 1024;
    if (
      !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(subscription.consumer) ||
      !/^[a-zA-Z0-9._-]{1,249}$/.test(subscription.topic) ||
      ['.', '..'].includes(subscription.topic) ||
      !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(
        subscription.expectedProducer,
      ) ||
      !Number.isSafeInteger(maxBytes) ||
      maxBytes < 1 ||
      maxBytes > 256 * 1024
    )
      throw invalid();
    const trusted = { ...subscription, maxBytes };
    return {
      autoCommit: false,
      partitionsConsumedConcurrently: 1,
      eachMessage: async (payload) => {
        try {
          const event = this.parse(trusted, payload);
          const offset = {
            topic: payload.topic,
            partition: payload.partition,
            offset: (BigInt(payload.message.offset) + 1n).toString(),
          };
          await payload.heartbeat();
          await this.inbox.consume(
            trusted.consumer,
            trusted.expectedProducer,
            event,
            apply,
          );
          await payload.heartbeat();
          await client.commitOffsets([offset]);
        } catch {
          // KafkaJS may log handler errors. Never expose driver errors or event data.
          throw new Error('Kafka inbox processing failed');
        }
      },
    };
  }

  private parse(
    subscription: CommerceInboxKafkaSubscription,
    payload: EachMessagePayload,
  ): CanonicalEvent {
    const message = payload.message;
    if (
      payload.topic !== subscription.topic ||
      !message.value ||
      !Number.isSafeInteger(payload.partition) ||
      payload.partition < 0 ||
      !/^(0|[1-9][0-9]{0,18})$/.test(message.offset) ||
      BigInt(message.offset) >= 9223372036854775807n
    )
      throw invalid();
    if (message.value.length > (subscription.maxBytes ?? 256 * 1024))
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
    const expectedKey = `${parsed.producer}:${parsed.aggregateType}:${parsed.aggregateId}`;
    if (!message.key?.equals(Buffer.from(expectedKey, 'utf8'))) throw invalid();
    if (
      header(message, 'event-id') !== parsed.eventId ||
      header(message, 'correlation-id') !== parsed.correlationId ||
      header(message, 'event-version') !== '1'
    )
      throw invalid();
    return parsed;
  }
}
