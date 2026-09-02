import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import * as crypto from 'node:crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { User } from '../../database/entities/user.entity';
import { TwoFactorChallenge } from '../../database/entities/two-factor-challenge.entity';
import { findOneOrThrow } from '../../database/utils/find-one-or-throw';
import { ErrorCode } from '../../common/errors';
import {
  decryptPii,
  encryptPii,
  hashPii,
  isValidIranianNationalId,
} from '../../common/pii-crypto';
import { TWO_FACTOR_PROVIDER } from '../auth/providers/two-factor-provider.interface';
import type { TwoFactorProvider } from '../auth/providers/two-factor-provider.interface';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import type { UpdateProfileDto } from './dto/profile.dtos';
import { assessProfileCompletion } from '../../common/profile-completion';

function generateSixDigitCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

const EMAIL_VERIFY_TTL_MS = 2 * 60 * 1000;
const EMAIL_VERIFY_MAX_ATTEMPTS = 5;

@Injectable()
export class ProfileService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(TwoFactorChallenge)
    private readonly challengeRepo: Repository<TwoFactorChallenge>,
    @Inject(TWO_FACTOR_PROVIDER)
    private readonly twoFactorProvider: TwoFactorProvider,
  ) {}

  private shape(user: User) {
    const completion = assessProfileCompletion(user);
    return {
      fullName: user.fullName,
      nationalId: user.nationalIdEnc ? decryptPii(user.nationalIdEnc) : null,
      birthDate: user.birthDate,
      passportNo: user.passportNoEnc ? decryptPii(user.passportNoEnc) : null,
      address: user.addressEnc ? decryptPii(user.addressEnc) : null,
      email: user.email,
      emailVerifiedAt: user.emailVerifiedAt,
      ...completion,
    };
  }

  async getProfile(actor: AuthenticatedUser) {
    const user = await findOneOrThrow(this.userRepo, {
      where: { id: actor.id },
    });
    return this.shape(user);
  }

  async updateProfile(actor: AuthenticatedUser, dto: UpdateProfileDto) {
    const currentUser = await findOneOrThrow(this.userRepo, {
      where: { id: actor.id },
    });
    const data: {
      fullName?: string;
      birthDate?: Date;
      nationalIdEnc?: string;
      nationalIdHash?: string;
      passportNoEnc?: string;
      addressEnc?: string;
      email?: string;
      emailVerifiedAt?: Date | null;
    } = {};

    if (dto.fullName !== undefined) data.fullName = dto.fullName;
    if (dto.birthDate !== undefined) data.birthDate = new Date(dto.birthDate);
    if (dto.nationalId !== undefined) {
      if (!isValidIranianNationalId(dto.nationalId)) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_FAILED,
          message: 'کد ملی نامعتبر است.',
        });
      }
      data.nationalIdEnc = encryptPii(dto.nationalId);
      data.nationalIdHash = hashPii(dto.nationalId);
    }
    if (dto.passportNo !== undefined) {
      data.passportNoEnc = encryptPii(dto.passportNo);
    }
    if (dto.address !== undefined) {
      data.addressEnc = encryptPii(dto.address.trim());
    }
    if (dto.email !== undefined) {
      const normalizedEmail = dto.email.trim().toLowerCase();
      const existing = await this.userRepo.findOne({
        where: { email: ILike(normalizedEmail) },
      });
      if (existing && existing.id !== actor.id) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message: 'این ایمیل قبلاً برای حساب دیگری ثبت شده است.',
        });
      }
      data.email = normalizedEmail;
      if ((currentUser.email ?? '').toLowerCase() !== normalizedEmail) {
        data.emailVerifiedAt = null;
      }
    }

    await this.userRepo.update(
      { id: actor.id },
      { ...data, updatedAt: new Date() },
    );
    const user = await findOneOrThrow(this.userRepo, {
      where: { id: actor.id },
    });
    return this.shape(user);
  }

  async requestEmailVerify(
    actor: AuthenticatedUser,
  ): Promise<{ challengeId: string }> {
    const user = await findOneOrThrow(this.userRepo, {
      where: { id: actor.id },
    });
    if (!user.email) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'ابتدا ایمیل خود را ثبت کنید.',
      });
    }

    const code = generateSixDigitCode();
    const challenge = await this.challengeRepo.save(
      this.challengeRepo.create({
        userId: actor.id,
        purpose: 'EMAIL_VERIFY',
        codeHash: await argon2.hash(code),
        expiresAt: new Date(Date.now() + EMAIL_VERIFY_TTL_MS),
      }),
    );
    await this.twoFactorProvider.sendCode(
      { id: user.id, fullName: user.fullName, email: user.email, phone: null },
      code,
    );
    return { challengeId: challenge.id };
  }

  async verifyEmail(
    actor: AuthenticatedUser,
    challengeId: string,
    code: string,
  ): Promise<{ verified: true }> {
    const challenge = await this.challengeRepo.findOneBy({ id: challengeId });
    if (
      !challenge ||
      challenge.purpose !== 'EMAIL_VERIFY' ||
      challenge.userId !== actor.id
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
    if (challenge.attempts >= EMAIL_VERIFY_MAX_ATTEMPTS) {
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
      { id: actor.id },
      { emailVerifiedAt: new Date(), updatedAt: new Date() },
    );

    return { verified: true };
  }
}
