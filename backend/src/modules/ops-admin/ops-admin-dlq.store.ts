import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { ErrorCode } from '../../common/errors';
import {
  OpsAdminKafkaFailureStatus,
  type OpsAdminKafkaFailureStage,
  OpsAdminKafkaProcessingFailure,
} from '../../database/ops-admin-projection-entities/ops-admin-kafka-processing-failure.entity';

export type OpsAdminFailedDelivery = {
  consumerGroup: string;
  topic: string;
  partition: number;
  offset: string;
  nextOffset: string;
  highWatermark?: string;
  fingerprint: string;
};

export type OpsAdminFailureAction = 'process' | 'block' | 'skip';
export type OpsAdminOperatorDecision = 'retry' | 'skip';

@Injectable()
export class OpsAdminDlqStore {
  constructor(private readonly dataSource: DataSource) {}

  async actionFor(
    delivery: OpsAdminFailedDelivery,
  ): Promise<OpsAdminFailureAction> {
    const row = await this.dataSource
      .getRepository(OpsAdminKafkaProcessingFailure)
      .findOneBy({
        consumerGroup: delivery.consumerGroup,
        topic: delivery.topic,
        partition: delivery.partition,
        offset: delivery.offset,
      });
    if (!row) return 'process';
    this.assertFingerprint(row, delivery);
    if (row.status === OpsAdminKafkaFailureStatus.QUARANTINED) return 'block';
    if (
      row.status === OpsAdminKafkaFailureStatus.SKIP_APPROVED ||
      row.status === OpsAdminKafkaFailureStatus.SKIPPED
    ) {
      return 'skip';
    }
    return 'process';
  }

  recordFailure(
    delivery: OpsAdminFailedDelivery,
    stage: OpsAdminKafkaFailureStage,
    eventId: string | null,
    maxAttempts: number,
  ): Promise<'retry' | 'quarantined'> {
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [
          `ops-admin-dlq:${delivery.consumerGroup}:${delivery.topic}:${delivery.partition}:${delivery.offset}`,
        ],
      );
      const repository = manager.getRepository(OpsAdminKafkaProcessingFailure);
      const existing = await repository.findOneBy({
        consumerGroup: delivery.consumerGroup,
        topic: delivery.topic,
        partition: delivery.partition,
        offset: delivery.offset,
      });
      if (existing) this.assertFingerprint(existing, delivery);
      if (existing?.status === OpsAdminKafkaFailureStatus.QUARANTINED) {
        return 'quarantined';
      }

