import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, ILike, In, IsNull, Repository } from 'typeorm';
import { User } from '../../database/entities/user.entity';
import { Permission } from '../../database/entities/permission.entity';
import { EmployeePermission } from '../../database/entities/employee-permission.entity';
import { PasswordResetEvent } from '../../database/entities/password-reset-event.entity';
import { RefreshToken } from '../../database/entities/refresh-token.entity';
import { findOneOrThrow } from '../../database/utils/find-one-or-throw';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ErrorCode } from '../../common/errors';
import { generateTempPassword } from '../../common/temp-password';
import { normalizeIranPhone } from '../../common/normalize-iran-phone';
import {
  CATALOG_DEPTS,
  PERMISSION_CATALOG,
  catalogDeptFor,
} from './permission-catalog';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { isTemporaryPanelUsername } from '../../database/temporary-panel-accounts';
import type {
  CreateEmployeeDto,
  ListEmployeesQueryDto,
} from './dto/employees.dtos';
import {
  dependentEmployeePermissionKeys,
  expandEmployeePermissionKeys,
} from '../../common/employee-permission-dependencies';

@Injectable()
export class EmployeesService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Permission)
    private readonly permissionRepo: Repository<Permission>,
    @InjectRepository(EmployeePermission)
    private readonly employeePermissionRepo: Repository<EmployeePermission>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Grouped by dept -> sections -> perms, matching site-data.js's shape. */
  async catalog() {
    const rows = await this.permissionRepo.find({
      order: { dept: 'ASC', sectionKey: 'ASC', key: 'ASC' },
    });
    const byDept: Record<
      string,
      Record<
        string,
        {
          sectionKey: string;
          sectionLabelFa: string;
          perms: { key: string; labelFa: string }[];
        }
      >
    > = {};
    for (const r of rows) {
      byDept[r.dept] ??= {};
      byDept[r.dept][r.sectionKey] ??= {
        sectionKey: r.sectionKey,
        sectionLabelFa: r.sectionLabelFa,
        perms: [],
      };
      byDept[r.dept][r.sectionKey].perms.push({
        key: r.key,
        labelFa: r.labelFa,
      });
    }
    return Object.fromEntries(
      Object.entries(byDept).map(([dept, sections]) => [
        dept,
        Object.values(sections),
      ]),
    );
  }

  private async getEmployeeOrThrow(id: string) {
    const employee = await this.userRepo.findOneBy({
      id,
      role: 'EMPLOYEE',
      deletedAt: IsNull(),
    });
    if (!employee) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'کارمند یافت نشد.',
      });
    }
    return employee;
  }

  /** Phase 31: an EMPLOYEE holding `us_manage` only ever reaches this
   * module scoped to their own dept — never another dept's roster.
   * `AuthenticatedUser` doesn't carry `dept` (it's not on the JWT), so
   * it's looked up fresh here, same freshness guarantee as
   * EmployeePermissionGuard's own live grant check. Returns `null` for
   * every non-EMPLOYEE role (IT_MANAGER stays unscoped). */
  private async deptScopeForEmployee(
    actor: AuthenticatedUser,
  ): Promise<string | null> {
    if (actor.role !== 'EMPLOYEE') return null;
    const self = await findOneOrThrow(this.userRepo, {
      where: { id: actor.id },
      select: { dept: true },
    });
    return self.dept;
  }

  async list(actor: AuthenticatedUser, query: ListEmployeesQueryDto) {
    const employeeDept = await this.deptScopeForEmployee(actor);
    const deptFilter = employeeDept ?? query.dept;
    const base: FindOptionsWhere<User> = {
      role: 'EMPLOYEE',
      deletedAt: IsNull(),
    };
    if (deptFilter) base.dept = deptFilter;

    const employees = await this.userRepo.find({
      where: query.q
        ? [
            { ...base, fullName: ILike(`%${query.q}%`) },
            { ...base, username: ILike(`%${query.q}%`) },
          ]
        : base,
      order: { createdAt: 'DESC' },
    });
    // UAT temporary identity/access accounts are infrastructure, never a
    // real employee — excluded from the roster IT_MANAGER sees.
    return employees
      .filter((e) => !isTemporaryPanelUsername(e.username))
      .map((e) => ({
        id: e.id,
        fullName: e.fullName,
        username: e.username,
        dept: e.dept,
        rank: e.rank,
        isActive: e.isActive,
        lastLoginAt: e.lastLoginAt,
        createdAt: e.createdAt,
      }));
  }

  async create(actor: AuthenticatedUser, dto: CreateEmployeeDto) {
    const normalizedPhone = normalizeIranPhone(dto.phone);
    const existing = await this.userRepo.findOneBy({
      username: dto.username,
    });
    if (existing) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'این نام کاربری قبلاً استفاده شده است.',
      });
    }

    const existingPhone = await this.userRepo.findOneBy({
      phone: normalizedPhone,
    });
    if (existingPhone) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'این شماره موبایل قبلاً استفاده شده است.',
      });
    }

    const catalogDept = catalogDeptFor(dto.dept);
    const isKnownCatalogDept = (CATALOG_DEPTS as readonly string[]).includes(
      catalogDept,
    );
    const requestedPermissionKeys = expandEmployeePermissionKeys(
      dto.permissionKeys ?? [],
    );
    const grantable = isKnownCatalogDept
      ? await this.permissionRepo.find({
          where: { dept: catalogDept, key: In(requestedPermissionKeys) },
        })
      : [];
    const grantableKeys = new Set(
      grantable.map((permission) => permission.key),
    );
    const invalidPermissionKeys = requestedPermissionKeys.filter(
      (key) => !grantableKeys.has(key),
    );
    if (invalidPermissionKeys.length > 0) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: `دسترسی‌های انتخاب‌شده برای این واحد معتبر نیست: ${invalidPermissionKeys.join(', ')}`,
      });
    }

    const passwordHash = await argon2.hash(dto.password);
    const employeeId = await this.userRepo.manager.transaction(async (tx) => {
      const employee = await tx.save(
        tx.create(User, {
          role: 'EMPLOYEE',
          fullName: dto.fullName,
          username: dto.username,
          phone: normalizedPhone,
          passwordHash,
          twoFactorEnabled: true,
          mustChangePassword: false,
          dept: dto.dept,
          rank: dto.rank,
          referralScope: dto.referralScope ?? 'MANAGERS_ONLY',
          createdById: actor.id,
          updatedAt: new Date(),
        }),
      );
      if (grantable.length > 0) {
        await tx.save(
          grantable.map((p) =>
            tx.create(EmployeePermission, {
              employeeId: employee.id,
              permissionId: p.id,
              grantedById: actor.id,
            }),
          ),
        );
      }
      return employee.id;
    });

    const deptLabel: Record<string, string> = {
      commercial: 'مدیر بازرگانی',
      sales: 'مدیر بازرگانی (واحد فروش)',
      finance: 'مدیر مالی',
      it: 'مدیر IT',
    };
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'ACCOUNT',
      action: 'ایجاد حساب کارمند',
      detail: `کارمند «${dto.fullName}» (${dto.username}) توسط ${actor.fullName} ایجاد و اعلان برای ${
        deptLabel[dto.dept] ?? 'واحد سازمانی'
      } ارسال شد.`,
      entityType: 'User',
      entityId: employeeId,
    });

    return this.get(actor, employeeId);
  }

  async get(actor: AuthenticatedUser, id: string) {
    const employeeDept = await this.deptScopeForEmployee(actor);
    const employee = await this.getEmployeeOrThrow(id);
    if (employeeDept && employee.dept !== employeeDept) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'دسترسی به کارمندان واحد دیگر برای شما مجاز نیست.',
      });
    }
    const granted = await this.employeePermissionRepo.find({
      where: { employeeId: id },
      relations: { permission: true },
    });
    const grantedKeys = new Set(granted.map((g) => g.permission.key));
    const catalogDept = catalogDeptFor(employee.dept ?? '');
    const available = PERMISSION_CATALOG.filter(
      (p) => p.dept === catalogDept && !grantedKeys.has(p.key),
    );

    return {
      id: employee.id,
      fullName: employee.fullName,
      username: employee.username,
      phone: employee.phone,
      dept: employee.dept,
      rank: employee.rank,
      referralScope: employee.referralScope,
      isActive: employee.isActive,
      lastLoginAt: employee.lastLoginAt,
      mustChangePassword: employee.mustChangePassword,
      createdAt: employee.createdAt,
      permissions: granted.map((g) => ({
        key: g.permission.key,
        labelFa: g.permission.labelFa,
        sectionLabelFa: g.permission.sectionLabelFa,
      })),
      available: available.map((p) => ({ key: p.key, labelFa: p.labelFa })),
    };
  }

  async setStatus(actor: AuthenticatedUser, id: string, isActive: boolean) {
    const employee = await this.getEmployeeOrThrow(id);
    await this.userRepo.update({ id }, { isActive, updatedAt: new Date() });
    const updated = await findOneOrThrow(this.userRepo, { where: { id } });

    if (!isActive) {
      // Revoke outstanding refresh tokens immediately; JwtAuthGuard also
      // re-checks live isActive on every request, so an already-issued
      // access token stops working on its very next use too — access
      // revocation doesn't wait for token expiry.
      await this.refreshTokenRepo.update(
        { userId: id, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );
    }

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'ACCOUNT',
      action: isActive ? 'فعال‌سازی حساب کارمند' : 'مسدودسازی حساب کارمند',
      detail: `حساب «${employee.fullName}» توسط ${actor.fullName} ${
        isActive ? 'فعال' : 'مسدود'
      } شد.`,
      entityType: 'User',
      entityId: id,
    });

    if (!isActive) {
      await this.notifications.notify({
        recipientId: id,
        category: 'SYSTEM',
        action: 'ACCESS_REVOKED',
        title: 'دسترسی حساب شما لغو شد',
        body: `دسترسی حساب کاربری شما توسط ${actor.fullName} مسدود شد.`,
        entityType: 'User',
        entityId: id,
        dedupeKey: `User:${id}:ACCESS_REVOKED:${updated.updatedAt.toISOString()}`,
      });
    }

    return { id: updated.id, isActive: updated.isActive };
  }

  async remove(actor: AuthenticatedUser, id: string) {
    const employee = await this.getEmployeeOrThrow(id);
    const deletedAt = new Date();

    await this.userRepo.manager.transaction(async (tx) => {
      await tx.update(
        RefreshToken,
        { userId: id, revokedAt: IsNull() },
        { revokedAt: deletedAt },
      );
      await tx.delete(EmployeePermission, { employeeId: id });
      await tx.update(
        User,
        { id },
        {
          isActive: false,
          deletedAt,
          username: null,
          phone: null,
          passwordHash: null,
          twoFactorEnabled: false,
          twoFactorSecret: null,
          mustChangePassword: false,
          updatedAt: deletedAt,
        },
      );
    });

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'ACCOUNT',
      action: 'حذف حساب کارمند',
      detail: `حساب «${employee.fullName}» (${employee.username ?? 'بدون نام کاربری'}) توسط ${actor.fullName} بایگانی شد و همه دسترسی‌ها و نشست‌های آن لغو گردید.`,
      entityType: 'User',
      entityId: id,
    });

    return { id, deletedAt: deletedAt.toISOString() };
  }

  async setPermission(
    actor: AuthenticatedUser,
    id: string,
    permissionKey: string,
    grant: boolean,
  ) {
    const employee = await this.getEmployeeOrThrow(id);
    const catalogDept = catalogDeptFor(employee.dept ?? '');
    const permission = await this.permissionRepo.findOneBy({
      dept: catalogDept,
      key: permissionKey,
    });
    if (!permission) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'این دسترسی برای واحد سازمانی این کارمند تعریف نشده است.',
      });
    }

    if (grant) {
      const grantKeys = expandEmployeePermissionKeys([permissionKey]);
      const permissions = await this.permissionRepo.find({
        where: { dept: catalogDept, key: In(grantKeys) },
      });
      const existing = await this.employeePermissionRepo.find({
        where: {
          employeeId: id,
          permissionId: In(permissions.map((row) => row.id)),
        },
      });
      const existingIds = new Set(existing.map((row) => row.permissionId));
      const missing = permissions.filter((row) => !existingIds.has(row.id));
      if (missing.length > 0) {
        await this.employeePermissionRepo.save(
          missing.map((row) =>
            this.employeePermissionRepo.create({
              employeeId: id,
              permissionId: row.id,
              grantedById: actor.id,
            }),
          ),
        );
      }
    } else {
      const revokeKeys = dependentEmployeePermissionKeys(permissionKey);
      const permissions = await this.permissionRepo.find({
        where: { dept: catalogDept, key: In(revokeKeys) },
      });
      if (permissions.length > 0) {
        await this.employeePermissionRepo.delete({
          employeeId: id,
          permissionId: In(permissions.map((row) => row.id)),
        });
      }
    }

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'ACCESS',
      action: grant ? 'افزودن دسترسی کارمند' : 'حذف دسترسی کارمند',
      detail: `دسترسی «${permission.labelFa}» برای «${employee.fullName}» توسط ${actor.fullName} ${
        grant ? 'افزوده' : 'حذف'
      } شد.`,
      entityType: 'User',
      entityId: id,
    });

    return this.get(actor, id);
  }

  async resetPassword(actor: AuthenticatedUser, id: string) {
    if (actor.role === 'EMPLOYEE' && actor.id === id) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'امکان بازنشانی رمز عبور خودتان از این مسیر وجود ندارد.',
      });
    }
    const employeeDept = await this.deptScopeForEmployee(actor);
    const employee = await this.getEmployeeOrThrow(id);
    if (employeeDept && employee.dept !== employeeDept) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'دسترسی به کارمندان واحد دیگر برای شما مجاز نیست.',
      });
    }
    const tempPassword = generateTempPassword();
    const passwordHash = await argon2.hash(tempPassword);

    await this.userRepo.manager.transaction(async (tx) => {
      await tx.update(
        User,
        { id },
        { passwordHash, mustChangePassword: true, updatedAt: new Date() },
      );
      await tx.save(
        tx.create(PasswordResetEvent, { employeeId: id, resetById: actor.id }),
      );
    });

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'ACCOUNT',
      action: 'بازنشانی رمز عبور کارمند',
      detail: `رمز عبور «${employee.fullName}» توسط ${actor.fullName} بازنشانی شد.`,
      entityType: 'User',
      entityId: id,
    });

    // Plaintext temp password is returned exactly once and never stored.
    return { tempPassword };
  }
}
