export interface AdminRow {
  id: string;
  fullName: string;
  username: string | null;
  email: string | null;
  role: string;
  roleLabelFa: string;
  lastLoginAt: string | null;
  isActive: boolean;
  online: boolean;
  managedByCaller: boolean;
  permissions: string[] | null;
}

export type AdminCreatableRole =
  | 'SENIOR_MANAGER'
  | 'FINANCE_MANAGER'
  | 'COMMERCIAL_MANAGER'
  | 'IT_MANAGER'
  | 'SITE_ADMIN';

export interface SystemEventRow {
  id: string;
  at: string;
  user: string;
  actorRole: string;
  action: string;
  detail: string;
  level: 'WARN' | 'OK' | 'INFO';
}

export interface RefundRuleRow {
  id: string;
  minHoursBeforeDeparture: number;
  penaltyPct: number;
  labelFa: string;
}

export interface SettingsResult {
  settings: Record<string, unknown>;
  refundRules: RefundRuleRow[];
}
