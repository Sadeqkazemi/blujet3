/**
 * The unit-scoped access catalog shown by IT → Users & access.
 *
 * The legacy umbrella keys (for example `fl_manage` and `sv_control`) stay
 * in the catalog so existing employees and guards continue to work. New
 * entries are intentionally action-level: IT can grant only the part of a
 * panel an employee needs. Employee-facing handlers use the same keys via
 * `@RequiresPermission`; legacy section umbrellas remain accepted by the
 * guard, while a new action grant never widens into an umbrella grant.
 */
export interface PermissionCatalogEntry {
  dept: string;
  sectionKey: string;
  sectionLabelFa: string;
  key: string;
  labelFa: string;
}

export const PERMISSION_CATALOG: PermissionCatalogEntry[] = [
  // commercial
  {
    dept: 'commercial',
    sectionKey: 'agencies',
    sectionLabelFa: 'مدیریت آژانس‌ها',
    key: 'ag_list',
    labelFa: 'مشاهدهٔ فهرست آژانس‌ها',
  },
  {
    dept: 'commercial',
    sectionKey: 'agencies',
    sectionLabelFa: 'مدیریت آژانس‌ها',
    key: 'ag_partners',
    labelFa: 'مشاهده آژانس‌های همکار',
  },
  {
    dept: 'commercial',
    sectionKey: 'agencies',
    sectionLabelFa: 'مدیریت آژانس‌ها',
    key: 'ag_requests',
    labelFa: 'بررسی درخواست عضویت جدید آژانس',
  },
  {
    dept: 'commercial',
    sectionKey: 'agencies',
    sectionLabelFa: 'مدیریت آژانس‌ها',
    key: 'ag_info',
    labelFa: 'دسترسی به اطلاعات کامل آژانس',
  },
  {
    dept: 'commercial',
    sectionKey: 'agencies',
    sectionLabelFa: 'مدیریت آژانس‌ها',
    key: 'ag_debtors',
    labelFa: 'مشاهده آژانس‌های دارای بدهی',
  },
  {
    dept: 'commercial',
    sectionKey: 'routes',
    sectionLabelFa: 'مسیرهای پروازی',
    key: 'rt_view',
    labelFa: 'مشاهده مسیرهای پروازی',
  },
  {
    dept: 'commercial',
    sectionKey: 'routes',
    sectionLabelFa: 'مسیرهای پروازی',
    key: 'rt_create',
    labelFa: 'افزودن مسیر پروازی',
  },
  {
    dept: 'commercial',
    sectionKey: 'routes',
    sectionLabelFa: 'مسیرهای پروازی',
    key: 'rt_manage',
    labelFa: 'مدیریت مسیرهای فعال',
  },
  {
    dept: 'commercial',
    sectionKey: 'aircraft',
    sectionLabelFa: 'تعریف هواپیما',
    key: 'ac_view',
    labelFa: 'مشاهده هواپیماها و نقشه کابین',
  },
  {
    dept: 'commercial',
    sectionKey: 'aircraft',
    sectionLabelFa: 'تعریف هواپیما',
    key: 'ac_manage',
    labelFa: 'ایجاد و ویرایش هواپیما',
  },
  {
    dept: 'commercial',
    sectionKey: 'flights',
    sectionLabelFa: 'مدیریت پروازها',
    key: 'fl_view',
    labelFa: 'مشاهدهٔ پروازها',
  },
  {
    dept: 'commercial',
    sectionKey: 'flights',
    sectionLabelFa: 'مدیریت پروازها',
    key: 'fl_manage',
    labelFa: 'ویرایش و مدیریت پرواز',
  },
  ...[
    ['fl_active', 'مشاهده پروازهای فعال'],
    ['fl_add', 'افزودن پرواز'],
    ['fl_assign', 'تعیین و برنامه‌ریزی پرواز'],
    ['fl_completed', 'مشاهده پروازهای انجام‌شده'],
    ['fl_cities', 'مدیریت شهرهای پروازی'],
    ['fl_costs', 'مشاهده هزینه‌های سفر'],
    ['fl_history', 'مشاهده تاریخچه پرواز'],
    ['fl_sales_view', 'مشاهده اطلاعات و فروش پرواز'],
    ['fl_site_sales', 'مدیریت نمایش، ظرفیت و قیمت فروش سایت'],
    ['fl_agency_sales', 'مدیریت نمایش، ظرفیت و قیمت فروش آژانسی'],
    ['fl_agency_allotments', 'تخصیص و آزادسازی صندلی آژانس‌ها'],
  ].map(([key, labelFa]) => ({
    dept: 'commercial',
    sectionKey: 'flights',
    sectionLabelFa: 'مدیریت پروازها',
    key,
    labelFa,
  })),
  {
    dept: 'commercial',
    sectionKey: 'operations',
    sectionLabelFa: 'عملیات',
    key: 'op_view',
    labelFa: 'مشاهده عملیات پروازی',
  },
  {
    dept: 'commercial',
    sectionKey: 'operations',
    sectionLabelFa: 'عملیات',
    key: 'op_manage',
    labelFa: 'مدیریت و اجرای عملیات',
  },
  {
    dept: 'commercial',
    sectionKey: 'services',
    sectionLabelFa: 'خدمات',
    key: 'sv_view',
    labelFa: 'مشاهده خدمات',
  },
  {
    dept: 'commercial',
    sectionKey: 'services',
    sectionLabelFa: 'خدمات',
    key: 'sv_manage',
    labelFa: 'مدیریت خدمات',
  },
  {
    dept: 'commercial',
    sectionKey: 'pricing',
    sectionLabelFa: 'نرخ‌گذاری',
    key: 'pr_propose',
    labelFa: 'ثبت نرخ پیشنهادی',
  },
  {
    dept: 'commercial',
    sectionKey: 'reports',
    sectionLabelFa: 'گزارش‌ها',
    key: 'rp_sales',
    labelFa: 'گزارش فروش',
  },
  {
    dept: 'commercial',
    sectionKey: 'reports',
    sectionLabelFa: 'گزارش‌ها',
    key: 'rp_passengers',
    labelFa: 'گزارش مسافران',
  },
  {
    dept: 'commercial',
    sectionKey: 'club',
    sectionLabelFa: 'قوانین باشگاه مشتریان',
    key: 'cl_rules_view',
    labelFa: 'مشاهده قوانین باشگاه مشتریان',
  },
  {
    dept: 'commercial',
    sectionKey: 'club',
    sectionLabelFa: 'قوانین باشگاه مشتریان',
    key: 'cl_rules_manage',
    labelFa: 'مدیریت قوانین باشگاه مشتریان',
  },
  {
    dept: 'commercial',
    sectionKey: 'webservice',
    sectionLabelFa: 'وب‌سرویس',
    key: 'ws_view',
    labelFa: 'مشاهده وب‌سرویس‌ها',
  },
  {
    dept: 'commercial',
    sectionKey: 'webservice',
    sectionLabelFa: 'وب‌سرویس',
    key: 'ws_manage',
    labelFa: 'مدیریت وب‌سرویس‌ها',
  },
  {
    dept: 'commercial',
    sectionKey: 'cartable',
    sectionLabelFa: 'کارتابل',
    key: 'ct_list',
    labelFa: 'مشاهده کارتابل',
  },
  {
    dept: 'commercial',
    sectionKey: 'cartable',
    sectionLabelFa: 'کارتابل',
    key: 'ct_process',
    labelFa: 'انجام کارها و ارسال پیام به مدیر',
  },
  // finance
  {
    dept: 'finance',
    sectionKey: 'finance',
    sectionLabelFa: 'امور مالی',
    key: 'fn_dashboard',
    labelFa: 'مشاهده داشبورد مالی',
  },
  {
    dept: 'finance',
    sectionKey: 'finance',
    sectionLabelFa: 'امور مالی',
    key: 'fn_transactions',
    labelFa: 'مشاهده تراکنش‌های اخیر',
  },
  {
    dept: 'finance',
    sectionKey: 'finance',
    sectionLabelFa: 'امور مالی',
    key: 'fn_settlements',
    labelFa: 'مشاهده و پیگیری تسویه آژانس‌ها',
  },
  {
    dept: 'finance',
    sectionKey: 'refund',
    sectionLabelFa: 'استرداد بلیط',
    key: 'rf_list',
    labelFa: 'مشاهدهٔ درخواست‌های استرداد',
  },
  {
    dept: 'finance',
    sectionKey: 'refund',
    sectionLabelFa: 'استرداد بلیط',
    key: 'rf_details',
    labelFa: 'مشاهدهٔ جزییات کامل مسافر',
  },
  {
    dept: 'finance',
    sectionKey: 'refund',
    sectionLabelFa: 'استرداد بلیط',
    key: 'rf_process',
    labelFa: 'پردازش و ارجاع استرداد',
  },
  {
    dept: 'finance',
    sectionKey: 'agencies',
    sectionLabelFa: 'آژانس‌ها',
    key: 'ag_settle',
    labelFa: 'تسویه حساب آژانس‌ها',
  },
  {
    dept: 'finance',
    sectionKey: 'agencies',
    sectionLabelFa: 'آژانس‌ها',
    key: 'ag_info',
    labelFa: 'دسترسی به اطلاعات آژانس',
  },
  {
    dept: 'finance',
    sectionKey: 'agencies',
    sectionLabelFa: 'آژانس‌ها',
    key: 'ag_list',
    labelFa: 'مشاهده فهرست آژانس‌ها',
  },
  {
    dept: 'finance',
    sectionKey: 'credit',
    sectionLabelFa: 'اعتبار و تسویه',
    key: 'cr_view',
    labelFa: 'مشاهده اعتبار و تسویه آژانس‌ها',
  },
  {
    dept: 'finance',
    sectionKey: 'credit',
    sectionLabelFa: 'اعتبار و تسویه',
    key: 'cr_manage',
    labelFa: 'مدیریت اعتبار و تسویه آژانس‌ها',
  },
  {
    dept: 'finance',
    sectionKey: 'finance',
    sectionLabelFa: 'امور مالی',
    key: 'fn_invoices',
    labelFa: 'مشاهده و مدیریت فاکتورها',
  },
  {
    dept: 'finance',
    sectionKey: 'reports',
    sectionLabelFa: 'گزارش‌ها',
    key: 'rp_finance',
    labelFa: 'گزارش مالی',
  },
  {
    dept: 'finance',
    sectionKey: 'reports',
    sectionLabelFa: 'گزارش‌ها و خروجی',
    key: 'rp_exports',
    labelFa: 'گزارش‌ها و خروجی‌ها',
  },
  {
    dept: 'finance',
    sectionKey: 'cartable',
    sectionLabelFa: 'کارتابل',
    key: 'ct_list',
    labelFa: 'مشاهده کارتابل',
  },
  {
    dept: 'finance',
    sectionKey: 'cartable',
    sectionLabelFa: 'کارتابل',
    key: 'ct_process',
    labelFa: 'انجام کارها و ارسال پیام به مدیر',
  },
  // it
  {
    dept: 'it',
    sectionKey: 'users',
    sectionLabelFa: 'مدیریت کاربران',
    key: 'us_manage',
    labelFa: 'ایجاد و مدیریت کاربران',
  },
  ...[
    ['us_list', 'مشاهده فهرست کاربران'],
    ['us_create', 'افزودن کاربر'],
    ['us_permissions', 'مدیریت دسترسی کاربران'],
    ['us_status', 'فعال‌سازی و تعلیق کاربر'],
    ['us_reset_password', 'بازنشانی رمز عبور'],
  ].map(([key, labelFa]) => ({
    dept: 'it',
    sectionKey: 'users',
    sectionLabelFa: 'مدیریت کاربران',
    key,
    labelFa,
  })),
  {
    dept: 'it',
    sectionKey: 'services',
    sectionLabelFa: 'سرویس‌های سایت',
    key: 'sv_control',
    labelFa: 'کنترل و راه‌اندازی سرویس‌ها',
  },
  {
    dept: 'it',
    sectionKey: 'services',
    sectionLabelFa: 'سرویس‌های سایت',
    key: 'sv_view',
    labelFa: 'مشاهده وضعیت سرویس‌ها',
  },
  {
    dept: 'it',
    sectionKey: 'services',
    sectionLabelFa: 'سرویس‌های سایت',
    key: 'sv_config',
    labelFa: 'پیکربندی سرویس‌ها',
  },
  {
    dept: 'it',
    sectionKey: 'security',
    sectionLabelFa: 'امنیت',
    key: 'sc_manage',
    labelFa: 'مدیریت امنیت و رمزها',
  },
  {
    dept: 'it',
    sectionKey: 'security',
    sectionLabelFa: 'امنیت',
    key: 'sc_view',
    labelFa: 'مشاهده سیاست و نشست‌های امنیتی',
  },
  {
    dept: 'it',
    sectionKey: 'security',
    sectionLabelFa: 'امنیت',
    key: 'sc_sessions',
    labelFa: 'مدیریت نشست‌ها و خروج همه کاربران',
  },
  {
    dept: 'it',
    sectionKey: 'logs',
    sectionLabelFa: 'لاگ و رویدادها',
    key: 'lg_view',
    labelFa: 'مشاهدهٔ لاگ و رویدادها',
  },
  {
    dept: 'it',
    sectionKey: 'logs',
    sectionLabelFa: 'لاگ و رویدادها',
    key: 'lg_export',
    labelFa: 'خروجی گرفتن از لاگ‌ها',
  },
];

