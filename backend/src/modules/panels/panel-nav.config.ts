import { Role } from '../../database/enums';

export interface PanelNavItem {
  key: string;
  labelFa: string;
  /** Only "dashboard" is a working page in Phase 1 — everything else renders
   * a "به‌زودی" placeholder on the frontend until its phase lands. */
  implemented: boolean;
}

/**
 * SITE_ADMIN sidebar must never surface these system-only keys.
 * Kept as an explicit denylist so a future accidental re-add to PANEL_NAV
 * cannot ship them again without also deleting this set.
 */
export const SITE_ADMIN_SIDEBAR_DENYLIST = new Set(['kyc', 'settings']);

/**
 * Server-computed per-role sidebar, confirmed from a full read of each
 * panel's design file. Deliberately excludes tabs the extraction found to
 * be coded-but-unreachable (dead `sc-if` blocks with no nav trigger) —
 * see docs/DB_SCHEMA.md's design-extraction notes and PLAN.md.
 */
export const PANEL_NAV: Partial<Record<Role, PanelNavItem[]>> = {
  // Confirmed from پنل ادمین سایت.dc.html's roleDefs.siteAdmin.access.
  // `media` is in that same design list but still has no backend — left
  // out rather than shipped as a dead tab; see Phase 18 notes.
  // `media` added in Phase E (site content CMS backend).
  // Order/labels match design-reference-v2/پنل ادمین سایت.dc.html
  // roleDefs.siteAdmin.access (visible sidebar). KYC and system settings
  // stay system-only.
  SITE_ADMIN: [
    { key: 'dashboard', labelFa: 'داشبورد', implemented: true },
    { key: 'agencies', labelFa: 'آژانس‌ها', implemented: true },
    { key: 'flightops', labelFa: 'پرواز', implemented: true },
    { key: 'reports', labelFa: 'گزارش مسافران', implemented: true },
    { key: 'customers', labelFa: 'مشتریان', implemented: true },
    { key: 'club', labelFa: 'باشگاه مشتریان', implemented: true },
    { key: 'loans', labelFa: 'درخواست وام', implemented: true },
    { key: 'refund', labelFa: 'استرداد بلیط', implemented: true },
    { key: 'cartable', labelFa: 'کارتابل', implemented: true },
    { key: 'tickets', labelFa: 'تیکت‌ها', implemented: true },
    { key: 'notices', labelFa: 'اصلاحیه و اطلاعیه', implemented: true },
    { key: 'media', labelFa: 'مدیریت سایت', implemented: true },
    { key: 'jobapps', labelFa: 'درخواست‌های استخدام', implemented: true },
    { key: 'rules', labelFa: 'قوانین سایت', implemented: true },
  ],
  // Order matches design-reference-v2/پنل مدیر عامل.dc.html sidebar
  // (settings is display:none there). clubrules stays on COMMERCIAL_MANAGER;
  // flightops stays on SITE_ADMIN. `reservation` (label هواپیما) is in
  // roleDefs.ceo.access and the approved CEO screenshots — same key/label
  // as BOARD_CHAIR.
  CEO: [
    { key: 'dashboard', labelFa: 'داشبورد', implemented: true },
    { key: 'admins', labelFa: 'مدیران', implemented: true },
    { key: 'finance', labelFa: 'مالی', implemented: true },
    { key: 'cartable', labelFa: 'کارتابل', implemented: true },
    { key: 'club', labelFa: 'مشتریان VIP', implemented: true },
    { key: 'survey', labelFa: 'نظرسنجی مسافران', implemented: true },
    { key: 'mgrreports', labelFa: 'گزارش مدیران', implemented: true },
    { key: 'reservation', labelFa: 'هواپیما', implemented: true },
    { key: 'pricing', labelFa: 'تعیین قیمت بلیط', implemented: true },
    { key: 'panels', labelFa: 'دسترسی به پنل‌ها', implemented: true },
    { key: 'security', labelFa: 'امنیت و رمز عبور', implemented: true },
    { key: 'logs', labelFa: 'لاگ و رویدادها', implemented: true },
  ],
  BOARD_CHAIR: [
    { key: 'dashboard', labelFa: 'داشبورد', implemented: true },
    { key: 'admins', labelFa: 'مدیران', implemented: true },
    { key: 'finance', labelFa: 'مالی', implemented: true },
    { key: 'cartable', labelFa: 'کارتابل', implemented: true },
    { key: 'club', labelFa: 'مشتریان VIP', implemented: true },
    { key: 'reservation', labelFa: 'هواپیما', implemented: true },
    { key: 'mgrreports', labelFa: 'گزارش مدیران', implemented: true },
    { key: 'survey', labelFa: 'نظرسنجی مسافران', implemented: true },
    { key: 'security', labelFa: 'امنیت و رمز عبور', implemented: true },
  ],
  // Senior Manager sidebar — HTML design order + product Phase 3/4/9 tabs
  // (+ reservation seat lock per product request 2026-08-21).
  SENIOR_MANAGER: [
    { key: 'dashboard', labelFa: 'داشبورد', implemented: true },
    { key: 'agencies', labelFa: 'آژانس‌ها', implemented: true },
    { key: 'flights', labelFa: 'مدیریت پروازها', implemented: true },
    { key: 'admins', labelFa: 'مدیران و ادمین‌ها', implemented: true },
    { key: 'reports', labelFa: 'گزارش مسافران', implemented: true },
    { key: 'finance', labelFa: 'مالی', implemented: true },
    { key: 'cartable', labelFa: 'کارتابل', implemented: true },
    { key: 'referrals', labelFa: 'ارجاعات', implemented: true },
    { key: 'mgrreports', labelFa: 'گزارش مدیران', implemented: true },
    { key: 'vip', labelFa: 'مشتریان VIP', implemented: true },
    { key: 'survey', labelFa: 'نظرسنجی مسافران', implemented: true },
    { key: 'panels', labelFa: 'دسترسی به پنل‌ها', implemented: true },
    { key: 'security', labelFa: 'امنیت و رمز عبور', implemented: true },
    { key: 'reservation', labelFa: 'سامانه رزرواسیون', implemented: true },
  ],
  FINANCE_MANAGER: [
    { key: 'dashboard', labelFa: 'داشبورد', implemented: true },
    { key: 'agencies', labelFa: 'آژانس‌ها', implemented: true },
    { key: 'reports', labelFa: 'گزارش مسافران', implemented: true },
    { key: 'staff', labelFa: 'گزارش کارمندان', implemented: true },
    { key: 'finance', labelFa: 'مالی', implemented: true },
    { key: 'exports', labelFa: 'گزارشات و خروجی', implemented: true },
    { key: 'refund', labelFa: 'استرداد بلیط', implemented: true },
    { key: 'cancellations', labelFa: 'کنسلی پرواز', implemented: true },
    { key: 'cartable', labelFa: 'کارتابل', implemented: true },
    {
      key: 'integrations',
      labelFa: 'اتصال نرم‌افزارهای مالی',
      implemented: true,
    },
  ],
  COMMERCIAL_MANAGER: [
    { key: 'dashboard', labelFa: 'داشبورد', implemented: true },
    { key: 'agencies', labelFa: 'آژانس‌ها', implemented: true },
    { key: 'routes', labelFa: 'مسیرهای پروازی', implemented: true },
    { key: 'aircraft', labelFa: 'تعریف هواپیما', implemented: true },
    { key: 'flights', labelFa: 'مدیریت پروازها', implemented: true },
    { key: 'cancellations', labelFa: 'کنسلی پرواز', implemented: true },
    { key: 'ancillary-services', labelFa: 'خدمات', implemented: true },
    { key: 'reports', labelFa: 'گزارش مسافران', implemented: true },
    { key: 'staff', labelFa: 'گزارش کارمندان', implemented: true },
    { key: 'clubrules', labelFa: 'قوانین باشگاه مشتریان', implemented: true },
    { key: 'webservice', labelFa: 'وب سرویس', implemented: true },
    { key: 'finance', labelFa: 'مالی', implemented: true },
    { key: 'cartable', labelFa: 'کارتابل', implemented: true },
  ],
  OPERATIONS_MANAGER: [
    { key: 'dashboard', labelFa: 'داشبورد', implemented: true },
    { key: 'cartable', labelFa: 'کارتابل', implemented: true },
    { key: 'flights', labelFa: 'مدیریت پرواز', implemented: true },
  ],
  IT_MANAGER: [
    // Phase 8: real service-health/os-metrics dashboard, not the shared
    // sales/KPI one the other 5 roles get (IT_MANAGER stays excluded from
    // REPORTING_ROLES). All eleven IT entries below have matching routes;
    // employee-level delegation is limited to the catalogued operations.
    { key: 'dashboard', labelFa: 'داشبورد فنی', implemented: true },
    { key: 'cartable', labelFa: 'کارتابل', implemented: true },
    { key: 'users', labelFa: 'کاربران و دسترسی‌ها', implemented: true },
    { key: 'security', labelFa: 'رمزها و امنیت', implemented: true },
    { key: 'services', labelFa: 'سرویس‌های سایت', implemented: true },
    { key: 'webservices', labelFa: 'وب‌سرویس‌ها و API', implemented: true },
    { key: 'reservation', labelFa: 'سامانه رزرواسیون', implemented: true },
    { key: 'panels', labelFa: 'دسترسی به پنل‌ها', implemented: true },
    { key: 'logs', labelFa: 'لاگ و رویدادها', implemented: true },
    { key: 'survey', labelFa: 'نظرسنجی مسافران', implemented: true },
    { key: 'backup', labelFa: 'پشتیبان‌گیری', implemented: true },
    { key: 'settings', labelFa: 'تنظیمات سامانه', implemented: true },
  ],
};

