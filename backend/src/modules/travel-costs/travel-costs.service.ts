import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ErrorCode } from '../../common/errors';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { TravelExtraSetting } from '../../database/entities/travel-extra-setting.entity';
import { AuditService } from '../audit/audit.service';
import { AncillaryServicesService } from '../ancillary-services/ancillary-services.service';
import type {
  CreateTravelCostDto,
  UpdateTravelCostDto,
} from './dto/travel-cost.dtos';

const FIXED_CHECKOUT_EXTRA_CODES = new Set(['SEAT_SELECTION', 'PET']);

@Injectable()
export class TravelCostsService {
  constructor(
    @InjectRepository(TravelExtraSetting)
    private readonly repo: Repository<TravelExtraSetting>,
    private readonly audit: AuditService,
    private readonly ancillary: AncillaryServicesService,
  ) {}

  listManager() {
    return this.repo.find({ order: { sortOrder: 'ASC', createdAt: 'ASC' } });
  }

  async listPublic() {
    const rows = await this.repo.find({
      where: { active: true },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
      select: {
        id: true,
        code: true,
        titleFa: true,
        titleEn: true,
        titleAr: true,
        descriptionFa: true,
        descriptionEn: true,
        descriptionAr: true,
        billingUnit: true,
        priceIrr: true,
        purchaseEnabled: true,
        active: true,
        sortOrder: true,
      },
    });
    const overlaid = await this.ancillary.overlayTravelExtras(rows);
    return overlaid
      .filter((row) => row.purchaseEnabled)
      .map((row) => {
        const publicRow: Partial<typeof row> = { ...row };
        delete publicRow.active;
        return publicRow;
      });
  }

  async create(actor: AuthenticatedUser, dto: CreateTravelCostDto) {
    const existing = await this.repo.findOneBy({ code: dto.code });
    if (existing) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'این نوع هزینه سفر قبلاً تعریف شده است.',
      });
    }
    const row = await this.repo.save(
      this.repo.create({
        code: dto.code,
        titleFa: dto.titleFa.trim(),
        titleEn: dto.titleEn?.trim() || null,
        titleAr: dto.titleAr?.trim() || null,
        descriptionFa: dto.descriptionFa?.trim() || null,
        descriptionEn: dto.descriptionEn?.trim() || null,
        descriptionAr: dto.descriptionAr?.trim() || null,
        billingUnit: dto.billingUnit,
        priceIrr: dto.priceIrr,
        active: dto.active ?? true,
        purchaseEnabled: dto.purchaseEnabled ?? true,
        sortOrder: dto.sortOrder ?? 0,
        updatedById: actor.id,
      }),
    );
    await this.record(actor, row, 'ثبت هزینه سفر');
    return row;
  }

  async update(actor: AuthenticatedUser, id: string, dto: UpdateTravelCostDto) {
    const row = await this.repo.findOneBy({ id });
    if (!row) this.notFound();
    if (
      FIXED_CHECKOUT_EXTRA_CODES.has(row.code) &&
      (dto.active === false || dto.purchaseEnabled === false)
    ) {
      this.fixedCheckoutExtra();
    }
    if (
      FIXED_CHECKOUT_EXTRA_CODES.has(row.code) &&
      dto.code !== undefined &&
      dto.code !== row.code
    ) {
      this.fixedCheckoutExtra();
    }
    if (dto.code && dto.code !== row.code) {
      const duplicate = await this.repo.findOneBy({ code: dto.code });
      if (duplicate) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message: 'این نوع هزینه سفر قبلاً تعریف شده است.',
        });
      }
      row.code = dto.code;
    }
    if (dto.titleFa !== undefined) row.titleFa = dto.titleFa.trim();
    if (dto.titleEn !== undefined) row.titleEn = dto.titleEn.trim() || null;
    if (dto.titleAr !== undefined) row.titleAr = dto.titleAr.trim() || null;
    if (dto.descriptionFa !== undefined)
      row.descriptionFa = dto.descriptionFa.trim() || null;
    if (dto.descriptionEn !== undefined)
      row.descriptionEn = dto.descriptionEn.trim() || null;
    if (dto.descriptionAr !== undefined)
      row.descriptionAr = dto.descriptionAr.trim() || null;
    if (dto.billingUnit !== undefined) row.billingUnit = dto.billingUnit;
    if (dto.priceIrr !== undefined) row.priceIrr = dto.priceIrr;
    if (dto.active !== undefined) row.active = dto.active;
    if (dto.purchaseEnabled !== undefined)
      row.purchaseEnabled = dto.purchaseEnabled;
    if (dto.sortOrder !== undefined) row.sortOrder = dto.sortOrder;
    row.updatedById = actor.id;
    const saved = await this.repo.save(row);
    await this.record(actor, saved, 'ویرایش هزینه سفر');
    return saved;
  }

  async remove(actor: AuthenticatedUser, id: string) {
    const row = await this.repo.findOneBy({ id });
    if (!row) this.notFound();
    if (FIXED_CHECKOUT_EXTRA_CODES.has(row.code)) this.fixedCheckoutExtra();
    await this.repo.remove(row);
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'PRICING',
      action: 'حذف هزینه سفر',
      detail: `هزینه «${row.titleFa}» توسط ${actor.fullName} حذف شد.`,
      entityType: 'TravelExtraSetting',
      entityId: id,
      metadata: { code: row.code },
    });
    return { id };
  }

  private notFound(): never {
    throw new NotFoundException({
      code: ErrorCode.NOT_FOUND,
      message: 'هزینه سفر یافت نشد.',
    });
  }

  private fixedCheckoutExtra(): never {
    throw new BadRequestException({
      code: ErrorCode.VALIDATION_FAILED,
      message: 'خدمت انتخاب صندلی و حمل حیوان خانگی ثابت است و قابل حذف یا غیرفعال‌سازی نیست.',
    });
  }

  private async record(
    actor: AuthenticatedUser,
    row: TravelExtraSetting,
    action: string,
  ) {
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'PRICING',
      action,
      detail: `هزینه «${row.titleFa}» توسط ${actor.fullName} ثبت شد.`,
      entityType: 'TravelExtraSetting',
      entityId: row.id,
      metadata: {
        code: row.code,
        priceIrr: row.priceIrr.toString(),
        active: row.active,
        purchaseEnabled: row.purchaseEnabled,
      },
    });
  }
}
