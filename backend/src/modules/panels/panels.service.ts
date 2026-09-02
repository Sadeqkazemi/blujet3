import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { User } from '../../database/entities/user.entity';
import { EmployeePermission } from '../../database/entities/employee-permission.entity';
import { PanelAccessFlag } from '../../database/entities/panel-access-flag.entity';
import { RefreshToken } from '../../database/entities/refresh-token.entity';
import { findOneOrThrow } from '../../database/utils/find-one-or-throw';
import { AuditService } from '../audit/audit.service';
import {
  ALL_PANEL_KEYS,
  EMPLOYEE_SECTION_NAV,
  PANEL_ACCESS_TOGGLE_RIGHTS,
  PANEL_NAV,
  SITE_ADMIN_SIDEBAR_DENYLIST,
  PanelNavItem,
} from './panel-nav.config';
import { PERMISSION_CATALOG } from '../it-manager/permission-catalog';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { ErrorCode } from '../../common/errors';
import {
  permissionForNavKey,
  permissionForRequestPath,
} from './manager-panel-permissions';

@Injectable()
export class PanelsService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(EmployeePermission)
    private readonly employeePermissionRepo: Repository<EmployeePermission>,
    @InjectRepository(PanelAccessFlag)
    private readonly panelAccessFlagRepo: Repository<PanelAccessFlag>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
    private readonly audit: AuditService,
  ) {}

  async getNav(user: AuthenticatedUser): Promise<PanelNavItem[]> {
    if (user.isSuperAdmin) {
      const byKey = new Map<string, PanelNavItem>();
      for (const roleItems of Object.values(PANEL_NAV)) {
        for (const item of roleItems ?? []) {
          if (!byKey.has(item.key)) byKey.set(item.key, item);
        }
      }
      return [...byKey.values()];
    }
    if (user.role !== 'EMPLOYEE') {
      const persisted = await this.userRepo.findOne({
        where: { id: user.id },
        select: { panelPermissions: true },
      });
      const restrictions = persisted?.panelPermissions;
      const roleItems = PANEL_NAV[user.role] ?? [];
      const items = Array.isArray(restrictions)
        ? roleItems.filter((item) => {
            const permission = permissionForNavKey(item.key);
            if (item.key === 'agencies') {
              return (
                restrictions.includes('agencies') ||
                restrictions.includes('approvals')
              );
            }
            return permission === null || restrictions.includes(permission);
          })
        : roleItems;
      if (user.role === 'SITE_ADMIN') {
        return items.filter(
          (item) => !SITE_ADMIN_SIDEBAR_DENYLIST.has(item.key),
        );
      }
      return items;
    }

    const grants = await this.employeePermissionRepo.find({
      where: { employeeId: user.id },
      relations: { permission: true },
      select: { permission: { key: true } },
    });
    const grantedKeys = new Set(grants.map((g) => g.permission.key));
    const employee = await this.userRepo.findOne({
      where: { id: user.id },
      select: { dept: true },
    });

    const items: PanelNavItem[] = [
      { key: 'dashboard', labelFa: 'داشبورد', implemented: true },
    ];
    for (const [sectionKey, section] of Object.entries(EMPLOYEE_SECTION_NAV)) {
      if (section.depts && !section.depts.includes(employee?.dept ?? '')) {
        continue;
      }
      const hasAccess = section.wiredKeys.some((key) => grantedKeys.has(key));
      if (hasAccess) {
        items.push({
          key: sectionKey,
          labelFa: section.labelFa,
          implemented: true,
        });
      }
    }
    // پنل کارمند.dc.html's navKeys formula always appends "referrals" —
    // unconditional, not gated by any permission key (referrals are
    // personally addressed regardless of section grants). This was
    // deferred since Phase 18 (GET /referrals was sender-scoped, no
    // recipient-side listing existed — see docs/DB_SCHEMA.md's Phase 18
    // notes); GET /referrals/mine (Phase 26) closes that gap, so every
    // EMPLOYEE gets the tab now.
    items.push({ key: 'referrals', labelFa: 'ارجاعات', implemented: true });
    return items;
  }

  async assertCustomPermissionForRequest(
    user: AuthenticatedUser,
    requestPath: string,
  ): Promise<void> {
    if (user.role === 'EMPLOYEE') return;
    const required = permissionForRequestPath(requestPath);
    if (!required) return;
    const persisted = await this.userRepo.findOne({
      where: { id: user.id },
      select: { panelPermissions: true },
    });
    if (
      Array.isArray(persisted?.panelPermissions) &&
      !persisted.panelPermissions.includes(required)
    ) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'دسترسی این بخش برای حساب شما فعال نیست.',
      });
    }
  }

  /** Dashboard context for پنل کارمند.dc.html — dept label + granted perm chips. */
  async getEmployeeContext(user: AuthenticatedUser) {
    if (user.role !== 'EMPLOYEE') {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'این endpoint فقط برای کارمند است.',
      });
    }

    const employee = await findOneOrThrow(this.userRepo, {
      where: { id: user.id },
      select: { dept: true, rank: true },
    });

    const deptLabels: Record<string, string> = {
      commercial: 'بازرگانی',
      sales: 'فروش',
      finance: 'مالی',
      it: 'فناوری اطلاعات',
      site: 'پشتیبانی سایت',
    };

    const grants = await this.employeePermissionRepo.find({
      where: { employeeId: user.id },
      relations: { permission: true },
      select: {
        permission: { key: true, labelFa: true, sectionKey: true },
      },
    });

    const sectionLabels: Record<string, string> = {
      dashboard: 'داشبورد',
      cartable: 'کارتابل',
      referrals: 'ارجاعات',
    };
    for (const [sectionKey, section] of Object.entries(EMPLOYEE_SECTION_NAV)) {
      sectionLabels[sectionKey] = section.labelFa;
    }
    for (const entry of PERMISSION_CATALOG) {
      if (!sectionLabels[entry.sectionKey]) {
        sectionLabels[entry.sectionKey] = entry.sectionLabelFa;
      }
    }

    const grantedSectionKeys = new Set<string>();
    for (const [sectionKey, section] of Object.entries(EMPLOYEE_SECTION_NAV)) {
      if (section.depts && !section.depts.includes(employee.dept ?? '')) {
        continue;
      }
      if (
        section.wiredKeys.some((key) =>
          grants.some((g) => g.permission.key === key),
        )
      ) {
        grantedSectionKeys.add(sectionKey);
      }
    }

    const permissionLabels = [
      'داشبورد',
      ...Array.from(grantedSectionKeys)
        .map((key) => sectionLabels[key] ?? key)
        .filter((label) => label !== 'داشبورد'),
      'ارجاعات',
    ];

    return {
      dept: employee.dept,
      deptLabelFa: deptLabels[employee.dept ?? ''] ?? employee.dept ?? '—',
      rank: employee.rank,
      permissionLabelsFa: permissionLabels,
      // Raw granted permission keys (e.g. 'ag_list', 'ag_requests') so the UI
      // can avoid firing endpoint calls it isn't authorized for — the server
      // still enforces every permission via @RequiresPermission.
      permissionKeys: grants.map((g) => g.permission.key),
    };
  }

  async getAccessFlags(actor: AuthenticatedUser) {
    // Phase 12: IT_MANAGER has no toggle rights but reads the full flag set
    // for its informational tab; the PATCH route never allows it to write.
    const togglable = actor.isSuperAdmin
      ? ALL_PANEL_KEYS
      : actor.role === 'IT_MANAGER'
        ? (PANEL_ACCESS_TOGGLE_RIGHTS.SENIOR_MANAGER ?? [])
        : (PANEL_ACCESS_TOGGLE_RIGHTS[actor.role] ?? []);
    const rows = await this.panelAccessFlagRepo.find({
      where: { panelKey: In(togglable) },
    });
    const byKey = new Map(rows.map((r) => [r.panelKey, r]));

    return togglable.map((key) => ({
      panelKey: key,
      enabled: byKey.get(key)?.enabled ?? true,
      updatedAt: byKey.get(key)?.updatedAt ?? null,
    }));
  }

  async setAccessFlag(
    actor: AuthenticatedUser,
    panelKey: string,
    enabled: boolean,
  ) {
    const allowed = actor.isSuperAdmin
      ? ALL_PANEL_KEYS
      : (PANEL_ACCESS_TOGGLE_RIGHTS[actor.role] ?? []);
    if (!allowed.includes(panelKey) || !ALL_PANEL_KEYS.includes(panelKey)) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'اجازه تغییر دسترسی این پنل را ندارید.',
      });
    }

    const updatedAt = new Date();
    await this.panelAccessFlagRepo.upsert(
      { panelKey, enabled, updatedById: actor.id, updatedAt },
      ['panelKey'],
    );
    const flag = await this.panelAccessFlagRepo.findOneByOrFail({ panelKey });

    if (!enabled) {
      const roleByPanelKey = {
        SITE_ADMIN: 'SITE_ADMIN',
        CEO: 'CEO',
        BOARD_CHAIR: 'BOARD_CHAIR',
        SENIOR_MANAGER: 'SENIOR_MANAGER',
        FINANCE: 'FINANCE_MANAGER',
        COMMERCIAL: 'COMMERCIAL_MANAGER',
        OPERATIONS: 'OPERATIONS_MANAGER',
        IT: 'IT_MANAGER',
      } as const;
      const role = roleByPanelKey[panelKey as keyof typeof roleByPanelKey];
      if (role) {
        const users = await this.userRepo.find({
          where: { role },
          select: { id: true },
        });
        if (users.length > 0) {
          await this.refreshTokenRepo.update(
            { userId: In(users.map((user) => user.id)), revokedAt: IsNull() },
            { revokedAt: updatedAt },
          );
        }
      }
    }

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'ACCESS',
      action: enabled ? 'فعال‌سازی دسترسی پنل' : 'مسدودسازی دسترسی پنل',
      detail: `پنل «${panelKey}» توسط ${actor.fullName} ${enabled ? 'فعال' : 'مسدود'} شد.`,
      entityType: 'PanelAccessFlag',
      entityId: panelKey,
    });

    return flag;
  }

  async assertPanelEnabledForSelf(role: AuthenticatedUser['role']) {
    const selfKeyByRole: Partial<Record<AuthenticatedUser['role'], string>> = {
      SITE_ADMIN: 'SITE_ADMIN',
      FINANCE_MANAGER: 'FINANCE',
      COMMERCIAL_MANAGER: 'COMMERCIAL',
      OPERATIONS_MANAGER: 'OPERATIONS',
      IT_MANAGER: 'IT',
    };
    const key = selfKeyByRole[role];
    if (!key) return;

    const flag = await this.panelAccessFlagRepo.findOneBy({ panelKey: key });
    if (flag && !flag.enabled) {
      throw new ForbiddenException({
        code: ErrorCode.ACCESS_REVOKED,
        message: 'اجازه دسترسی برای شما امکان‌پذیر نیست.',
      });
    }
  }
}
