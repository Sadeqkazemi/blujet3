import type { StoredLocale } from '../../hooks/useLocale';

export type AgencyNavKey =
  | 'dashboard'
  | 'tickets'
  | 'seats'
  | 'webservice'
  | 'apidocs'
  | 'credit'
  | 'report'
  | 'notices'
  | 'inbox'
  | 'profile';

export type AgencyNavIconKey =
  | 'dash'
  | 'ticket'
  | 'seat'
  | 'webservice'
  | 'apidocs'
  | 'credit'
  | 'report'
  | 'notices'
  | 'inbox'
  | 'profile';

export type AgencyNavItem = {
  key: AgencyNavKey;
  path: string;
  icon: AgencyNavIconKey;
  label: Record<StoredLocale, string>;
  showBadge?: boolean;
};

export const AGENCY_NAV_ITEMS: AgencyNavItem[] = [
  {
    key: 'dashboard',
    path: '/agency',
    icon: 'dash',
    label: { fa: 'داشبورد', en: 'Dashboard', ar: 'لوحة التحكم' },
  },
  {
    key: 'tickets',
    path: '/agency/tickets',
    icon: 'ticket',
    label: { fa: 'خرید بلیط', en: 'Buy Ticket', ar: 'شراء تذكرة' },
  },
  {
    key: 'seats',
    path: '/agency/seats',
    icon: 'seat',
    label: { fa: 'صندلی‌های تخصیصی', en: 'Allocated Seats', ar: 'المقاعد المخصصة' },
  },
  {
    key: 'webservice',
    path: '/agency/webservice',
    icon: 'webservice',
    label: { fa: 'وب سرویس', en: 'Web Service', ar: 'خدمة الويب' },
  },
  {
    key: 'apidocs',
    path: '/agency/apidocs',
    icon: 'apidocs',
    label: { fa: 'مستندات وب‌سرویس', en: 'Web Service Docs', ar: 'توثيق خدمة الويب' },
  },
  {
    key: 'credit',
    path: '/agency/credit',
    icon: 'credit',
    label: { fa: 'کیف پول و اعتبار', en: 'Wallet & Credit', ar: 'المحفظة والائتمان' },
  },
  {
    key: 'report',
    path: '/agency/sales',
    icon: 'report',
    label: { fa: 'فروش و گزارش‌ها', en: 'Sales & Reports', ar: 'المبيعات والتقارير' },
  },
  {
    key: 'notices',
    path: '/agency/notices',
    icon: 'notices',
    label: { fa: 'اطلاعیه و اصلاحیه', en: 'Notices & Amendments', ar: 'الإشعارات والتعديلات' },
  },
  {
    key: 'inbox',
    path: '/agency/inbox',
    icon: 'inbox',
    label: { fa: 'صندوق پیام‌ها', en: 'Inbox & Messages', ar: 'صندوق الرسائل' },
    showBadge: true,
  },
  {
    key: 'profile',
    path: '/agency/profile',
    icon: 'profile',
    label: { fa: 'پروفایل و مدارک', en: 'Profile & Documents', ar: 'الملف والمستندات' },
  },
];

export const AGENCY_PAGE_META: Record<
  AgencyNavKey,
  { title: Record<StoredLocale, string>; subtitle: Record<StoredLocale, string> }
