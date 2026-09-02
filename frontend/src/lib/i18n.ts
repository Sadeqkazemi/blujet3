import { useCallback } from 'react';
import { useLocale, type StoredLocale } from '../hooks/useLocale';

export const DIR: Record<StoredLocale, 'rtl' | 'ltr'> = { fa: 'rtl', en: 'ltr', ar: 'rtl' };
export const FONT: Record<StoredLocale, string> = {
  fa: "'Vazirmatn Variable', Vazirmatn, sans-serif",
  en: "Inter, 'Vazirmatn Variable', Vazirmatn, sans-serif",
  ar: "'Vazirmatn Variable', Vazirmatn, sans-serif",
};

/** Public-site shared shell (header/footer) strings — one entry per key,
 * all three locales hand-translated (never a runtime exact-match fallback
 * that silently leaves a string in Persian, unlike the design bundle's own
 * `arDeep` mechanism for some pages). Extend as more pages get translated. */
const DICT = {
  navFlights: { fa: 'پرواز', en: 'Flights', ar: 'الطيران' },
  navDestinations: { fa: 'مقاصد پروازی', en: 'Destinations', ar: 'الوجهات' },
  navLoyalty: { fa: 'باشگاه مشتریان', en: 'Loyalty Club', ar: 'نادي العملاء' },
  navTravelInfo: { fa: 'اطلاعات سفر', en: 'Travel Info', ar: 'معلومات السفر' },
  navSupport: { fa: 'پشتیبانی', en: 'Support', ar: 'الدعم' },
  navServices: { fa: 'خدمات', en: 'Services', ar: 'الخدمات' },
  svcSeatLabel: { fa: 'انتخاب صندلی', en: 'Seat selection', ar: 'اختيار المقعد' },
  svcBaggageLabel: { fa: 'اضافه بار', en: 'Extra baggage', ar: 'وزن إضافي' },
  svcRefundLabel: { fa: 'استرداد بلیط', en: 'Ticket refund', ar: 'استرداد التذكرة' },
  svcPetLabel: { fa: 'حمل حیوان خانگی', en: 'Pet travel', ar: 'سفر الحيوانات' },
  svcWheelchairLabel: { fa: 'درخواست ویلچر', en: 'Wheelchair request', ar: 'طلب كرسي متحرك' },
  menuTitle: { fa: 'منو', en: 'Menu', ar: 'القائمة' },
  btnLoginSignup: { fa: 'ورود / ثبت‌نام', en: 'Log in / Sign up', ar: 'تسجيل الدخول / إنشاء حساب' },
  btnLoginOnly: { fa: 'ورود', en: 'Log in', ar: 'تسجيل الدخول' },
  btnJoinClub: { fa: 'عضویت باشگاه', en: 'Join Club', ar: 'الانضمام إلى النادي' },
  loginDrawerTitle: { fa: 'ورود', en: 'Log in', ar: 'تسجيل الدخول' },
  loginWelcome: {
    fa: 'به باشگاه مشتریان blujet خوش آمدید، برنامه وفاداری پروازهای blujet.',
    en: 'Welcome to blujet Club, the loyalty programme for blujet flights.',
    ar: 'مرحبًا بك في نادي blujet، برنامج الولاء لرحلات blujet.',
  },
  discoverMoreLabel: { fa: 'بیشتر بدانید', en: 'Discover more', ar: 'اكتشف المزيد' },
  notifNewLabel: { fa: 'جدید', en: 'New', ar: 'جديد' },
  notificationsTitle: { fa: 'اعلان‌ها', en: 'Notifications', ar: 'الإشعارات' },
  notificationsEmpty: {
    fa: 'اعلان جدیدی ندارید.',
    en: 'No new notifications.',
    ar: 'لا توجد إشعارات جديدة.',
  },
  notificationsMarkAll: {
    fa: 'خواندن همه',
    en: 'Mark all read',
    ar: 'تعيين الكل كمقروء',
  },
  profileLabel: { fa: 'مشاهده پروفایل', en: 'View Profile', ar: 'عرض الملف الشخصي' },
  completeProfileLabel: {
    fa: 'تکمیل پروفایل خود را انجام دهید',
    en: 'Complete your profile',
    ar: 'أكمل ملفك الشخصي',
  },
  tripsLabel: { fa: 'سفرها و خریدها', en: 'Trips & Purchases', ar: 'الرحلات والمشتريات' },
  refundLabel: { fa: 'استرداد بلیط', en: 'Refund Ticket', ar: 'استرداد التذكرة' },
  pointsLabel: { fa: 'امتیاز باشگاه', en: 'Club Points', ar: 'نقاط النادي' },
  walletBalanceLabel: {
    fa: 'موجودی کل کیف پول',
    en: 'Total wallet balance',
    ar: 'إجمالي رصيد المحفظة',
  },
  walletCopiedLabel: {
    fa: 'موجودی کپی شد',
    en: 'Balance copied',
    ar: 'تم نسخ الرصيد',
  },
  defaultUserLabel: { fa: 'کاربر blujet', en: 'blujet user', ar: 'مستخدم blujet' },
  logoutLabel: { fa: 'خروج از حساب', en: 'Sign Out', ar: 'تسجيل الخروج' },
  tierSilver: { fa: 'نقره‌ای', en: 'Silver', ar: 'فضي' },
  tierGold: { fa: 'طلایی', en: 'Gold', ar: 'ذهبي' },
  tierPlatinum: { fa: 'پلاتین', en: 'Platinum', ar: 'بلاتيني' },

  footerTagline: {
    fa: 'رزرو آنلاین بلیط پروازهای داخلی و بین‌المللی با بهترین قیمت و خدمات باشگاه مشتریان.',
    en: 'Book domestic and international flights online at the best prices, with loyalty club benefits.',
    ar: 'احجز رحلاتك الداخلية والدولية عبر الإنترنت بأفضل الأسعار، مع مزايا نادي العملاء.',
  },
  footerColServices: { fa: 'خدمات', en: 'Services', ar: 'الخدمات' },
  footerColCompany: { fa: 'شرکت', en: 'Company', ar: 'الشركة' },
  footerColSupport: { fa: 'پشتیبانی', en: 'Support', ar: 'الدعم' },
  footerBookFlight: { fa: 'رزرو پرواز', en: 'Book a Flight', ar: 'حجز رحلة' },
  footerManageBooking: { fa: 'مدیریت رزرو', en: 'Manage Booking', ar: 'إدارة الحجز' },
  footerFlightStatus: { fa: 'وضعیت پرواز', en: 'Flight Status', ar: 'حالة الرحلة' },
  footerRefund: { fa: 'استرداد بلیط', en: 'Ticket Refund', ar: 'استرداد التذكرة' },
  footerAbout: { fa: 'درباره ما', en: 'About Us', ar: 'من نحن' },
  footerContact: { fa: 'تماس با ما', en: 'Contact Us', ar: 'اتصل بنا' },
  footerTerms: { fa: 'قوانین و مقررات', en: 'Terms & Conditions', ar: 'الشروط والأحكام' },
  footerCareers: { fa: 'فرصت‌های شغلی', en: 'Careers', ar: 'الوظائف' },
  footerBlog: { fa: 'بلاگ', en: 'Blog', ar: 'المدونة' },
  footerHelpCenter: { fa: 'مرکز راهنما', en: 'Help Center', ar: 'مركز المساعدة' },
  footerFaq: { fa: 'سوالات متداول', en: 'FAQ', ar: 'الأسئلة الشائعة' },
  footerPhone: { fa: '۰۲۱ — ۹۱۰۰۰۰۰۰', en: '021 — 91000000', ar: '٠٢١ — ٩١٠٠٠٠٠٠' },
  footerCopyright: {
    fa: '© ۱۴۰۵ blujet. تمامی حقوق محفوظ است.',
    en: '© 2026 blujet. All rights reserved.',
    ar: '© ٢٠٢٦ blujet. جميع الحقوق محفوظة.',
  },
  badgeTrust: { fa: 'نماد اعتماد الکترونیکی', en: 'e-Trust Seal', ar: 'رمز الثقة الإلكترونية' },
  badgeGuild: { fa: 'انجمن صنفی دفاتر خدمات مسافرتی', en: 'Travel Agencies Guild', ar: 'اتحاد وكالات السفر' },
  badgeSamandehi: { fa: 'ساماندهی', en: 'Samandehi Registered', ar: 'مسجل رسميًا' },
  badgeIata: { fa: 'عضو IATA', en: 'IATA Member', ar: 'عضو IATA' },
} satisfies Record<string, Record<StoredLocale, string>>;

export type TranslationKey = keyof typeof DICT;

export function useT(): (key: TranslationKey) => string {
  const { locale } = useLocale();
  return useCallback((key: TranslationKey) => DICT[key][locale], [locale]);
}
