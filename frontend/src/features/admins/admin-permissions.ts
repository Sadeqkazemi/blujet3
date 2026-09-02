import type { AdminCreatableRole } from '../../types/admins';

export type PermKey =
  | 'dashboard'
  | 'priorities'
  | 'flights'
  | 'agencies'
  | 'approvals'
  | 'reports'
  | 'finance'
  | 'cartable'
  | 'admins'
  ;

export type PermState = Record<PermKey, boolean>;

export const PERM_DEFS: { key: PermKey; label: string; desc: string }[] = [
  { key: 'dashboard', label: 'داشبورد', desc: 'مشاهده نمای کلی فروش و آمار سازمان' },
  { key: 'priorities', label: 'اولویت‌های راهبردی', desc: 'تعریف و ابلاغ اولویت‌های سازمانی' },
  {
    key: 'agencies',
    label: 'مدیریت آژانس‌ها',
    desc: 'مشاهده و ویرایش پروفایل آژانس‌ها',
  },
  {
    key: 'approvals',
    label: 'تأیید درخواست‌ها',
    desc: 'تأیید یا لغو درخواست عضویت آژانس‌ها',
  },
  {
    key: 'flights',
    label: 'مدیریت پروازها',
    desc: 'افزودن، ویرایش و نرخ‌گذاری پروازها',
  },
  { key: 'reports', label: 'گزارش مسافران', desc: 'جستجوی مسافر و گزارش فروش' },
  { key: 'finance', label: 'مالی و تسویه', desc: 'تراکنش‌ها و تسویه‌حساب' },
  { key: 'cartable', label: 'کارتابل', desc: 'بررسی و پاسخ به کارهای ارجاع‌شده' },
  {
    key: 'admins',
    label: 'مدیران و ادمین‌ها',
    desc: 'افزودن و تعیین سطح دسترسی مدیران',
  },
];

/** Default permission toggles per creatable role — design-reference-v2 rolePresets(). */
const ROLE_PRESET_BITS: Record<AdminCreatableRole, Record<PermKey, 0 | 1>> = {
  SENIOR_MANAGER: {
    dashboard: 1,
    priorities: 1,
    flights: 1,
    agencies: 1,
    approvals: 1,
    reports: 1,
    finance: 1,
    cartable: 1,
    admins: 1,
  },
  FINANCE_MANAGER: {
    dashboard: 1,
    priorities: 0,
    flights: 0,
    agencies: 0,
    approvals: 0,
    reports: 1,
    finance: 1,
    cartable: 1,
    admins: 0,
  },
  COMMERCIAL_MANAGER: {
    dashboard: 1,
    priorities: 1,
    flights: 1,
    agencies: 1,
    approvals: 1,
    reports: 1,
    finance: 1,
    cartable: 1,
    admins: 0,
  },
  IT_MANAGER: {
    dashboard: 1,
    priorities: 0,
    flights: 0,
    agencies: 0,
    approvals: 0,
    reports: 0,
    finance: 0,
    cartable: 0,
    admins: 1,
  },
  SITE_ADMIN: {
    dashboard: 1,
    priorities: 0,
    flights: 0,
    agencies: 1,
    approvals: 1,
    reports: 1,
    finance: 0,
    cartable: 1,
    admins: 0,
  },
};

const HIDDEN_ROLE_PERMISSIONS: Record<AdminCreatableRole, string[]> = {
  SENIOR_MANAGER: ['refunds', 'club', 'content', 'support', 'settings'],
  FINANCE_MANAGER: ['refunds'],
  COMMERCIAL_MANAGER: ['club'],
  IT_MANAGER: ['support', 'settings'],
  SITE_ADMIN: ['refunds', 'club', 'content', 'support'],
};

export function rolePermissionPreset(role: AdminCreatableRole): PermState {
  const bits = ROLE_PRESET_BITS[role];
  return PERM_DEFS.reduce((acc, { key }) => {
    acc[key] = bits[key] === 1;
    return acc;
  }, {} as PermState);
}

export function enabledPermissionKeys(
  perms: PermState,
  role?: AdminCreatableRole,
): string[] {
  const visible = PERM_DEFS.filter(({ key }) => perms[key]).map(({ key }) => key);
  return role ? [...visible, ...HIDDEN_ROLE_PERMISSIONS[role]] : visible;
}

export function permissionStateFromKeys(
  keys: readonly string[],
  _fallbackRole: AdminCreatableRole,
): PermState {
  const selected = new Set(keys);
  return PERM_DEFS.reduce((state, { key }) => {
    state[key] = selected.has(key);
    return state;
  }, {} as PermState);
}

export function deriveUsernameFromEmail(email: string): string {
  const local = email.split('@')[0]?.trim().toLowerCase() ?? '';
  const sanitized = local
    .replace(/[^a-z0-9._-]/g, '.')
    .replace(/\.+/g, '.')
    .replace(/^\.+|\.+$/g, '');
  if (sanitized.length >= 3) return sanitized;
  return `admin.${Date.now().toString(36).slice(-6)}`;
}
