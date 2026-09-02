import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { InternalService } from '../../database/entities/internal-service.entity';
import { ExternalServiceConfig } from '../../database/entities/external-service-config.entity';
import { SmsLog } from '../../database/entities/sms-log.entity';
import { AuditService } from '../audit/audit.service';
import { ErrorCode } from '../../common/errors';
import { encryptPii } from '../../common/pii-crypto';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import type {
  CreateExternalServiceDto,
  UpdateExternalServiceDto,
} from './dto/services.dtos';

function toExternalView(s: ExternalServiceConfig) {
  const { apiKeyEncrypted, ...rest } = s;
  return { ...rest, hasApiKey: !!apiKeyEncrypted };
}

/** «0912***5678»-style mask — this surface never returns a full phone. */
function maskPhone(phone: string | null): string | null {
  if (!phone) return null;
  if (phone.length < 7) return '*'.repeat(phone.length);
  return `${phone.slice(0, 4)}***${phone.slice(-4)}`;
}

@Injectable()
export class ItServicesService {
  constructor(
    @InjectRepository(InternalService)
    private readonly internalServiceRepo: Repository<InternalService>,
    @InjectRepository(ExternalServiceConfig)
    private readonly externalServiceConfigRepo: Repository<ExternalServiceConfig>,
    @InjectRepository(SmsLog)
    private readonly smsLogRepo: Repository<SmsLog>,
    private readonly audit: AuditService,
  ) {}

  async list() {
    const [internal, external] = await Promise.all([
      this.internalServiceRepo.find({ order: { nameFa: 'ASC' } }),
      this.externalServiceConfigRepo.find({ order: { nameFa: 'ASC' } }),
    ]);
    return { internal, external: external.map(toExternalView) };
  }

