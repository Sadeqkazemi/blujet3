import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { KavenegarApi } from 'kavenegar';
import { Repository } from 'typeorm';
import { decryptProviderKey } from '../common/pii-crypto';
import {
  SmsLog,
  SmsStatus,
  type SmsStatus as SmsStatusType,
} from '../database/entities/sms-log.entity';
import type { SmsRequestedPayloadDto } from '../events/dto/consume-event.dto';

interface SendResult {
  success: boolean;
  failureReason?: string;
}

function safeFailureReason(value: unknown): string {
  if (typeof value !== 'string') return 'خطای ناشناخته در ارسال پیامک';
  return value.replace(/[\r\n]/g, ' ').slice(0, 500);
}

@Injectable()
export class SmsDeliveryService {
  constructor(
    @InjectRepository(SmsLog)
    private readonly repo: Repository<SmsLog>,
  ) {}

  async deliver(eventId: string, payload: SmsRequestedPayloadDto) {
    const existing = await this.repo.findOneBy({ sourceEventId: eventId });
    if (existing) return existing;

    const reserved = await this.repo.save(
      this.repo.create({
        phone: payload.phone,
        messageType: payload.messageType,
        status: SmsStatus.FAILED,
        failureReason: 'ارسال تکمیل نشد.',
        sourceEventId: eventId,
      }),
    );

    let result: SendResult;
    try {
      result = await this.send(payload);
    } catch {
      result = {
        success: false,
        failureReason: 'خطای داخلی در ارتباط با سرویس پیامک.',
      };
    }
    const status: SmsStatusType = result.success
      ? SmsStatus.SUCCESS
      : SmsStatus.FAILED;
    await this.repo.update(
      { id: reserved.id },
      {
        status,
        failureReason: result.failureReason ?? null,
      },
    );
    return this.repo.findOneByOrFail({ id: reserved.id });
  }

  private send(payload: SmsRequestedPayloadDto): Promise<SendResult> {
    if (!payload.phone) {
      return Promise.resolve({
        success: false,
        failureReason: 'این حساب شماره موبایل ثبت‌شده ندارد.',
      });
    }
    if (payload.provider.mode === 'MOCK') {
      return Promise.resolve({ success: true });
    }
    if (
      payload.provider.mode === 'UNAVAILABLE' ||
      !payload.provider.apiKeyEncrypted
    ) {
      return Promise.resolve({
        success: false,
        failureReason: 'سرویس ارسال پیامک فعال یا پیکربندی نشده است.',
      });
    }

    const api = KavenegarApi({
      apikey: decryptProviderKey(payload.provider.apiKeyEncrypted),
    });
    return new Promise((resolve) => {
      let settled = false;
      const finish = (result: SendResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      };
      const timer = setTimeout(
        () =>
          finish({
            success: false,
            failureReason: 'مهلت پاسخ سرویس پیامک تمام شد.',
          }),
        Number(process.env.SMS_PROVIDER_TIMEOUT_MS ?? 10_000),
      );
      try {
        api.Send(
          {
            receptor: payload.phone as string,
            message: payload.message,
            sender: payload.provider.senderLine,
          },
          (entries: unknown, status: number, statusMessage: string) => {
            if (status === 200) {
              finish({ success: true });
              return;
            }
            finish({
              success: false,
              failureReason: safeFailureReason(statusMessage || entries),
            });
          },
        );
      } catch {
        finish({
          success: false,
          failureReason: 'خطای داخلی در ارتباط با سرویس پیامک.',
        });
      }
    });
  }
}
