import { Inject, Injectable } from '@nestjs/common';
import type { Consumer, ConsumerRunConfig } from 'kafkajs';
import { createHash } from 'node:crypto';
import {
  parseKafkaEventDelivery,
  validateKafkaEventSubscription,
} from '../../common/events/kafka-event-message';
import {
  REPORTING_DLQ_CONFIG,
  type ReportingDlqConfig,
} from '../../config/reporting-dlq.config';
import {
  ReportingKafkaFailureStage,
  type ReportingKafkaFailureStage as ReportingFailureStage,
} from '../../database/entities/reporting-kafka-processing-failure.entity';
import {
  type ReportingFailedDelivery,
  ReportingDlqStore,
} from './reporting-dlq.store';
import { ReportingEventConsumer } from './reporting-event-consumer';

export interface ReportingKafkaSubscription {
  topic: string;
  maxBytes?: number;
  consumerGroup?: string;
  requireSchemaId?: boolean;
}

@Injectable()
export class ReportingKafkaHandler {
  constructor(
    private readonly reporting: ReportingEventConsumer,
    private readonly dlq: ReportingDlqStore,
    @Inject(REPORTING_DLQ_CONFIG)
    private readonly dlqConfig: ReportingDlqConfig,
  ) {}

  runConfig(
    client: Pick<Consumer, 'commitOffsets'>,
    subscription: ReportingKafkaSubscription,
  ): ConsumerRunConfig {
    const trusted = validateKafkaEventSubscription({
      ...subscription,
      expectedProducer: 'core-commerce',
    });
    if (this.dlqConfig.enabled && subscription.consumerGroup === undefined) {
      throw new Error('Reporting DLQ requires a consumer group');
    }
    return {
      autoCommit: false,
      partitionsConsumedConcurrently: 1,
      eachMessage: async (payload) => {
        let delivery: ReportingFailedDelivery | undefined;
        let eventId: string | null = null;
        let stage: ReportingFailureStage = ReportingKafkaFailureStage.TRANSPORT;
        let projectionCompleted = false;
        let recordFailure = false;
        try {
          if (this.dlqConfig.enabled) {
            delivery = this.describeDelivery(
              subscription.consumerGroup!,
              trusted.topic,
              payload,
            );
            const action = await this.dlq.actionFor(delivery);
            if (action === 'block') {
              throw new Error('Reporting delivery is quarantined');
            }
            if (action === 'skip') {
              await payload.heartbeat();
              await this.dlq.markSkipped(delivery);
              await payload.heartbeat();
              await client.commitOffsets([
                {
                  topic: delivery.topic,
                  partition: delivery.partition,
                  offset: delivery.nextOffset,
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
          await payload.heartbeat();
          stage = ReportingKafkaFailureStage.PROJECTION;
          await this.reporting.consume(
            event,
            subscription.consumerGroup === undefined
              ? undefined
              : {
                  consumerGroup: subscription.consumerGroup,
                  topic: offset.topic,
                  partition: offset.partition,
                  nextOffset: offset.offset,
                  highWatermark,
                },
          );
          projectionCompleted = true;
          if (delivery) await this.dlq.markResolved(delivery);
          await payload.heartbeat();
          await client.commitOffsets([offset]);
        } catch {
          if (
            this.dlqConfig.enabled &&
            delivery &&
            recordFailure &&
            !projectionCompleted
          ) {
            try {
              await this.dlq.recordFailure(
                delivery,
                stage,
                eventId,
                this.dlqConfig.maxAttempts,
              );
            } catch {
              // Preserve the sanitized consumer contract if quarantine storage fails.
            }
          }
          // KafkaJS may log handler errors. Never expose event or database data.
          throw new Error('Reporting Kafka processing failed');
        }
      },
    };
  }

  private describeDelivery(
    consumerGroup: string,
    trustedTopic: string,
    payload: Parameters<NonNullable<ConsumerRunConfig['eachMessage']>>[0],
  ): ReportingFailedDelivery {
    const { topic, partition, message } = payload;
    if (
      topic !== trustedTopic ||
      !Number.isSafeInteger(partition) ||
      partition < 0 ||
      !/^(0|[1-9][0-9]{0,18})$/.test(message.offset) ||
      BigInt(message.offset) >= 9223372036854775807n
    ) {
      throw new Error('Invalid Reporting delivery coordinates');
    }
    const highWatermarkCandidate =
      'highWatermark' in message ? message.highWatermark : undefined;
    if (
      highWatermarkCandidate !== undefined &&
      typeof highWatermarkCandidate !== 'string'
    ) {
      throw new Error('Invalid Reporting delivery high watermark');
    }
    const highWatermark = highWatermarkCandidate;
    if (
      highWatermark !== undefined &&
      (!/^(0|[1-9][0-9]{0,18})$/.test(highWatermark) ||
        BigInt(highWatermark) > 9223372036854775807n)
    ) {
      throw new Error('Invalid Reporting delivery high watermark');
    }
    return {
      consumerGroup,
      topic,
      partition,
      offset: message.offset,
      nextOffset: (BigInt(message.offset) + 1n).toString(),
      highWatermark,
      fingerprint: createHash('sha256')
        .update(message.value ?? Buffer.alloc(0))
        .digest('hex'),
    };
  }
}
