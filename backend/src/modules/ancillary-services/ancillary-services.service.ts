import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { ErrorCode } from '../../common/errors';
import type { Irr } from '../../common/money';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AncillaryService } from '../../database/entities/ancillary-service.entity';
import { TravelExtraSetting } from '../../database/entities/travel-extra-setting.entity';
import type { TravelExtraCode } from '../../database/entities/travel-extra-setting.entity';
import { AncillaryServiceCategory } from '../../database/enums';
import { AuditService } from '../audit/audit.service';
import {
  ANCILLARY_BUILT_IN_SERVICES,
  ANCILLARY_KEY_BY_TRAVEL_EXTRA,
  ANCILLARY_TRAVEL_EXTRA_BY_KEY,
} from './ancillary-services.catalog';
import { classifySeatType, type SeatTypeKey } from './seat-type-pricing';

const COMMERCIAL_HIDDEN_SERVICE_KEYS = new Set(['refund-fee']);

@Injectable()
export class AncillaryServicesService implements OnModuleInit {
  constructor(
    @InjectRepository(AncillaryService)
    private readonly repo: Repository<AncillaryService>,
    @InjectRepository(TravelExtraSetting)
    private readonly travelExtraRepo: Repository<TravelExtraSetting>,
    private readonly audit: AuditService,
  ) {}

  async onModuleInit() {
    await this.ensureBuiltIns();
  }

  async ensureBuiltIns() {
    for (const seed of ANCILLARY_BUILT_IN_SERVICES) {
      const existing = await this.repo.findOneBy({ key: seed.key });
      if (existing) continue;
      await this.repo.save(
        this.repo.create({
          key: seed.key,
          category: seed.category,
          titleFa: seed.titleFa,
          descriptionFa: seed.descriptionFa,
          priceIrr: seed.priceIrr,
          enabled: seed.enabled,
          isCustom: false,
        }),
      );
    }
    // Product policy: these two checkout rules are permanent built-ins.
    // Repair older databases where PET was seeded disabled and keep their
    // travel-extra mirrors purchasable.
    for (const key of ['seat-selection', 'pet']) {
      const fixed = await this.repo.findOneBy({ key });
      if (!fixed) continue;
      let saved = fixed;
      if (!fixed.enabled) {
        fixed.enabled = true;
        saved = await this.repo.save(fixed);
      }
      await this.syncTravelExtra(saved);
    }
  }

  async listManager() {
    const rows = await this.repo.find({
      order: { isCustom: 'ASC', key: 'ASC' },
    });
    const seatServices = rows
      .filter((row) => row.category === AncillaryServiceCategory.SEAT)
      .map((row) => this.toSeatRow(row));
    const otherServices = rows
      .filter(
        (row) =>
          row.category === AncillaryServiceCategory.OTHER &&
          !COMMERCIAL_HIDDEN_SERVICE_KEYS.has(row.key),
      )
      .map((row) => this.toOtherRow(row));
    return { seatServices, otherServices };
  }

  async listPublic() {
    const rows = await this.repo.find({
      where: { enabled: true, category: AncillaryServiceCategory.OTHER },
      order: { isCustom: 'ASC', key: 'ASC' },
    });
    return rows
      .filter((row) => row.key !== 'pet')
      .map((row) => {
        const localized = TRAVEL_EXTRA_LOCALIZATION[row.key] ?? null;
        return {
          key: row.key,
          titleFa: row.titleFa,
          titleEn: localized?.titleEn ?? null,
          titleAr: localized?.titleAr ?? null,
          descriptionFa: row.descriptionFa,
          descriptionEn: localized?.descriptionEn ?? null,
          descriptionAr: localized?.descriptionAr ?? null,
          priceIrr: row.priceIrr.toString(),
        };
      });
  }

  async listPublicSeatServices() {
    const rows = await this.repo.find({
      where: { enabled: true, category: AncillaryServiceCategory.SEAT },
      order: { key: 'ASC' },
    });
    return rows.map((row) => this.toSeatRow(row));
  }

