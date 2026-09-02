import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import * as crypto from 'node:crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { User } from '../../database/entities/user.entity';
import { TwoFactorChallenge } from '../../database/entities/two-factor-challenge.entity';
import { RefreshToken } from '../../database/entities/refresh-token.entity';
import { AgencyProfile } from '../../database/entities/agency-profile.entity';
import { findOneOrThrow } from '../../database/utils/find-one-or-throw';
import { AuditService } from '../audit/audit.service';
import { ErrorCode } from '../../common/errors';
import { hashRefreshToken } from './auth-token.util';
import { TWO_FACTOR_PROVIDER } from './providers/two-factor-provider.interface';
import type { TwoFactorProvider } from './providers/two-factor-provider.interface';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { CustomerReferralsService } from '../customer-referrals/customer-referrals.service';
import type { Locale, Role } from '../../database/enums';
import { normalizeIranPhone } from '../../common/normalize-iran-phone';
import { generateOtpCode } from '../../common/generate-otp-code';
import {
  TEMPORARY_PHONE_LOGIN_ACCOUNTS,
  getTemporaryPanelAccessState,
} from '../../database/temporary-panel-accounts';
import { isSandboxAuthEnabled } from '../../common/sandbox-auth';

export interface AuthUserView {
  id: string;
  fullName: string;
  role: Role;
  preferredLocale: Locale;
  mustChangePassword: boolean;
  isSuperAdmin: boolean;
  isSandboxImpersonation: boolean;
}

export interface SandboxTenantAccountView {
  id: string;
  fullName: string;
  role: 'USER' | 'AGENCY';
  username: string | null;
}

export type StaffLoginResult =
  | { loginMode: 'TWO_FACTOR'; challengeId: string }
  | {
      loginMode: 'PASSWORD_ONLY';
      accessToken: string;
      refreshToken: string;
      user: AuthUserView;
    }
  | {
      loginMode: 'TEMPORARY_PASSWORD_ONLY';
      accessToken: string;
      refreshToken: string;
      user: AuthUserView;
      temporaryAccessExpiresAt: string;
    };

export type AgencyLoginResult =
  | { loginMode: 'TWO_FACTOR'; challengeId: string }
  | {
      accessToken: string;
      refreshToken: string;
      user: AuthUserView;
    };

function toAuthUserView(
  user: {
    id: string;
    fullName: string;
    role: Role;
    preferredLocale: Locale;
    mustChangePassword: boolean;
    isSuperAdmin?: boolean;
  },
  isSandboxImpersonation = false,
): AuthUserView {
  return {
    id: user.id,
    fullName: user.fullName,
    role: user.role,
    preferredLocale: user.preferredLocale,
    mustChangePassword: user.mustChangePassword,
    isSuperAdmin: user.isSuperAdmin === true,
    isSandboxImpersonation,
  };
}

const TWO_FACTOR_TTL_MS = 2 * 60 * 1000;
const TWO_FACTOR_MAX_ATTEMPTS = 5;
const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SANDBOX_IMPERSONATION_TTL = '15m';

const STAFF_ROLES = [
  'EMPLOYEE',
  'IT_MANAGER',
  'COMMERCIAL_MANAGER',
  'OPERATIONS_MANAGER',
  'FINANCE_MANAGER',
  'SENIOR_MANAGER',
  'CEO',
  'BOARD_CHAIR',
  'SITE_ADMIN',
] as const;

function generateSixDigitCode(): string {
  return generateOtpCode();
}

