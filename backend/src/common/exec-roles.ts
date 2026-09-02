import type { Role } from '../database/enums';

/** The 5 roles whose panels have a کارتابل tab (per the confirmed design). */
export const EXEC_ROLES = [
  'CEO',
  'BOARD_CHAIR',
  'SENIOR_MANAGER',
  'FINANCE_MANAGER',
  'COMMERCIAL_MANAGER',
] as const satisfies readonly Role[];

/** Any authenticated staff account (everything but customers/agencies). */
export const STAFF_ROLES = [
  'EMPLOYEE',
  'IT_MANAGER',
  'COMMERCIAL_MANAGER',
  'OPERATIONS_MANAGER',
  'FINANCE_MANAGER',
  'SENIOR_MANAGER',
  'CEO',
  'BOARD_CHAIR',
  'SITE_ADMIN',
] as const satisfies readonly Role[];

export const ROLE_LABELS_FA: Record<Role, string> = {
  USER: 'کاربر',
  AGENCY: 'آژانس',
  EMPLOYEE: 'کارمند',
  IT_MANAGER: 'مدیر IT',
  COMMERCIAL_MANAGER: 'مدیر بازرگانی',
  OPERATIONS_MANAGER: 'مدیر عملیات',
  FINANCE_MANAGER: 'مدیر مالی',
  SENIOR_MANAGER: 'مدیر ارشد',
  CEO: 'مدیر عامل',
  BOARD_CHAIR: 'رئیس هیئت مدیره',
  SITE_ADMIN: 'ادمین سایت',
};
