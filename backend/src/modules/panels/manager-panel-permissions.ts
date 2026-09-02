export const MANAGER_PANEL_PERMISSION_KEYS = [
  'dashboard',
  'priorities',
  'flights',
  'agencies',
  'approvals',
  'reports',
  'finance',
  'cartable',
  'refunds',
  'club',
  'content',
  'support',
  'admins',
  'settings',
] as const;

export type ManagerPanelPermissionKey =
  (typeof MANAGER_PANEL_PERMISSION_KEYS)[number];

const NAV_PERMISSION_BY_KEY: Readonly<
  Record<string, ManagerPanelPermissionKey>
> = {
  dashboard: 'dashboard',
  flights: 'flights',
  flightops: 'flights',
  aircraft: 'flights',
  routes: 'flights',
  pricing: 'flights',
  webservice: 'flights',
  reservation: 'flights',
  agencies: 'agencies',
  reports: 'reports',
  staff: 'reports',
  mgrreports: 'reports',
  survey: 'reports',
  finance: 'finance',
  exports: 'finance',
  integrations: 'finance',
  refund: 'refunds',
  club: 'club',
  clubrules: 'club',
  vip: 'club',
  media: 'content',
  notices: 'content',
  jobapps: 'content',
  tickets: 'support',
  admins: 'admins',
  users: 'admins',
  panels: 'admins',
  settings: 'settings',
  cartable: 'cartable',
  referrals: 'cartable',
};

export function permissionForNavKey(
  navKey: string,
): ManagerPanelPermissionKey | null {
  return NAV_PERMISSION_BY_KEY[navKey] ?? null;
}

export function permissionForRequestPath(
  rawPath: string,
): ManagerPanelPermissionKey | null {
  const path = rawPath.split('?')[0].replace(/^\/api(?=\/)/, '');
  if (/^\/cartable(?:\/|$)/.test(path)) return 'cartable';
  if (/^\/admins(?:\/|$)/.test(path)) return 'admins';
  if (/^\/agencies\/requests(?:\/|$)/.test(path)) return 'approvals';
  if (/^\/agencies(?:\/|$)/.test(path)) return 'agencies';
  if (
    /^\/(?:flightops|flights|pricing|reservation|webservice\/pricing)(?:\/|$)/.test(
      path,
    )
  ) {
    return 'flights';
  }
  if (
    /^\/(?:audit|passenger-reports|reporting|staff-reports|survey)(?:\/|$)/.test(
      path,
    )
  ) {
    return 'reports';
  }
  if (/^\/reconciliation(?:\/|$)/.test(path)) return 'finance';
  if (/^\/financial-integrations(?:\/|$)/.test(path)) return 'finance';
  if (/^\/refunds(?:\/|$)/.test(path)) return 'refunds';
  if (/^\/club(?:\/|$)/.test(path)) return 'club';
  if (
    /^\/(?:site-content\/admin|blog\/admin|careers|agency-bulletins)(?:\/|$)/.test(
      path,
    )
  ) {
    return 'content';
  }
  if (/^\/manager-messages(?:\/|$)/.test(path)) return 'cartable';
  if (/^\/support-tickets(?:\/|$)/.test(path)) return 'support';
  if (/^\/it\/(?:employees|permissions)(?:\/|$)/.test(path)) return 'admins';
  if (/^\/it\/(?:services|security|backups)(?:\/|$)/.test(path))
    return 'settings';
  if (/^\/settings(?:\/|$)/.test(path)) return 'settings';
  return null;
}
