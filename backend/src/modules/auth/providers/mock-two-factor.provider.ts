import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { TwoFactorProvider } from './two-factor-provider.interface';
import { SmsService } from '../../sms/sms.service';
import { isSandboxAuthEnabled } from '../../../common/sandbox-auth';

/** SMS-backed provider. Capturing a code is allowed only outside production
 * so deterministic automated OTP tests can inspect it. */
@Injectable()
export class MockTwoFactorProvider implements TwoFactorProvider {
  private readonly logger = new Logger(MockTwoFactorProvider.name);
  private readonly lastCodeByUserId = new Map<string, string>();

  constructor(private readonly sms: SmsService) {}

  async sendCode(
    user: { id: string; fullName: string; phone: string | null },
    code: string,
  ): Promise<void> {
    const sandbox = isSandboxAuthEnabled();
    const production = process.env.NODE_ENV === 'production';
    if (!production) {
      this.lastCodeByUserId.set(user.id, code);
      this.logger.debug(
        `2FA test code for ${user.fullName} (${user.id}): ${code}`,
      );
    }

    if (user.phone) {
      const result = await this.sms.send(
        user.phone,
        `کد ورود بلوجت: ${code}`,
        'OTP',
      );
      if (!result.success) {
        if (sandbox) {
          this.logger.warn(
            `OTP delivery unavailable for ${user.id}; sandbox mock code remains valid.`,
          );
          return;
        }
        throw new ServiceUnavailableException({
          code: 'OTP_DELIVERY_UNAVAILABLE',
          message: 'ارسال کد ورود انجام نشد؛ لطفاً بعداً دوباره تلاش کنید.',
        });
      }
      return;
    }

    if (production && !sandbox) {
      throw new ServiceUnavailableException({
        code: 'OTP_DELIVERY_UNAVAILABLE',
        message: 'برای این حساب شماره موبایل معتبر ثبت نشده است.',
      });
    }

    if (sandbox) {
      this.logger.warn(
        `No mobile is registered for ${user.id}; sandbox mock code remains valid.`,
      );
    }
  }

  /** Test-only helper to read back the last code sent to a user. */
  getLastCode(userId: string): string | undefined {
    if (process.env.NODE_ENV === 'production') return undefined;
    return this.lastCodeByUserId.get(userId);
  }
}
