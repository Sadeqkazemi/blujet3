import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { User } from '../../database/entities/user.entity';
import { RefreshToken } from '../../database/entities/refresh-token.entity';
import { findOneOrThrow } from '../../database/utils/find-one-or-throw';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ErrorCode } from '../../common/errors';
import { generateTempPassword } from '../../common/temp-password';
import { SmsService } from '../sms/sms.service';
import { StepUpService } from '../auth/step-up.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import type { Role } from '../../database/enums';
import { isTemporaryPanelUsername } from '../../database/temporary-panel-accounts';
import {
  MANAGER_PANEL_PERMISSION_KEYS,
  type ManagerPanelPermissionKey,
} from '../panels/manager-panel-permissions';

const ROLE_LABEL_FA: Partial<Record<Role, string>> = {
  SENIOR_MANAGER: 'مدیر ارشد',
  FINANCE_MANAGER: 'مدیر مالی',
  COMMERCIAL_MANAGER: 'مدیر بازرگانی',
  IT_MANAGER: 'مدیر IT',
  SITE_ADMIN: 'ادمین سایت',
};

/** ⚑ Server-enforced management hierarchy (see docs/API.md Phase 12):
 * CEO/Chair manage every subordinate manager role; Senior manages the same
 * set minus itself. CEO/BOARD_CHAIR accounts are never manageable. */
const MANAGED_ROLES: Partial<Record<Role, Role[]>> = {
  CEO: [
    'SENIOR_MANAGER',
    'FINANCE_MANAGER',
    'COMMERCIAL_MANAGER',
    'IT_MANAGER',
    'SITE_ADMIN',
  ],
  BOARD_CHAIR: [
    'SENIOR_MANAGER',
    'FINANCE_MANAGER',
    'COMMERCIAL_MANAGER',
    'IT_MANAGER',
    'SITE_ADMIN',
  ],
  SENIOR_MANAGER: [
    'FINANCE_MANAGER',
    'COMMERCIAL_MANAGER',
    'IT_MANAGER',
    'SITE_ADMIN',
  ],
};

