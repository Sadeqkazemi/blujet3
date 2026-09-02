import type { StoredLocale } from '../../../hooks/useLocale';
import type { TabKey } from './account-types';

export type AccountNavGroup = 'primary' | 'account';

export type AccountNavItem = {
  key: TabKey;
  group: AccountNavGroup;
  label: Record<StoredLocale, string>;
  /** Show in the account page sidebar */
  showInSidebar: boolean;
  /** Show in the compact account-page sidebar on mobile */
  showInMobileSidebar: boolean;
  /** Show in the public-site mobile hamburger drawer */
  showInMobileMenu: boolean;
};

/** Shared account-panel navigation — sidebar + mobile header menu. */
export const ACCOUNT_NAV_ITEMS: AccountNavItem[] = [
  {
    key: 'profile',
    group: 'primary',
    label: { fa: 'پروفایل من', en: 'My Profile', ar: 'ملفي الشخصي' },
    showInSidebar: true,
    showInMobileSidebar: true,
    showInMobileMenu: true,
  },
  {
    key: 'account-info',
    group: 'primary',
    label: { fa: 'اطلاعات حساب', en: 'Account Information', ar: 'معلومات الحساب' },
    showInSidebar: true,
    showInMobileSidebar: true,
    showInMobileMenu: true,
  },
  {
    key: 'trips',
    group: 'primary',
    label: { fa: 'سفرها و خریدها', en: 'Trips & Purchases', ar: 'الرحلات والمشتريات' },
    showInSidebar: true,
    showInMobileSidebar: true,
    showInMobileMenu: true,
  },
  {
    key: 'refunds',
    group: 'primary',
    label: { fa: 'استرداد بلیط', en: 'Refund Ticket', ar: 'استرداد التذكرة' },
    showInSidebar: true,
    showInMobileSidebar: true,
    showInMobileMenu: true,
  },
  {
    key: 'wallet',
    group: 'primary',
    label: { fa: 'کیف پول', en: 'Wallet', ar: 'المحفظة' },
    showInSidebar: true,
    showInMobileSidebar: true,
    showInMobileMenu: true,
  },
  {
    key: 'loans',
    group: 'primary',
    label: { fa: 'وام و اعتبارات', en: 'Loans & Credit', ar: 'القروض والائتمان' },
    showInSidebar: true,
    showInMobileSidebar: true,
    showInMobileMenu: true,
  },
  {
    key: 'club',
    group: 'primary',
    label: { fa: 'امتیاز و باشگاه مشتریان', en: 'Points & Loyalty Club', ar: 'النقاط ونادي الولاء' },
    showInSidebar: true,
    showInMobileSidebar: true,
    showInMobileMenu: false,
  },
  {
    key: 'price-locks',
    group: 'account',
    label: { fa: 'قفل قیمت', en: 'Price Lock', ar: 'قفل السعر' },
    showInSidebar: true,
    showInMobileSidebar: false,
    showInMobileMenu: true,
  },
  {
    key: 'passengers',
    group: 'account',
    label: { fa: 'مسافران', en: 'Passengers', ar: 'المسافرون' },
    showInSidebar: true,
    showInMobileSidebar: false,
    showInMobileMenu: true,
  },
  {
    key: 'tickets',
    group: 'account',
    label: { fa: 'پیام به پشتیبانی', en: 'Message Support', ar: 'رسالة للدعم' },
    showInSidebar: true,
    showInMobileSidebar: false,
    showInMobileMenu: true,
  },
  {
    key: 'identity',
    group: 'account',
    label: { fa: 'احراز هویت', en: 'Identity Verification', ar: 'التحقق من الهوية' },
    showInSidebar: true,
    showInMobileSidebar: false,
    showInMobileMenu: true,
  },
  {
    key: 'security',
    group: 'account',
    label: { fa: 'امنیت حساب', en: 'Account Security', ar: 'أمان الحساب' },
    showInSidebar: true,
    showInMobileSidebar: false,
    showInMobileMenu: true,
  },
  {
    key: 'banks',
    group: 'account',
    label: { fa: 'حساب‌های بانکی', en: 'Bank Accounts', ar: 'الحسابات البنكية' },
    showInSidebar: true,
    showInMobileSidebar: false,
    showInMobileMenu: true,
  },
  {
    key: 'referral',
    group: 'account',
    label: { fa: 'معرفی دوستان', en: 'Invite Friends', ar: 'دعوة الأصدقاء' },
    showInSidebar: true,
    showInMobileSidebar: false,
    showInMobileMenu: true,
  },
];

const TAB_KEYS = new Set<string>(ACCOUNT_NAV_ITEMS.map((i) => i.key));

export function isAccountTabKey(value: string | null | undefined): value is TabKey {
  return !!value && TAB_KEYS.has(value);
}

export function accountTabHref(tab: TabKey): string {
  return `/account?tab=${tab}`;
}

export function accountNavByGroup(group: AccountNavGroup): AccountNavItem[] {
  return ACCOUNT_NAV_ITEMS.filter((item) => item.group === group);
}

export function sidebarAccountNavItems(isMobile = false): AccountNavItem[] {
  return ACCOUNT_NAV_ITEMS.filter((item) =>
    isMobile ? item.showInMobileSidebar : item.showInSidebar,
  );
}

export function mobileAccountNavItems(): AccountNavItem[] {
  return ACCOUNT_NAV_ITEMS.filter((item) => item.showInMobileMenu);
}

export function mobileAccountNavLabel(item: AccountNavItem, locale: StoredLocale): string {
  if (item.key === 'profile') return MOBILE_PROFILE_ENTRY[locale];
  if (item.key === 'trips') return MOBILE_TRIPS_ENTRY[locale];
  return item.label[locale];
}

/** Design label for profile entry in mobile drawer (مدیریت پروفایل). */
export const MOBILE_PROFILE_ENTRY: Record<StoredLocale, string> = {
  fa: 'مدیریت پروفایل',
  en: 'Manage Profile',
  ar: 'إدارة الملف الشخصي',
};

export const MOBILE_TRIPS_ENTRY: Record<StoredLocale, string> = {
  fa: 'سفرها و خریدها',
  en: 'Trips & Purchases',
  ar: 'الرحلات والمشتريات',
};
