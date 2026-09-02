import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { AuditLog } from '../../database/entities/audit-log.entity';
import { User } from '../../database/entities/user.entity';
import { Role } from '../../database/enums';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

/** Which employee depts each manager's «گزارش کارمندان» tab covers — the
 * design shows finance staff to the Finance Manager and sales staff to the
 * Commercial Manager ("sales" is Commercial's sub-unit, per Phase 8). */
const DEPTS_BY_ROLE: Record<string, string[]> = {
  FINANCE_MANAGER: ['finance'],
  COMMERCIAL_MANAGER: ['commercial', 'sales'],
};

@Injectable()
export class StaffReportsService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(AuditLog)
    private readonly auditLogRepo: Repository<AuditLog>,
  ) {}

  async reports(actor: AuthenticatedUser, staffId?: string) {
    const depts = DEPTS_BY_ROLE[actor.role] ?? [];

    const staff = depts.length
      ? await this.userRepo.find({
          where: { role: Role.EMPLOYEE, dept: In(depts), deletedAt: IsNull() },
          select: {
            id: true,
            fullName: true,
            rank: true,
            isActive: true,
            createdAt: true,
          },
          order: { createdAt: 'ASC' },
        })
      : [];
    const staffIds = staff.map((s) => s.id);

    // Dept isolation is structural: a staffId outside the caller's dept
    // simply matches no rows (empty feed), never someone else's feed.
    const feedActorIds = staffId
      ? staffIds.filter((id) => id === staffId)
      : staffIds;

    const [reports, newEmployeeEvents] = await Promise.all([
      feedActorIds.length
        ? this.auditLogRepo
            .createQueryBuilder('log')
            .leftJoin('log.actor', 'actor')
            .addSelect(['actor.fullName'])
            .where('log.actorId IN (:...ids)', { ids: feedActorIds })
            .orderBy('log.createdAt', 'DESC')
            .take(50)
            .getMany()
        : Promise.resolve<AuditLog[]>([]),
      // The «کارمند جدید توسط مدیر IT اضافه شد» banner — real ACCOUNT
      // audit events for this dept's employees, newest first.
      staffIds.length
        ? this.auditLogRepo
            .createQueryBuilder('log')
            .where('log.category = :category', { category: 'ACCOUNT' })
            .andWhere('log.entityType = :entityType', { entityType: 'User' })
            .andWhere('log.entityId IN (:...ids)', { ids: staffIds })
            .andWhere('log.action LIKE :action', { action: '%ایجاد%' })
            .orderBy('log.createdAt', 'DESC')
            .take(5)
            .getMany()
        : Promise.resolve<AuditLog[]>([]),
    ]);

    return {
      staff,
      reports: reports.map((r) => ({
        id: r.id,
        action: r.action,
        category: r.category,
        detail: r.detail,
        staffId: r.actorId,
        staffName: r.actor?.fullName ?? '—',
        at: r.createdAt.toISOString(),
      })),
      newEmployeeEvents: newEmployeeEvents.map((e) => ({
        id: e.id,
        detail: e.detail,
        at: e.createdAt.toISOString(),
      })),
    };
  }

  /** EMPLOYEE «گزارش‌های من» — own AuditLog feed (design activity cards). */
  async myActivity(actor: AuthenticatedUser) {
    const rows = await this.auditLogRepo.find({
      where: { actorId: actor.id },
      order: { createdAt: 'DESC' },
      take: 40,
    });
    return {
      items: rows.map((r) => ({
        id: r.id,
        title: r.action,
        detail: r.detail,
        category: r.category,
        at: r.createdAt.toISOString(),
      })),
    };
  }
}
