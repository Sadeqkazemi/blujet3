import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import type { ActorContextDto } from '../common/actor-context.dto';
import {
  SiteContentBlock,
  SITE_CONTENT_BLOCK_KEYS,
  type SiteContentBlockKey,
} from '../database/entities/site-content-block.entity';
import { SiteDestinationHighlight } from '../database/entities/site-destination-highlight.entity';
import { SiteMediaAsset } from '../database/entities/site-media-asset.entity';
import { SiteRouteHighlight } from '../database/entities/site-route-highlight.entity';
import { StoredFile } from '../database/entities/stored-file.entity';
import type {
  AddLibraryAssetDto,
  CreateDestinationDto,
  CreateRouteDto,
  UpdateContentBlockDto,
  UpdateDestinationDto,
  UpdateRouteDto,
} from './dto/site-content.dto';

const BLOCK_DEFAULTS: Record<
  SiteContentBlockKey,
  {
    enabled: boolean;
    title: string;
    subtitle: string;
    buttonText: string;
    badgeText: string;
  }
> = {
  HERO_BANNER: {
    enabled: true,
    title: 'پرواز بعدی‌ات را با blujet رزرو کن',
    subtitle: 'مقاصد داخلی و بین‌المللی با بهترین قیمت',
    buttonText: 'مشاهده پیشنهادهای ویژه',
    badgeText: '',
  },
  ANNOUNCEMENT_BAR: {
    enabled: true,
    title: 'اطلاعیه مهم: آخرین وضعیت پروازها را بررسی کنید',
    subtitle: '',
    buttonText: 'مشاهده',
    badgeText: '',
  },
  PROMO_BANNER: {
    enabled: true,
    title: 'تخفیف ویژه پروازهای داخلی',
    subtitle: '',
    buttonText: 'رزرو کنید',
    badgeText: 'پیشنهاد ویژه',
  },
};

const BLOCK_LOCALE_DEFAULTS = {
  en: {
    HERO_BANNER: {
      title: 'Book your next flight with blujet',
      subtitle: 'Domestic and international destinations at the best prices',
      buttonText: 'View special offers',
      badgeText: '',
    },
    ANNOUNCEMENT_BAR: {
      title: 'Important notice: check the latest flight status',
      subtitle: '',
      buttonText: 'View',
      badgeText: '',
    },
    PROMO_BANNER: {
      title: 'Special discount on domestic flights',
      subtitle: '',
      buttonText: 'Book now',
      badgeText: 'Special offer',
    },
  },
  ar: {
    HERO_BANNER: {
      title: 'احجز رحلتك القادمة مع blujet',
      subtitle: 'وجهات داخلية ودولية بأفضل الأسعار',
      buttonText: 'عرض العروض الخاصة',
      badgeText: '',
    },
    ANNOUNCEMENT_BAR: {
      title: 'إشعار مهم: تحقق من آخر حالة للرحلات',
      subtitle: '',
      buttonText: 'عرض',
      badgeText: '',
    },
    PROMO_BANNER: {
      title: 'خصم خاص على الرحلات الداخلية',
      subtitle: '',
      buttonText: 'احجز الآن',
      badgeText: 'عرض خاص',
    },
  },
} as const;

@Injectable()
export class SiteContentService {
  constructor(
    @InjectRepository(StoredFile)
    private readonly storedFileRepo: Repository<StoredFile>,
    @InjectRepository(SiteMediaAsset)
    private readonly mediaRepo: Repository<SiteMediaAsset>,
    @InjectRepository(SiteContentBlock)
    private readonly blockRepo: Repository<SiteContentBlock>,
    @InjectRepository(SiteDestinationHighlight)
    private readonly destinationRepo: Repository<SiteDestinationHighlight>,
    @InjectRepository(SiteRouteHighlight)
    private readonly routeRepo: Repository<SiteRouteHighlight>,
  ) {}

