import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as fs from 'node:fs';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { StoredFile } from '../../database/entities/stored-file.entity';
import { SiteMediaAsset } from '../../database/entities/site-media-asset.entity';
import { SiteContentBlock } from '../../database/entities/site-content-block.entity';
import { SiteDestinationHighlight } from '../../database/entities/site-destination-highlight.entity';
import { SiteRouteHighlight } from '../../database/entities/site-route-highlight.entity';
import { Airport } from '../../database/entities/airport.entity';
import { BlogPost } from '../../database/entities/blog-post.entity';
import { FlightInstance } from '../../database/entities/flight-instance.entity';
import {
  BlogPostStatus,
  FlightDefinitionStatus,
  FlightInstanceStatus,
  type SiteContentBlockKey,
} from '../../database/enums';
import { findOneOrThrow } from '../../database/utils/find-one-or-throw';
import { AuditService } from '../audit/audit.service';
import { ErrorCode } from '../../common/errors';
import type {
  AddLibraryAssetDto,
  CreateDestinationDto,
  CreateRouteDto,
  UpdateContentBlockDto,
  UpdateDestinationDto,
  UpdateRouteDto,
} from './dto/site-content.dtos';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

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
    title:
      'اطلاعیه مهم: برخی پروازهای امروز به‌دلیل شرایط جوی با تأخیر انجام می‌شوند — آخرین وضعیت پروازها را بررسی کنید',
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

const BLOCK_LOCALE_DEFAULTS: Record<
  'en' | 'ar',
  Record<
    SiteContentBlockKey,
    Pick<
      (typeof BLOCK_DEFAULTS)[SiteContentBlockKey],
      'title' | 'subtitle' | 'buttonText' | 'badgeText'
    >
  >
