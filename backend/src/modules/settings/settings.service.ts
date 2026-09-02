import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { SystemSetting } from '../../database/entities/system-setting.entity';
import { RefundPenaltyRule } from '../../database/entities/refund-penalty-rule.entity';
import { AuditService } from '../audit/audit.service';
import { ErrorCode } from '../../common/errors';
import {
  DEFAULT_SOCIAL_LINKS,
  parseSocialLinks,
  publicSocialLinks,
} from '../../common/social-links.util';
import {
  DEFAULT_APP_DOWNLOAD_LINKS,
  parseAppDownloadLinks,
  publicAppDownloadLinks,
} from '../../common/app-download-links.util';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

const SITE_ADMIN_PATCH_KEYS = new Set([
  'socialLinks',
  'supportEmail',
  'supportPhone',
  'appDownloadLinks',
  'homeHeroTitle',
  'homeHeroSubtitle',
  'aboutUsText',
  'contactAddress',
  'contactOfficeHours',
  'termsText',
  ...(
    [
      'homeHeroTitle',
      'homeHeroSubtitle',
      'aboutUsText',
      'contactAddress',
      'contactOfficeHours',
      'termsText',
    ] as const
  ).flatMap((base) => [`${base}_en`, `${base}_ar`] as const),
]);

type LocaleContentBase =
  | 'homeHeroTitle'
  | 'homeHeroSubtitle'
  | 'aboutUsText'
  | 'contactAddress'
  | 'contactOfficeHours'
  | 'termsText';

export type PublicContentLocale = 'fa' | 'en' | 'ar';

export const SITE_RULE_IDS = [
  'purchase',
  'refund',
  'change',
  'baggage',
  'club',
  'privacy',
  'pets',
] as const;

export type SiteRuleCategory = {
  id: (typeof SITE_RULE_IDS)[number];
  title: string;
  text: string;
};

export type SiteRules = { categories: SiteRuleCategory[] };

