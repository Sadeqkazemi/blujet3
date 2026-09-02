export type SiteContentFieldKey =
  | 'homeHeroTitle'
  | 'homeHeroSubtitle'
  | 'aboutUsText'
  | 'contactAddress'
  | 'contactOfficeHours'
  | 'termsText';

export type PublicSiteContent = Record<SiteContentFieldKey, string>;

export type SiteRuleId =
  | 'purchase'
  | 'refund'
  | 'change'
  | 'baggage'
  | 'club'
  | 'privacy'
  | 'pets';

export type SiteRuleCategory = {
  id: SiteRuleId;
  title: string;
  text: string;
};

export type SiteRules = { categories: SiteRuleCategory[] };

export type SitePageRow = {
  id: string;
  nameFa: string;
  path: string;
  statusLabel: string;
  editableFields: SiteContentFieldKey[];
  editHint?: string;
};

export const SITE_PAGE_ROWS: SitePageRow[] = [
  {
    id: 'home',
    nameFa: 'صفحه اصلی',
    path: '/',
    statusLabel: 'منتشرشده',
    editableFields: ['homeHeroTitle', 'homeHeroSubtitle'],
    editHint: 'عنوان/زیرعنوان fallback — بنر اصلی در بخش بالا',
  },
  {
    id: 'about',
    nameFa: 'درباره ما',
    path: '/about',
    statusLabel: 'منتشرشده',
    editableFields: ['aboutUsText'],
  },
  {
    id: 'contact',
    nameFa: 'تماس با ما',
    path: '/contact',
    statusLabel: 'منتشرشده',
    editableFields: ['contactAddress', 'contactOfficeHours'],
    editHint: 'تلفن و ایمیل در بخش تماس پشتیبانی مدیریت می‌شوند',
  },
  {
    id: 'terms',
    nameFa: 'قوانین و مقررات',
    path: '/travel-info',
    statusLabel: 'منتشرشده',
    editableFields: ['termsText'],
  },
  {
    id: 'support',
    nameFa: 'مرکز پشتیبانی',
    path: '/support',
    statusLabel: 'منتشرشده',
    editableFields: [],
  },
  {
    id: 'destinations',
    nameFa: 'مقاصد پروازی',
    path: '/destinations',
    statusLabel: 'منتشرشده',
    editableFields: [],
    editHint: 'مقاصد محبوب در بخش بالا',
  },
];

export const SITE_CONTENT_FIELD_LABELS: Record<SiteContentFieldKey, string> = {
  homeHeroTitle: 'عنوان صفحهٔ اصلی',
  homeHeroSubtitle: 'زیرعنوان صفحهٔ اصلی',
  aboutUsText: 'متن دربارهٔ ما',
  contactAddress: 'آدرس تماس با ما',
  contactOfficeHours: 'ساعات کاری دفتر',
  termsText: 'متن مقدمهٔ قوانین',
};
