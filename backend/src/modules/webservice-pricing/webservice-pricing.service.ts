import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SystemSetting } from '../../database/entities/system-setting.entity';
import { AuditService } from '../audit/audit.service';
import { ErrorCode } from '../../common/errors';
import {
  DEFAULT_WEBSERVICE_PLAN_PRICES_IRR,
  parseWebservicePlanPrices,
  type WebservicePlanPrices,
} from '../../common/webservice-pricing.util';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

const SETTING_KEY = 'webservicePlanPrices';

@Injectable()
export class WebservicePricingService {
  constructor(
    @InjectRepository(SystemSetting)
    private readonly settingRepo: Repository<SystemSetting>,
    private readonly audit: AuditService,
  ) {}

  async getPlanPrices(): Promise<WebservicePlanPrices> {
    const row = await this.settingRepo
      .createQueryBuilder('s')
      .where('s.key = :key', { key: SETTING_KEY })
      .getOne();
    if (!row) return { ...DEFAULT_WEBSERVICE_PLAN_PRICES_IRR };
    try {
      return parseWebservicePlanPrices(row.value);
    } catch {
      return { ...DEFAULT_WEBSERVICE_PLAN_PRICES_IRR };
    }
  }

  async updatePlanPrices(
    actor: AuthenticatedUser,
    patch: WebservicePlanPrices,
  ): Promise<WebservicePlanPrices> {
    let parsed: WebservicePlanPrices;
    try {
      parsed = parseWebservicePlanPrices(patch);
    } catch {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'قیمت‌های پلن وب‌سرویس نامعتبر است.',
      });
    }

    const existing = await this.settingRepo
      .createQueryBuilder('s')
      .where('s.key = :key', { key: SETTING_KEY })
      .getOne();
    if (existing) {
      existing.value = parsed;
      existing.updatedById = actor.id;
      existing.updatedAt = new Date();
      await this.settingRepo.save(existing);
    } else {
      await this.settingRepo.save(
        this.settingRepo.create({
          key: SETTING_KEY,
          value: parsed,
          updatedById: actor.id,
          updatedAt: new Date(),
        }),
      );
    }

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'SYSTEM',
      action: 'تغییر قیمت‌گذاری وب‌سرویس',
      detail: `قیمت پلن‌های ۱/۳/۱۲ ماهه وب‌سرویس توسط ${actor.fullName} به‌روزرسانی شد.`,
      entityType: 'SystemSetting',
      entityId: SETTING_KEY,
    });

    return parsed;
  }
}
