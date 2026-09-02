import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SmsLog } from '../../database/entities/sms-log.entity';
import {
  SMS_PROVIDER,
  type SmsMessageType,
  type SmsProvider,
} from '../../common/sms/sms-provider.interface';
import { SmsStatus } from '../../database/enums';

/** Wraps SmsProvider with the real send log (Phase 14) — see
 * docs/DB_SCHEMA.md. The only genuine (non-fabricated) failure this
 * introduces is a missing phone number; the provider itself is never
 * asked to simulate a failure rate. */
@Injectable()
export class SmsService {
  constructor(
    @InjectRepository(SmsLog)
    private readonly smsLogRepo: Repository<SmsLog>,
    @Inject(SMS_PROVIDER) private readonly provider: SmsProvider,
  ) {}

  async send(
    phone: string | null | undefined,
    message: string,
    messageType: SmsMessageType,
  ) {
    if (!phone) {
      await this.smsLogRepo.save(
        this.smsLogRepo.create({
          phone: null,
          messageType,
          status: SmsStatus.FAILED,
          failureReason: 'این حساب شماره موبایل ثبت‌شده ندارد.',
        }),
      );
      return { success: false as const };
    }

    const result = await this.provider.send(phone, message, messageType);
    await this.smsLogRepo.save(
      this.smsLogRepo.create({
        phone,
        messageType,
        status: result.success ? SmsStatus.SUCCESS : SmsStatus.FAILED,
        failureReason: result.failureReason ?? null,
      }),
    );
    return result;
  }
}
