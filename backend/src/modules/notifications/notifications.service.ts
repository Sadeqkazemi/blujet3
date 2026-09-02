import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository, SelectQueryBuilder } from 'typeorm';
import { Notification } from '../../database/entities/notification.entity';
import { ErrorCode } from '../../common/errors';
import type { NotificationCategory } from '../../database/enums';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import {
  EXTERNAL_NOTIFICATION_ENTITIES,
  notificationEntityVisibleToRole,
} from './notification-audience';
import { NotifyInternalClient } from '../notify-outbox/notify-internal.client';
import { NotifyOutboxService } from '../notify-outbox/notify-outbox.service';
import { NotifyOutboxEventType } from '../notify-outbox/notify-outbox.contract';
import type { NotificationView } from '../notify-outbox/notify-outbox.contract';

export interface NotifyInput {
  recipientId: string;
  category: NotificationCategory;
  /** Stable English action code — CREATED/REFERRED/APPROVED/REJECTED/
   * DELETED/ACCESS_REVOKED/SENT/... (not localized; extend freely, no
   * migration needed since this column is free text). */
  action: string;
  title: string;
  body?: string;
  entityType?: string;
  entityId?: string;
  /** Pass a stable key (e.g. `${entityType}:${entityId}:${action}`) from
   * any caller that might retry the same logical event — replay returns
   * the original row instead of creating a duplicate. */
  dedupeKey?: string;
}

const CATEGORY_KEYS = [
  'CARTABLE',
  'MESSAGE',
  'REQUEST',
  'APPROVAL',
  'SYSTEM',
] as const;

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly repo: Repository<Notification>,
    private readonly outbox: NotifyOutboxService,
    private readonly notifyClient: NotifyInternalClient,
  ) {}

  private applyAudienceScope(
    qb: SelectQueryBuilder<Notification>,
    actor: AuthenticatedUser,
  ) {
    if (actor.role === 'USER' || actor.role === 'AGENCY') {
      qb.andWhere(
        `UPPER(COALESCE(n."entityType", '')) IN (:...audienceEntities)`,
        {
          audienceEntities: EXTERNAL_NOTIFICATION_ENTITIES[actor.role],
        },
      );
    }
    return qb;
  }

  /** The single write path every event source (cartable, referrals,
   * pricing approval, commitments, access revocation, ...) calls through —
   * idempotent when `dedupeKey` is supplied. */
  async notify(
    input: NotifyInput,
    manager?: EntityManager,
  ): Promise<Notification | { eventId: string; queued: true }> {
    if (this.notifyClient.enabled()) {
      return this.outbox.enqueue(
        NotifyOutboxEventType.NOTIFICATION_CREATED,
        input,
        input.dedupeKey,
        manager,
      );
    }
    const repo = manager?.getRepository(Notification) ?? this.repo;
    if (input.dedupeKey) {
      const existing = await repo.findOneBy({
        dedupeKey: input.dedupeKey,
      });
      if (existing) return existing;
    }
    return repo.save(
      repo.create({
        recipientId: input.recipientId,
        category: input.category,
        action: input.action,
        title: input.title,
        body: input.body ?? null,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        dedupeKey: input.dedupeKey ?? null,
        readAt: null,
      }),
    );
  }

  async list(
    actor: AuthenticatedUser,
    query: {
      category?: NotificationCategory;
      unreadOnly?: boolean;
      limit?: number;
      offset?: number;
    },
  ) {
    if (this.notifyClient.enabled()) {
      return this.notifyClient.list(actor, query);
    }
    const qb = this.applyAudienceScope(
      this.repo
        .createQueryBuilder('n')
        .where('n.recipientId = :recipientId', { recipientId: actor.id })
        .orderBy('n.createdAt', 'DESC')
        .limit(Math.min(Math.max(query.limit ?? 20, 1), 100))
        .offset(Math.max(query.offset ?? 0, 0)),
      actor,
    );
    if (query.category) {
      qb.andWhere('n.category = :category', { category: query.category });
    }
    if (query.unreadOnly) {
      qb.andWhere('n.readAt IS NULL');
    }
    return qb.getMany();
  }

  /** Per-category breakdown (matches CLAUDE.md's «شمارنده تفکیک‌شده
   * کارتابل، پیام‌ها، درخواست‌ها و تأییدها») + a `total`. */
  async unreadCount(
    actor: AuthenticatedUser,
  ): Promise<
    { total: number } & Record<(typeof CATEGORY_KEYS)[number], number>
  > {
    if (this.notifyClient.enabled()) {
      return this.notifyClient.unreadCount(actor);
    }
    const qb = this.applyAudienceScope(
      this.repo
        .createQueryBuilder('n')
        .select('n.category', 'category')
        .addSelect('COUNT(*)', 'count')
        .where('n.recipientId = :recipientId', { recipientId: actor.id })
        .andWhere('n.readAt IS NULL'),
      actor,
    );
    const rows = await qb
      .groupBy('n.category')
      .getRawMany<{ category: string; count: string }>();

    const counts = Object.fromEntries(
      CATEGORY_KEYS.map((key) => [key, 0]),
    ) as Record<(typeof CATEGORY_KEYS)[number], number>;
    let total = 0;
    for (const row of rows) {
      const n = Number(row.count);
      counts[row.category as (typeof CATEGORY_KEYS)[number]] = n;
      total += n;
    }
    return { total, ...counts };
  }

  async markRead(
    actor: AuthenticatedUser,
    id: string,
  ): Promise<Notification | NotificationView> {
    if (this.notifyClient.enabled()) {
      return this.notifyClient.markRead(actor, id);
    }
    const existing = await this.repo.findOneBy({
      id,
      recipientId: actor.id,
    });
    if (!existing) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'اعلان یافت نشد.',
      });
    }
    if (!notificationEntityVisibleToRole(actor.role, existing.entityType)) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'اعلان یافت نشد.',
      });
    }
    if (existing.readAt) return existing; // idempotent
    await this.repo.update({ id }, { readAt: new Date() });
    return this.repo.findOneByOrFail({ id });
  }

  async markAllRead(actor: AuthenticatedUser): Promise<{ updated: number }> {
    if (this.notifyClient.enabled()) {
      return this.notifyClient.markAllRead(actor);
    }
    const qb = this.repo
      .createQueryBuilder()
      .update(Notification)
      .set({ readAt: new Date() })
      .where('recipientId = :recipientId', { recipientId: actor.id })
      .andWhere('readAt IS NULL');
    if (actor.role === 'USER' || actor.role === 'AGENCY') {
      qb.andWhere(
        `UPPER(COALESCE("entityType", '')) IN (:...audienceEntities)`,
        {
          audienceEntities: EXTERNAL_NOTIFICATION_ENTITIES[actor.role],
        },
      );
    }
    const result = await qb.execute();
    return { updated: result.affected ?? 0 };
  }

  async listByEntityType(
    entityType: string,
  ): Promise<Notification[] | NotificationView[]> {
    if (this.notifyClient.enabled()) {
      return this.notifyClient.listByEntityType(entityType);
    }
    return this.repo.find({
      where: { entityType },
      order: { createdAt: 'DESC' },
    });
  }
}
