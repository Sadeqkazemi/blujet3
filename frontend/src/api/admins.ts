import { apiGet, apiPatch, apiPost } from './http';
import type {
  AdminCreatableRole,
  AdminRow,
  SettingsResult,
  SystemEventRow,
} from '../types/admins';

export function fetchAdmins() {
  return apiGet<AdminRow[]>('/admins');
}

export function createAdmin(dto: {
  fullName: string;
  email: string;
  username: string;
  role: AdminCreatableRole;
  password: string;
  delivery: 'sms' | 'email';
  stepUpChallengeId: string;
  stepUpCode: string;
  permissions?: string[];
}) {
  return apiPost<{ id: string; username: string; tempPassword?: string }>('/admins', dto);
}

export function updateAdminPermissions(
  id: string,
  dto: {
    permissions: string[];
    stepUpChallengeId: string;
    stepUpCode: string;
  },
) {
  return apiPatch<{ id: string; permissions: string[] }>(
    `/admins/${id}/permissions`,
    dto,
  );
}

export function blockAdmin(id: string) {
  return apiPatch<{ id: string; isActive: boolean }>(`/admins/${id}/block`);
}

export function unblockAdmin(id: string) {
  return apiPatch<{ id: string; isActive: boolean }>(`/admins/${id}/unblock`);
}

export function resetAdminPassword(
  id: string,
  dto: { password?: string; delivery?: 'sms' | 'email' },
) {
  return apiPost<{ tempPassword: string }>(`/admins/${id}/reset-password`, dto);
}

export function changeOwnPassword(
  currentPassword: string,
  newPassword: string,
) {
  return apiPost<{ changed: boolean }>('/auth/change-password', {
    currentPassword,
    newPassword,
  });
}

export function fetchSystemEvents(
  query: {
    actor?: string;
    action?: string;
    resource?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  } = {},
) {
  const params = new URLSearchParams();
  if (query.actor) params.set('actor', query.actor);
  if (query.action) params.set('action', query.action);
  if (query.resource) params.set('resource', query.resource);
  if (query.dateFrom) params.set('dateFrom', query.dateFrom);
  if (query.dateTo) params.set('dateTo', query.dateTo);
  if (query.page != null) params.set('page', String(query.page));
  if (query.limit != null) params.set('limit', String(query.limit));
  const qs = params.toString();
  return apiGet<SystemEventRow[]>(`/audit/system-events${qs ? `?${qs}` : ''}`);
}

export function fetchSettings() {
  return apiGet<SettingsResult>('/settings');
}

export function updateSettings(patch: Record<string, unknown>) {
  return apiPatch<SettingsResult>('/settings', { patch });
}

export function updateRefundRules(rules: { id: string; penaltyPct: number }[]) {
  return apiPatch<SettingsResult>('/settings/refund-rules', { rules });
}