export const DEFAULT_SITE_RULES: SiteRules = {
  categories: [
    {
      id: 'purchase',
      title: 'خرید و صدور بلیط',
      text: '۱. قیمت نمایش‌داده‌شده شامل مالیات و عوارض است و هزینهٔ پنهانی وجود ندارد.\n۲. پس از پرداخت موفق، بلیط الکترونیکی بلافاصله صادر و به ایمیل و شمارهٔ موبایل شما ارسال می‌شود.\n۳. مسئولیت صحت اطلاعات هویتی مسافران (نام، نام خانوادگی و کد ملی/گذرنامه) بر عهدهٔ خریدار است.',
    },
    {
      id: 'refund',
      title: 'استرداد و کنسلی',
      text: '۱. میزان جریمهٔ استرداد بر اساس نوع نرخ بلیط و سیاست ایرلاین تعیین می‌شود.\n۲. درخواست استرداد از بخش «مدیریت رزرو» قابل ثبت و مبلغ قابل بازگشت پیش از تأیید نمایش داده می‌شود.\n۳. بازگشت وجه حداکثر ظرف ۷۲ ساعت کاری به حساب پرداخت‌کننده انجام می‌شود.',
    },
    {
      id: 'change',
      title: 'تغییر تاریخ و مشخصات',
      text: '۱. تغییر تاریخ پرواز تا ۴ ساعت پیش از پرواز و بر اساس موجودی صندلی امکان‌پذیر است.\n۲. اصلاح مشخصات هویتی مسافر (نام، نام خانوادگی، کد ملی) تنها یک‌بار و پیش از صدور بلیط مجاز است.\n۳. تغییر تاریخ مشمول مابه‌التفاوت نرخ و کارمزد تغییر بر اساس سیاست ایرلاین است.',
    },
    {
      id: 'baggage',
      title: 'بار و چک‌این',
      text: '۱. بار مجاز همراه بر اساس کلاس پروازی و مسیر پرواز تعیین و در زمان رزرو نمایش داده می‌شود.\n۲. اضافه‌بار در فرودگاه بر اساس تعرفهٔ ایرلاین محاسبه و دریافت می‌شود.\n۳. حضور در کانتر چک‌این حداقل ۹۰ دقیقه پیش از پرواز داخلی و ۱۸۰ دقیقه پیش از پرواز خارجی الزامی است.',
    },
    {
      id: 'club',
      title: 'باشگاه مشتریان',
      text: '۱. عضویت در باشگاه مشتریان رایگان است و با هر خرید بلیط امتیاز محاسبه می‌شود.\n۲. سطح عضویت (نقره‌ای، طلایی، پلاتینیوم) بر اساس مجموع امتیاز سالانه تعیین می‌شود.\n۳. امتیازهای باشگاه قابل استفاده برای تخفیف در خرید بلیط‌های بعدی هستند و تاریخ انقضا دارند.',
    },
    {
      id: 'privacy',
      title: 'حریم خصوصی و امنیت',
      text: '۱. اطلاعات شخصی مسافران صرفاً برای صدور بلیط و ارائهٔ خدمات پروازی استفاده می‌شود.\n۲. اطلاعات پرداخت از طریق درگاه بانکی رمزنگاری‌شده پردازش و در سرورهای blujet ذخیره نمی‌شود.\n۳. اطلاعات کاربران بدون رضایت صریح در اختیار اشخاص ثالث قرار نمی‌گیرد، مگر بر اساس الزام قانونی.',
    },
    {
      id: 'pets',
      title: 'قوانین حمل حیوان خانگی',
      text: '۱. حیوانات خانگی کوچک (سگ و گربه) تا وزن ۸ کیلوگرم همراه با قفس مجاز، در کابین مسافر پذیرفته می‌شوند.\n۲. حیوانات با وزن بیشتر باید در محفظه بار هواپیما و در قفس استاندارد IATA حمل شوند.\n۳. ارائه‌ی کارت واکسیناسیون معتبر و گواهی سلامت دامپزشکی الزامی است.\n۴. هزینه‌ی حمل حیوان خانگی جداگانه محاسبه و در زمان رزرو دریافت می‌شود.\n۵. حمل حیوانات وحشی، خطرناک یا نژادهای ممنوعه طبق مقررات پروازی مجاز نیست.\n۶. ظرفیت حمل حیوان خانگی در هر پرواز محدود است و بر اساس اولویت رزرو تخصیص می‌یابد.',
    },
  ],
};

/** Every storable key with its server-side default. Unknown keys are
 * rejected — the settings table never becomes a free-form dumping ground. */
export const SETTING_DEFAULTS: Record<string, unknown> = {
  companyName: 'هواپیمایی blujet',
  supportEmail: 'support@blujet.example',
  supportPhone: '021-48000',
  gatewayMellat: true,
  gatewaySaman: true,
  gatewayZarin: false,
  maintenance: false,
  registration: true,
  charterSale: true,
  apiPublic: false,
  sandbox: true,
  brandColor: '#1668c4',
  // Site content (مدیریت محتوا) — plain text/HTML blocks the public-site
  // track reads at render time; editable here so content never needs a
  // deploy. Kept in the same generic SystemSetting KV store as the rest of
  // this tab rather than a dedicated table, matching Phase 12's design.
  homeHeroTitle: 'پرواز به هر کجا که دوست دارید',
  homeHeroSubtitle: 'بهترین قیمت بلیط هواپیما را با blujet پیدا کنید',
  aboutUsText: 'blujet یک پلتفرم آنلاین رزرو بلیط هواپیما است.',
  contactAddress: 'تهران، ایران',
  contactOfficeHours: 'شنبه تا پنج‌شنبه ۸:۰۰ تا ۲۰:۰۰ — جمعه‌ها تعطیل',
  termsText: 'قوانین و مقررات استفاده از خدمات blujet.',
  homeHeroTitle_en: 'Fly anywhere you want',
  homeHeroSubtitle_en: 'Find the best flight prices with blujet',
  aboutUsText_en: 'blujet is an online platform for booking airline tickets.',
  contactAddress_en: 'Tehran, Iran',
  contactOfficeHours_en: 'Sat–Thu 8:00–20:00 — closed on Fridays',
  termsText_en: 'Terms and conditions for using blujet services.',
  homeHeroTitle_ar: 'سافر إلى أي مكان تريده',
  homeHeroSubtitle_ar: 'اعثر على أفضل أسعار التذاكر مع blujet',
  aboutUsText_ar: 'blujet منصة إلكترونية لحجز تذاكر الطيران.',
  contactAddress_ar: 'طهران، إيران',
  contactOfficeHours_ar: 'السبت–الخميس ٨:٠٠–٢٠:٠٠ — مغلق يوم الجمعة',
  termsText_ar: 'الشروط والأحكام لاستخدام خدمات blujet.',
  siteRules: DEFAULT_SITE_RULES,
  // IT Manager / SITE_ADMIN settings tab — footer social links.
  socialLinks: DEFAULT_SOCIAL_LINKS,
  // SITE_ADMIN settings tab — app download buttons on the home page.
  appDownloadLinks: DEFAULT_APP_DOWNLOAD_LINKS,
};

