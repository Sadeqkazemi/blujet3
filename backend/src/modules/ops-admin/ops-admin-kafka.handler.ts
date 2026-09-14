import { Inject, Injectable, Optional } from '@nestjs/common';
import type { Consumer, ConsumerRunConfig, EachMessagePayload } from 'kafkajs';
import { createHash } from 'node:crypto';
import {
  parseKafkaEventDelivery,
  validateKafkaEventSubscription,
} from '../../common/events/kafka-event-message';
import {
  OPS_ADMIN_DLQ_CONFIG,
  type OpsAdminDlqConfig,
} from '../../config/ops-admin-dlq.config';
import {
  OpsAdminKafkaFailureStage,
  type OpsAdminKafkaFailureStage as OpsAdminFailureStage,
} from '../../database/ops-admin-projection-entities/ops-admin-kafka-processing-failure.entity';
import {
  type OpsAdminFailedDelivery,
  OpsAdminDlqStore,
} from './ops-admin-dlq.store';
import { OpsAdminProjectionConsumer } from './ops-admin-projection.consumer';

export interface OpsAdminKafkaSubscription {
  topic: string;
  maxBytes?: number;
  consumerGroup?: string;
  requireSchemaId?: boolean;
}

const MAX_KAFKA_OFFSET = 9_223_372_036_854_775_807n;

@Injectable()
export class OpsAdminKafkaHandler {
  constructor(
    private readonly opsAdmin: OpsAdminProjectionConsumer,
    @Optional() private readonly dlq?: OpsAdminDlqStore,
    @Optional()
    @Inject(OPS_ADMIN_DLQ_CONFIG)
    private readonly dlqConfig?: OpsAdminDlqConfig,
  ) {}

  runConfig(
    client: Pick<Consumer, 'commitOffsets'>,
    subscription: OpsAdminKafkaSubscription,
  ): ConsumerRunConfig {
    const dlqConfig = this.dlqConfig ?? ({ enabled: false } as const);
    const consumerGroup = subscription.consumerGroup;
    if (
      consumerGroup !== undefined &&
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(consumerGroup)
    )
      throw new Error('Invalid Ops/Admin Kafka consumer group');
    if (dlqConfig.enabled && (consumerGroup === undefined || !this.dlq)) {
      throw new Error('Ops/Admin DLQ requires a consumer group and store');
    }
    const trusted = validateKafkaEventSubscription({
      ...subscription,
      expectedProducer: 'core-ops',
    });
    return {
      autoCommit: false,
      partitionsConsumedConcurrently: 1,
      eachMessage: async (payload) => {
        let failedDelivery: OpsAdminFailedDelivery | undefined;
        let eventId: string | null = null;
        let stage: OpsAdminFailureStage = OpsAdminKafkaFailureStage.TRANSPORT;
        let deliveryPersisted = false;
        let recordFailure = false;
        try {
          if (dlqConfig.enabled) {
            failedDelivery = this.describeDelivery(
              consumerGroup!,
              trusted.topic,
              payload,
            );
            const action = await this.dlq!.actionFor(failedDelivery);
            if (action === 'block') {
              throw new Error('Ops/Admin delivery is quarantined');
            }
            if (action === 'skip') {
              await payload.heartbeat();
              await this.dlq!.markSkipped(failedDelivery);
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
          const { event, offset, highWatermark } = parseKafkaEventDelivery(
            trusted,
            payload,
          );
          eventId = event.eventId;
          if (
            highWatermark !== undefined &&
            BigInt(highWatermark) < BigInt(offset.offset)
          )
            throw new Error('Invalid Ops/Admin Kafka high watermark');
          await payload.heartbeat();
          stage = OpsAdminKafkaFailureStage.PROJECTION;
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
          deliveryPersisted = true;
          if (failedDelivery) await this.dlq!.markResolved(failedDelivery);
          await payload.heartbeat();
          await client.commitOffsets([offset]);
        } catch {
          if (
            dlqConfig.enabled &&
            failedDelivery &&
            recordFailure &&
            !deliveryPersisted
          ) {
            try {
              await this.dlq!.recordFailure(
                failedDelivery,
                stage,
                eventId,
                dlqConfig.maxAttempts,
              );
            } catch {
              // Keep processing fail-closed if the failure registry is down.
            }
          }
          // KafkaJS may log handler errors. Never expose event or database data.
          throw new Error('Ops/Admin Kafka processing failed');
        }
      },
    };
  }

  private describeDelivery(
    consumerGroup: string,
    trustedTopic: string,
    payload: EachMessagePayload,
  ): OpsAdminFailedDelivery {
    const { topic, partition, message } = payload;
    if (
      topic !== trustedTopic ||
      !Number.isSafeInteger(partition) ||
      partition < 0 ||
      !/^(0|[1-9][0-9]{0,18})$/.test(message.offset) ||
      BigInt(message.offset) >= MAX_KAFKA_OFFSET
    ) {
      throw new Error('Invalid Ops/Admin delivery coordinates');
    }
    const nextOffset = BigInt(message.offset) + 1n;
    const highWatermarkCandidate =
      'highWatermark' in message ? message.highWatermark : undefined;
    if (
      highWatermarkCandidate !== undefined &&
      typeof highWatermarkCandidate !== 'string'
    ) {
      throw new Error('Invalid Ops/Admin delivery high watermark');
    }
    const highWatermark = highWatermarkCandidate;
    if (
      highWatermark !== undefined &&
      (!/^(0|[1-9][0-9]{0,18})$/.test(highWatermark) ||
        BigInt(highWatermark) > MAX_KAFKA_OFFSET ||
        BigInt(highWatermark) < nextOffset)
    ) {
      throw new Error('Invalid Ops/Admin delivery high watermark');
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