/** Which panel keys each role may toggle via PATCH /panels/access/:panelKey. */
export const PANEL_ACCESS_TOGGLE_RIGHTS: Partial<Record<Role, string[]>> = {
  CEO: ['FINANCE', 'COMMERCIAL', 'OPERATIONS', 'IT'],
  SENIOR_MANAGER: [
    'CEO',
    'SITE_ADMIN',
    'FINANCE',
    'COMMERCIAL',
    'OPERATIONS',
    'IT',
  ],
};

/**
 * EMPLOYEE's sidebar is computed per-user (see پنل کارمند.dc.html's
 * `navKeys = ["dashboard"].concat(granted).concat(["referrals"])`), not a
 * static PANEL_NAV row. This maps each PERMISSION_CATALOG sectionKey to
 * the nav tab it unlocks and the exact catalog key(s) actually wired to
 * real backend access this phase. An employee only sees a tab if they hold
 * one of its wired keys. Read-only flight, route, and aircraft grants unlock
 * their corresponding views; mutations still require the matching write
 * action. IT capabilities are also real, narrowly scoped employee surfaces
 * (see the controller comments), not access to the complete IT Manager role.
 *
 * fn_invoices' real UI surface remains the per-agency invoice list on
 * AgencyDetailPage. Company-wide finance data is separately delegated by
 * fn_dashboard/fn_transactions/fn_settlements, each enforced on its API.
 */