function hashToken(token: string): string {
  return hashRefreshToken(token);
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(TwoFactorChallenge)
    private readonly challengeRepo: Repository<TwoFactorChallenge>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
    @InjectRepository(AgencyProfile)
    private readonly agencyProfileRepo: Repository<AgencyProfile>,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    @Inject(TWO_FACTOR_PROVIDER)
    private readonly twoFactorProvider: TwoFactorProvider,
    private readonly customerReferrals: CustomerReferralsService,
  ) {}

  /** Phase 12 «تغییر رمز عبور من» — the current password must verify before
   * anything changes; no password material is ever logged. */
  async changeOwnPassword(
    actor: AuthenticatedUser,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await findOneOrThrow(this.userRepo, {
      where: { id: actor.id },
    });
    if (
      !user.passwordHash ||
      !(await argon2.verify(user.passwordHash, currentPassword))
    ) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'رمز عبور فعلی نادرست است.',
      });
    }

    await this.userRepo.update(
      { id: actor.id },
      {
        passwordHash: await argon2.hash(newPassword),
        mustChangePassword: false,
        updatedAt: new Date(),
      },
    );

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'SECURITY',
      action: 'تغییر رمز عبور حساب خود',
      detail: `${actor.fullName} رمز عبور حساب خود را تغییر داد.`,
      entityType: 'User',
      entityId: actor.id,
    });
  }

  /** GET /auth/me does a fresh DB read (not a bare JWT-payload echo) so
   * `preferredLocale` — which the user can change far more often than a
   * short-lived access token gets refreshed — is never stale. */
  async getMe(actor: AuthenticatedUser): Promise<AuthUserView> {
    const user = await findOneOrThrow(this.userRepo, {
      where: { id: actor.id },
      select: {
        id: true,
        fullName: true,
        role: true,
        preferredLocale: true,
        mustChangePassword: true,
        isSuperAdmin: true,
      },
    });
    return toAuthUserView(user, Boolean(actor.sandboxOwnerId));
  }

  private assertSandboxOwner(actor: AuthenticatedUser): void {
    if (
      !actor.isSuperAdmin ||
      process.env.SANDBOX_SUPER_ADMIN_TENANT_ACCESS !== 'true'
    ) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'دسترسی آزمایشی به حساب کاربران و آژانس‌ها غیرفعال است.',
      });
    }
  }

  async listSandboxTenantAccounts(
    actor: AuthenticatedUser,
  ): Promise<SandboxTenantAccountView[]> {
    this.assertSandboxOwner(actor);
    const [customers, agencies] = await Promise.all(
      (['USER', 'AGENCY'] as const).map((role) =>
        this.userRepo.find({
          where: { role, isActive: true, deletedAt: IsNull() },
          select: { id: true, fullName: true, role: true, username: true },
          order: { createdAt: 'ASC' },
        }),
      ),
    );
    const activeAgencyProfiles = agencies.length
      ? await this.agencyProfileRepo.find({
          where: {
            userId: In(agencies.map((agency) => agency.id)),
            suspendedAt: IsNull(),
          },
          select: { userId: true },
        })
      : [];
    const activeAgencyIds = new Set(
      activeAgencyProfiles.map((profile) => profile.userId),
    );
    const users = [
      ...customers,
      ...agencies.filter((agency) => activeAgencyIds.has(agency.id)),
    ];

    return users.map((user) => ({
      id: user.id,
      fullName: user.fullName,
      role: user.role as 'USER' | 'AGENCY',
      username: user.username,
    }));
  }

  async startSandboxImpersonation(
    actor: AuthenticatedUser,
    targetUserId: string,
  ): Promise<{ accessToken: string; user: AuthUserView }> {
    this.assertSandboxOwner(actor);
    const target = await this.userRepo.findOne({
      where: {
        id: targetUserId,
        role: In(['USER', 'AGENCY']),
        isActive: true,
        deletedAt: IsNull(),
      },
    });
    if (!target) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'حساب آزمایشی انتخاب‌شده در دسترس نیست.',
      });
    }
    if (target.role === 'AGENCY') {
      const profile = await this.agencyProfileRepo.findOne({
        where: { userId: target.id },
        select: { userId: true, suspendedAt: true },
      });
      if (!profile || profile.suspendedAt) {
        throw new ForbiddenException({
          code: ErrorCode.FORBIDDEN,
          message: 'پروفایل آژانس انتخاب‌شده فعال نیست.',
        });
      }
    }

    const accessToken = this.jwt.sign(
      {
        sub: target.id,
        role: target.role,
        fullName: target.fullName,
        isSuperAdmin: false,
        sandboxOwnerId: actor.id,
      },
      {
        secret: process.env.JWT_ACCESS_SECRET,
        expiresIn: SANDBOX_IMPERSONATION_TTL,
      },
    );
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'SECURITY',
      action: 'شروع مشاهده آزمایشی حساب',
      detail: `مالک سامانه یک نشست آزمایشی کوتاه برای نقش ${target.role} آغاز کرد.`,
      entityType: 'User',
      entityId: target.id,
      metadata: {
        sandboxImpersonation: true,
        targetRole: target.role,
      },
    });

    return {
      accessToken,
      user: toAuthUserView(target, true),
    };
  }

  /** Display-language preference — the DB row is only the cross-device sync
   * point for a logged-in USER/AGENCY; an anonymous visitor's choice lives
   * in localStorage until they log in (see docs/API.md). Meaningful for any
   * role technically, but only USER/AGENCY frontends expose the switcher —
   * staff panels stay Persian-only, per the design refresh's scope. Not
   * audited: a display preference isn't a security/financial/admin event. */
  async updateLocale(
    actor: AuthenticatedUser,
    locale: 'FA' | 'EN' | 'AR',
  ): Promise<{ preferredLocale: 'FA' | 'EN' | 'AR' }> {
    await this.userRepo.update(
      { id: actor.id },
      { preferredLocale: locale, updatedAt: new Date() },
    );
    const updated = await findOneOrThrow(this.userRepo, {
      where: { id: actor.id },
      select: { preferredLocale: true },
    });
    return updated;
  }

  /** فراموشی رمز — the caller already proved phone ownership via
   * POST /auth/otp/verify (issuing the JWT this endpoint requires), so no
   * current-password check applies here, unlike changeOwnPassword above.
   * Also doubles as "set a password for the first time" for a customer who
   * only ever logged in via OTP — CLAUDE.md's email+password is optional,
   * bootstrapped through this same OTP-verified flow rather than a
   * separate signup step. `@Roles('USER')` at the controller keeps this
   * from ever being reachable for a staff/agency token. */
  async setOwnPassword(
    actor: AuthenticatedUser,
    newPassword: string,
  ): Promise<void> {
    await this.userRepo.update(
      { id: actor.id },
      {
        passwordHash: await argon2.hash(newPassword),
        mustChangePassword: false,
        updatedAt: new Date(),
      },
    );

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'SECURITY',
      action: 'تعیین/بازنشانی رمز عبور مشتری',
      detail: `${actor.fullName} رمز عبور حساب خود را از طریق تأیید OTP تعیین کرد.`,
      entityType: 'User',
      entityId: actor.id,
    });
  }

  /** ورود مشتری با موبایل+رمز — the optional secondary login method
   * alongside phone+OTP; no 2FA (customers aren't staff). */
  async customerPasswordLogin(
    phone: string,
    password: string,
    context: { userAgent?: string; ip?: string },
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    user: AuthUserView;
  }> {
    const user = await this.userRepo.findOneBy({
      phone: normalizeIranPhone(phone),
    });
    if (!user || user.role !== 'USER' || !user.passwordHash) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'شماره موبایل یا رمز عبور نادرست است.',
      });
    }
    if (!user.isActive) {
      throw new ForbiddenException({
        code: 'ACCOUNT_SUSPENDED',
        message: 'این حساب مسدود شده است.',
      });
    }
    if (!(await argon2.verify(user.passwordHash, password))) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'شماره موبایل یا رمز عبور نادرست است.',
      });
    }

    // UAT shared-password temp customer account. Only ever set by
    // the UAT bootstrap script, so real customers never hit this.
    const temporaryAccessState = getTemporaryPanelAccessState(user);
    if (temporaryAccessState !== 'NONE') {
      if (!isSandboxAuthEnabled()) {
        throw new ForbiddenException({
          code: 'SANDBOX_AUTH_DISABLED',
          message: 'ورود آزمایشی موقت در این محیط فعال نیست.',
        });
      }
      if (temporaryAccessState !== 'ACTIVE') {
        throw new ForbiddenException({
          code: ErrorCode.TEMPORARY_ACCESS_EXPIRED,
          message: 'مهلت دسترسی آزمایشی این حساب به پایان رسیده است.',
        });
      }
      const deadline = user.temporaryPasswordOnlyUntil!;
      await this.userRepo.update(
        { id: user.id },
        { lastLoginAt: new Date(), updatedAt: new Date() },
      );
      const jwtUser: AuthenticatedUser = {
        id: user.id,
        role: user.role,
        fullName: user.fullName,
      };
      const accessToken = this.signAccessToken(jwtUser, deadline);
      const refreshToken = await this.issueRefreshToken(
        user.id,
        context,
        deadline,
      );
      await this.audit.record({
        actorId: user.id,
        actorRole: user.role,
        category: 'SECURITY',
        action: 'ورود آزمایشی موقت بدون OTP',
        detail: `حساب UAT ${user.username} در بازه موقت تأییدشده وارد پنل کاربر شد.`,
        entityType: 'User',
        entityId: user.id,
        metadata: {
          loginMode: 'TEMPORARY_PASSWORD_ONLY',
          expiresAt: deadline.toISOString(),
        },
      });
      return { accessToken, refreshToken, user: toAuthUserView(user) };
    }

    await this.userRepo.update(
      { id: user.id },
      { lastLoginAt: new Date(), updatedAt: new Date() },
    );

    const jwtUser: AuthenticatedUser = {
      id: user.id,
      role: user.role,
      fullName: user.fullName,
    };
    const accessToken = this.signAccessToken(jwtUser);
    const refreshToken = await this.issueRefreshToken(user.id, context);

    return { accessToken, refreshToken, user: toAuthUserView(user) };
  }

  /**
   * فراموشی رمز — email path (Phase 51). An alternative to phone+SMS OTP
   * for customers whose account has a VERIFIED email (Phase 17's
   * emailVerifiedAt) — real functionality, not gated by display locale,
   * since restricting a security recovery path by UI language would be an
   * arbitrary and fragile restriction; some fa-locale customers may also
   * lack a reachable Iranian phone at reset time and some en/ar-locale
   * customers may have one. Deliberately does NOT upsert/create an
   * account the way requestOtp does — inventing an account for an
   * arbitrary submitted email would let anyone probe/claim an address
   * that isn't theirs.
   */
  async requestPasswordResetEmail(
    email: string,
  ): Promise<{ challengeId: string }> {
    const user = await this.userRepo
      .createQueryBuilder('u')
      .where('u.email = :email', { email })
      .andWhere('u.role = :role', { role: 'USER' })
      .andWhere('u."emailVerifiedAt" IS NOT NULL')
      .getOne();
    if (!user) {
      throw new UnauthorizedException({
        code: ErrorCode.NOT_FOUND,
        message: 'حساب کاربری با ایمیل تأییدشدهٔ داده‌شده یافت نشد.',
      });
    }
    if (!user.isActive) {
      throw new ForbiddenException({
        code: 'ACCOUNT_SUSPENDED',
        message: 'این حساب مسدود شده است.',
      });
    }

    const code = generateSixDigitCode();
    const challenge = await this.challengeRepo.save(
      this.challengeRepo.create({
        userId: user.id,
        purpose: 'PASSWORD_RESET_EMAIL',
        codeHash: await argon2.hash(code),
        expiresAt: new Date(Date.now() + TWO_FACTOR_TTL_MS),
      }),
    );
    await this.twoFactorProvider.sendCode(
      { id: user.id, fullName: user.fullName, email: user.email, phone: null },
      code,
    );

    return { challengeId: challenge.id };
  }

  /** Verifies the emailed reset code and logs the customer in — same
   * trust handoff as verifyOtp, so the frontend can immediately call the
   * existing POST /auth/set-password with no current-password check. */
  async verifyPasswordResetEmail(
    challengeId: string,
    code: string,
    context: { userAgent?: string; ip?: string },
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    user: AuthUserView;
  }> {
    const challenge = await this.challengeRepo.findOne({
      where: { id: challengeId },
      relations: { user: true },
    });

    if (!challenge || challenge.purpose !== 'PASSWORD_RESET_EMAIL') {
      throw new UnauthorizedException({
        code: 'TWO_FACTOR_INVALID',
        message: 'کد نامعتبر است.',
      });
    }
    if (challenge.consumedAt) {
      throw new UnauthorizedException({
        code: 'TWO_FACTOR_INVALID',
        message: 'این کد قبلاً استفاده شده است.',
      });
    }
    if (challenge.expiresAt < new Date()) {
      throw new UnauthorizedException({
        code: 'TWO_FACTOR_EXPIRED',
        message: 'کد منقضی شده است.',
      });
    }
    if (challenge.attempts >= TWO_FACTOR_MAX_ATTEMPTS) {
      throw new UnauthorizedException({
        code: 'TWO_FACTOR_INVALID',
        message: 'تعداد تلاش‌های مجاز به پایان رسید.',
      });
    }

    const codeValid = await argon2.verify(challenge.codeHash, code);
    if (!codeValid) {
      await this.challengeRepo.increment({ id: challenge.id }, 'attempts', 1);
      throw new UnauthorizedException({
        code: 'TWO_FACTOR_INVALID',
        message: 'کد وارد شده نادرست است.',
      });
    }

    await this.challengeRepo.update(
      { id: challenge.id },
      { consumedAt: new Date() },
    );
    await this.userRepo.update(
      { id: challenge.userId },
      { lastLoginAt: new Date(), updatedAt: new Date() },
    );

    const user = challenge.user;
    const jwtUser: AuthenticatedUser = {
      id: user.id,
      role: user.role,
      fullName: user.fullName,
    };
    const accessToken = this.signAccessToken(jwtUser);
    const refreshToken = await this.issueRefreshToken(user.id, context);

    return { accessToken, refreshToken, user: toAuthUserView(user) };
  }

  async staffLogin(
    username: string,
    password: string,
    context: { userAgent?: string; ip?: string },
  ): Promise<StaffLoginResult> {
    const user = await this.userRepo.findOneBy({ username });

    if (
      !user ||
      !STAFF_ROLES.includes(user.role as (typeof STAFF_ROLES)[number]) ||
      !user.passwordHash
    ) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'نام کاربری یا رمز عبور نادرست است.',
      });
    }
    if (!user.isActive) {
      throw new ForbiddenException({
        code: 'ACCOUNT_SUSPENDED',
        message: 'این حساب مسدود شده است.',
      });
    }

    const passwordValid = await argon2.verify(user.passwordHash, password);
    if (!passwordValid) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'نام کاربری یا رمز عبور نادرست است.',
      });
    }

    if (user.isSuperAdmin) {
      const jwtUser: AuthenticatedUser = {
        id: user.id,
        role: user.role,
        fullName: user.fullName,
        isSuperAdmin: true,
      };
      await this.userRepo.update(
        { id: user.id },
        { lastLoginAt: new Date(), updatedAt: new Date() },
      );
      const accessToken = this.signAccessToken(jwtUser);
      const refreshToken = await this.issueRefreshToken(user.id, context);
      await this.audit.record({
        actorId: user.id,
        actorRole: user.role,
        category: 'SECURITY',
        action: 'ورود مالک سامانه بدون OTP',
        detail: `حساب مالک ${user.username} با رمز عبور معتبر وارد سامانه شد.`,
        entityType: 'User',
        entityId: user.id,
        metadata: { loginMode: 'PASSWORD_ONLY', isSuperAdmin: true },
      });
      return {
        loginMode: 'PASSWORD_ONLY',
        accessToken,
        refreshToken,
        user: toAuthUserView(user),
      };
    }

    const temporaryAccessState = getTemporaryPanelAccessState(user);
    if (temporaryAccessState !== 'NONE') {
      if (!isSandboxAuthEnabled()) {
        throw new ForbiddenException({
          code: 'SANDBOX_AUTH_DISABLED',
          message: 'ورود آزمایشی موقت در این محیط فعال نیست.',
        });
      }
      if (temporaryAccessState !== 'ACTIVE') {
        throw new ForbiddenException({
          code: ErrorCode.TEMPORARY_ACCESS_EXPIRED,
          message:
            'مهلت دسترسی آزمایشی این حساب به پایان رسیده است. برای ادامه با مدیر IT تماس بگیرید.',
        });
      }

      const deadline = user.temporaryPasswordOnlyUntil!;
      const jwtUser: AuthenticatedUser = {
        id: user.id,
        role: user.role,
        fullName: user.fullName,
      };
      await this.userRepo.update(
        { id: user.id },
        { lastLoginAt: new Date(), updatedAt: new Date() },
      );
      const accessToken = this.signAccessToken(jwtUser, deadline);
      const refreshToken = await this.issueRefreshToken(
        user.id,
        context,
        deadline,
      );
      await this.audit.record({
        actorId: user.id,
        actorRole: user.role,
        category: 'SECURITY',
        action: 'ورود آزمایشی موقت بدون OTP',
        detail: `حساب UAT ${user.username} در بازه موقت تأییدشده وارد پنل شد.`,
        entityType: 'User',
        entityId: user.id,
        metadata: {
          loginMode: 'TEMPORARY_PASSWORD_ONLY',
          expiresAt: deadline.toISOString(),
        },
      });
      return {
        loginMode: 'TEMPORARY_PASSWORD_ONLY',
        accessToken,
        refreshToken,
        user: toAuthUserView(user),
        temporaryAccessExpiresAt: deadline.toISOString(),
      };
    }

    const code = generateSixDigitCode();
    const challenge = await this.challengeRepo.save(
      this.challengeRepo.create({
        userId: user.id,
        purpose: 'STAFF_LOGIN_2FA',
        codeHash: await argon2.hash(code),
        expiresAt: new Date(Date.now() + TWO_FACTOR_TTL_MS),
      }),
    );

    await this.twoFactorProvider.sendCode(user, code);

    return { loginMode: 'TWO_FACTOR', challengeId: challenge.id };
  }

  async staffLoginMode(
    username: string,
  ): Promise<{ mode: 'FIRST_LOGIN_SETUP' | 'PASSWORD' }> {
    if (!isSandboxAuthEnabled()) return { mode: 'PASSWORD' };
    const user = await this.userRepo.findOneBy({ username: username.trim() });
    const isStaff =
      user && STAFF_ROLES.includes(user.role as (typeof STAFF_ROLES)[number]);
    const firstLogin =
      isStaff &&
      user.isActive &&
      !user.isSuperAdmin &&
      user.lastLoginAt === null &&
      user.mustChangePassword &&
      getTemporaryPanelAccessState(user) === 'NONE';
    return { mode: firstLogin ? 'FIRST_LOGIN_SETUP' : 'PASSWORD' };
  }

  async requestStaffFirstLogin(
    username: string,
    phone: string,
    newPassword: string,
  ): Promise<{ challengeId: string }> {
    if (!isSandboxAuthEnabled()) {
      throw new ForbiddenException({
        code: 'SANDBOX_AUTH_DISABLED',
        message: 'راه‌اندازی آزمایشی ورود در این محیط فعال نیست.',
      });
    }
    const user = await this.userRepo.findOneBy({ username: username.trim() });
    if (
      !user ||
      !STAFF_ROLES.includes(user.role as (typeof STAFF_ROLES)[number]) ||
      user.isSuperAdmin ||
      user.lastLoginAt !== null ||
      getTemporaryPanelAccessState(user) !== 'NONE'
    ) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'امکان راه‌اندازی اولین ورود برای این حساب وجود ندارد.',
      });
    }
    if (!user.isActive) {
      throw new ForbiddenException({
        code: 'ACCOUNT_SUSPENDED',
        message: 'این حساب مسدود شده است.',
      });
    }

    const normalizedPhone = normalizeIranPhone(phone);
    const phoneOwner = await this.userRepo.findOneBy({ phone: normalizedPhone });
    if (phoneOwner && phoneOwner.id !== user.id) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'امکان ثبت این شماره موبایل وجود ندارد.',
      });
    }

    await this.userRepo.update(
      { id: user.id },
      {
        phone: normalizedPhone,
        passwordHash: await argon2.hash(newPassword),
        twoFactorEnabled: true,
        mustChangePassword: false,
        updatedAt: new Date(),
      },
    );
    user.phone = normalizedPhone;
    user.passwordHash = 'configured';
    user.mustChangePassword = false;

    await this.challengeRepo.update(
      { userId: user.id, purpose: 'STAFF_LOGIN_2FA', consumedAt: IsNull() },
      { consumedAt: new Date() },
    );
    const code = generateSixDigitCode();
    const challenge = await this.challengeRepo.save(
      this.challengeRepo.create({
        userId: user.id,
        purpose: 'STAFF_LOGIN_2FA',
        codeHash: await argon2.hash(code),
        expiresAt: new Date(Date.now() + TWO_FACTOR_TTL_MS),
      }),
    );
    await this.twoFactorProvider.sendCode(user, code);
    await this.audit.record({
      actorId: user.id,
      actorRole: user.role,
      category: 'SECURITY',
      action: 'راه‌اندازی اولین ورود در Sandbox',
      detail: `${user.fullName} رمز عبور و شماره موبایل اولین ورود خود را ثبت کرد.`,
      entityType: 'User',
      entityId: user.id,
    });
    return { challengeId: challenge.id };
  }

  async verifyTwoFactor(
    challengeId: string,
    code: string,
    context: { userAgent?: string; ip?: string },
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    user: AuthUserView;
  }> {
    const challenge = await this.challengeRepo.findOne({
      where: { id: challengeId },
      relations: { user: true },
    });

    if (!challenge || challenge.purpose !== 'STAFF_LOGIN_2FA') {
      throw new UnauthorizedException({
        code: 'TWO_FACTOR_INVALID',
        message: 'کد نامعتبر است.',
      });
    }
    if (challenge.consumedAt) {
      throw new UnauthorizedException({
        code: 'TWO_FACTOR_INVALID',
        message: 'این کد قبلاً استفاده شده است.',
      });
    }
    if (challenge.expiresAt < new Date()) {
      throw new UnauthorizedException({
        code: 'TWO_FACTOR_EXPIRED',
        message: 'کد منقضی شده است.',
      });
    }
    if (challenge.attempts >= TWO_FACTOR_MAX_ATTEMPTS) {
      throw new UnauthorizedException({
        code: 'TWO_FACTOR_INVALID',
        message: 'تعداد تلاش‌های مجاز به پایان رسید.',
      });
    }

    const codeValid = await argon2.verify(challenge.codeHash, code);
    if (!codeValid) {
      await this.challengeRepo.increment({ id: challenge.id }, 'attempts', 1);
      throw new UnauthorizedException({
        code: 'TWO_FACTOR_INVALID',
        message: 'کد وارد شده نادرست است.',
      });
    }

    await this.challengeRepo.update(
      { id: challenge.id },
      { consumedAt: new Date() },
    );
    await this.userRepo.update(
      { id: challenge.userId },
      { lastLoginAt: new Date(), updatedAt: new Date() },
    );

    const user = challenge.user;
    const jwtUser: AuthenticatedUser = {
      id: user.id,
      role: user.role,
      fullName: user.fullName,
    };
    const accessToken = this.signAccessToken(jwtUser);
    const refreshToken = await this.issueRefreshToken(user.id, context);

    return { accessToken, refreshToken, user: toAuthUserView(user) };
  }

  /** Agency Portal login: phone+password, no 2FA step (unlike staff login) —
   * the design's آژانس همکار tab shows no 2FA anywhere. See docs/API.md ⚑. */
  async agencyLogin(
    phone: string,
    password: string,
    context: { userAgent?: string; ip?: string },
  ): Promise<AgencyLoginResult> {
    const normalizedPhone = normalizeIranPhone(phone);
    const sandboxAgency = TEMPORARY_PHONE_LOGIN_ACCOUNTS.find(
      (account) =>
        account.role === 'AGENCY' &&
        normalizeIranPhone(account.phone) === normalizedPhone,
    );
    // The reserved UAT number may have been used by the public OTP flow
    // before the dedicated agency identity existed. In sandbox only, resolve
    // that reserved input by its immutable UAT username instead of whichever
    // historical row currently owns the canonical phone column.
    const user =
      isSandboxAuthEnabled() && sandboxAgency
        ? await this.userRepo.findOneBy({ username: sandboxAgency.username })
        : await this.userRepo.findOneBy({ phone: normalizedPhone });

    if (
      !user ||
      user.role !== 'AGENCY' ||
      !user.passwordHash ||
      !(await argon2.verify(user.passwordHash, password))
    ) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'شماره تماس یا رمز عبور نادرست است.',
      });
    }
    if (!user.isActive) {
      throw new ForbiddenException({
        code: 'ACCOUNT_SUSPENDED',
        message: 'این حساب غیرفعال شده است.',
      });
    }
    const agencyProfile = await this.agencyProfileRepo.findOneBy({
      userId: user.id,
    });
    if (agencyProfile?.suspendedAt) {
      throw new ForbiddenException({
        code: 'ACCOUNT_SUSPENDED',
        message: 'حساب آژانس شما تعلیق شده است.',
      });
    }

    // UAT shared-password temp agency account. Only ever set by the
    // UAT bootstrap script, so real agencies never hit this.
    const temporaryAccessState = getTemporaryPanelAccessState(user);
    if (temporaryAccessState !== 'NONE') {
      if (!isSandboxAuthEnabled()) {
        throw new ForbiddenException({
          code: 'SANDBOX_AUTH_DISABLED',
          message: 'ورود آزمایشی موقت در این محیط فعال نیست.',
        });
      }
      if (temporaryAccessState !== 'ACTIVE') {
        throw new ForbiddenException({
          code: ErrorCode.TEMPORARY_ACCESS_EXPIRED,
          message: 'مهلت دسترسی آزمایشی این حساب به پایان رسیده است.',
        });
      }
      const deadline = user.temporaryPasswordOnlyUntil!;
      await this.userRepo.update(
        { id: user.id },
        { lastLoginAt: new Date(), updatedAt: new Date() },
      );
      const jwtUser: AuthenticatedUser = {
        id: user.id,
        role: user.role,
        fullName: user.fullName,
      };
      const accessToken = this.signAccessToken(jwtUser, deadline);
      const refreshToken = await this.issueRefreshToken(
        user.id,
        context,
        deadline,
      );
      await this.audit.record({
        actorId: user.id,
        actorRole: user.role,
        category: 'SECURITY',
        action: 'ورود آزمایشی موقت بدون OTP',
        detail: `حساب UAT ${user.username} در بازه موقت تأییدشده وارد پنل آژانس شد.`,
        entityType: 'User',
        entityId: user.id,
        metadata: {
          loginMode: 'TEMPORARY_PASSWORD_ONLY',
          expiresAt: deadline.toISOString(),
        },
      });
      return { accessToken, refreshToken, user: toAuthUserView(user) };
    }

    if (isSandboxAuthEnabled()) {
      await this.challengeRepo.update(
        { userId: user.id, purpose: 'AGENCY_LOGIN_2FA', consumedAt: IsNull() },
        { consumedAt: new Date() },
      );
      const code = generateSixDigitCode();
      const challenge = await this.challengeRepo.save(
        this.challengeRepo.create({
          userId: user.id,
          purpose: 'AGENCY_LOGIN_2FA',
          codeHash: await argon2.hash(code),
          expiresAt: new Date(Date.now() + TWO_FACTOR_TTL_MS),
        }),
      );
      await this.twoFactorProvider.sendCode(user, code);
      return { loginMode: 'TWO_FACTOR', challengeId: challenge.id };
    }

    await this.userRepo.update(
      { id: user.id },
      { lastLoginAt: new Date(), updatedAt: new Date() },
    );

    const jwtUser: AuthenticatedUser = {
      id: user.id,
      role: user.role,
      fullName: user.fullName,
    };
    const accessToken = this.signAccessToken(jwtUser);
    const refreshToken = await this.issueRefreshToken(user.id, context);

    return { accessToken, refreshToken, user: toAuthUserView(user) };
  }

  /** Sandbox-only activation for an approved agency's first portal login. */
  async requestAgencyFirstLogin(
    phone: string,
    newPassword: string,
  ): Promise<{ challengeId: string }> {
    if (!isSandboxAuthEnabled()) {
      throw new ForbiddenException({
        code: 'SANDBOX_AUTH_DISABLED',
        message: 'فعال‌سازی آزمایشی آژانس در این محیط فعال نیست.',
      });
    }
    const user = await this.userRepo.findOneBy({ phone: normalizeIranPhone(phone) });
    if (
      !user ||
      user.role !== 'AGENCY' ||
      (user.lastLoginAt !== null && !user.mustChangePassword)
    ) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'امکان فعال‌سازی اولین ورود برای این حساب وجود ندارد.',
      });
    }
    if (!user.isActive) {
      throw new ForbiddenException({ code: 'ACCOUNT_SUSPENDED', message: 'این حساب غیرفعال شده است.' });
    }
    const agencyProfile = await this.agencyProfileRepo.findOneBy({ userId: user.id });
    if (agencyProfile?.suspendedAt) {
      throw new ForbiddenException({ code: 'ACCOUNT_SUSPENDED', message: 'حساب آژانس شما تعلیق شده است.' });
    }

    await this.userRepo.update(
      { id: user.id },
      {
        passwordHash: await argon2.hash(newPassword),
        mustChangePassword: false,
        updatedAt: new Date(),
      },
    );
    user.passwordHash = 'configured';
    user.mustChangePassword = false;
    await this.challengeRepo.update(
      { userId: user.id, purpose: 'AGENCY_LOGIN_2FA', consumedAt: IsNull() },
      { consumedAt: new Date() },
    );
    const code = generateSixDigitCode();
    const challenge = await this.challengeRepo.save(
      this.challengeRepo.create({
        userId: user.id,
        purpose: 'AGENCY_LOGIN_2FA',
        codeHash: await argon2.hash(code),
        expiresAt: new Date(Date.now() + TWO_FACTOR_TTL_MS),
      }),
    );
    await this.twoFactorProvider.sendCode(user, code);
    return { challengeId: challenge.id };
  }

  async verifyAgencyLogin(
    challengeId: string,
    code: string,
    context: { userAgent?: string; ip?: string },
  ): Promise<{ accessToken: string; refreshToken: string; user: AuthUserView }> {
    const challenge = await this.challengeRepo.findOne({
      where: { id: challengeId },
      relations: { user: true },
    });
    if (!challenge || challenge.purpose !== 'AGENCY_LOGIN_2FA' || challenge.user.role !== 'AGENCY') {
      throw new UnauthorizedException({ code: 'TWO_FACTOR_INVALID', message: 'کد نامعتبر است.' });
    }
    if (challenge.consumedAt || challenge.attempts >= TWO_FACTOR_MAX_ATTEMPTS) {
      throw new UnauthorizedException({ code: 'TWO_FACTOR_INVALID', message: 'این کد قابل استفاده نیست.' });
    }
    if (challenge.expiresAt < new Date()) {
      throw new UnauthorizedException({ code: 'TWO_FACTOR_EXPIRED', message: 'کد منقضی شده است.' });
    }
    if (!(await argon2.verify(challenge.codeHash, code))) {
      await this.challengeRepo.increment({ id: challenge.id }, 'attempts', 1);
      throw new UnauthorizedException({ code: 'TWO_FACTOR_INVALID', message: 'کد واردشده نادرست است.' });
    }

    const user = challenge.user;
    if (!user.isActive) {
      throw new ForbiddenException({ code: 'ACCOUNT_SUSPENDED', message: 'این حساب غیرفعال شده است.' });
    }
    const agencyProfile = await this.agencyProfileRepo.findOneBy({ userId: user.id });
    if (agencyProfile?.suspendedAt) {
      throw new ForbiddenException({ code: 'ACCOUNT_SUSPENDED', message: 'حساب آژانس شما تعلیق شده است.' });
    }
    await this.challengeRepo.update({ id: challenge.id }, { consumedAt: new Date() });
    await this.userRepo.update(
      { id: user.id },
      { lastLoginAt: new Date(), updatedAt: new Date() },
    );
    const jwtUser: AuthenticatedUser = { id: user.id, role: user.role, fullName: user.fullName };
    return {
      accessToken: this.signAccessToken(jwtUser),
      refreshToken: await this.issueRefreshToken(user.id, context),
      user: toAuthUserView(user),
    };
  }

  /** Public purchase engine: customer phone+OTP login (design's ورود و
   * ثبت‌نام — primary auth, no password). Find-or-create keeps this a
   * single step for first-time buyers, matching the design's single phone
   * field with no separate registration form. */
  async requestOtp(
    phone: string,
    referralCode?: string,
  ): Promise<{ challengeId: string }> {
    const normalizedPhone = normalizeIranPhone(phone);
    const existing = await this.userRepo.findOneBy({ phone: normalizedPhone });
    const user =
      existing ??
      (await this.userRepo.save(
        this.userRepo.create({
          role: 'USER',
          phone: normalizedPhone,
          fullName: normalizedPhone,
          updatedAt: new Date(),
        }),
      ));
    if (!existing) {
      await this.customerReferrals.applyOnSignup(user.id, referralCode);
    }
    if (!user.isActive) {
      throw new ForbiddenException({
        code: 'ACCOUNT_SUSPENDED',
        message: 'این حساب مسدود شده است.',
      });
    }

    await this.challengeRepo.update(
      { userId: user.id, purpose: 'CUSTOMER_OTP_LOGIN', consumedAt: IsNull() },
      { consumedAt: new Date() },
    );

    const code = generateOtpCode();
    const challenge = await this.challengeRepo.save(
      this.challengeRepo.create({
        userId: user.id,
        purpose: 'CUSTOMER_OTP_LOGIN',
        codeHash: await argon2.hash(code),
        expiresAt: new Date(Date.now() + TWO_FACTOR_TTL_MS),
      }),
    );

    await this.twoFactorProvider.sendCode(user, code);

    return { challengeId: challenge.id };
  }

  async verifyOtp(
    challengeId: string,
    code: string,
    context: { userAgent?: string; ip?: string },
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    user: AuthUserView;
  }> {
    const challenge = await this.challengeRepo.findOne({
      where: { id: challengeId },
      relations: { user: true },
    });

    if (!challenge || challenge.purpose !== 'CUSTOMER_OTP_LOGIN') {
      throw new UnauthorizedException({
        code: 'TWO_FACTOR_INVALID',
        message: 'کد نامعتبر است.',
      });
    }
    if (challenge.consumedAt) {
      throw new UnauthorizedException({
        code: 'TWO_FACTOR_INVALID',
        message: 'این کد قبلاً استفاده شده است.',
      });
    }
    if (challenge.expiresAt < new Date()) {
      throw new UnauthorizedException({
        code: 'TWO_FACTOR_EXPIRED',
        message: 'کد منقضی شده است.',
      });
    }
    if (challenge.attempts >= TWO_FACTOR_MAX_ATTEMPTS) {
      throw new UnauthorizedException({
        code: 'TWO_FACTOR_INVALID',
        message: 'تعداد تلاش‌های مجاز به پایان رسید.',
      });
    }

    const codeValid = await argon2.verify(challenge.codeHash, code);
    if (!codeValid) {
      await this.challengeRepo.increment({ id: challenge.id }, 'attempts', 1);
      throw new UnauthorizedException({
        code: 'TWO_FACTOR_INVALID',
        message: 'کد وارد شده نادرست است.',
      });
    }

    await this.challengeRepo.update(
      { id: challenge.id },
      { consumedAt: new Date() },
    );
    await this.userRepo.update(
      { id: challenge.userId },
      { lastLoginAt: new Date(), updatedAt: new Date() },
    );

    const user = challenge.user;
    const jwtUser: AuthenticatedUser = {
      id: user.id,
      role: user.role,
      fullName: user.fullName,
    };
    const accessToken = this.signAccessToken(jwtUser);
    const refreshToken = await this.issueRefreshToken(user.id, context);

    return { accessToken, refreshToken, user: toAuthUserView(user) };
  }

  /** Agency forgot-password: SMS OTP to the agency account's registered phone. */
  async requestAgencyPasswordReset(
    phone: string,
  ): Promise<{ challengeId: string }> {
    const user = await this.userRepo.findOneBy({
      phone: normalizeIranPhone(phone),
    });
    const agencyProfile = user
      ? await this.agencyProfileRepo.findOneBy({ userId: user.id })
      : null;
    if (
      !user ||
      user.role !== 'AGENCY' ||
      !user.isActive ||
      agencyProfile?.suspendedAt
    ) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'شماره تماس یافت نشد.',
      });
    }

    const code = generateSixDigitCode();
    const challenge = await this.challengeRepo.save(
      this.challengeRepo.create({
        userId: user.id,
        purpose: 'AGENCY_PASSWORD_RESET',
        codeHash: await argon2.hash(code),
        expiresAt: new Date(Date.now() + TWO_FACTOR_TTL_MS),
      }),
    );
    await this.twoFactorProvider.sendCode(user, code);
    return { challengeId: challenge.id };
  }

  async verifyAgencyPasswordResetOtp(
    challengeId: string,
    code: string,
    context: { userAgent?: string; ip?: string },
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    user: AuthUserView;
  }> {
    const challenge = await this.challengeRepo.findOne({
      where: { id: challengeId },
      relations: { user: true },
    });
    if (!challenge || challenge.purpose !== 'AGENCY_PASSWORD_RESET') {
      throw new UnauthorizedException({
        code: 'TWO_FACTOR_INVALID',
        message: 'کد نامعتبر است.',
      });
    }
    if (challenge.consumedAt) {
      throw new UnauthorizedException({
        code: 'TWO_FACTOR_INVALID',
        message: 'این کد قبلاً استفاده شده است.',
      });
    }
    if (challenge.expiresAt < new Date()) {
      throw new UnauthorizedException({
        code: 'TWO_FACTOR_EXPIRED',
        message: 'کد منقضی شده است.',
      });
    }
    if (challenge.attempts >= TWO_FACTOR_MAX_ATTEMPTS) {
      throw new UnauthorizedException({
        code: 'TWO_FACTOR_INVALID',
        message: 'تعداد تلاش‌های مجاز به پایان رسید.',
      });
    }
    const codeValid = await argon2.verify(challenge.codeHash, code);
    if (!codeValid) {
      await this.challengeRepo.increment({ id: challenge.id }, 'attempts', 1);
      throw new UnauthorizedException({
        code: 'TWO_FACTOR_INVALID',
        message: 'کد وارد شده نادرست است.',
      });
    }
    await this.challengeRepo.update(
      { id: challenge.id },
      { consumedAt: new Date() },
    );

    await this.userRepo.update(
      { id: challenge.userId },
      { mustChangePassword: true, updatedAt: new Date() },
    );
    const updated = await findOneOrThrow(this.userRepo, {
      where: { id: challenge.userId },
    });

    const jwtUser: AuthenticatedUser = {
      id: updated.id,
      role: updated.role,
      fullName: updated.fullName,
    };
    const accessToken = this.signAccessToken(jwtUser);
    const refreshToken = await this.issueRefreshToken(updated.id, context);
    return { accessToken, refreshToken, user: toAuthUserView(updated) };
  }

  /**
   * Non-production only: reads back the mock password-reset-email code —
   * same escape hatch as getLastOtpForE2e, keyed by email. 404s in prod.
   */
  async getLastPasswordResetEmailCodeForE2e(
    email: string,
  ): Promise<string | null> {
    if (
      process.env.NODE_ENV === 'production' ||
      !this.twoFactorProvider.getLastCode
    )
      return null;
    const user = await this.userRepo.findOneBy({ email });
    if (!user) return null;
    return this.twoFactorProvider.getLastCode(user.id) ?? null;
  }

  /**
   * Non-production only: reads back the mock OTP code — same escape hatch
   * as staff 2FA's getLastCodeForE2e, keyed by phone instead of username.
   * Always 404s in production.
   */
  async getLastOtpForE2e(phone: string): Promise<string | null> {
    if (
      process.env.NODE_ENV === 'production' ||
      !this.twoFactorProvider.getLastCode
    )
      return null;
    const user = await this.userRepo.findOneBy({
      phone: normalizeIranPhone(phone),
    });
    if (!user) return null;
    return this.twoFactorProvider.getLastCode(user.id) ?? null;
  }

  async refresh(
    presentedToken: string,
    context: { userAgent?: string; ip?: string },
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const tokenHash = hashToken(presentedToken);
    const stored = await this.refreshTokenRepo.findOne({
      where: { tokenHash },
      relations: { user: true },
    });

    if (!stored) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'نشست شما منقضی شده است.',
      });
    }

    // A REVOKED token being presented again — as opposed to one that simply
    // expired — means the token was already rotated away by a legitimate
    // refresh (or logout) and is now being replayed by someone else who
    // captured it. That is a theft signal, not routine expiry: revoke the
    // user's entire refresh-token family so a stolen token can't keep
    // rotating forever, and force a real re-login everywhere.
    if (stored.revokedAt) {
      await this.refreshTokenRepo.update(
        { userId: stored.userId, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );
      await this.audit.record({
        actorId: stored.userId,
        actorRole: stored.user.role,
        category: 'SECURITY',
        action: 'شناسایی سرقت نشست (refresh token reuse)',
        detail: `یک refresh token باطل‌شده دوباره ارسال شد؛ همه نشست‌های فعال این کاربر باطل شدند.${context.ip ? ` IP: ${context.ip}` : ''}`,
        entityType: 'User',
        entityId: stored.userId,
      });
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'نشست شما به دلایل امنیتی باطل شد. دوباره وارد شوید.',
      });
    }

    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'نشست شما منقضی شده است.',
      });
    }
    // Re-check the account's current status on every refresh — isActive
    // is only checked at login otherwise, so a blocked/suspended account
    // could keep extending an already-issued refresh token forever.
    if (!stored.user.isActive) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'این حساب مسدود شده است.',
      });
    }
    const temporaryAccessState = getTemporaryPanelAccessState(stored.user);
    if (temporaryAccessState !== 'NONE' && temporaryAccessState !== 'ACTIVE') {
      await this.refreshTokenRepo.update(
        { userId: stored.userId, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );
      throw new UnauthorizedException({
        code: ErrorCode.TEMPORARY_ACCESS_EXPIRED,
        message:
          'مهلت دسترسی آزمایشی این حساب به پایان رسیده است. دوباره وارد نشوید و با مدیر IT تماس بگیرید.',
      });
    }
    if (stored.user.role === 'AGENCY') {
      const profile = await this.agencyProfileRepo.findOne({
        where: { userId: stored.userId },
        select: { userId: true, suspendedAt: true },
      });
      if (profile?.suspendedAt) {
        throw new UnauthorizedException({
          code: ErrorCode.UNAUTHORIZED,
          message: 'این حساب مسدود شده است.',
        });
      }
    }

    await this.refreshTokenRepo.update(
      { id: stored.id },
      { revokedAt: new Date() },
    );

    const temporaryDeadline =
      temporaryAccessState === 'ACTIVE'
        ? stored.user.temporaryPasswordOnlyUntil!
        : undefined;
    const accessToken = this.signAccessToken(
      {
        id: stored.user.id,
        role: stored.user.role,
        fullName: stored.user.fullName,
        isSuperAdmin: stored.user.isSuperAdmin,
      },
      temporaryDeadline,
    );
    const refreshToken = await this.issueRefreshToken(
      stored.userId,
      context,
      temporaryDeadline,
    );

    return { accessToken, refreshToken };
  }

  async logout(presentedToken: string): Promise<void> {
    const tokenHash = hashToken(presentedToken);
    await this.refreshTokenRepo.update(
      { tokenHash, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  /**
   * Non-production only: lets Playwright E2E runs read back the mock 2FA
   * code instead of receiving a real SMS/email. Always 404s in production
   * (enforced here AND by the controller, belt-and-braces).
   */
  async getLastCodeForE2e(username: string): Promise<string | null> {
    if (
      process.env.NODE_ENV === 'production' ||
      !this.twoFactorProvider.getLastCode
    )
      return null;
    const user = await this.userRepo.findOneBy({ username });
    if (!user) return null;
    return this.twoFactorProvider.getLastCode(user.id) ?? null;
  }

  private signAccessToken(
    user: AuthenticatedUser,
    absoluteExpiresAt?: Date,
  ): string {
    const remainingSeconds = absoluteExpiresAt
      ? Math.floor((absoluteExpiresAt.getTime() - Date.now()) / 1000)
      : null;
    if (remainingSeconds !== null && remainingSeconds < 1) {
      throw new UnauthorizedException({
        code: ErrorCode.TEMPORARY_ACCESS_EXPIRED,
        message: 'مهلت دسترسی آزمایشی این حساب به پایان رسیده است.',
      });
    }
    const expiresIn =
      remainingSeconds === null
        ? ACCESS_TOKEN_TTL
        : Math.min(15 * 60, remainingSeconds);
    return this.jwt.sign(
      {
        sub: user.id,
        role: user.role,
        fullName: user.fullName,
        isSuperAdmin: user.isSuperAdmin === true,
        sandboxOwnerId: user.sandboxOwnerId,
      },
      { secret: process.env.JWT_ACCESS_SECRET, expiresIn },
    );
  }

  private async issueRefreshToken(
    userId: string,
    context: { userAgent?: string; ip?: string },
    absoluteExpiresAt?: Date,
  ): Promise<string> {
    const token = crypto.randomBytes(48).toString('hex');
    const normalExpiry = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
    const expiresAt =
      absoluteExpiresAt && absoluteExpiresAt < normalExpiry
        ? absoluteExpiresAt
        : normalExpiry;
    await this.refreshTokenRepo.save(
      this.refreshTokenRepo.create({
        userId,
        tokenHash: hashToken(token),
        userAgent: context.userAgent,
        ip: context.ip,
        expiresAt,
      }),
    );
    return token;
  }
}