/** Departments that pick a real permission catalog; anything else is a
 * custom department created ad hoc by IT and starts with zero perm rows. */
export const CATALOG_DEPTS = ['commercial', 'finance', 'it'] as const;

export function catalogDeptFor(dept: string): string {
  // The design's "واحد فروش" (sales) card is explicitly a sub-unit of
  // Commercial Manager — reuse the commercial catalog for it.
  if (dept === 'sales') return 'commercial';
  return dept;
}

export const INTERNAL_SERVICE_SEED = [
  { key: 'search', nameFa: 'موتور جستجوی پرواز', uptimePct: 99.99 },
  { key: 'payment', nameFa: 'درگاه پرداخت بانکی', uptimePct: 99.95 },
  { key: 'api', nameFa: 'وب‌سرویس API آژانس‌ها', uptimePct: 99.9 },
  { key: 'sms', nameFa: 'سامانه پیامک (SMS)', uptimePct: 99.8 },
  { key: 'email', nameFa: 'سرویس ایمیل', uptimePct: 99.99 },
  { key: 'club', nameFa: 'باشگاه مشتریان', uptimePct: 100 },
  { key: 'charter', nameFa: 'فروش چارتر', uptimePct: 99.7 },
  { key: 'refund', nameFa: 'استرداد آنلاین', uptimePct: 98.2 },
  { key: 'checkin', nameFa: 'چک‌این آنلاین', uptimePct: 99.6 },
  { key: 'cdn', nameFa: 'CDN و تصاویر', uptimePct: 100 },
  { key: 'dest', nameFa: 'نقشه و مقاصد', uptimePct: 99.99 },
  { key: 'mobile', nameFa: 'اپلیکیشن موبایل (API)', uptimePct: 99.85 },
];

export const EXTERNAL_SERVICE_SEED = [
  {
    key: 'ext_zarinpal',
    nameFa: 'درگاه پرداخت زرین‌پال',
    provider: 'زرین‌پال',
    endpoint: 'https://api.zarinpal.com/pg/v4/payment/request.json',
  },
  {
    key: 'ext_amadeus',
    nameFa: 'موتور رزرواسیون آمادئوس',
    provider: 'Amadeus GDS',
    endpoint: 'https://api.amadeus.com/v2/shopping/flight-offers',
  },
  {
    key: 'ext_kavenegar',
    nameFa: 'سرویس پیامک کاوه‌نگار',
    provider: 'Kavenegar',
    endpoint: 'https://api.kavenegar.com/v1/sms/send.json',
  },
  {
    key: 'ext_neshan',
    nameFa: 'نقشه و مسیریابی نشان',
    provider: 'Neshan Maps',
    endpoint: 'https://api.neshan.org/v4/direction',
  },
];
