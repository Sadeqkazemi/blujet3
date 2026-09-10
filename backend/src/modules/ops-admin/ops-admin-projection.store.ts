import { ConflictException, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import type { CartableTaskProjectedEvent } from '../../common/events/ops-admin-events';
import { fingerprintJson } from '../../common/events/event-fingerprint';
import { ErrorCode } from '../../common/errors';
import { OpsAdminCartableEventReceipt } from '../../database/ops-admin-projection-entities/ops-admin-cartable-event-receipt.entity';
import { OpsAdminCartableTaskProjection } from '../../database/ops-admin-projection-entities/ops-admin-cartable-task.entity';

export type OpsAdminProjectionResult = 'applied' | 'duplicate' | 'stale';

@Injectable()
export class OpsAdminProjectionStore {
  constructor(private readonly dataSource: DataSource) {}

  project(
    event: CartableTaskProjectedEvent,
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
      return 'applied';
    });
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
