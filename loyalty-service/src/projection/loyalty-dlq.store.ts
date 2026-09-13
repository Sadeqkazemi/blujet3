import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { ErrorCode } from '../common/errors';
import {
  LoyaltyKafkaFailureStatus,
  type LoyaltyKafkaFailureStage,
  LoyaltyKafkaProcessingFailure,
} from '../database/entities/loyalty-kafka-processing-failure.entity';

export type LoyaltyFailedDelivery = {
  consumerGroup: string;
  topic: string;
  partition: number;
  offset: string;
  nextOffset: string;
  highWatermark?: string;
  fingerprint: string;
};

export type LoyaltyFailureAction = 'process' | 'block' | 'skip';
export type LoyaltyOperatorDecision = 'retry' | 'skip';

@Injectable()
export class LoyaltyDlqStore {
  constructor(private readonly dataSource: DataSource) {}

  async actionFor(
    delivery: LoyaltyFailedDelivery,
  ): Promise<LoyaltyFailureAction> {
    const row = await this.dataSource
      .getRepository(LoyaltyKafkaProcessingFailure)
      .findOneBy({
        consumerGroup: delivery.consumerGroup,
        topic: delivery.topic,
        partition: delivery.partition,
        offset: delivery.offset,
      });
    if (!row) return 'process';
    this.assertFingerprint(row, delivery);
    if (row.status === LoyaltyKafkaFailureStatus.QUARANTINED) return 'block';
    if (
      row.status === LoyaltyKafkaFailureStatus.SKIP_APPROVED ||
      row.status === LoyaltyKafkaFailureStatus.SKIPPED
    ) {
      return 'skip';
    }
    return 'process';
  }

  recordFailure(
    delivery: LoyaltyFailedDelivery,
    stage: LoyaltyKafkaFailureStage,
    eventId: string | null,
    maxAttempts: number,
  ): Promise<'retry' | 'quarantined'> {
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [
          `loyalty-dlq:${delivery.consumerGroup}:${delivery.topic}:${delivery.partition}:${delivery.offset}`,
        ],
      );
      const repository = manager.getRepository(LoyaltyKafkaProcessingFailure);
      const existing = await repository.findOneBy({
        consumerGroup: delivery.consumerGroup,
        topic: delivery.topic,
        partition: delivery.partition,
        offset: delivery.offset,
      });
      if (existing) this.assertFingerprint(existing, delivery);
      if (existing?.status === LoyaltyKafkaFailureStatus.QUARANTINED) {
        return 'quarantined';
      }