  private assertSiteAdmin(actor: ActorContextDto): void {
    if (actor.role !== 'SITE_ADMIN' && !actor.isSuperAdmin) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'دسترسی به مدیریت محتوای سایت مجاز نیست.',
      });
    }
  }

  private mediaUrl(fileId: string): string {
    return `/site-content/media/${fileId}`;
  }

  private async assertImage(actorId: string, fileId: string): Promise<void> {
    const file = await this.storedFileRepo.findOneBy({ id: fileId });
    if (
      !file ||
      file.ownerId !== actorId ||
      !file.mimeType.startsWith('image/')
    ) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'فایل تصویر معتبر و متعلق به شما نیست.',
      });
    }
  }

  private async ensureBlock(key: SiteContentBlockKey) {
    const existing = await this.blockRepo.findOneBy({ key });
    if (existing) return existing;
    return this.blockRepo.save(
      this.blockRepo.create({
        key,
        ...BLOCK_DEFAULTS[key],
        updatedAt: new Date(),
      }),
    );
  }

  private toBlock(row: SiteContentBlock) {
    return {
      key: row.key,
      enabled: row.enabled,
      title: row.title,
      subtitle: row.subtitle,
      buttonText: row.buttonText,
      badgeText: row.badgeText,
      imageFileId: row.imageFileId,
      imageUrl: row.imageFileId ? this.mediaUrl(row.imageFileId) : null,
    };
  }

  private toDestination(row: SiteDestinationHighlight) {
    return {
      id: row.id,
      airportCode: row.airportCode,
      priceIrr: row.priceIrr.toString(),
      imageFileId: row.imageFileId,
      imageUrl: row.imageFileId ? this.mediaUrl(row.imageFileId) : null,
      sortOrder: row.sortOrder,
    };
  }

  private toRoute(row: SiteRouteHighlight) {
    return {
      id: row.id,
      fromAirportCode: row.fromAirportCode,
      toAirportCode: row.toAirportCode,
      priceIrr: row.priceIrr.toString(),
      sortOrder: row.sortOrder,
    };
  }

  async listLibrary(actor: ActorContextDto) {
    this.assertSiteAdmin(actor);
    const rows = await this.mediaRepo.find({
      where: { deletedAt: IsNull() },
      relations: { storedFile: true },
      order: { createdAt: 'DESC' },
    });
    return rows.map((row) => ({
      id: row.id,
      label: row.label,
      fileName: row.storedFile.fileName,
      mimeType: row.storedFile.mimeType,
      sizeBytes: row.storedFile.sizeBytes,
      fileId: row.storedFile.id,
      url: this.mediaUrl(row.storedFile.id),
      createdAt: row.createdAt,
    }));
  }

  async addLibrary(actor: ActorContextDto, dto: AddLibraryAssetDto) {
    this.assertSiteAdmin(actor);
    await this.assertImage(actor.id, dto.storedFileId);
    const file = await this.storedFileRepo.findOneByOrFail({
      id: dto.storedFileId,
    });
    const existing = await this.mediaRepo.findOneBy({
      storedFileId: dto.storedFileId,
    });
    if (existing && !existing.deletedAt) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'این فایل قبلاً در کتابخانه ثبت شده است.',
      });
    }
    const row = existing ?? this.mediaRepo.create({ storedFileId: file.id });
    row.label = dto.label?.trim() || file.fileName;
    row.uploadedById = actor.id;
    row.deletedAt = null;
    const saved = await this.mediaRepo.save(row);
    return {
      id: saved.id,
      label: saved.label,
      fileName: file.fileName,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      fileId: file.id,
      url: this.mediaUrl(file.id),
      createdAt: saved.createdAt,
    };
  }

  async deleteLibrary(actor: ActorContextDto, id: string) {
    this.assertSiteAdmin(actor);
    const row = await this.mediaRepo.findOneBy({ id, deletedAt: IsNull() });
    if (!row) this.notFound('تصویر یافت نشد.');
    row.deletedAt = new Date();
    await this.mediaRepo.save(row);
    return { id };
  }

  async listBlocks(actor?: ActorContextDto) {
    if (actor) this.assertSiteAdmin(actor);
    const rows = await Promise.all(
      SITE_CONTENT_BLOCK_KEYS.map((key) => this.ensureBlock(key)),
    );
    return rows.map((row) => this.toBlock(row));
  }

  async updateBlock(
    actor: ActorContextDto,
    key: SiteContentBlockKey,
    dto: UpdateContentBlockDto,
  ) {
    this.assertSiteAdmin(actor);
    const row = await this.ensureBlock(key);
    if (dto.imageFileId) await this.assertImage(actor.id, dto.imageFileId);
    Object.assign(row, dto, { updatedById: actor.id, updatedAt: new Date() });
    return this.toBlock(await this.blockRepo.save(row));
  }

  async listDestinations(actor?: ActorContextDto) {
    if (actor) this.assertSiteAdmin(actor);
    const rows = await this.destinationRepo.find({
      where: { deletedAt: IsNull() },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
    return rows.map((row) => this.toDestination(row));
  }

  async createDestination(actor: ActorContextDto, dto: CreateDestinationDto) {
    this.assertSiteAdmin(actor);
    if (dto.imageFileId) await this.assertImage(actor.id, dto.imageFileId);
    const row = await this.destinationRepo.save(
      this.destinationRepo.create({
        airportCode: dto.airportCode.toUpperCase(),
        priceIrr: BigInt(dto.priceIrr),
        imageFileId: dto.imageFileId ?? null,
        sortOrder: dto.sortOrder ?? 0,
        updatedAt: new Date(),
      }),
    );
    return this.toDestination(row);
  }

  async updateDestination(
    actor: ActorContextDto,
    id: string,
    dto: UpdateDestinationDto,
  ) {
    this.assertSiteAdmin(actor);
    const row = await this.destinationRepo.findOneBy({
      id,
      deletedAt: IsNull(),
    });
    if (!row) this.notFound('مقصد یافت نشد.');
    if (dto.imageFileId) await this.assertImage(actor.id, dto.imageFileId);
    if (dto.airportCode !== undefined) {
      row.airportCode = dto.airportCode.toUpperCase();
    }
    if (dto.priceIrr !== undefined) row.priceIrr = BigInt(dto.priceIrr);
    if (dto.imageFileId !== undefined) row.imageFileId = dto.imageFileId;
    if (dto.sortOrder !== undefined) row.sortOrder = dto.sortOrder;
    row.updatedAt = new Date();
    return this.toDestination(await this.destinationRepo.save(row));
  }

  async deleteDestination(actor: ActorContextDto, id: string) {
    this.assertSiteAdmin(actor);
    const row = await this.destinationRepo.findOneBy({
      id,
      deletedAt: IsNull(),
    });
    if (!row) this.notFound('مقصد یافت نشد.');
    row.deletedAt = new Date();
    row.updatedAt = new Date();
    await this.destinationRepo.save(row);
    return { id };
  }

  async listRoutes(actor?: ActorContextDto) {
    if (actor) this.assertSiteAdmin(actor);
    const rows = await this.routeRepo.find({
      where: { deletedAt: IsNull() },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
    return rows.map((row) => this.toRoute(row));
  }

  async createRoute(actor: ActorContextDto, dto: CreateRouteDto) {
    this.assertSiteAdmin(actor);
    const row = await this.routeRepo.save(
      this.routeRepo.create({
        fromAirportCode: dto.fromAirportCode.toUpperCase(),
        toAirportCode: dto.toAirportCode.toUpperCase(),
        priceIrr: BigInt(dto.priceIrr),
        sortOrder: dto.sortOrder ?? 0,
        updatedAt: new Date(),
      }),
    );
    return this.toRoute(row);
  }

  async updateRoute(actor: ActorContextDto, id: string, dto: UpdateRouteDto) {
    this.assertSiteAdmin(actor);
    const row = await this.routeRepo.findOneBy({ id, deletedAt: IsNull() });
    if (!row) this.notFound('مسیر یافت نشد.');
    if (dto.fromAirportCode !== undefined) {
      row.fromAirportCode = dto.fromAirportCode.toUpperCase();
    }
    if (dto.toAirportCode !== undefined) {
      row.toAirportCode = dto.toAirportCode.toUpperCase();
    }
    if (dto.priceIrr !== undefined) row.priceIrr = BigInt(dto.priceIrr);
    if (dto.sortOrder !== undefined) row.sortOrder = dto.sortOrder;
    row.updatedAt = new Date();
    return this.toRoute(await this.routeRepo.save(row));
  }

  async deleteRoute(actor: ActorContextDto, id: string) {
    this.assertSiteAdmin(actor);
    const row = await this.routeRepo.findOneBy({ id, deletedAt: IsNull() });
    if (!row) this.notFound('مسیر یافت نشد.');
    row.deletedAt = new Date();
    row.updatedAt = new Date();
    await this.routeRepo.save(row);
    return { id };
  }

  async getPublicContent(locale: 'fa' | 'en' | 'ar' = 'fa') {
    const [blocks, destinations, routes] = await Promise.all([
      this.listBlocks(),
      this.listDestinations(),
      this.listRoutes(),
    ]);
    return {
      blocks: blocks.map((block) => {
        if (locale === 'fa') return block;
        return { ...block, ...BLOCK_LOCALE_DEFAULTS[locale][block.key] };
      }),
      destinations,
      routes,
    };
  }

  private notFound(message: string): never {
    throw new NotFoundException({ code: 'NOT_FOUND', message });
  }
}
