import { BadRequestException, Injectable } from '@nestjs/common';
import type { Consumer, ConsumerRunConfig } from 'kafkajs';
import { ErrorCode } from '../../common/errors';
import {
  parseKafkaEventDelivery,
  validateKafkaEventSubscription,
} from '../../common/events/kafka-event-message';
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
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(subscription.consumer))
      throw invalid();
    const trusted = {
      consumer: subscription.consumer,
      ...validateKafkaEventSubscription(subscription),
    };
    return {
      autoCommit: false,
      partitionsConsumedConcurrently: 1,
      eachMessage: async (payload) => {
        try {
          const { event, offset } = parseKafkaEventDelivery(trusted, payload);
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
}
