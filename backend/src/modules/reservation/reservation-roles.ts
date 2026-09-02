import type { Role } from '../../database/enums';

/** Reachable nav: CEO + BOARD_CHAIR (label هواپیما), SENIOR_MANAGER +
 * IT_MANAGER (سامانه رزرواسیون). See docs/DB_SCHEMA.md Phase 9. */
export const RESERVATION_ROLES = [
  'CEO',
  'BOARD_CHAIR',
  'COMMERCIAL_MANAGER',
  'SENIOR_MANAGER',
  'IT_MANAGER',
] as const satisfies readonly Role[];

/** PNR cancel / change-seat / manual issue / no-show. SENIOR_MANAGER may
 * lock seats and manage PNRs like CEO/Chair (product 2026-08-21). */
export const CAN_LOCK_ROLES = [
  'CEO',
  'BOARD_CHAIR',
  'SENIOR_MANAGER',
  'COMMERCIAL_MANAGER',
  'IT_MANAGER',
] as const satisfies readonly Role[];

/** Managerial seat lock/release/approve — IT Manager is view-only on the
 * seat map (may inspect sold-seat passengers, cannot lock). */
export const CAN_SEAT_LOCK_ROLES = [
  'CEO',
  'BOARD_CHAIR',
  'SENIOR_MANAGER',
  'COMMERCIAL_MANAGER',
] as const satisfies readonly Role[];
