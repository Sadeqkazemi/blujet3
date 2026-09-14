import { ConflictException, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import type { CartableTaskProjectedEvent } from '../../common/events/ops-admin-events';
import { fingerprintJson } from '../../common/events/event-fingerprint';
import { ErrorCode } from '../../common/errors';
import { OpsAdminCartableEventReceipt } from '../../database/ops-admin-projection-entities/ops-admin-cartable-event-receipt.entity';
import { OpsAdminCartableTaskProjection } from '../../database/ops-admin-projection-entities/ops-admin-cartable-task.entity';
import { OpsAdminKafkaConsumerCheckpoint } from '../../database/ops-admin-projection-entities/ops-admin-kafka-consumer-checkpoint.entity';

export type OpsAdminProjectionResult = 'applied' | 'duplicate' | 'stale';
export type OpsAdminEventDelivery = {
  consumerGroup: string;
  topic: string;
  partition: number;
  nextOffset: string;
  highWatermark?: string;
};
export type OpsAdminCheckpointState = {
  partitions: readonly number[];
  maxLag: string | null;
  lastCheckpointAt: string | null;
};

@Injectable()
export class OpsAdminProjectionStore {
  constructor(private readonly dataSource: DataSource) {}

  project(
    event: CartableTaskProjectedEvent,
    delivery?: OpsAdminEventDelivery,
  ): Promise<OpsAdminProjectionResult> {
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      for (const lock of [
        `event:${event.eventId}`,
        `task:${event.aggregateId}`,
      ].sort()) {
        await manager.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
          [`ops-admin-projection:${lock}`],
        );
      }

      const envelopeFingerprint = fingerprintJson(event);
      const semanticFingerprint = this.semanticFingerprint(event);
      const receipts = manager.getRepository(OpsAdminCartableEventReceipt);
      const existingReceipt = await receipts.findOneBy({
        eventId: event.eventId,
      });
      if (existingReceipt) {
        if (existingReceipt.fingerprint === envelopeFingerprint) {
          await this.saveCheckpoint(manager, delivery);
          return 'duplicate';
        }
        throw new ConflictException({
          code: ErrorCode.IDEMPOTENCY_PAYLOAD_MISMATCH,
          message: 'شناسهٔ رویداد کارتابل با محتوای متفاوت تکرار شده است.',
        });
      }

      const projections = manager.getRepository(OpsAdminCartableTaskProjection);
      const current = await projections.findOneBy({ id: event.aggregateId });
      const currentVersion = current?.taskVersion ?? 0;
      if (event.payload.taskVersion < currentVersion) {
        await this.saveReceipt(manager, event, envelopeFingerprint);
        await this.saveCheckpoint(manager, delivery);
        return 'stale';
      }
      if (event.payload.taskVersion === currentVersion) {
        if (current?.fingerprint !== semanticFingerprint) {
          throw new ConflictException({
            code: ErrorCode.CONFLICT,
            message: 'نسخهٔ رویداد کارتابل با محتوای متفاوت دریافت شده است.',
          });
        }
        await this.saveReceipt(manager, event, envelopeFingerprint);
        await this.saveCheckpoint(manager, delivery);
        return 'duplicate';
      }

      await this.saveReceipt(manager, event, envelopeFingerprint);
      await projections.save(
        projections.create({
          id: event.aggregateId,
          assigneeId: event.payload.assigneeId,
          category: event.payload.category,
          sourceType: event.payload.sourceType,
          sourceId: event.payload.sourceId,
          status: event.payload.status,
          resolvedAt:
            event.payload.resolvedAt === null
              ? null
              : new Date(event.payload.resolvedAt),
          readAt:
            event.payload.readAt === null
              ? null
              : new Date(event.payload.readAt),
          taskVersion: event.payload.taskVersion,
          auditId: event.payload.auditId,
          fingerprint: semanticFingerprint,
          createdAt: new Date(event.payload.createdAt),
        }),
      );
      await this.saveCheckpoint(manager, delivery);
      return 'applied';
    });
  }

  async getCheckpointState(
    consumerGroup: string,
    topic: string,
  ): Promise<OpsAdminCheckpointState> {
    const rows = await this.dataSource
      .getRepository(OpsAdminKafkaConsumerCheckpoint)
      .find({ where: { consumerGroup, topic }, order: { partition: 'ASC' } });
    let maxLag: bigint | null = null;
    let lastCheckpointAt: Date | null = null;
    for (const row of rows) {
      if (row.highWatermark !== null) {
        const observed = BigInt(row.highWatermark) - BigInt(row.nextOffset);
        const lag = observed > 0n ? observed : 0n;
        if (maxLag === null || lag > maxLag) maxLag = lag;
      }
      if (lastCheckpointAt === null || row.updatedAt > lastCheckpointAt)
        lastCheckpointAt = row.updatedAt;
    }
    return {
      partitions: rows.map((row) => row.partition),
      maxLag: maxLag?.toString() ?? null,
      lastCheckpointAt: lastCheckpointAt?.toISOString() ?? null,
    };
  }

  private saveReceipt(
    manager: EntityManager,
    event: CartableTaskProjectedEvent,
    fingerprint: string,
  ): Promise<OpsAdminCartableEventReceipt> {
    const receipts = manager.getRepository(OpsAdminCartableEventReceipt);
    return receipts.save(
      receipts.create({
        eventId: event.eventId,
        fingerprint,
        taskId: event.aggregateId,
        taskVersion: event.payload.taskVersion,
      }),
    );
  }

  private saveCheckpoint(
    manager: EntityManager,
    delivery?: OpsAdminEventDelivery,
  ): Promise<void> {
    if (delivery === undefined) return Promise.resolve();
    return manager
      .query(
        `INSERT INTO "ops"."kafka_consumer_checkpoints"
          ("consumerGroup", "topic", "partition", "nextOffset", "highWatermark")
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT ("consumerGroup", "topic", "partition") DO UPDATE SET
           "nextOffset" = GREATEST(
             "ops"."kafka_consumer_checkpoints"."nextOffset",
             EXCLUDED."nextOffset"
           ),
           "highWatermark" = CASE
             WHEN EXCLUDED."highWatermark" IS NULL
               THEN "ops"."kafka_consumer_checkpoints"."highWatermark"
             WHEN "ops"."kafka_consumer_checkpoints"."highWatermark" IS NULL
               THEN EXCLUDED."highWatermark"
             ELSE GREATEST(
               "ops"."kafka_consumer_checkpoints"."highWatermark",
               EXCLUDED."highWatermark"
             )
           END,
           "updatedAt" = now()`,
        [
          delivery.consumerGroup,
          delivery.topic,
          delivery.partition,
          delivery.nextOffset,
          delivery.highWatermark ?? null,
        ],
      )
      .then(() => undefined);
  }

  private semanticFingerprint(event: CartableTaskProjectedEvent): string {
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
