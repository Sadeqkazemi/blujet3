import { BadRequestException, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { decryptPayload } from '../common/pii-crypto';
import { NotificationsService } from '../notifications/notifications.service';
import { SmsDeliveryService } from '../sms/sms-delivery.service';
import {
  ConsumeEventDto,
  NotificationCreatedPayloadDto,
  NotifyEventType,
  SmsRequestedPayloadDto,
} from './dto/consume-event.dto';

@Injectable()
export class EventsService {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly sms: SmsDeliveryService,
  ) {}

  async consume(event: ConsumeEventDto) {
    const payload = this.decryptJson(event.payloadEncrypted);
    if (event.eventType === NotifyEventType.NOTIFICATION_CREATED) {
      const dto = this.validatePayload(NotificationCreatedPayloadDto, payload);
      const notification = await this.notifications.create({
        ...dto,
        dedupeKey: dto.dedupeKey ?? `outbox:${event.eventId}`,
      });
      return { eventId: event.eventId, notificationId: notification.id };
    }

    const dto = this.validatePayload(SmsRequestedPayloadDto, payload);
    const smsLog = await this.sms.deliver(event.eventId, dto);
    return { eventId: event.eventId, smsLogId: smsLog.id };
  }

  private decryptJson(payloadEncrypted: string): unknown {
    try {
      return JSON.parse(decryptPayload(payloadEncrypted)) as unknown;
    } catch {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'محتوای رمز‌شده event معتبر نیست.',
      });
    }
  }

  private validatePayload<T extends object>(
    dtoType: new () => T,
    payload: unknown,
  ): T {
    const dto = plainToInstance(dtoType, payload);
    const errors = validateSync(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
    });
    if (errors.length > 0) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'ساختار event اعلان معتبر نیست.',
      });
    }
    return dto;
  }
}
