import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { SmsLog } from '../../database/entities/sms-log.entity';
import {
  SMS_PROVIDER,
  type SmsMessageType,
  type SmsProvider,
} from '../../common/sms/sms-provider.interface';
import { SmsStatus } from '../../database/enums';
import { ExternalServiceConfig } from '../../database/entities/external-service-config.entity';
import { NotifyInternalClient } from '../notify-outbox/notify-internal.client';
import { NotifyOutboxEventType } from '../notify-outbox/notify-outbox.contract';
import { NotifyOutboxService } from '../notify-outbox/notify-outbox.service';

const KAVENEGAR_SERVICE_KEY = 'ext_kavenegar';

/** Wraps SmsProvider with the real send log (Phase 14) — see
 * docs/DB_SCHEMA.md. The only genuine (non-fabricated) failure this
 * introduces is a missing phone number; the provider itself is never
 * asked to simulate a failure rate. */
@Injectable()
export class SmsService {
  constructor(
    @InjectRepository(SmsLog)
    private readonly smsLogRepo: Repository<SmsLog>,
    @InjectRepository(ExternalServiceConfig)
    private readonly externalServiceConfigRepo: Repository<ExternalServiceConfig>,
    @Inject(SMS_PROVIDER) private readonly provider: SmsProvider,
    private readonly outbox: NotifyOutboxService,
    private readonly notifyClient: NotifyInternalClient,
  ) {}

  asyncDeliveryEnabled(): boolean {
    return this.notifyClient.enabled();
  }

  async send(
    phone: string | null | undefined,
    message: string,
    messageType: SmsMessageType,
    idempotencyKey?: string,
    manager?: EntityManager,
  ) {
    if (this.notifyClient.enabled()) {
      return this.enqueue(phone, message, messageType, idempotencyKey, manager);
    }
    const smsLogRepo = manager?.getRepository(SmsLog) ?? this.smsLogRepo;
    if (!phone) {
      await smsLogRepo.save(
        smsLogRepo.create({
          phone: null,
          messageType,
          status: SmsStatus.FAILED,
          failureReason: 'این حساب شماره موبایل ثبت‌شده ندارد.',
        }),
      );
      return { success: false as const };
    }

    const result = await this.provider.send(phone, message, messageType);
    await smsLogRepo.save(
      smsLogRepo.create({
        phone,
        messageType,
        status: result.success ? SmsStatus.SUCCESS : SmsStatus.FAILED,
        failureReason: result.failureReason ?? null,
      }),
    );
    return result;
  }

  private async enqueue(
    phone: string | null | undefined,
    message: string,
    messageType: SmsMessageType,
    idempotencyKey?: string,
    manager?: EntityManager,
  ) {
    const configRepo =
      manager?.getRepository(ExternalServiceConfig) ??
      this.externalServiceConfigRepo;
    const config = phone
      ? await configRepo.findOneBy({
          key: KAVENEGAR_SERVICE_KEY,
        })
      : null;
    const provider =
      config?.enabled && config.apiKeyEncrypted
        ? {
            mode: 'KAVENEGAR' as const,
            apiKeyEncrypted: config.apiKeyEncrypted,
            senderLine: process.env.KAVENEGAR_SENDER_LINE || undefined,
          }
        : process.env.NODE_ENV === 'production'
          ? { mode: 'UNAVAILABLE' as const }
          : { mode: 'MOCK' as const };

    const queued = await this.outbox.enqueue(
      NotifyOutboxEventType.SMS_REQUESTED,
      {
        phone: phone ?? null,
        message,
        messageType,
        provider,
      },
      idempotencyKey,
      manager,
    );
    return {
      success: Boolean(phone) && provider.mode !== 'UNAVAILABLE',
      queued: true as const,
      eventId: queued.eventId,
    };
  }
}
