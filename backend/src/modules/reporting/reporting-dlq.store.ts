import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { ErrorCode } from '../../common/errors';
import {
  ReportingKafkaFailureStatus,
  type ReportingKafkaFailureStage,
  ReportingKafkaProcessingFailure,
} from '../../database/entities/reporting-kafka-processing-failure.entity';

export type ReportingFailedDelivery = {
  consumerGroup: string;
  topic: string;
  partition: number;
  offset: string;
  nextOffset: string;
  highWatermark?: string;
  fingerprint: string;
};

export type ReportingFailureAction = 'process' | 'block' | 'skip';
export type ReportingOperatorDecision = 'retry' | 'skip';

@Injectable()
export class ReportingDlqStore {
  constructor(
    @InjectRepository(ReportingKafkaProcessingFailure)
    private readonly failures: Repository<ReportingKafkaProcessingFailure>,
  ) {}

  async actionFor(
    delivery: ReportingFailedDelivery,
  ): Promise<ReportingFailureAction> {
    const row = await this.failures.findOneBy({
      consumerGroup: delivery.consumerGroup,
      topic: delivery.topic,
      partition: delivery.partition,
      offset: delivery.offset,
    });
    if (!row) return 'process';
    if (row.fingerprint !== delivery.fingerprint) {
      throw new ConflictException({
        code: ErrorCode.IDEMPOTENCY_PAYLOAD_MISMATCH,
        message: 'اثر انگشت پیام قرنطینه‌شده با offset یکسان متفاوت است.',
      });
    }
    if (row.status === ReportingKafkaFailureStatus.QUARANTINED) return 'block';
    if (
      row.status === ReportingKafkaFailureStatus.SKIP_APPROVED ||
      row.status === ReportingKafkaFailureStatus.SKIPPED
    ) {
      return 'skip';
    }
    return 'process';
  }

  recordFailure(
    delivery: ReportingFailedDelivery,
    stage: ReportingKafkaFailureStage,
    eventId: string | null,
    maxAttempts: number,
  ): Promise<'retry' | 'quarantined'> {
    return this.failures.manager.transaction('READ COMMITTED', async (tx) => {
      await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `reporting-dlq:${delivery.consumerGroup}:${delivery.topic}:${delivery.partition}:${delivery.offset}`,
      ]);
      const repository = tx.getRepository(ReportingKafkaProcessingFailure);
      const existing = await repository.findOneBy({
        consumerGroup: delivery.consumerGroup,
        topic: delivery.topic,
        partition: delivery.partition,
        offset: delivery.offset,
      });
      if (existing && existing.fingerprint !== delivery.fingerprint) {
        throw new ConflictException({
          code: ErrorCode.IDEMPOTENCY_PAYLOAD_MISMATCH,
          message: 'اثر انگشت پیام قرنطینه‌شده با offset یکسان متفاوت است.',
        });
      }
      if (existing?.status === ReportingKafkaFailureStatus.QUARANTINED) {
        return 'quarantined';
      }
      const now = new Date();
      const attempts =
        existing?.status === ReportingKafkaFailureStatus.RETRY_APPROVED
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
        ? ReportingKafkaFailureStatus.QUARANTINED
        : ReportingKafkaFailureStatus.RETRYING;
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

  async markResolved(delivery: ReportingFailedDelivery): Promise<void> {
    await this.failures
      .createQueryBuilder()
      .update()
      .set({
        status: ReportingKafkaFailureStatus.RESOLVED,
        resolvedAt: new Date(),
      })
      .where('"consumerGroup" = :consumerGroup', delivery)
      .andWhere('topic = :topic', delivery)
      .andWhere('partition = :partition', delivery)
      .andWhere('offset = :offset', delivery)
      .andWhere('status NOT IN (:...terminal)', {
        terminal: [ReportingKafkaFailureStatus.SKIPPED],
      })
      .execute();
  }

  markSkipped(delivery: ReportingFailedDelivery): Promise<void> {
    return this.failures.manager.transaction('READ COMMITTED', async (tx) => {
      const result = await tx
        .getRepository(ReportingKafkaProcessingFailure)
        .createQueryBuilder()
        .update()
        .set({
          status: ReportingKafkaFailureStatus.SKIPPED,
          resolvedAt: new Date(),
        })
        .where('"consumerGroup" = :consumerGroup', delivery)
        .andWhere('topic = :topic', delivery)
        .andWhere('partition = :partition', delivery)
        .andWhere('offset = :offset', delivery)
        .andWhere('fingerprint = :fingerprint', delivery)
        .andWhere('status IN (:...approved)', {
          approved: [
            ReportingKafkaFailureStatus.SKIP_APPROVED,
            ReportingKafkaFailureStatus.SKIPPED,
          ],
        })
        .execute();
      if (result.affected !== 1) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message: 'مجوز ردکردن پیام معتبر نیست.',
        });
      }
      await tx.query(
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
          delivery.highWatermark ?? null,
        ],
      );
    });
  }

  async list(status: ReportingKafkaFailureStatus, limit: number) {
    const rows = await this.failures.find({
      where: { status },
      order: { lastFailedAt: 'ASC', id: 'ASC' },
      take: limit,
    });
    return rows.map((row) => this.safe(row));
  }

  async approve(
    id: string,
    decision: ReportingOperatorDecision,
    operatorId: string,
    reason: string,
  ) {
    return this.failures.manager.transaction('READ COMMITTED', async (tx) => {
      const repository = tx.getRepository(ReportingKafkaProcessingFailure);
      const row = await repository
        .createQueryBuilder('failure')
        .setLock('pessimistic_write')
        .where('failure.id = :id', { id })
        .getOne();
      if (!row) {
        throw new NotFoundException({
          code: ErrorCode.NOT_FOUND,
          message: 'رکورد قرنطینه یافت نشد.',
        });
      }
      if (row.status !== ReportingKafkaFailureStatus.QUARANTINED) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message: 'رکورد در وضعیت قابل تصمیم‌گیری نیست.',
        });
      }
      row.status =
        decision === 'retry'
          ? ReportingKafkaFailureStatus.RETRY_APPROVED
          : ReportingKafkaFailureStatus.SKIP_APPROVED;
      row.approvedBy = operatorId;
      row.approvalReason = reason;
      row.approvedAt = new Date();
      await repository.save(row);
      return this.safe(row);
    });
  }

  countQuarantined(): Promise<number> {
    return this.failures.countBy({
      status: ReportingKafkaFailureStatus.QUARANTINED,
    });
  }

  private safe(row: ReportingKafkaProcessingFailure) {
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