      const now = new Date();
      const startsNewCycle =
        existing?.status === OpsAdminKafkaFailureStatus.RETRY_APPROVED ||
        existing?.status === OpsAdminKafkaFailureStatus.RESOLVED;
      const attempts = startsNewCycle ? 1 : (existing?.attempts ?? 0) + 1;
      const totalAttempts = (existing?.totalAttempts ?? 0) + 1;
      const quarantined = attempts >= maxAttempts;
      const row =
        existing ??
        repository.create({
          id: randomUUID(),
          consumerGroup: delivery.consumerGroup,
          topic: delivery.topic,
          partition: delivery.partition,
          offset: delivery.offset,
          fingerprint: delivery.fingerprint,
          firstFailedAt: now,
        });
      row.eventId ??= eventId;
      row.stage = stage;
      row.attempts = attempts;
      row.totalAttempts = totalAttempts;
      row.status = quarantined
        ? OpsAdminKafkaFailureStatus.QUARANTINED
        : OpsAdminKafkaFailureStatus.RETRYING;
      row.lastFailedAt = now;
      row.quarantinedAt = quarantined ? now : null;
      row.resolvedAt = null;
      await repository.save(row);
      return quarantined ? 'quarantined' : 'retry';
    });
  }

  async markResolved(delivery: OpsAdminFailedDelivery): Promise<void> {
    await this.dataSource
      .getRepository(OpsAdminKafkaProcessingFailure)
      .createQueryBuilder()
      .update()
      .set({
        status: OpsAdminKafkaFailureStatus.RESOLVED,
        resolvedAt: new Date(),
      })
      .where('"consumerGroup" = :consumerGroup', delivery)
      .andWhere('topic = :topic', delivery)
      .andWhere('partition = :partition', delivery)
      .andWhere('offset = :offset', delivery)
      .andWhere('fingerprint = :fingerprint', delivery)
      .andWhere('status <> :terminal', {
        terminal: OpsAdminKafkaFailureStatus.SKIPPED,
      })
      .execute();
  }

  markSkipped(delivery: OpsAdminFailedDelivery): Promise<void> {
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const result = await manager
        .getRepository(OpsAdminKafkaProcessingFailure)
        .createQueryBuilder()
        .update()
        .set({
          status: OpsAdminKafkaFailureStatus.SKIPPED,
          resolvedAt: new Date(),
        })
        .where('"consumerGroup" = :consumerGroup', delivery)
        .andWhere('topic = :topic', delivery)
        .andWhere('partition = :partition', delivery)
        .andWhere('offset = :offset', delivery)
        .andWhere('fingerprint = :fingerprint', delivery)
        .andWhere('status IN (:...approved)', {
          approved: [
            OpsAdminKafkaFailureStatus.SKIP_APPROVED,
            OpsAdminKafkaFailureStatus.SKIPPED,
          ],
        })
        .execute();
      if (result.affected !== 1) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message: 'مجوز ردکردن پیام کارتابل معتبر نیست.',
        });
      }
      await manager.query(
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
      );
    });
  }

  async list(status: OpsAdminKafkaFailureStatus, limit: number) {
    const rows = await this.dataSource
      .getRepository(OpsAdminKafkaProcessingFailure)
      .find({
        where: { status },
        order: { lastFailedAt: 'ASC', id: 'ASC' },
        take: limit,
      });
    return rows.map((row) => this.safe(row));
  }

  approve(
    id: string,
    decision: OpsAdminOperatorDecision,
    operatorId: string,
    reason: string,
  ) {
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const repository = manager.getRepository(OpsAdminKafkaProcessingFailure);
      const row = await repository
        .createQueryBuilder('failure')
        .setLock('pessimistic_write')
        .where('failure.id = :id', { id })
        .getOne();
      if (!row) {
        throw new NotFoundException({
          code: ErrorCode.NOT_FOUND,
          message: 'رکورد قرنطینهٔ کارتابل یافت نشد.',
        });
      }
      if (row.status !== OpsAdminKafkaFailureStatus.QUARANTINED) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message: 'رکورد در وضعیت قابل تصمیم‌گیری نیست.',
        });
      }
      row.status =
        decision === 'retry'
          ? OpsAdminKafkaFailureStatus.RETRY_APPROVED
          : OpsAdminKafkaFailureStatus.SKIP_APPROVED;
      row.approvedBy = operatorId;
      row.approvalReason = reason;
      row.approvedAt = new Date();
      await repository.save(row);
      return this.safe(row);
    });
  }

  countQuarantined(): Promise<number> {
    return this.dataSource
      .getRepository(OpsAdminKafkaProcessingFailure)
      .countBy({ status: OpsAdminKafkaFailureStatus.QUARANTINED });
  }

  private assertFingerprint(
    row: OpsAdminKafkaProcessingFailure,
    delivery: OpsAdminFailedDelivery,
  ): void {
    if (row.fingerprint !== delivery.fingerprint) {
      throw new ConflictException({
        code: ErrorCode.IDEMPOTENCY_PAYLOAD_MISMATCH,
        message: 'اثر انگشت پیام کارتابل برای offset یکسان متفاوت است.',
      });
    }
  }

  private safe(row: OpsAdminKafkaProcessingFailure) {
    return {
      id: row.id,
      fingerprint: row.fingerprint,
      eventId: row.eventId,
      stage: row.stage,
      attempts: row.attempts,
      totalAttempts: row.totalAttempts,
      status: row.status,
      firstFailedAt: row.firstFailedAt.toISOString(),
      lastFailedAt: row.lastFailedAt.toISOString(),
      quarantinedAt: row.quarantinedAt?.toISOString() ?? null,
      approvedAt: row.approvedAt?.toISOString() ?? null,
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
    };
  }
}