  async internalReport(key: string, page = 1, limit = 5) {
    const service = await this.internalServiceRepo.findOneBy({ key });
    if (!service) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'سرویس یافت نشد.',
      });
    }
    return {
      service: {
        kind: 'internal' as const,
        id: service.id,
        key: service.key,
        nameFa: service.nameFa,
        enabled: service.enabled,
      },
      ...(await this.audit.entityEvents('InternalService', key, page, limit)),
    };
  }

  async externalReport(id: string, page = 1, limit = 5) {
    const service = await this.getExternalOrThrow(id);
    return {
      service: {
        kind: 'external' as const,
        id: service.id,
        key: service.key,
        nameFa: service.nameFa,
        enabled: service.enabled,
      },
      ...(await this.audit.entityEvents(
        'ExternalServiceConfig',
        id,
        page,
        limit,
      )),
    };
  }

  async toggleInternal(
    actor: AuthenticatedUser,
    key: string,
    enabled: boolean,
  ) {
    const service = await this.internalServiceRepo.findOneBy({ key });
    if (!service) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'سرویس یافت نشد.',
      });
    }
    await this.internalServiceRepo.update(
      { key },
      { enabled, updatedAt: new Date() },
    );
    const updated = await this.internalServiceRepo.findOneByOrFail({ key });

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'SYSTEM',
      action: enabled ? 'فعال‌سازی سرویس داخلی' : 'غیرفعال‌سازی سرویس داخلی',
      detail: `سرویس «${service.nameFa}» توسط ${actor.fullName} ${enabled ? 'فعال' : 'غیرفعال'} شد.`,
      entityType: 'InternalService',
      entityId: key,
    });

    return updated;
  }

  async createExternal(
    actor: AuthenticatedUser,
    dto: CreateExternalServiceDto,
  ) {
    const created = await this.externalServiceConfigRepo.save(
      this.externalServiceConfigRepo.create({
        key: `ext_${Date.now().toString(36)}`,
        nameFa: dto.nameFa,
        provider: dto.provider,
        endpoint: dto.endpoint,
        method: dto.method ?? 'POST',
        timeoutMs: dto.timeoutMs ?? 30000,
        apiKeyEncrypted: dto.apiKey ? encryptPii(dto.apiKey) : null,
        sandbox: dto.sandbox ?? false,
        updatedAt: new Date(),
      }),
    );

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'SYSTEM',
      action: 'تعریف سرویس خارجی جدید',
      detail: `سرویس خارجی «${dto.nameFa}» توسط ${actor.fullName} تعریف شد.`,
      entityType: 'ExternalServiceConfig',
      entityId: created.id,
    });

    return toExternalView(created);
  }

  private async getExternalOrThrow(id: string) {
    const service = await this.externalServiceConfigRepo.findOneBy({ id });
    if (!service) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'سرویس خارجی یافت نشد.',
      });
    }
    return service;
  }

  async updateExternal(
    actor: AuthenticatedUser,
    id: string,
    dto: UpdateExternalServiceDto,
  ) {
    const service = await this.getExternalOrThrow(id);
    const { apiKey, ...rest } = dto;
    await this.externalServiceConfigRepo.update(
      { id },
      {
        ...rest,
        ...(apiKey ? { apiKeyEncrypted: encryptPii(apiKey) } : {}),
        updatedAt: new Date(),
      },
    );
    const updated = await this.externalServiceConfigRepo.findOneByOrFail({
      id,
    });

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'SYSTEM',
      action: 'به‌روزرسانی سرویس خارجی',
      detail: `سرویس خارجی «${service.nameFa}» توسط ${actor.fullName} به‌روزرسانی شد.`,
      entityType: 'ExternalServiceConfig',
      entityId: id,
    });

    return toExternalView(updated);
  }

  async removeExternal(actor: AuthenticatedUser, id: string) {
    const service = await this.getExternalOrThrow(id);
    await this.externalServiceConfigRepo.delete({ id });

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'SYSTEM',
      action: 'حذف سرویس خارجی',
      detail: `سرویس خارجی «${service.nameFa}» توسط ${actor.fullName} حذف شد.`,
      entityType: 'ExternalServiceConfig',
      entityId: id,
    });

    return { id };
  }

  /** Real connectivity check — never a fabricated success. */
  async testExternal(actor: AuthenticatedUser, id: string) {
    const service = await this.getExternalOrThrow(id);
    const started = Date.now();
    let ok = false;
    let message: string;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), service.timeoutMs);
      try {
        const res = await fetch(service.endpoint, {
          method: service.method,
          signal: controller.signal,
        });
        ok = res.status < 500;
        message = `پاسخ HTTP ${res.status} در ${Date.now() - started}ms`;
      } finally {
        clearTimeout(timeout);
      }
    } catch (err) {
      ok = false;
      message =
        err instanceof Error && err.name === 'AbortError'
          ? `مهلت اتصال (${service.timeoutMs}ms) به پایان رسید`
          : `اتصال ناموفق: ${err instanceof Error ? err.message : 'خطای نامشخص'}`;
    }

    await this.externalServiceConfigRepo.update(
      { id },
      {
        lastTestAt: new Date(),
        lastTestOk: ok,
        lastTestMessage: message,
        updatedAt: new Date(),
      },
    );
    const updated = await this.externalServiceConfigRepo.findOneByOrFail({
      id,
    });

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'SYSTEM',
      action: 'تست اتصال سرویس خارجی',
      detail: `تست اتصال «${service.nameFa}» توسط ${actor.fullName}: ${message}`,
      entityType: 'ExternalServiceConfig',
      entityId: id,
    });

    return { ok, message, service: toExternalView(updated) };
  }

  /** Phase 14: real send counters + recent-log rows — no fabricated
   * uptime figure anywhere in this response (see docs/DB_SCHEMA.md). */
  async smsLog() {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);

    const [service, todaySuccessCount, todayFailedCount, recent] =
      await Promise.all([
        this.internalServiceRepo.findOneBy({ key: 'sms' }),
        this.smsLogRepo.count({
          where: { status: 'SUCCESS', createdAt: MoreThanOrEqual(dayStart) },
        }),
        this.smsLogRepo.count({
          where: { status: 'FAILED', createdAt: MoreThanOrEqual(dayStart) },
        }),
        this.smsLogRepo.find({
          order: { createdAt: 'DESC' },
          take: 50,
        }),
      ]);

    return {
      enabled: service?.enabled ?? false,
      todaySuccessCount,
      todayFailedCount,
      recent: recent.map((r) => ({
        id: r.id,
        phoneMasked: maskPhone(r.phone),
        messageType: r.messageType,
        status: r.status,
        failureReason: r.failureReason,
        createdAt: r.createdAt,
      })),
    };
  }
}
