import type { PanelNavItem } from './panels';
import type { LowSalesAlert } from './reporting';

export interface PanelShellContext {
  nav: PanelNavItem[] | null;
  /** All low-sales alerts for roles that receive them; empty array otherwise. */
  lowSalesAlerts: LowSalesAlert[];
}

/** Roles that see the dashboard/finance low-sales banner + notification extras. */
export const LOW_SALES_ROLES = [
  'CEO',
  'BOARD_CHAIR',
  'SENIOR_MANAGER',
  'FINANCE_MANAGER',
  'COMMERCIAL_MANAGER',
] as const;

export function isLowSalesRole(role: string | undefined): boolean {
  return !!role && (LOW_SALES_ROLES as readonly string[]).includes(role);
}
