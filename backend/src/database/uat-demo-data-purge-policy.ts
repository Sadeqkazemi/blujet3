export const UAT_PURGE_FLAG = '--execute-purge';
export const UAT_PURGE_CONFIRMATION = 'PURGE_BLUJET_UAT_DEMO_DATA';

/**
 * Reference/configuration data required for an empty but usable UAT system.
 * Every entity table not listed here is treated as operational data and purged.
 */
export const UAT_PRESERVED_TABLES = new Set([
  'aircraft_seat_maps',
  'careers_settings',
  'club_tier_rules',
  'external_service_configs',
  'panel_access_flags',
  'permissions',
  'refund_penalty_rules',
  'security_policy',
  'survey_settings',
  'system_settings',
]);

export function isUatAccessAccount(
  username: string | null,
  isSuperAdmin: boolean,
): boolean {
  if (isSuperAdmin) return true;
  const normalized = username?.trim().toLowerCase() ?? '';
  return normalized.startsWith('uat.') || normalized.startsWith('panel.');
}

export function operationalTables(entityTableNames: string[]): string[] {
  return [...new Set(entityTableNames)]
    .filter((table) => table !== 'users' && !UAT_PRESERVED_TABLES.has(table))
    .sort();
}
