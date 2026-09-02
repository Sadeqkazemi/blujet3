import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository, SelectQueryBuilder } from 'typeorm';
import {
  Notification,
  type NotificationCategory,
} from '../database/entities/notification.entity';
import {
  EXTERNAL_NOTIFICATION_ENTITIES,
  notificationEntityVisibleToRole,
} from './notification-audience';

export interface CreateNotificationInput {
  recipientId: string;
  category: NotificationCategory;
  action: string;
  title: string;
  body?: string;
  entityType?: string;
  entityId?: string;
  dedupeKey: string;
}

const CATEGORY_KEYS = [
  'CARTABLE',
  'MESSAGE',
  'REQUEST',
  'APPROVAL',
  'SYSTEM',
] as const;

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    (error.driverError as { code?: string } | undefined)?.code === '23505'
  );
}

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly repo: Repository<Notification>,
  ) {}

  async create(input: CreateNotificationInput): Promise<Notification> {
    const existing = await this.repo.findOneBy({ dedupeKey: input.dedupeKey });
    if (existing) return existing;
    try {
      return await this.repo.save(
        this.repo.create({
          ...input,
          body: input.body ?? null,
          entityType: input.entityType ?? null,
          entityId: input.entityId ?? null,
          readAt: null,
        }),
      );
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      return this.repo.findOneByOrFail({ dedupeKey: input.dedupeKey });
    }
  }

  async list(
    recipientId: string,
    role: string,
    query: {
      category?: NotificationCategory;
      unreadOnly: boolean;
      limit: number;
      offset: number;
    },
  ) {
    const qb = this.applyAudienceScope(
      this.repo
        .createQueryBuilder('n')
        .where('n.recipientId = :recipientId', { recipientId })
        .orderBy('n.createdAt', 'DESC')
        .limit(query.limit)
        .offset(query.offset),
      role,
    );
    if (query.category) {
      qb.andWhere('n.category = :category', { category: query.category });
    }
    if (query.unreadOnly) qb.andWhere('n.readAt IS NULL');
    return qb.getMany();
  }

  async unreadCount(recipientId: string, role: string) {
    const qb = this.applyAudienceScope(
      this.repo
        .createQueryBuilder('n')
        .select('n.category', 'category')
        .addSelect('COUNT(*)', 'count')
        .where('n.recipientId = :recipientId', { recipientId })
        .andWhere('n.readAt IS NULL'),
      role,
    );
    const rows = await qb
      .groupBy('n.category')
      .getRawMany<{ category: string; count: string }>();
    const counts = Object.fromEntries(
      CATEGORY_KEYS.map((key) => [key, 0]),
    ) as Record<(typeof CATEGORY_KEYS)[number], number>;
    let total = 0;
    for (const row of rows) {
      const count = Number(row.count);
      counts[row.category as (typeof CATEGORY_KEYS)[number]] = count;
      total += count;
    }
    return { total, ...counts };
  }

  async markRead(recipientId: string, role: string, id: string) {
    const existing = await this.repo.findOneBy({ id, recipientId });
    if (
      !existing ||
      !notificationEntityVisibleToRole(role, existing.entityType)
    ) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'اعلان یافت نشد.',
      });
    }
    if (existing.readAt) return existing;
    await this.repo.update({ id, recipientId }, { readAt: new Date() });
    return this.repo.findOneByOrFail({ id, recipientId });
  }

  async markAllRead(recipientId: string, role: string) {
    const qb = this.repo
      .createQueryBuilder()
      .update(Notification)
      .set({ readAt: new Date() })
      .where('recipientId = :recipientId', { recipientId })
      .andWhere('readAt IS NULL');
    if (role === 'USER' || role === 'AGENCY') {
      qb.andWhere(
        `UPPER(COALESCE("entityType", '')) IN (:...audienceEntities)`,
        { audienceEntities: EXTERNAL_NOTIFICATION_ENTITIES[role] },
      );
    }
    const result = await qb.execute();
    return { updated: result.affected ?? 0 };
  }

  listByEntityType(entityType: string) {
    return this.repo.find({
      where: { entityType },
      order: { createdAt: 'DESC' },
    });
  }

  private applyAudienceScope(
    qb: SelectQueryBuilder<Notification>,
    role: string,
  ) {
    if (role === 'USER' || role === 'AGENCY') {
      qb.andWhere(
        `UPPER(COALESCE(n."entityType", '')) IN (:...audienceEntities)`,
        { audienceEntities: EXTERNAL_NOTIFICATION_ENTITIES[role] },
      );
    }
    return qb;
  }
}