@Injectable()
export class AdminsService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly sms: SmsService,
    private readonly stepUp: StepUpService,
  ) {}

  private managedRolesFor(actor: AuthenticatedUser): Role[] {
    return MANAGED_ROLES[actor.role] ?? [];
  }

  private async getManagedOrThrow(actor: AuthenticatedUser, id: string) {
    const target = await this.userRepo.findOneBy({ id });
    if (!target || target.deletedAt) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'حساب مدیر یافت نشد.',
      });
    }
    if (
      target.id === actor.id ||
      !this.managedRolesFor(actor).includes(target.role)
    ) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'این حساب در حوزهٔ مدیریت شما نیست.',
      });
    }
    return target;
  }

  async list(actor: AuthenticatedUser) {
    const managed = this.managedRolesFor(actor);
    // Temporary UAT access identities are authentication infrastructure, not
    // operational manager records, so they never appear in this directory.
    const allAdminRoles = MANAGED_ROLES.CEO!;
    const now = new Date();

    const users = (
      await this.userRepo.find({
        where: { role: In(allAdminRoles), deletedAt: IsNull() },
        order: { createdAt: 'ASC' },
      })
    ).filter((user) => !isTemporaryPanelUsername(user.username));

    // Real derivation — an unexpired, unrevoked refresh token means a live
    // session; never a fabricated presence flag.
    const userIds = users.map((u) => u.id);
    const activeCounts = userIds.length
      ? await this.refreshTokenRepo
          .createQueryBuilder('rt')
          .select('rt.userId', 'userId')
          .addSelect('COUNT(*)', 'count')
          .where('rt.userId IN (:...userIds)', { userIds })
          .andWhere('rt.revokedAt IS NULL')
          .andWhere('rt.expiresAt > :now', { now })
          .groupBy('rt.userId')
          .getRawMany<{ userId: string; count: string }>()
      : [];
    const activeCountByUserId = new Map(
      activeCounts.map((r) => [r.userId, parseInt(r.count, 10)]),
    );

    return users.map((u) => {
      return {
        id: u.id,
        fullName: u.fullName,
        username: u.username,
        email: u.email,
        role: u.role,
        roleLabelFa: ROLE_LABEL_FA[u.role] ?? u.role,
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        isActive: u.isActive,
        online: (activeCountByUserId.get(u.id) ?? 0) > 0,
        managedByCaller: managed.includes(u.role) && u.id !== actor.id,
        permissions: u.panelPermissions,
      };
    });
  }

  async create(
    actor: AuthenticatedUser,
    dto: {
      fullName: string;
      email: string;
      username: string;
      role: Role;
      password: string;
      delivery: 'sms' | 'email';
      stepUpChallengeId: string;
      stepUpCode: string;
      permissions?: string[];
    },
  ) {
    await this.stepUp.verify(
      actor,
      dto.stepUpChallengeId,
      dto.stepUpCode,
      'ADMIN_ROLE_CHANGE',
    );

    if (!this.managedRolesFor(actor).includes(dto.role)) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'ایجاد حساب با این نقش در حوزهٔ شما نیست.',
      });
    }

    const existing = await this.userRepo.findOne({
      where: [{ username: dto.username }, { email: dto.email }],
    });
    if (existing) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'نام کاربری یا ایمیل قبلاً ثبت شده است.',
      });
    }

    const passwordHash = await argon2.hash(dto.password);
    const user = await this.userRepo.save(
      this.userRepo.create({
        role: dto.role,
        username: dto.username,
        email: dto.email,
        fullName: dto.fullName,
        passwordHash,
        mustChangePassword: true,
        twoFactorEnabled: true,
        isActive: true,
        panelPermissions: dto.permissions ?? null,
        updatedAt: new Date(),
      }),
    );

    let delivered = false;
    if (dto.delivery === 'sms') {
      const result = await this.sms.send(
        user.phone,
        `رمز عبور موقت شما در بلوجت: ${dto.password}`,
        'TEMP_PASSWORD',
      );
      delivered = result.success;
    }

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'ACCOUNT',
      action: 'ایجاد حساب مدیر / ادمین',
      detail: `حساب «${dto.fullName}» (${ROLE_LABEL_FA[dto.role] ?? dto.role}) توسط ${actor.fullName} ایجاد شد.`,
      entityType: 'User',
      entityId: user.id,
    });

    return {
      id: user.id,
      fullName: user.fullName,
      username: user.username,
      role: user.role,
      permissions: user.panelPermissions,
      tempPassword: dto.password,
      credentialDelivered: delivered,
    };
  }

  async setPermissions(
    actor: AuthenticatedUser,
    id: string,
    dto: {
      permissions: string[];
      stepUpChallengeId: string;
      stepUpCode: string;
    },
  ) {
    await this.stepUp.verify(
      actor,
      dto.stepUpChallengeId,
      dto.stepUpCode,
      'ADMIN_ROLE_CHANGE',
    );
    const target = await this.getManagedOrThrow(actor, id);
    const allowed = new Set<string>(MANAGER_PANEL_PERMISSION_KEYS);
    if (dto.permissions.some((permission) => !allowed.has(permission))) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'Unknown manager panel permission.',
      });
    }
    const permissions = [
      ...new Set(dto.permissions as ManagerPanelPermissionKey[]),
    ];
    await this.userRepo.update(
      { id },
      { panelPermissions: permissions, updatedAt: new Date() },
    );
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'SECURITY',
      action: 'تغییر سطح دسترسی پنل مدیر',
      detail: `دسترسی‌های «${target.fullName}» توسط ${actor.fullName} به‌روزرسانی شد.`,
      entityType: 'User',
      entityId: id,
    });
    return { id, permissions };
  }

  async setBlocked(actor: AuthenticatedUser, id: string, blocked: boolean) {
    const target = await this.getManagedOrThrow(actor, id);

    await this.userRepo.update(
      { id },
      { isActive: !blocked, updatedAt: new Date() },
    );
    const updated = await findOneOrThrow(this.userRepo, { where: { id } });

    if (blocked) {
      // Revoke this account's outstanding sessions immediately — isActive
      // alone doesn't kill an already-issued refresh token until its next
      // use, and a global logout-all would affect every other user too.
      await this.refreshTokenRepo.update(
        { userId: id, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );
    }

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'SECURITY',
      action: blocked ? 'مسدودسازی ورود مدیر' : 'رفع مسدودی ورود مدیر',
      detail: `ورود «${target.fullName}» توسط ${actor.fullName} ${blocked ? 'مسدود' : 'فعال'} شد.`,
      entityType: 'User',
      entityId: id,
    });

    if (blocked) {
      await this.notifications.notify({
        recipientId: id,
        category: 'SYSTEM',
        action: 'ACCESS_REVOKED',
        title: 'دسترسی حساب شما لغو شد',
        body: `دسترسی حساب مدیریتی شما توسط ${actor.fullName} مسدود شد.`,
        entityType: 'User',
        entityId: id,
        dedupeKey: `User:${id}:ACCESS_REVOKED:${updated.updatedAt.toISOString()}`,
      });
    }

    return { id: updated.id, isActive: updated.isActive };
  }

  async resetPassword(
    actor: AuthenticatedUser,
    id: string,
    dto: { password?: string; delivery?: 'sms' | 'email' },
  ) {
    const target = await this.getManagedOrThrow(actor, id);

    if (dto.password !== undefined && dto.password.length < 6) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'رمز عبور باید حداقل ۶ کاراکتر باشد.',
      });
    }
    const tempPassword = dto.password ?? generateTempPassword();
    const passwordHash = await argon2.hash(tempPassword);

    await this.userRepo.update(
      { id },
      { passwordHash, mustChangePassword: true, updatedAt: new Date() },
    );

    // Phase 14: same real-send treatment as create() — matches this
    // method's own default (anything not 'email' is sms).
    if (dto.delivery !== 'email') {
      await this.sms.send(
        target.phone,
        `رمز عبور موقت جدید شما در بلوجت: ${tempPassword}`,
        'TEMP_PASSWORD',
      );
    }

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'SECURITY',
      action: 'بازنشانی رمز عبور مدیر',
      detail: `رمز عبور «${target.fullName}» توسط ${actor.fullName} بازنشانی و از طریق ${dto.delivery === 'email' ? 'ایمیل سازمانی' : 'پیامک'} ارسال شد.`,
      entityType: 'User',
      entityId: id,
    });

    // Returned exactly once, never stored in plaintext.
    return { tempPassword };
  }
}