> = {
  en: {
    HERO_BANNER: {
      title: 'Book your next flight with blujet',
      subtitle: 'Domestic and international destinations at the best prices',
      buttonText: 'View special offers',
      badgeText: '',
    },
    ANNOUNCEMENT_BAR: {
      title:
        'Important notice: some flights today are delayed due to weather — check the latest flight status',
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
      title:
        'إشعار مهم: بعض الرحلات اليوم متأخرة بسبب الأحوال الجوية — تحقق من آخر حالة للرحلات',
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
};

@Injectable()
export class SiteContentService {
  constructor(
    @InjectRepository(StoredFile)
    private readonly storedFileRepo: Repository<StoredFile>,
    @InjectRepository(SiteMediaAsset)
    private readonly siteMediaAssetRepo: Repository<SiteMediaAsset>,
    @InjectRepository(SiteContentBlock)
    private readonly siteContentBlockRepo: Repository<SiteContentBlock>,
    @InjectRepository(SiteDestinationHighlight)
    private readonly siteDestinationHighlightRepo: Repository<SiteDestinationHighlight>,
    @InjectRepository(SiteRouteHighlight)
    private readonly siteRouteHighlightRepo: Repository<SiteRouteHighlight>,
    @InjectRepository(Airport)
    private readonly airportRepo: Repository<Airport>,
    @InjectRepository(BlogPost)
    private readonly blogPostRepo: Repository<BlogPost>,
    @InjectRepository(FlightInstance)
    private readonly instanceRepo: Repository<FlightInstance>,
    private readonly audit: AuditService,
  ) {}

  /**
   * Active destinations = distinct dest airports that appear on sellable
   * published flight instances, intersected with the active airport catalog.
   * Zeros are valid when nothing is published.
   */
  async getDestinationStats() {
    const rows = await this.instanceRepo
      .createQueryBuilder('fi')
      .innerJoin('fi.flight', 'f')
      .innerJoin('f.route', 'r')
      .innerJoin(Airport, 'a', 'a.code = r.destCode AND a.active = true')
      .select('a.code', 'code')
      .addSelect('a.isInternational', 'isInternational')
      .where('fi.status = :scheduled', {
        scheduled: FlightInstanceStatus.SCHEDULED,
      })
      .andWhere(
        '(fi.definitionStatus IN (:...sellable) OR (fi.definitionStatus = :rev AND fi.approvedSnapshot IS NOT NULL))',
        {
          sellable: [
            FlightDefinitionStatus.PUBLISHED,
            FlightDefinitionStatus.APPROVED,
          ],
          rev: FlightDefinitionStatus.PENDING_REVISION,
        },
      )
      .andWhere('fi.departureAt > NOW()')
      .groupBy('a.code')
      .addGroupBy('a.isInternational')
      .getRawMany<{ code: string; isInternational: boolean | string }>();

    let domestic = 0;
    let international = 0;
    for (const r of rows) {
      const intl =
        r.isInternational === true ||
        r.isInternational === 'true' ||
        r.isInternational === 't';
      if (intl) international += 1;
      else domestic += 1;
    }
    return {
      activeDestinations: domestic + international,
      domesticDestinations: domestic,
      internationalDestinations: international,
    };
  }

  private async assertImageFile(actorId: string, fileId: string) {
    const file = await this.storedFileRepo.findOneBy({ id: fileId });
    if (!file) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'فایل تصویر یافت نشد.',
      });
    }
    if (file.ownerId !== actorId) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'فقط فایل‌های آپلودشده توسط شما قابل استفاده است.',
      });
    }
    if (!file.mimeType.startsWith('image/')) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'فقط تصویر برای این بخش مجاز است.',
      });
    }
  }

  private mediaUrl(fileId: string) {
    return `/site-content/media/${fileId}`;
  }

  private toLibraryRow(row: {
    id: string;
    label: string;
    createdAt: Date;
    storedFile: {
      id: string;
      fileName: string;
      mimeType: string;
      sizeBytes: number;
    };
  }) {
    return {
      id: row.id,
      label: row.label,
      fileName: row.storedFile.fileName,
      mimeType: row.storedFile.mimeType,
      sizeBytes: row.storedFile.sizeBytes,
      fileId: row.storedFile.id,
      url: this.mediaUrl(row.storedFile.id),
      createdAt: row.createdAt,
    };
  }

  async listLibrary() {
    const rows = await this.siteMediaAssetRepo.find({
      where: { deletedAt: IsNull() },
      relations: { storedFile: true },
      order: { createdAt: 'DESC' },
    });
    return rows.map((r) => this.toLibraryRow(r));
  }

  async addLibraryAsset(actor: AuthenticatedUser, dto: AddLibraryAssetDto) {
    await this.assertImageFile(actor.id, dto.storedFileId);
    const file = await findOneOrThrow(this.storedFileRepo, {
      where: { id: dto.storedFileId },
    });
    const existing = await this.siteMediaAssetRepo.findOneBy({
      storedFileId: dto.storedFileId,
    });
    if (existing && !existing.deletedAt) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'این فایل قبلاً در کتابخانه ثبت شده است.',
      });
    }
    const label = dto.label?.trim() || file.fileName;
    let assetId: string;
    if (existing) {
      await this.siteMediaAssetRepo.update(
        { id: existing.id },
        { label, deletedAt: null, uploadedById: actor.id },
      );
      assetId = existing.id;
    } else {
      const saved = await this.siteMediaAssetRepo.save(
        this.siteMediaAssetRepo.create({
          storedFileId: dto.storedFileId,
          label,
          uploadedById: actor.id,
        }),
      );
      assetId = saved.id;
    }
    const asset = await findOneOrThrow(this.siteMediaAssetRepo, {
      where: { id: assetId },
      relations: { storedFile: true },
    });
    return this.toLibraryRow(asset);
  }

  async deleteLibraryAsset(actor: AuthenticatedUser, id: string) {
    const asset = await this.siteMediaAssetRepo.findOneBy({
      id,
      deletedAt: IsNull(),
    });
    if (!asset) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'تصویر یافت نشد.',
      });
    }
    await this.siteMediaAssetRepo.update({ id }, { deletedAt: new Date() });
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'CONTENT',
      action: 'حذف تصویر از کتابخانه',
      detail: `${actor.fullName} تصویر «${asset.label}» را از کتابخانه حذف کرد.`,
      entityType: 'SiteMediaAsset',
      entityId: asset.id,
    });
    return { id };
  }

  private async ensureBlock(key: SiteContentBlockKey) {
    const existing = await this.siteContentBlockRepo.findOneBy({ key });
    if (existing) return existing;
    const defaults = BLOCK_DEFAULTS[key];
    return this.siteContentBlockRepo.save(
      this.siteContentBlockRepo.create({
        key,
        ...defaults,
        updatedAt: new Date(),
      }),
    );
  }

  private toBlockRow(row: {
    key: SiteContentBlockKey;
    enabled: boolean;
    title: string;
    subtitle: string;
    buttonText: string;
    badgeText: string;
    imageFileId: string | null;
  }) {
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

  async listBlocks() {
    const keys: SiteContentBlockKey[] = [
      'HERO_BANNER',
      'ANNOUNCEMENT_BAR',
      'PROMO_BANNER',
    ];
    const rows = await Promise.all(keys.map((k) => this.ensureBlock(k)));
    return rows.map((r) => this.toBlockRow(r));
  }

  async updateBlock(
    actor: AuthenticatedUser,
    key: SiteContentBlockKey,
    dto: UpdateContentBlockDto,
  ) {
    await this.ensureBlock(key);
    if (dto.imageFileId) {
      await this.assertImageFile(actor.id, dto.imageFileId);
    }
    await this.siteContentBlockRepo.update(
      { key },
      {
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.subtitle !== undefined ? { subtitle: dto.subtitle } : {}),
        ...(dto.buttonText !== undefined ? { buttonText: dto.buttonText } : {}),
        ...(dto.badgeText !== undefined ? { badgeText: dto.badgeText } : {}),
        ...(dto.imageFileId !== undefined
          ? { imageFileId: dto.imageFileId }
          : {}),
        updatedById: actor.id,
        updatedAt: new Date(),
      },
    );
    const updated = await findOneOrThrow(this.siteContentBlockRepo, {
      where: { key },
    });
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'CONTENT',
      action: 'ویرایش بلوک محتوای سایت',
      detail: `${actor.fullName} بلوک «${key}» را ویرایش کرد.`,
      entityType: 'SiteContentBlock',
      entityId: key,
    });
    return this.toBlockRow(updated);
  }

  async listDestinations() {
    const rows = await this.siteDestinationHighlightRepo.find({
      where: { deletedAt: IsNull() },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
    return rows.map((r) => ({
      id: r.id,
      airportCode: r.airportCode,
      priceIrr: r.priceIrr.toString(),
      imageFileId: r.imageFileId,
      imageUrl: r.imageFileId ? this.mediaUrl(r.imageFileId) : null,
      sortOrder: r.sortOrder,
    }));
  }

  async createDestination(actor: AuthenticatedUser, dto: CreateDestinationDto) {
    if (dto.imageFileId) {
      await this.assertImageFile(actor.id, dto.imageFileId);
    }
    const row = await this.siteDestinationHighlightRepo.save(
      this.siteDestinationHighlightRepo.create({
        airportCode: dto.airportCode.toUpperCase(),
        priceIrr: BigInt(dto.priceIrr),
        imageFileId: dto.imageFileId ?? null,
        sortOrder: dto.sortOrder ?? 0,
        updatedAt: new Date(),
      }),
    );
    return {
      id: row.id,
      airportCode: row.airportCode,
      priceIrr: row.priceIrr.toString(),
      imageFileId: row.imageFileId,
      sortOrder: row.sortOrder,
    };
  }

  async updateDestination(
    actor: AuthenticatedUser,
    id: string,
    dto: UpdateDestinationDto,
  ) {
    const existing = await this.siteDestinationHighlightRepo.findOneBy({
      id,
      deletedAt: IsNull(),
    });
    if (!existing) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'مقصد یافت نشد.',
      });
    }
    if (dto.imageFileId) {
      await this.assertImageFile(actor.id, dto.imageFileId);
    }
    await this.siteDestinationHighlightRepo.update(
      { id },
      {
        ...(dto.airportCode !== undefined
          ? { airportCode: dto.airportCode.toUpperCase() }
          : {}),
        ...(dto.priceIrr !== undefined
          ? { priceIrr: BigInt(dto.priceIrr) }
          : {}),
        ...(dto.imageFileId !== undefined
          ? { imageFileId: dto.imageFileId }
          : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        updatedAt: new Date(),
      },
    );
    const updated = await findOneOrThrow(this.siteDestinationHighlightRepo, {
      where: { id },
    });
    return {
      id: updated.id,
      airportCode: updated.airportCode,
      priceIrr: updated.priceIrr.toString(),
      imageFileId: updated.imageFileId,
      sortOrder: updated.sortOrder,
    };
  }

  async deleteDestination(actor: AuthenticatedUser, id: string) {
    const existing = await this.siteDestinationHighlightRepo.findOneBy({
      id,
      deletedAt: IsNull(),
    });
    if (!existing) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'مقصد یافت نشد.',
      });
    }
    await this.siteDestinationHighlightRepo.update(
      { id },
      { deletedAt: new Date(), updatedAt: new Date() },
    );
    return { id };
  }

  async listRoutes() {
    const rows = await this.siteRouteHighlightRepo.find({
      where: { deletedAt: IsNull() },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
    return rows.map((r) => ({
      id: r.id,
      fromAirportCode: r.fromAirportCode,
      toAirportCode: r.toAirportCode,
      priceIrr: r.priceIrr.toString(),
      sortOrder: r.sortOrder,
    }));
  }

  async createRoute(actor: AuthenticatedUser, dto: CreateRouteDto) {
    const row = await this.siteRouteHighlightRepo.save(
      this.siteRouteHighlightRepo.create({
        fromAirportCode: dto.fromAirportCode.toUpperCase(),
        toAirportCode: dto.toAirportCode.toUpperCase(),
        priceIrr: BigInt(dto.priceIrr),
        sortOrder: dto.sortOrder ?? 0,
        updatedAt: new Date(),
      }),
    );
    return {
      id: row.id,
      fromAirportCode: row.fromAirportCode,
      toAirportCode: row.toAirportCode,
      priceIrr: row.priceIrr.toString(),
      sortOrder: row.sortOrder,
    };
  }

  async updateRoute(actor: AuthenticatedUser, id: string, dto: UpdateRouteDto) {
    const existing = await this.siteRouteHighlightRepo.findOneBy({
      id,
      deletedAt: IsNull(),
    });
    if (!existing) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'مسیر یافت نشد.',
      });
    }
    await this.siteRouteHighlightRepo.update(
      { id },
      {
        ...(dto.fromAirportCode !== undefined
          ? { fromAirportCode: dto.fromAirportCode.toUpperCase() }
          : {}),
        ...(dto.toAirportCode !== undefined
          ? { toAirportCode: dto.toAirportCode.toUpperCase() }
          : {}),
        ...(dto.priceIrr !== undefined
          ? { priceIrr: BigInt(dto.priceIrr) }
          : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        updatedAt: new Date(),
      },
    );
    const updated = await findOneOrThrow(this.siteRouteHighlightRepo, {
      where: { id },
    });
    return {
      id: updated.id,
      fromAirportCode: updated.fromAirportCode,
      toAirportCode: updated.toAirportCode,
      priceIrr: updated.priceIrr.toString(),
      sortOrder: updated.sortOrder,
    };
  }

  async deleteRoute(actor: AuthenticatedUser, id: string) {
    const existing = await this.siteRouteHighlightRepo.findOneBy({
      id,
      deletedAt: IsNull(),
    });
    if (!existing) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'مسیر یافت نشد.',
      });
    }
    await this.siteRouteHighlightRepo.update(
      { id },
      { deletedAt: new Date(), updatedAt: new Date() },
    );
    return { id };
  }

  async getPublicHome(locale: 'fa' | 'en' | 'ar' = 'fa') {
    const [blocks, destinations, routes, airports, destinationStats] =
      await Promise.all([
        this.listBlocks(),
        this.listDestinations(),
        this.listRoutes(),
        this.airportRepo.find(),
        this.getDestinationStats(),
      ]);
    const airportMap = new Map(airports.map((a) => [a.code, a.cityFa]));

    const localizedBlocks = blocks.map((block) => {
      if (locale === 'fa') return block;
      const tr = BLOCK_LOCALE_DEFAULTS[locale][block.key];
      return {
        ...block,
        title: tr.title,
        subtitle: tr.subtitle,
        buttonText: tr.buttonText,
        badgeText: tr.badgeText,
      };
    });

    return {
      blocks: localizedBlocks,
      destinations: destinations.map((d) => ({
        airportCode: d.airportCode,
        cityFa: airportMap.get(d.airportCode) ?? d.airportCode,
        priceIrr: d.priceIrr,
        imageUrl: d.imageUrl,
      })),
      routes: routes.map((r) => ({
        fromAirportCode: r.fromAirportCode,
        toAirportCode: r.toAirportCode,
        fromCityFa: airportMap.get(r.fromAirportCode) ?? r.fromAirportCode,
        toCityFa: airportMap.get(r.toAirportCode) ?? r.toAirportCode,
        priceIrr: r.priceIrr,
      })),
      destinationStats,
    };
  }

  async readPublicMedia(fileId: string) {
    const file = await this.storedFileRepo.findOneBy({ id: fileId });
    if (!file || !fs.existsSync(file.path)) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'تصویر یافت نشد.',
      });
    }
    const [inLibrary, inBlock, inDest, inBlog] = await Promise.all([
      this.siteMediaAssetRepo.count({
        where: { storedFileId: fileId, deletedAt: IsNull() },
      }),
      this.siteContentBlockRepo.count({ where: { imageFileId: fileId } }),
      this.siteDestinationHighlightRepo.count({
        where: { imageFileId: fileId, deletedAt: IsNull() },
      }),
      this.blogPostRepo.count({
        where: {
          coverFileId: fileId,
          deletedAt: IsNull(),
          status: BlogPostStatus.PUBLISHED,
        },
      }),
    ]);
    if (inLibrary + inBlock + inDest + inBlog === 0) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'تصویر یافت نشد.',
      });
    }
    return {
      mimeType: file.mimeType,
      fileName: file.fileName,
      stream: fs.createReadStream(file.path),
    };
  }
}
