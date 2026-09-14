import { Injectable } from '@nestjs/common';
import type { Consumer, ConsumerRunConfig } from 'kafkajs';
import {
  parseKafkaEventDelivery,
  validateKafkaEventSubscription,
} from '../../common/events/kafka-event-message';
import { OpsAdminProjectionConsumer } from './ops-admin-projection.consumer';

export interface OpsAdminKafkaSubscription {
  topic: string;
  maxBytes?: number;
  consumerGroup?: string;
  requireSchemaId?: boolean;
}

@Injectable()
export class OpsAdminKafkaHandler {
  constructor(private readonly opsAdmin: OpsAdminProjectionConsumer) {}

  runConfig(
    client: Pick<Consumer, 'commitOffsets'>,
    subscription: OpsAdminKafkaSubscription,
  ): ConsumerRunConfig {
    const consumerGroup = subscription.consumerGroup;
    if (
      consumerGroup !== undefined &&
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(consumerGroup)
    )
      throw new Error('Invalid Ops/Admin Kafka consumer group');
    const trusted = validateKafkaEventSubscription({
      ...subscription,
      expectedProducer: 'core-ops',
    });
    return {
      autoCommit: false,
      partitionsConsumedConcurrently: 1,
      eachMessage: async (payload) => {
        try {
          const { event, offset, highWatermark } = parseKafkaEventDelivery(
            trusted,
            payload,
          );
          if (
            highWatermark !== undefined &&
            BigInt(highWatermark) < BigInt(offset.offset)
          )
            throw new Error('Invalid Ops/Admin Kafka high watermark');
          await payload.heartbeat();
          if (consumerGroup === undefined) {
            await this.opsAdmin.consume(event);
          } else {
            await this.opsAdmin.consume(event, {
              consumerGroup,
              topic: offset.topic,
              partition: offset.partition,
              nextOffset: offset.offset,
              highWatermark,
            });
          }
          await payload.heartbeat();
          await client.commitOffsets([offset]);
        } catch {
          // KafkaJS may log handler errors. Never expose event or database data.
          throw new Error('Ops/Admin Kafka processing failed');
        }
      },
    };
  }
}