> = {
  dashboard: {
    title: { fa: 'داشبورد آژانس', en: 'Agency Dashboard', ar: 'لوحة تحكم الوكالة' },
    subtitle: {
      fa: 'نمای کلی فروش، اعتبار و صندلی‌های شما',
      en: 'Overview of your sales, credit, and seats',
      ar: 'نظرة عامة على مبيعاتك ورصيدك ومقاعدك',
    },
  },
  tickets: {
    title: { fa: 'خرید بلیط', en: 'Buy Ticket', ar: 'شراء تذكرة' },
    subtitle: {
      fa: 'جستجوی پروازهای منتشرشده در موتور رزرو blujet',
      en: 'Search published flights in the blujet booking engine',
      ar: 'ابحث عن الرحلات المنشورة في محرك حجز blujet',
    },
  },
  seats: {
    title: { fa: 'صندلی‌های تخصیصی', en: 'Allocated Seats', ar: 'المقاعد المخصصة' },
    subtitle: {
      fa: 'ظرفیت تخصیص‌یافته بر اساس تقاضا برای پروازهای مجاز',
      en: 'Capacity allocated by demand for licensed flights',
      ar: 'السعة المخصصة حسب الطلب للرحلات المرخصة',
    },
  },
  webservice: {
    title: { fa: 'وب سرویس', en: 'Web Service', ar: 'خدمة الويب' },
    subtitle: {
      fa: 'درخواست و دریافت وب‌سرویس اختصاصی آژانس شما',
      en: "Request and receive your agency's dedicated API",
      ar: 'طلب والحصول على واجهة API مخصصة لوكالتك',
    },
  },
  apidocs: {
    title: { fa: 'مستندات وب‌سرویس', en: 'Web Service Documentation', ar: 'توثيق خدمة الويب' },
    subtitle: {
      fa: 'راهنمای یکپارچه‌سازی با اینترفیس رزرو آژانس',
      en: 'Integration guide for the agency booking API',
      ar: 'دليل التكامل مع واجهة حجز الوكالة',
    },
  },
  credit: {
    title: { fa: 'کیف پول و اعتبار', en: 'Wallet & Credit', ar: 'المحفظة والائتمان' },
    subtitle: {
      fa: 'سقف اعتبار، فاکتورهای شرکت هواپیمایی و فعالیت حساب',
      en: 'Credit limit, airline invoices, and account activity',
      ar: 'سقف الائتمان وفواتير شركة الطيران ونشاط الحساب',
    },
  },
  report: {
    title: { fa: 'فروش و گزارش‌ها', en: 'Sales & Reports', ar: 'المبيعات والتقارير' },
    subtitle: {
      fa: 'عملکرد فروش و گزارش‌های آژانس',
      en: 'Agency sales performance and reports',
      ar: 'أداء مبيعات الوكالة والتقارير',
    },
  },
  notices: {
    title: { fa: 'اطلاعیه و اصلاحیه', en: 'Notices & Amendments', ar: 'الإشعارات والتعديلات' },
    subtitle: {
      fa: 'اطلاعیه‌های سایت، پروازهای جدید و پیام‌های مرتبط با آژانس شما',
      en: 'Site notices, new flights, and notifications relevant to your agency',
      ar: 'إشعارات الموقع والرحلات الجديدة والتنبيهات الخاصة بوكالتك',
    },
  },
  inbox: {
    title: { fa: 'صندوق پیام‌ها', en: 'Inbox & Messages', ar: 'صندوق الرسائل' },
    subtitle: {
      fa: 'پیام‌های مدیریت شرکت هواپیمایی',
      en: 'Messages from airline management',
      ar: 'رسائل إدارة شركة الطيران',
    },
  },
  profile: {
    title: { fa: 'پروفایل و مدارک', en: 'Profile & Documents', ar: 'الملف والمستندات' },
    subtitle: {
      fa: 'اطلاعات آژانس و مدارک ثبت‌شده',
      en: 'Agency information and registered documents',
      ar: 'معلومات الوكالة والمستندات المسجلة',
    },
  },
};

export function agencyNavKeyFromPath(pathname: string): AgencyNavKey {
  if (pathname === '/agency' || pathname === '/agency/') return 'dashboard';
  if (pathname.startsWith('/agency/tickets')) return 'tickets';
  if (pathname.startsWith('/agency/seats')) return 'seats';
  if (pathname.startsWith('/agency/webservice')) return 'webservice';
  if (pathname.startsWith('/agency/apidocs')) return 'apidocs';
  if (pathname.startsWith('/agency/credit')) return 'credit';
  if (pathname.startsWith('/agency/sales')) return 'report';
  if (pathname.startsWith('/agency/notices')) return 'notices';
  if (pathname.startsWith('/agency/inbox')) return 'inbox';
  if (pathname.startsWith('/agency/profile')) return 'profile';
  return 'dashboard';
}

export function agencyInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}
