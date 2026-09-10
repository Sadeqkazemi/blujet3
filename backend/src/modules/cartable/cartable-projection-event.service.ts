import { ConflictException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import { ErrorCode } from '../../common/errors';
import { createCartableTaskProjectedEvent } from '../../common/events/ops-admin-events';
import { CartableProjectionAudit } from '../../database/entities/cartable-projection-audit.entity';
import type { CartableTask } from '../../database/entities/cartable-task.entity';
import { CommerceOutboxService } from '../commerce-outbox/commerce-outbox.service';

export const CARTABLE_PROJECTION_MUTATIONS = [
  'CREATED',
  'READ',
  'RESOLVED',
  'TRANSFERRED',
  'CONVERSATION_CLOSED',
  'AUTO_ARCHIVED',
] as const;

export type CartableProjectionMutation =
  (typeof CARTABLE_PROJECTION_MUTATIONS)[number];

@Injectable()
export class CartableProjectionEventService {
  constructor(private readonly outbox: CommerceOutboxService) {}

  async record(
    manager: EntityManager,
    task: CartableTask,
    mutation: CartableProjectionMutation,
  ): Promise<{ eventId: string; auditId: string }> {
    if (!manager.queryRunner?.isTransactionActive) {
      throw new Error(
        'Cartable projection requires an active Core transaction',
      );
    }

    await manager.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [JSON.stringify([task.id, task.version])],
    );
    const audits = manager.getRepository(CartableProjectionAudit);
    const existing = await audits.findOneBy({
      taskId: task.id,
      taskVersion: task.version,
    });
    if (existing && existing.mutation !== mutation) {
      throw new ConflictException({
        code: ErrorCode.IDEMPOTENCY_PAYLOAD_MISMATCH,
        message: 'نسخهٔ رویداد کارتابل با تغییر متفاوت ثبت شده است.',
      });
    }

    const auditId = existing?.id ?? randomUUID();
    if (!existing) {
      await audits.insert({
        id: auditId,
        taskId: task.id,
        taskVersion: task.version,
        mutation,
      });
    }

    const outbox = await this.outbox.enqueueCartable(
      manager,
      createCartableTaskProjectedEvent(
        {
          id: task.id,
          version: task.version,
          assigneeId: task.assigneeId,
          category: task.category,
          sourceType: task.sourceType,
          sourceId: task.sourceId,
          status: task.status,
          resolvedAt: task.resolvedAt,
          readAt: task.readAt,
          createdAt: task.createdAt,
        },
        {
          auditId,
          correlationId: `ops-cartable:${task.id}`,
          idempotencyKey: `cartable-projected:${task.id}:v${task.version}`,
        },
      ),
    );
    return { ...outbox, auditId };
  }
}
