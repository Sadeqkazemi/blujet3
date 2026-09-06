import { Injectable } from '@nestjs/common';
import type { Consumer, ConsumerRunConfig } from 'kafkajs';
import {
  parseKafkaEventDelivery,
  validateKafkaEventSubscription,
} from '../../common/events/kafka-event-message';
import { ReportingEventConsumer } from './reporting-event-consumer';

export interface ReportingKafkaSubscription {
  topic: string;
  maxBytes?: number;
}

@Injectable()
export class ReportingKafkaHandler {
  constructor(private readonly reporting: ReportingEventConsumer) {}

  runConfig(
    client: Pick<Consumer, 'commitOffsets'>,
    subscription: ReportingKafkaSubscription,
  ): ConsumerRunConfig {
    const trusted = validateKafkaEventSubscription({
      ...subscription,
      expectedProducer: 'core-commerce',
    });
    return {
      autoCommit: false,
      partitionsConsumedConcurrently: 1,
      eachMessage: async (payload) => {
        try {
          const { event, offset } = parseKafkaEventDelivery(trusted, payload);
          await payload.heartbeat();
          await this.reporting.consume(event);
          await payload.heartbeat();
          await client.commitOffsets([offset]);
        } catch {
          // KafkaJS may log handler errors. Never expose event or database data.
          throw new Error('Reporting Kafka processing failed');
        }
      },
    };
  }
}
