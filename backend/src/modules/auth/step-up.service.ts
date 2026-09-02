import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../database/entities/user.entity';
import { TwoFactorChallenge } from '../../database/entities/two-factor-challenge.entity';
import { findOneOrThrow } from '../../database/utils/find-one-or-throw';
import { AuditService } from '../audit/audit.service';
import { TWO_FACTOR_PROVIDER } from './providers/two-factor-provider.interface';
import type { TwoFactorProvider } from './providers/two-factor-provider.interface';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import type { StepUpScope } from '../../database/enums';
import { generateOtpCode } from '../../common/generate-otp-code';

const STEP_UP_TTL_MS = 2 * 60 * 1000;
const STEP_UP_MAX_ATTEMPTS = 5;

/** Phase 15 — a fresh re-authentication challenge required immediately
 * before a high-risk write, on top of (not instead of) the actor's
 * existing session JWT. Reuses TwoFactorChallenge and the same delivery
 * channel as staff 2FA login — see docs/DB_SCHEMA.md Phase 15. */
@Injectable()
export class StepUpService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(TwoFactorChallenge)
    private readonly challengeRepo: Repository<TwoFactorChallenge>,
    private readonly audit: AuditService,
    @Inject(TWO_FACTOR_PROVIDER)
    private readonly twoFactorProvider: TwoFactorProvider,
  ) {}

  async request(
    actor: AuthenticatedUser,
    scope: StepUpScope,
  ): Promise<{ challengeId: string }> {
    const user = await findOneOrThrow(this.userRepo, {
      where: { id: actor.id },
    });
    // Hosted UAT is an explicitly enabled sandbox and must use the same
    // deterministic OTP contract as login. Production without that explicit
    // switch still receives a cryptographically random code.
    const code = generateOtpCode();
    const challenge = await this.challengeRepo.save(
      this.challengeRepo.create({
        userId: actor.id,
        purpose: 'STEP_UP_VERIFICATION',
        scope,
        codeHash: await argon2.hash(code),
        expiresAt: new Date(Date.now() + STEP_UP_TTL_MS),
      }),
    );

    await this.twoFactorProvider.sendCode(user, code);

    return { challengeId: challenge.id };
  }

  /** Verifies and consumes a step-up challenge. Throws on any mismatch —
   * wrong owner, wrong scope, expired, already used, too many attempts,
   * wrong code. Callers must call this BEFORE touching any other state. */
  async verify(
    actor: AuthenticatedUser,
    challengeId: string,
    code: string,
    scope: StepUpScope,
  ): Promise<void> {
    const challenge = await this.challengeRepo.findOneBy({ id: challengeId });

    if (
      !challenge ||
      challenge.purpose !== 'STEP_UP_VERIFICATION' ||
      challenge.userId !== actor.id ||
      challenge.scope !== scope
    ) {
      throw new UnauthorizedException({
        code: 'TWO_FACTOR_INVALID',
        message: 'کد تأیید نامعتبر است.',
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
    if (challenge.attempts >= STEP_UP_MAX_ATTEMPTS) {
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

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'SECURITY',
      action: 'تأیید step-up برای عملیات حساس',
      detail: `${actor.fullName} با تأیید مجدد هویت، عملیات ${scope} را احراز کرد.`,
      entityType: 'TwoFactorChallenge',
      entityId: challenge.id,
    });
  }
}
