import type { PanelNavItem } from '../types/panels';

const COMMERCIAL_NAV_ORDER = [
  'dashboard',
  'agencies',
  'routes',
  'aircraft',
  'flights',
  'cancellations',
  'services',
  'ancillary-services',
  'reports',
  'staff',
  'clubrules',
  'webservice',
  'finance',
  'cartable',
] as const;

/**
 * Normalize older/newer server contracts to the approved Commercial Manager
 * sidebar: one services entry while retaining the aircraft-definition page.
 * Both service routes remain implemented, but when the backend advertises its canonical
 * `ancillary-services` item we must not also inject the legacy `services`
 * compatibility item.
 */
export function commercialNavWithServices(items: PanelNavItem[]): PanelNavItem[] {
  const hasCanonicalServices = items.some((item) => item.key === 'ancillary-services');
  const hasLegacyServices = items.some((item) => item.key === 'services');
  const next = hasCanonicalServices
    ? items.filter((item) => item.key !== 'services')
    : hasLegacyServices
      ? items
      : [...items, { key: 'services', labelFa: 'خدمات', implemented: true }];
  const order = new Map<string, number>(COMMERCIAL_NAV_ORDER.map((key, index) => [key, index]));
  return [...next].sort(
    (a, b) => (order.get(a.key) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.key) ?? Number.MAX_SAFE_INTEGER),
  );
}
