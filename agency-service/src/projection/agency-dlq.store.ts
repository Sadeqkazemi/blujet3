import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { ErrorCode } from '../common/errors';
import {
  AgencyKafkaFailureStatus,
  type AgencyKafkaFailureStage,
  AgencyKafkaProcessingFailure,
} from '../database/entities/agency-kafka-processing-failure.entity';

export type AgencyFailedDelivery = {
  consumerGroup: string;
  topic: string;
  partition: number;
  offset: string;
  nextOffset: string;
  highWatermark?: string;
  fingerprint: string;
};

export type AgencyFailureAction = 'process' | 'block' | 'skip';
export type AgencyOperatorDecision = 'retry' | 'skip';

@Injectable()
export class AgencyDlqStore {
  constructor(private readonly dataSource: DataSource) {}

  async actionFor(
    delivery: AgencyFailedDelivery,
  ): Promise<AgencyFailureAction> {
    const row = await this.dataSource
      .getRepository(AgencyKafkaProcessingFailure)
      .findOneBy({
        consumerGroup: delivery.consumerGroup,
        topic: delivery.topic,
        partition: delivery.partition,
        offset: delivery.offset,
      });
    if (!row) return 'process';
    this.assertFingerprint(row, delivery);
    if (row.status === AgencyKafkaFailureStatus.QUARANTINED) return 'block';
    if (
      row.status === AgencyKafkaFailureStatus.SKIP_APPROVED ||
      row.status === AgencyKafkaFailureStatus.SKIPPED
    ) {
      return 'skip';
    }
    return 'process';
  }

  recordFailure(
    delivery: AgencyFailedDelivery,
    stage: AgencyKafkaFailureStage,
    eventId: string | null,
    maxAttempts: number,
  ): Promise<'retry' | 'quarantined'> {
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [
          `agency-dlq:${delivery.consumerGroup}:${delivery.topic}:${delivery.partition}:${delivery.offset}`,
        ],
      );
      const repository = manager.getRepository(AgencyKafkaProcessingFailure);
      const existing = await repository.findOneBy({
        consumerGroup: delivery.consumerGroup,
        topic: delivery.topic,
        partition: delivery.partition,
        offset: delivery.offset,
      });
      if (existing) this.assertFingerprint(existing, delivery);
      if (existing?.status === AgencyKafkaFailureStatus.QUARANTINED) {
        return 'quarantined';
      }

      const now = new Date();
      const attempts =
        existing?.status === AgencyKafkaFailureStatus.RETRY_APPROVED
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
        ? AgencyKafkaFailureStatus.QUARANTINED
        : AgencyKafkaFailureStatus.RETRYING;
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

  async markResolved(delivery: AgencyFailedDelivery): Promise<void> {
    await this.dataSource
      .getRepository(AgencyKafkaProcessingFailure)
      .createQueryBuilder()
      .update()
      .set({
        status: AgencyKafkaFailureStatus.RESOLVED,
        resolvedAt: new Date(),
      })
      .where('"consumerGroup" = :consumerGroup', delivery)
      .andWhere('topic = :topic', delivery)
      .andWhere('partition = :partition', delivery)
      .andWhere('offset = :offset', delivery)
      .andWhere('fingerprint = :fingerprint', delivery)
      .andWhere('status <> :terminal', {
        terminal: AgencyKafkaFailureStatus.SKIPPED,
      })
      .execute();
  }

  markSkipped(delivery: AgencyFailedDelivery): Promise<void> {
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const result = await manager
        .getRepository(AgencyKafkaProcessingFailure)
        .createQueryBuilder()
        .update()
        .set({
          status: AgencyKafkaFailureStatus.SKIPPED,
          resolvedAt: new Date(),
        })
        .where('"consumerGroup" = :consumerGroup', delivery)
        .andWhere('topic = :topic', delivery)
        .andWhere('partition = :partition', delivery)
        .andWhere('offset = :offset', delivery)
        .andWhere('fingerprint = :fingerprint', delivery)
        .andWhere('status IN (:...approved)', {
          approved: [
            AgencyKafkaFailureStatus.SKIP_APPROVED,
            AgencyKafkaFailureStatus.SKIPPED,
          ],
        })
        .execute();
      if (result.affected !== 1) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message: 'مجوز ردکردن پیام آژانس معتبر نیست.',
        });
      }
      await manager.query(
        `INSERT INTO "agency"."kafka_consumer_checkpoints"
          ("consumerGroup", "topic", "partition", "nextOffset", "highWatermark")
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT ("consumerGroup", "topic", "partition") DO UPDATE SET
           "nextOffset" = GREATEST(
             "agency"."kafka_consumer_checkpoints"."nextOffset",
             EXCLUDED."nextOffset"
           ),
           "highWatermark" = CASE
             WHEN EXCLUDED."highWatermark" IS NULL
               THEN "agency"."kafka_consumer_checkpoints"."highWatermark"
             WHEN "agency"."kafka_consumer_checkpoints"."highWatermark" IS NULL
               THEN EXCLUDED."highWatermark"
             ELSE GREATEST(
               "agency"."kafka_consumer_checkpoints"."highWatermark",
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

  async list(status: AgencyKafkaFailureStatus, limit: number) {
    const rows = await this.dataSource
      .getRepository(AgencyKafkaProcessingFailure)
      .find({
        where: { status },
        order: { lastFailedAt: 'ASC', id: 'ASC' },
        take: limit,
      });
    return rows.map((row) => this.safe(row));
  }

  approve(
    id: string,
    decision: AgencyOperatorDecision,
    operatorId: string,
    reason: string,
  ) {
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const repository = manager.getRepository(AgencyKafkaProcessingFailure);
      const row = await repository
        .createQueryBuilder('failure')
        .setLock('pessimistic_write')
        .where('failure.id = :id', { id })
        .getOne();
      if (!row) {
        throw new NotFoundException({
          code: ErrorCode.NOT_FOUND,
          message: 'رکورد قرنطینهٔ آژانس یافت نشد.',
        });
      }
      if (row.status !== AgencyKafkaFailureStatus.QUARANTINED) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message: 'رکورد در وضعیت قابل تصمیم‌گیری نیست.',
        });
      }
      row.status =
        decision === 'retry'
          ? AgencyKafkaFailureStatus.RETRY_APPROVED
          : AgencyKafkaFailureStatus.SKIP_APPROVED;
      row.approvedBy = operatorId;
      row.approvalReason = reason;
      row.approvedAt = new Date();
      await repository.save(row);
      return this.safe(row);
    });
  }

  countQuarantined(): Promise<number> {
    return this.dataSource
      .getRepository(AgencyKafkaProcessingFailure)
      .countBy({ status: AgencyKafkaFailureStatus.QUARANTINED });
  }

  private assertFingerprint(
    row: AgencyKafkaProcessingFailure,
    delivery: AgencyFailedDelivery,
  ): void {
    if (row.fingerprint !== delivery.fingerprint) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'اثر انگشت پیام آژانس برای offset یکسان متفاوت است.',
      });
    }
  }

  private safe(row: AgencyKafkaProcessingFailure) {
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
