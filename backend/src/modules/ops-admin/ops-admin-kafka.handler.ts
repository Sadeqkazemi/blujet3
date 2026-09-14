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
  requireSchemaId?: boolean;
}

@Injectable()
export class OpsAdminKafkaHandler {
  constructor(private readonly opsAdmin: OpsAdminProjectionConsumer) {}

  runConfig(
    client: Pick<Consumer, 'commitOffsets'>,
    subscription: OpsAdminKafkaSubscription,
  ): ConsumerRunConfig {
    const trusted = validateKafkaEventSubscription({
      ...subscription,
      expectedProducer: 'core-ops',
    });
    return {
      autoCommit: false,
      partitionsConsumedConcurrently: 1,
      eachMessage: async (payload) => {
        try {
          const { event, offset } = parseKafkaEventDelivery(trusted, payload);
          await payload.heartbeat();
          await this.opsAdmin.consume(event);
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