/** IT_MANAGER's settings screen only ever shows these operational toggles
 * plus site-services links (design: پنل مدیر IT — «سرویس‌های سایت»).
 * Payment gateways and brand/company identity are Board Chair-only — the
 * controller shares the endpoint between both roles, so per-key scoping is
 * enforced here, server-side, not by hiding UI alone. */
const IT_MANAGER_WRITABLE_KEYS = new Set([
  'maintenance',
  'registration',
  'charterSale',
  'apiPublic',
  'sandbox',
  'socialLinks',
  'appDownloadLinks',
  'supportPhone',
]);

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(SystemSetting)
    private readonly settingRepo: Repository<SystemSetting>,
    @InjectRepository(RefundPenaltyRule)
    private readonly refundRuleRepo: Repository<RefundPenaltyRule>,
    private readonly audit: AuditService,
  ) {}

  async getAll() {
    const [stored, refundRules] = await Promise.all([
      this.settingRepo.find(),
      this.refundRuleRepo.find({
        order: { minHoursBeforeDeparture: 'DESC' },
      }),
    ]);
    const byKey = new Map(stored.map((s) => [s.key, s.value]));

    const settings: Record<string, unknown> = {};
    for (const [key, def] of Object.entries(SETTING_DEFAULTS)) {
      settings[key] = byKey.has(key) ? byKey.get(key) : def;
    }

    return {
      settings,
      refundRules: refundRules.map((r) => ({
        id: r.id,
        minHoursBeforeDeparture: r.minHoursBeforeDeparture,
        penaltyPct: r.penaltyPct,
        labelFa: r.labelFa,
      })),
    };
  }

  async update(actor: AuthenticatedUser, patch: Record<string, unknown>) {
    const keys = Object.keys(patch);
    if (actor.role === 'SITE_ADMIN') {
      const forbidden = keys.filter((k) => !SITE_ADMIN_PATCH_KEYS.has(k));
      if (forbidden.length > 0) {
        throw new ForbiddenException({
          code: ErrorCode.FORBIDDEN,
          message:
            'ادمین سایت فقط می‌تواند لینک‌های اجتماعی، تماس پشتیبانی، لینک اپلیکیشن و متن صفحات عمومی را ویرایش کند.',
        });
      }
    }
    const unknown = keys.filter((k) => !(k in SETTING_DEFAULTS));
    if (keys.length === 0 || unknown.length > 0) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message:
          unknown.length > 0
            ? `کلید نامعتبر: ${unknown.join(', ')}`
            : 'هیچ تنظیمی ارسال نشده است.',
      });
    }
    for (const key of keys) {
      if (key === 'socialLinks') {
        try {
          patch[key] = parseSocialLinks(patch[key]);
        } catch {
          throw new BadRequestException({
            code: ErrorCode.VALIDATION_FAILED,
            message: 'فرمت لینک‌های شبکه‌های اجتماعی نامعتبر است.',
          });
        }
        continue;
      }
      if (key === 'appDownloadLinks') {
        try {
          patch[key] = parseAppDownloadLinks(patch[key]);
        } catch {
          throw new BadRequestException({
            code: ErrorCode.VALIDATION_FAILED,
            message: 'فرمت لینک‌های دانلود اپلیکیشن نامعتبر است.',
          });
        }
        continue;
      }
      const expected = typeof SETTING_DEFAULTS[key];
      if (typeof patch[key] !== expected) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_FAILED,
          message: `مقدار «${key}» نامعتبر است.`,
        });
      }
    }
    if (actor.role === 'IT_MANAGER') {
      const outOfScope = keys.filter((k) => !IT_MANAGER_WRITABLE_KEYS.has(k));
      if (outOfScope.length > 0) {
        throw new ForbiddenException({
          code: ErrorCode.FORBIDDEN,
          message: `کلید (${outOfScope.join('، ')}) در اختیار مدیر IT نیست.`,
        });
      }
    }

    for (const key of keys) {
      const existing = await this.settingRepo
        .createQueryBuilder('s')
        .where('s.key = :key', { key })
        .getOne();
      const value = patch[key] as SystemSetting['value'];
      if (existing) {
        existing.value = value;
        existing.updatedById = actor.id;
        existing.updatedAt = new Date();
        await this.settingRepo.save(existing);
      } else {
        await this.settingRepo.save(
          this.settingRepo.create({
            key,
            value,
            updatedById: actor.id,
            updatedAt: new Date(),
          }),
        );
      }
    }

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'SYSTEM',
      action: 'تغییر تنظیمات سامانه',
      detail: `تنظیمات (${keys.join('، ')}) توسط ${actor.fullName} به‌روزرسانی شد.`,
      entityType: 'SystemSetting',
    });

    return this.getAll();
  }

  private parseSiteRules(value: unknown): SiteRules {
    if (!value || typeof value !== 'object' || !('categories' in value)) {
      return DEFAULT_SITE_RULES;
    }
    const categories = (value as { categories?: unknown }).categories;
    if (
      !Array.isArray(categories) ||
      categories.length !== SITE_RULE_IDS.length
    ) {
      return DEFAULT_SITE_RULES;
    }
    const byId = new Map<string, SiteRuleCategory>();
    for (const item of categories) {
      if (!item || typeof item !== 'object') return DEFAULT_SITE_RULES;
      const candidate = item as Record<string, unknown>;
      if (
        !SITE_RULE_IDS.includes(candidate.id as SiteRuleCategory['id']) ||
        typeof candidate.title !== 'string' ||
        typeof candidate.text !== 'string' ||
        !candidate.title.trim() ||
        !candidate.text.trim() ||
        byId.has(candidate.id as string)
      ) {
        return DEFAULT_SITE_RULES;
      }
      byId.set(candidate.id as string, {
        id: candidate.id as SiteRuleCategory['id'],
        title: candidate.title.trim(),
        text: candidate.text.trim(),
      });
    }
    if (byId.size !== SITE_RULE_IDS.length) return DEFAULT_SITE_RULES;
    return {
      categories: SITE_RULE_IDS.map((id) => byId.get(id)!),
    };
  }

  async getSiteRules(): Promise<SiteRules> {
    const stored = await this.settingRepo.findOne({
      where: { key: 'siteRules' },
    });
    return this.parseSiteRules(stored?.value ?? DEFAULT_SITE_RULES);
  }

  async updateSiteRules(
    actor: AuthenticatedUser,
    input: { categories: Array<{ id: string; title: string; text: string }> },
  ): Promise<SiteRules> {
    const submittedIds = input.categories.map((item) => item.id);
    if (
      input.categories.length !== SITE_RULE_IDS.length ||
      new Set(submittedIds).size !== SITE_RULE_IDS.length ||
      SITE_RULE_IDS.some((id) => !submittedIds.includes(id))
    ) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'هر هفت دستهٔ قوانین باید دقیقاً یک‌بار ارسال شوند.',
      });
    }
    const normalized: SiteRules = {
      categories: SITE_RULE_IDS.map((id) => {
        const item = input.categories.find((candidate) => candidate.id === id)!;
        return { id, title: item.title.trim(), text: item.text.trim() };
      }),
    };
    if (normalized.categories.some((item) => !item.title || !item.text)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'عنوان و متن هیچ دسته‌ای نمی‌تواند خالی باشد.',
      });
    }

    const existing = await this.settingRepo.findOne({
      where: { key: 'siteRules' },
    });
    const row = existing ?? this.settingRepo.create({ key: 'siteRules' });
    row.value = normalized;
    row.updatedById = actor.id;
    row.updatedAt = new Date();
    await this.settingRepo.save(row);
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'SYSTEM',
      action: 'تغییر قوانین سایت',
      detail: `هفت دستهٔ قوانین سایت توسط ${actor.fullName} به‌روزرسانی شد.`,
      entityType: 'SystemSetting',
      entityId: 'siteRules',
    });
    return normalized;
  }

  async getPublicSiteRules(locale: PublicContentLocale = 'fa') {
    if (locale !== 'fa') return { categories: [] as SiteRuleCategory[] };
    return this.getSiteRules();
  }

  /** ⚑ Writes the REAL Phase 7 refund engine rows — the settings screen and
   * the penalty engine can never disagree because they read the same table. */
  async updateRefundRules(
    actor: AuthenticatedUser,
    rules: { id: string; penaltyPct: number }[],
  ) {
    for (const rule of rules) {
      if (
        !Number.isInteger(rule.penaltyPct) ||
        rule.penaltyPct < 0 ||
        rule.penaltyPct > 100
      ) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_FAILED,
          message: 'درصد جریمه باید عددی بین ۰ تا ۱۰۰ باشد.',
        });
      }
    }

    const existing = await this.refundRuleRepo.find({
      where: { id: In(rules.map((r) => r.id)) },
    });
    if (existing.length !== rules.length) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'قاعدهٔ استرداد نامعتبر است.',
      });
    }

    for (const rule of rules) {
      await this.refundRuleRepo.update(
        { id: rule.id },
        { penaltyPct: rule.penaltyPct },
      );
    }

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'SYSTEM',
      action: 'تغییر قوانین استرداد',
      detail: `درصد جریمهٔ ${rules.length} بازهٔ استرداد توسط ${actor.fullName} به‌روزرسانی شد.`,
      entityType: 'RefundPenaltyRule',
    });

    return this.getAll();
  }

  /** Public footer — enabled social links only, no auth required. */
  async getPublicSocialLinks() {
    const all = await this.getAll();
    const links = parseSocialLinks(all.settings.socialLinks);
    return { links: publicSocialLinks(links) };
  }

  /** Public home page — configured app store links with non-empty URLs. */
  async getPublicAppLinks() {
    const all = await this.getAll();
    const links = parseAppDownloadLinks(all.settings.appDownloadLinks);
    return { links: publicAppDownloadLinks(links) };
  }

  /** Public site chrome — support phone and email shown on contact/home. */
  async getPublicSupportContact() {
    const all = await this.getAll();
    return {
      phone: String(all.settings.supportPhone ?? SETTING_DEFAULTS.supportPhone),
      email: String(all.settings.supportEmail ?? SETTING_DEFAULTS.supportEmail),
    };
  }

  /** Public static page copy edited from the SITE_ADMIN media tab. */
  async getPublicSiteContent(locale: PublicContentLocale = 'fa') {
    const all = await this.getAll();
    const pick = (base: LocaleContentBase) => {
      if (locale !== 'fa') {
        const localized = all.settings[`${base}_${locale}`];
        if (typeof localized === 'string' && localized.trim()) {
          return localized;
        }
      }
      const fallback = all.settings[base] ?? SETTING_DEFAULTS[base];
      return typeof fallback === 'string' ? fallback : String(fallback);
    };
    return {
      homeHeroTitle: pick('homeHeroTitle'),
      homeHeroSubtitle: pick('homeHeroSubtitle'),
      aboutUsText: pick('aboutUsText'),
      contactAddress: pick('contactAddress'),
      contactOfficeHours: pick('contactOfficeHours'),
      termsText: pick('termsText'),
    };
  }
}
