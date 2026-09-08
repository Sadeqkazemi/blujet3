import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { CoreItineraryEvent } from '../../common/events/core-itinerary-events';
import { fingerprintJson } from '../../common/events/event-fingerprint';
import { ErrorCode } from '../../common/errors';
import { ReportingItineraryEventProjection } from '../../database/entities/reporting-itinerary-event-projection.entity';
import { ReportingItineraryEventReceipt } from '../../database/entities/reporting-itinerary-event-receipt.entity';
import { ReportingKafkaConsumerCheckpoint } from '../../database/entities/reporting-kafka-consumer-checkpoint.entity';
import type { JsonValue } from '../../database/json-types';
import type {
  ReportingProjectionResult,
  ReportingCheckpointSummary,
  ReportingEventDelivery,
  ReportingReadModelSink,
} from './reporting-event-consumer';

@Injectable()
export class ReportingItineraryProjectionStore implements ReportingReadModelSink {
  constructor(
    @InjectRepository(ReportingItineraryEventProjection)
    private readonly projections: Repository<ReportingItineraryEventProjection>,
    @InjectRepository(ReportingItineraryEventReceipt)
    private readonly receipts: Repository<ReportingItineraryEventReceipt>,
    @InjectRepository(ReportingKafkaConsumerCheckpoint)
    private readonly checkpoints: Repository<ReportingKafkaConsumerCheckpoint>,
  ) {}

  project(
    event: CoreItineraryEvent,
    delivery?: ReportingEventDelivery,
  ): Promise<ReportingProjectionResult> {
    return this.projections.manager.transaction(
      'READ COMMITTED',
      async (tx) => {
        const slot = `${event.aggregateId}:${event.eventType}`;
        for (const lock of [`event:${event.eventId}`, `slot:${slot}`].sort()) {
          await tx.query(
            'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
            [`reporting-itinerary:${lock}`],
          );
        }
        const repository = tx.getRepository(ReportingItineraryEventProjection);
        const receiptRepository = tx.getRepository(
          ReportingItineraryEventReceipt,
        );
        const eventFingerprint = fingerprintJson(event);
        const semanticFingerprint = this.semanticFingerprint(event);
        const existingReceipt = await receiptRepository.findOneBy({
          eventId: event.eventId,
        });
        if (existingReceipt) {
          if (existingReceipt.fingerprint === eventFingerprint) {
            await this.saveCheckpoint(
              tx.getRepository(ReportingKafkaConsumerCheckpoint),
              delivery,
            );
            return 'duplicate';
          }
          throw new ConflictException({
            code: ErrorCode.IDEMPOTENCY_PAYLOAD_MISMATCH,
            message: 'شناسه رویداد گزارش با محتوای متفاوت تکرار شده است.',
          });
        }
        const current = await repository
          .createQueryBuilder('projection')
          .where('projection.orderId = :orderId', {
            orderId: event.aggregateId,
          })
          .andWhere('projection.eventType = :eventType', {
            eventType: event.eventType,
          })
          .getOne();
        if (current) {
          if (event.payload.orderVersion < current.orderVersion) {
            await this.saveReceipt(receiptRepository, event, eventFingerprint);
            await this.saveCheckpoint(
              tx.getRepository(ReportingKafkaConsumerCheckpoint),
              delivery,
            );
            return 'stale';
          }
          if (event.payload.orderVersion === current.orderVersion) {
            if (current.fingerprint === semanticFingerprint) {
              await this.saveReceipt(
                receiptRepository,
                event,
                eventFingerprint,
              );
              await this.saveCheckpoint(
                tx.getRepository(ReportingKafkaConsumerCheckpoint),
                delivery,
              );
              return 'duplicate';
            }
            throw new ConflictException({
              code: ErrorCode.CONFLICT,
              message: 'نسخه رویداد گزارش با محتوای متفاوت دریافت شده است.',
            });
          }
        }
        await this.saveReceipt(receiptRepository, event, eventFingerprint);
        await repository.save(
          repository.create({
            orderId: event.aggregateId,
            eventType: event.eventType,
            eventId: event.eventId,
            fingerprint: semanticFingerprint,
            orderVersion: event.payload.orderVersion,
            currency: event.payload.currency,
            payload: JSON.parse(JSON.stringify(event.payload)) as JsonValue,
            occurredAt: new Date(event.occurredAt),
          }),
        );
        await this.saveCheckpoint(
          tx.getRepository(ReportingKafkaConsumerCheckpoint),
          delivery,
        );
        return 'applied';
      },
    );
  }

  async getCheckpointSummary(
    consumerGroup: string,
    topic: string,
  ): Promise<ReportingCheckpointSummary> {
    const rows = await this.checkpoints.find({
      where: { consumerGroup, topic },
    });
    let maxLag: bigint | null = null;
    let lastCheckpointAt: Date | null = null;
    for (const row of rows) {
      if (row.highWatermark !== null) {
        const lag = BigInt(row.highWatermark) - BigInt(row.nextOffset);
        const safeLag = lag > 0n ? lag : 0n;
        if (maxLag === null || safeLag > maxLag) maxLag = safeLag;
      }
      if (lastCheckpointAt === null || row.updatedAt > lastCheckpointAt)
        lastCheckpointAt = row.updatedAt;
    }
    return {
      partitions: rows.length,
      maxLag: maxLag?.toString() ?? null,
      lastCheckpointAt: lastCheckpointAt?.toISOString() ?? null,
    };
  }

  private saveReceipt(
    repository: Repository<ReportingItineraryEventReceipt>,
    event: CoreItineraryEvent,
    fingerprint: string,
  ): Promise<ReportingItineraryEventReceipt> {
    return repository.save(
      repository.create({
        eventId: event.eventId,
        fingerprint,
        orderId: event.aggregateId,
        eventType: event.eventType,
        orderVersion: event.payload.orderVersion,
      }),
    );
  }

  private saveCheckpoint(
    repository: Repository<ReportingKafkaConsumerCheckpoint>,
    delivery?: ReportingEventDelivery,
  ): Promise<void> {
    if (delivery === undefined) return Promise.resolve();
    const highWatermark = delivery.highWatermark ?? null;
    return repository
      .query(
        `INSERT INTO "reporting"."kafka_consumer_checkpoints"
        ("consumerGroup", "topic", "partition", "nextOffset", "highWatermark")
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT ("consumerGroup", "topic", "partition") DO UPDATE SET
         "nextOffset" = GREATEST(
           "reporting"."kafka_consumer_checkpoints"."nextOffset",
           EXCLUDED."nextOffset"
         ),
         "highWatermark" = CASE
           WHEN EXCLUDED."highWatermark" IS NULL
             THEN "reporting"."kafka_consumer_checkpoints"."highWatermark"
           WHEN "reporting"."kafka_consumer_checkpoints"."highWatermark" IS NULL
             THEN EXCLUDED."highWatermark"
           ELSE GREATEST(
             "reporting"."kafka_consumer_checkpoints"."highWatermark",
             EXCLUDED."highWatermark"
           )
         END,
         "updatedAt" = now()`,
        [
          delivery.consumerGroup,
          delivery.topic,
          delivery.partition,
          delivery.nextOffset,
          highWatermark,
        ],
      )
      .then(() => undefined);
  }

  private semanticFingerprint(event: CoreItineraryEvent): string {
    return fingerprintJson({
      producer: event.producer,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      eventType: event.eventType,
      eventVersion: event.eventVersion,
      payload: event.payload,
    });
  }
}