  async priceSelectedSeats(seatCodes: string[], aircraftType: string) {
    if (seatCodes.length === 0) return [];
    const rows = await this.repo.find({
      where: { category: AncillaryServiceCategory.SEAT },
    });
    const byKey = new Map(rows.map((row) => [row.key as SeatTypeKey, row]));
    const grouped = new Map<SeatTypeKey, string[]>();
    for (const seatCode of seatCodes) {
      const key = classifySeatType(seatCode, aircraftType);
      const service = byKey.get(key);
      if (!service?.enabled) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_FAILED,
          message: `نوع قیمت صندلی ${seatCode} در حال حاضر فعال نیست.`,
        });
      }
      grouped.set(key, [...(grouped.get(key) ?? []), seatCode]);
    }
    return [...grouped.entries()].map(([key, codes]) => {
      const service = byKey.get(key)!;
      const localized = SEAT_SERVICE_LOCALIZATION[key] ?? null;
      return {
        id: `seat-type:${key}`,
        code: key.toUpperCase().replace(/-/g, '_'),
        titleFa: service.titleFa,
        titleEn: localized?.titleEn ?? null,
        titleAr: localized?.titleAr ?? null,
        billingUnit: 'PER_SEAT',
        unitPriceIrr: service.priceIrr.toString(),
        quantity: codes.length,
        totalIrr: (service.priceIrr * BigInt(codes.length)).toString(),
        seatCodes: codes,
      };
    });
  }

  async setPrice(actor: AuthenticatedUser, key: string, priceIrr: Irr) {
    const row = await this.getOrThrow(key);
    const previous = row.priceIrr.toString();
    row.priceIrr = priceIrr;
    row.updatedById = actor.id;
    const saved = await this.repo.save(row);
    await this.syncTravelExtra(saved);
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'PRICING',
      action: 'تغییر قیمت خدمت جانبی',
      detail: `قیمت «${saved.titleFa}» از ${previous} به ${saved.priceIrr.toString()} ریال توسط ${actor.fullName} تغییر کرد.`,
      entityType: 'AncillaryService',
      entityId: saved.key,
      metadata: {
        key: saved.key,
        previousPriceIrr: previous,
        priceIrr: saved.priceIrr.toString(),
      },
    });
    return this.listManager();
  }

  async setEnabled(actor: AuthenticatedUser, key: string, enabled: boolean) {
    const row = await this.getOrThrow(key);
    if (!enabled && (key === 'seat-selection' || key === 'pet')) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'قانون انتخاب صندلی و حمل حیوان خانگی همیشه فعال است.',
      });
    }
    const previous = row.enabled;
    row.enabled = enabled;
    row.updatedById = actor.id;
    const saved = await this.repo.save(row);
    await this.syncTravelExtra(saved);
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'PRICING',
      action: enabled ? 'فعال‌سازی خدمت جانبی' : 'غیرفعال‌سازی خدمت جانبی',
      detail: `خدمت «${saved.titleFa}» توسط ${actor.fullName} ${enabled ? 'فعال' : 'غیرفعال'} شد.`,
      entityType: 'AncillaryService',
      entityId: saved.key,
      metadata: { key: saved.key, previousEnabled: previous, enabled },
    });
    return this.listManager();
  }

  async createCustom(
    actor: AuthenticatedUser,
    dto: { titleFa: string; descriptionFa?: string; priceIrr: Irr },
  ) {
    const key = `custom-${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const duplicate = await this.repo.findOneBy({ key });
    if (duplicate) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'کلید خدمت تکراری است.',
      });
    }
    const saved = await this.repo.save(
      this.repo.create({
        key,
        category: AncillaryServiceCategory.OTHER,
        titleFa: dto.titleFa.trim(),
        descriptionFa: (dto.descriptionFa ?? '').trim(),
        priceIrr: dto.priceIrr,
        enabled: true,
        isCustom: true,
        updatedById: actor.id,
      }),
    );
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'PRICING',
      action: 'افزودن خدمت جانبی سفارشی',
      detail: `خدمت سفارشی «${saved.titleFa}» توسط ${actor.fullName} اضافه شد.`,
      entityType: 'AncillaryService',
      entityId: saved.key,
      metadata: { key: saved.key, priceIrr: saved.priceIrr.toString() },
    });
    return this.listManager();
  }

  async removeCustom(actor: AuthenticatedUser, key: string) {
    const row = await this.getOrThrow(key);
    if (!row.isCustom) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message:
          'خدمات پیش‌فرض قابل حذف نیستند؛ فقط می‌توان آن‌ها را غیرفعال کرد.',
      });
    }
    await this.repo.remove(row);
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'PRICING',
      action: 'حذف خدمت جانبی سفارشی',
      detail: `خدمت سفارشی «${row.titleFa}» توسط ${actor.fullName} حذف شد.`,
      entityType: 'AncillaryService',
      entityId: key,
      metadata: { key },
    });
    return this.listManager();
  }

  /** Overlay checkout extras with current ancillary prices/enabled flags. */
  async overlayTravelExtras<
    T extends {
      code: string;
      priceIrr: bigint;
      purchaseEnabled: boolean;
      active: boolean;
      titleFa: string;
      descriptionFa: string | null;
    },
  >(extras: T[]): Promise<T[]> {
    const mapped = await this.repo.find();
    const byKey = new Map(mapped.map((row) => [row.key, row]));
    return extras.flatMap((extra) => {
      const ancillaryKey = ANCILLARY_KEY_BY_TRAVEL_EXTRA.get(
        extra.code as TravelExtraCode,
      );
      if (!ancillaryKey) return [extra];
      const ancillary = byKey.get(ancillaryKey);
      if (!ancillary) return [extra];
      if (!ancillary.enabled) return [];
      return [
        {
          ...extra,
          priceIrr: ancillary.priceIrr,
          purchaseEnabled: ancillary.enabled,
          active: ancillary.enabled,
          titleFa: ancillary.titleFa,
          descriptionFa: ancillary.descriptionFa || extra.descriptionFa,
        },
      ];
    });
  }

  private async syncTravelExtra(row: AncillaryService) {
    const mapping = ANCILLARY_TRAVEL_EXTRA_BY_KEY.get(row.key);
    if (!mapping) return;
    const localized = TRAVEL_EXTRA_LOCALIZATION[row.key] ?? null;
    let extra = await this.travelExtraRepo.findOneBy({ code: mapping.code });
    if (!extra) {
      // Older installations can have the permanent ancillary catalogue row
      // without its checkout mirror. Recreate it at startup so fixed services
      // such as seat selection cannot silently disappear from checkout.
      extra = this.travelExtraRepo.create({
        code: mapping.code,
        titleFa: row.titleFa,
        titleEn: localized?.titleEn ?? null,
        titleAr: localized?.titleAr ?? null,
        descriptionFa: row.descriptionFa || null,
        descriptionEn: localized?.descriptionEn ?? null,
        descriptionAr: localized?.descriptionAr ?? null,
        billingUnit: mapping.billingUnit,
        priceIrr: row.priceIrr,
        active: row.enabled,
        purchaseEnabled: row.enabled,
        sortOrder: 0,
        updatedById: row.updatedById,
      });
      await this.travelExtraRepo.save(extra);
      return;
    }
    extra.priceIrr = row.priceIrr;
    extra.active = row.enabled;
    extra.purchaseEnabled = row.enabled;
    extra.titleFa = row.titleFa;
    extra.titleEn = localized?.titleEn ?? extra.titleEn;
    extra.titleAr = localized?.titleAr ?? extra.titleAr;
    extra.descriptionFa = row.descriptionFa || extra.descriptionFa;
    extra.descriptionEn = localized?.descriptionEn ?? extra.descriptionEn;
    extra.descriptionAr = localized?.descriptionAr ?? extra.descriptionAr;
    extra.updatedById = row.updatedById;
    await this.travelExtraRepo.save(extra);
  }

  private async getOrThrow(key: string) {
    if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(key)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'شناسه خدمت نامعتبر است.',
      });
    }
    const row = await this.repo.findOneBy({ key });
    if (!row) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'خدمت یافت نشد.',
      });
    }
    return row;
  }

  private toSeatRow(row: AncillaryService) {
    const localized = SEAT_SERVICE_LOCALIZATION[row.key] ?? null;
    return {
      key: row.key,
      titleFa: row.titleFa,
      titleEn: localized?.titleEn ?? null,
      titleAr: localized?.titleAr ?? null,
      descriptionFa: row.descriptionFa,
      priceIrr: row.priceIrr.toString(),
      enabled: row.enabled,
    };
  }

  private toOtherRow(row: AncillaryService) {
    return {
      ...this.toSeatRow(row),
      isCustom: row.isCustom,
    };
  }
}

const SEAT_SERVICE_LOCALIZATION: Record<string, { titleEn: string; titleAr: string }> = {
  'seat-normal': { titleEn: 'Standard seat', titleAr: 'مقعد عادي' },
  'seat-legroom': { titleEn: 'Extra-legroom seat', titleAr: 'مقعد بمساحة إضافية للساقين' },
  'seat-window-aisle': { titleEn: 'Window or aisle seat', titleAr: 'مقعد نافذة أو ممر' },
};

const TRAVEL_EXTRA_LOCALIZATION: Record<string, { titleEn: string; titleAr: string; descriptionEn: string; descriptionAr: string }> = {
  baggage: {
    titleEn: 'Extra baggage', titleAr: 'أمتعة إضافية',
    descriptionEn: 'Each 5 kg above the baggage allowance', descriptionAr: 'كل 5 كغ إضافية فوق الوزن المسموح',
  },
  meal: {
    titleEn: 'Special meal', titleAr: 'وجبة خاصة',
    descriptionEn: 'A hot meal on eligible flights', descriptionAr: 'وجبة ساخنة على الرحلات المؤهلة',
  },
  insurance: {
    titleEn: 'Travel insurance', titleAr: 'تأمين السفر',
    descriptionEn: 'Travel insurance cover for each passenger', descriptionAr: 'تغطية تأمين السفر لكل مسافر',
  },
  cip: {
    titleEn: 'Airport CIP service', titleAr: 'خدمة كبار الشخصيات في المطار',
    descriptionEn: 'Private airport transfer and lounge', descriptionAr: 'نقل خاص وصالة مميزة في المطار',
  },
  pet: {
    titleEn: 'Pet travel', titleAr: 'سفر الحيوانات الأليفة',
    descriptionEn: 'Pet transport in the cabin or hold', descriptionAr: 'نقل الحيوانات الأليفة في المقصورة أو مخزن الأمتعة',
  },
  'seat-selection': {
    titleEn: 'Advance seat selection', titleAr: 'اختيار المقعد مسبقاً',
    descriptionEn: 'Select a seat during booking', descriptionAr: 'اختيار رقم المقعد أثناء الحجز',
  },
  'refund-fee': {
    titleEn: 'Refund fee', titleAr: 'رسوم الاسترداد',
    descriptionEn: 'Deducted according to the ticket rules', descriptionAr: 'تخصم وفقاً لقواعد التذكرة',
  },
};
