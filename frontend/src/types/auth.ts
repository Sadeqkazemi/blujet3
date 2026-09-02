/** Mirrors backend/prisma Role enum — keep in sync with docs/DB_SCHEMA.md. */
export type Role =
  | 'USER'
  | 'AGENCY'
  | 'EMPLOYEE'
  | 'IT_MANAGER'
  | 'COMMERCIAL_MANAGER'
  | 'OPERATIONS_MANAGER'
  | 'FINANCE_MANAGER'
  | 'SENIOR_MANAGER'
  | 'CEO'
  | 'BOARD_CHAIR'
  | 'SITE_ADMIN';

/** Mirrors backend/prisma Locale enum. */
export type Locale = 'FA' | 'EN' | 'AR';

export interface AuthUser {
  id: string;
  fullName: string;
  role: Role;
  preferredLocale: Locale;
  mustChangePassword: boolean;
  isSuperAdmin?: boolean;
  isSandboxImpersonation?: boolean;
}