export const EMPLOYEE_SECTION_NAV: Record<
  string,
  { labelFa: string; wiredKeys: string[]; depts?: string[] }
> = {
  // Order follows the owning manager panels. A grant changes both this live
  // navigation response and the matching @RequiresPermission API guard.
  agencies: {
    labelFa: 'مدیریت آژانس‌ها',
    wiredKeys: [
      'ag_list',
      'ag_partners',
      'ag_requests',
      'ag_info',
      'ag_debtors',
      'ag_settle',
      'cr_view',
      'cr_manage',
      'fn_invoices',
    ],
  },
  flights: {
    labelFa: 'مدیریت پروازها',
    wiredKeys: [
      'fl_view',
      'fl_manage',
      'fl_active',
      'fl_add',
      'fl_assign',
      'fl_completed',
      'fl_cities',
      'fl_costs',
      'fl_history',
      'fl_sales_view',
      'fl_site_sales',
      'fl_agency_sales',
      'fl_agency_allotments',
    ],
  },
  routes: {
    labelFa: 'مسیرهای پروازی',
    wiredKeys: ['fl_manage', 'rt_view', 'rt_create', 'rt_manage'],
  },
  aircraft: {
    labelFa: 'تعریف هواپیما',
    wiredKeys: ['fl_manage', 'ac_view', 'ac_manage'],
  },
  pricing: { labelFa: 'نرخ‌گذاری', wiredKeys: ['pr_propose'] },
  refund: {
    labelFa: 'استرداد بلیط',
    wiredKeys: ['rf_list', 'rf_details', 'rf_process'],
  },
  finance: {
    labelFa: 'مالی',
    wiredKeys: ['fn_dashboard', 'fn_transactions', 'fn_settlements'],
    depts: ['finance'],
  },
  reports: {
    labelFa: 'گزارش‌ها',
    wiredKeys: ['rp_sales', 'rp_passengers', 'rp_finance', 'rp_exports'],
  },
  cartable: {
    labelFa: 'کارتابل',
    wiredKeys: ['ct_list', 'ct_process'],
  },
  users: {
    labelFa: 'کاربران و دسترسی‌ها',
    wiredKeys: [
      'us_manage',
      'us_list',
      'us_create',
      'us_permissions',
      'us_status',
      'us_reset_password',
    ],
  },
  security: {
    labelFa: 'رمزها و امنیت',
    wiredKeys: ['sc_manage', 'sc_view', 'sc_sessions'],
  },
  'ancillary-services': {
    labelFa: 'خدمات',
    wiredKeys: ['sv_view', 'sv_manage'],
    depts: ['commercial', 'sales'],
  },
  services: {
    labelFa: 'سرویس‌های سایت',
    wiredKeys: ['sv_view', 'sv_control', 'sv_config'],
    depts: ['it'],
  },
  club: {
    labelFa: 'قوانین باشگاه مشتریان',
    wiredKeys: ['cl_rules_view', 'cl_rules_manage'],
  },
  webservice: {
    labelFa: 'وب‌سرویس',
    wiredKeys: ['ws_view', 'ws_manage'],
  },
  logs: {
    labelFa: 'لاگ و رویدادها',
    wiredKeys: ['lg_view'],
  },
};

export const ALL_PANEL_KEYS = [
  'SITE_ADMIN',
  'CEO',
  'BOARD_CHAIR',
  'SENIOR_MANAGER',
  'FINANCE',
  'COMMERCIAL',
  'OPERATIONS',
  'IT',
];