      const now = new Date();
      const attempts =
        existing?.status === LoyaltyKafkaFailureStatus.RETRY_APPROVED
          ? 1
          : (existing?.attempts ?? 0) + 1;
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
        ? LoyaltyKafkaFailureStatus.QUARANTINED
        : LoyaltyKafkaFailureStatus.RETRYING;
      row.lastFailedAt = now;
      row.quarantinedAt = quarantined ? now : null;
      row.approvedBy = null;
      row.approvalReason = null;
      row.approvedAt = null;
      row.resolvedAt = null;
      await repository.save(row);
      return quarantined ? 'quarantined' : 'retry';
    });
  }

  async markResolved(delivery: LoyaltyFailedDelivery): Promise<void> {
    await this.dataSource
      .getRepository(LoyaltyKafkaProcessingFailure)
      .createQueryBuilder()
      .update()
      .set({
        status: LoyaltyKafkaFailureStatus.RESOLVED,
        resolvedAt: new Date(),
      })
      .where('"consumerGroup" = :consumerGroup', delivery)
      .andWhere('topic = :topic', delivery)
      .andWhere('partition = :partition', delivery)
      .andWhere('offset = :offset', delivery)
      .andWhere('fingerprint = :fingerprint', delivery)
      .andWhere('status <> :terminal', {
        terminal: LoyaltyKafkaFailureStatus.SKIPPED,
      })
      .execute();
  }

  markSkipped(delivery: LoyaltyFailedDelivery): Promise<void> {
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const result = await manager
        .getRepository(LoyaltyKafkaProcessingFailure)
        .createQueryBuilder()
        .update()
        .set({
          status: LoyaltyKafkaFailureStatus.SKIPPED,
          resolvedAt: new Date(),
        })
        .where('"consumerGroup" = :consumerGroup', delivery)
        .andWhere('topic = :topic', delivery)
        .andWhere('partition = :partition', delivery)
        .andWhere('offset = :offset', delivery)
        .andWhere('fingerprint = :fingerprint', delivery)
        .andWhere('status IN (:...approved)', {
          approved: [
            LoyaltyKafkaFailureStatus.SKIP_APPROVED,
            LoyaltyKafkaFailureStatus.SKIPPED,
          ],
        })
        .execute();
      if (result.affected !== 1) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message: 'مجوز ردکردن پیام باشگاه معتبر نیست.',
        });
      }
      await manager.query(
        `INSERT INTO "loyalty"."kafka_consumer_checkpoints"
          ("consumerGroup", "topic", "partition", "nextOffset", "highWatermark")
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT ("consumerGroup", "topic", "partition") DO UPDATE SET
           "nextOffset" = GREATEST(
             "loyalty"."kafka_consumer_checkpoints"."nextOffset",
             EXCLUDED."nextOffset"
           ),
           "highWatermark" = CASE
             WHEN EXCLUDED."highWatermark" IS NULL
               THEN "loyalty"."kafka_consumer_checkpoints"."highWatermark"
             WHEN "loyalty"."kafka_consumer_checkpoints"."highWatermark" IS NULL
               THEN EXCLUDED."highWatermark"
             ELSE GREATEST(
               "loyalty"."kafka_consumer_checkpoints"."highWatermark",
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

  async list(status: LoyaltyKafkaFailureStatus, limit: number) {
    const rows = await this.dataSource
      .getRepository(LoyaltyKafkaProcessingFailure)
      .find({
        where: { status },
        order: { lastFailedAt: 'ASC', id: 'ASC' },
        take: limit,
      });
    return rows.map((row) => this.safe(row));
  }

  approve(
    id: string,
    decision: LoyaltyOperatorDecision,
    operatorId: string,
    reason: string,
  ) {
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const repository = manager.getRepository(LoyaltyKafkaProcessingFailure);
      const row = await repository
        .createQueryBuilder('failure')
        .setLock('pessimistic_write')
        .where('failure.id = :id', { id })
        .getOne();
      if (!row) {
        throw new NotFoundException({
          code: ErrorCode.NOT_FOUND,
          message: 'رکورد قرنطینهٔ باشگاه یافت نشد.',
        });
      }
      if (row.status !== LoyaltyKafkaFailureStatus.QUARANTINED) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message: 'رکورد در وضعیت قابل تصمیم‌گیری نیست.',
        });
      }
      row.status =
        decision === 'retry'
          ? LoyaltyKafkaFailureStatus.RETRY_APPROVED
          : LoyaltyKafkaFailureStatus.SKIP_APPROVED;
      row.approvedBy = operatorId;
      row.approvalReason = reason;
      row.approvedAt = new Date();
      await repository.save(row);
      return this.safe(row);
    });
  }

  countQuarantined(): Promise<number> {
    return this.dataSource
      .getRepository(LoyaltyKafkaProcessingFailure)
      .countBy({ status: LoyaltyKafkaFailureStatus.QUARANTINED });
  }

  private assertFingerprint(
    row: LoyaltyKafkaProcessingFailure,
    delivery: LoyaltyFailedDelivery,
  ): void {
    if (row.fingerprint !== delivery.fingerprint) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'اثر انگشت پیام باشگاه برای offset یکسان متفاوت است.',
      });
    }
  }

  private safe(row: LoyaltyKafkaProcessingFailure) {
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
