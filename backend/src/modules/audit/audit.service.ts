import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository, SelectQueryBuilder } from 'typeorm';
import { AuditLog } from '../../database/entities/audit-log.entity';
import type { AuditCategory, Role } from '../../database/enums';
import { toJsonValue } from '../../database/json-types';

export interface RecordAuditEntryInput {
  actorId: string;
  actorRole: Role;
  category: AuditCategory;
  action: string;
  detail: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  requestId?: string;
}

/** Shared filter shape accepted by every audit listing endpoint — see
 * docs/API.md "Audit & Logs" and AuditLogQueryDto. */
export interface AuditLogFilters {
  actor?: string;
  action?: string;
  resource?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 100;

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepo: Repository<AuditLog>,
  ) {}

  /** actor/action/resource/dateFrom/dateTo — applied identically across
   * managerReports, systemLogs and ceoSystemEvents (alias must be `a`). */
  private applyCommonFilters(
    qb: SelectQueryBuilder<AuditLog>,
    filters: AuditLogFilters,
  ) {
    if (filters.actor) {
      qb.andWhere('a.actorId = :actor', { actor: filters.actor });
    }
    if (filters.action) {
      qb.andWhere('a.action ILIKE :action', { action: `%${filters.action}%` });
    }
    if (filters.resource) {
      qb.andWhere('a.entityType = :resource', { resource: filters.resource });
    }
    if (filters.dateFrom) {
      qb.andWhere('a.createdAt >= :dateFrom', { dateFrom: filters.dateFrom });
    }
    if (filters.dateTo) {
      qb.andWhere('a.createdAt <= :dateTo', { dateTo: filters.dateTo });
    }
  }

  private paginate(qb: SelectQueryBuilder<AuditLog>, filters: AuditLogFilters) {
    const page = filters.page && filters.page > 0 ? filters.page : DEFAULT_PAGE;
    const limit =
      filters.limit && filters.limit > 0 ? filters.limit : DEFAULT_LIMIT;
    qb.skip((page - 1) * limit).take(limit);
    return { page, limit };
  }

  async record(input: RecordAuditEntryInput) {
    return this.auditRepo.save(
      this.auditRepo.create({
        ...input,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        metadata:
          input.metadata === undefined ? null : toJsonValue(input.metadata),
        requestId: input.requestId ?? null,
      }),
    );
  }

  /**
   * CEO's "گزارش مدیران" excludes CEO/SENIOR_MANAGER/BOARD_CHAIR as actor —
   * "CEO oversees operational managers only" (confirmed in the design's own
   * code comment). Board Chair and Senior Manager see every role.
   */
  async managerReports(
    viewerRole: Role,
    filters: AuditLogFilters & {
      category?: AuditCategory;
      actorRole?: Role;
      q?: string;
    },
  ) {
    const excludedForCeo: Role[] = ['CEO', 'SENIOR_MANAGER', 'BOARD_CHAIR'];

    const qb = this.auditRepo
      .createQueryBuilder('a')
      .leftJoin('a.actor', 'actor')
      .addSelect(['actor.id', 'actor.fullName']);

    if (viewerRole === 'CEO') {
      qb.andWhere('a.actorRole NOT IN (:...excludedForCeo)', {
        excludedForCeo,
      });
    }
    if (filters.category) {
      qb.andWhere('a.category = :category', { category: filters.category });
    }
    if (filters.actorRole) {
      qb.andWhere('a.actorRole = :actorRole', { actorRole: filters.actorRole });
    }
    this.applyCommonFilters(qb, filters);
    if (filters.q) {
      qb.andWhere(
        '(a.action ILIKE :q OR a.detail ILIKE :q OR actor.fullName ILIKE :q)',
        { q: `%${filters.q}%` },
      );
    }

    qb.orderBy('a.createdAt', 'DESC');
    const { page, limit } = this.paginate(qb, filters);

    const [rows, total] = await qb.getManyAndCount();

    // CEO design card shows manager display name + role label.
    return {
      items: rows.map(({ actor, ...r }) => ({
        ...r,
        actorName: actor.fullName,
      })),
      total,
      page,
      limit,
    };
  }

  /** IT Manager's "لاگ و رویدادها" — system-category + account-management entries. */
  async systemLogs(filters: AuditLogFilters = {}) {
    const qb = this.auditRepo
      .createQueryBuilder('a')
      .leftJoin('a.actor', 'actor')
      .addSelect(['actor.id', 'actor.fullName', 'actor.dept', 'actor.role'])
      .where('a.category IN (:...categories)', {
        categories: ['SYSTEM', 'ACCOUNT'],
      });
    this.applyCommonFilters(qb, filters);
    qb.orderBy('a.createdAt', 'DESC');
    const { page, limit } = this.paginate(qb, filters);

    const [rows, total] = await qb.getManyAndCount();

    const unitLabel = (dept: string | null | undefined, role: Role) => {
      if (dept === 'commercial') return 'بازرگانی';
      if (dept === 'finance') return 'مالی';
      if (dept === 'it') return 'IT';
      if (dept === 'sales') return 'فروش';
      if (role === 'IT_MANAGER') return 'IT';
      return '—';
    };

    const levelOf = (category: AuditCategory): 'info' | 'warn' | 'error' => {
      if (category === 'SECURITY') return 'warn';
      return 'info';
    };

    return {
      items: rows.map((r) => ({
        id: r.id,
        actorRole: r.actorRole,
        category: r.category,
        action: r.action,
        detail: r.detail,
        createdAt: r.createdAt,
        actorName: r.actor.fullName,
        unit: unitLabel(r.actor.dept, r.actor.role),
        level: levelOf(r.category),
      })),
      total,
      page,
      limit,
    };
  }

  /** Real per-entity activity used by the IT service report drawer. */
  async entityEvents(
    entityType: string,
    entityId: string,
    page = 1,
    limit = 5,
  ) {
    const safePage = Number.isInteger(page) && page > 0 ? page : 1;
    const safeLimit = Math.min(
      Number.isInteger(limit) && limit > 0 ? limit : 5,
      50,
    );
    const qb = this.auditRepo
      .createQueryBuilder('a')
      .leftJoin('a.actor', 'actor')
      .addSelect(['actor.id', 'actor.fullName'])
      .where('a.entityType = :entityType', { entityType })
      .andWhere('a.entityId = :entityId', { entityId })
      .orderBy('a.createdAt', 'DESC')
      .skip((safePage - 1) * safeLimit)
      .take(safeLimit);
    const [rows, total] = await qb.getManyAndCount();
    return {
      items: rows.map((r) => ({
        id: r.id,
        action: r.action,
        detail: r.detail,
        actorName: r.actor?.fullName ?? '—',
        createdAt: r.createdAt,
        level: r.category === 'SECURITY' ? 'warn' : 'info',
      })),
      total,
      page: safePage,
      limit: safeLimit,
    };
  }

  /** Lightweight count for the IT sidebar badge on «لاگ و رویدادها». */
  async systemLogsBadgeCount() {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return this.auditRepo.count({
      where: [
        { category: 'SYSTEM', createdAt: MoreThanOrEqual(since) },
        { category: 'ACCOUNT', createdAt: MoreThanOrEqual(since) },
      ],
    });
  }

  /** CEO's «لاگ‌ها و رویدادهای سامانه» — real rows across every actor
   * (unlike managerReports' exclusions). The level chip is a presentational
   * mapping only: SECURITY→WARN, financial categories→OK, else INFO. */
  async ceoSystemEvents(filters: AuditLogFilters = {}) {
    const qb = this.auditRepo
      .createQueryBuilder('a')
      .leftJoin('a.actor', 'actor')
      .addSelect(['actor.id', 'actor.fullName']);
    this.applyCommonFilters(qb, filters);
    qb.orderBy('a.createdAt', 'DESC');
    const { page, limit } = this.paginate(qb, filters);

    const [rows, total] = await qb.getManyAndCount();

    const OK_CATEGORIES = new Set(['FINANCE', 'REFUND', 'PRICING', 'AGENCY']);
    return {
      items: rows.map((r) => ({
        id: r.id,
        at: r.createdAt.toISOString(),
        user: r.actor?.fullName ?? '—',
        actorRole: r.actorRole,
        action: r.action,
        detail: r.detail,
        level:
          r.category === 'SECURITY'
            ? 'WARN'
            : OK_CATEGORIES.has(r.category)
              ? 'OK'
              : 'INFO',
      })),
      total,
      page,
      limit,
    };
  }
}
