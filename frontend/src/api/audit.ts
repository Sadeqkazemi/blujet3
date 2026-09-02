import { apiGet, apiGetPaged } from './http';
import type { ApiPagedResult } from './envelope';
import type { ManagerReportRow } from '../types/audit';

export type AuditListFilters = {
  actor?: string;
  action?: string;
  resource?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
  category?: string;
  actorRole?: string;
  q?: string;
};

function buildAuditQuery(filters: AuditListFilters): string {
  const params = new URLSearchParams();
  if (filters.actor) params.set('actor', filters.actor);
  if (filters.action) params.set('action', filters.action);
  if (filters.resource) params.set('resource', filters.resource);
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  if (filters.page != null) params.set('page', String(filters.page));
  if (filters.limit != null) params.set('limit', String(filters.limit));
  if (filters.category) params.set('category', filters.category);
  if (filters.actorRole) params.set('actorRole', filters.actorRole);
  if (filters.q) params.set('q', filters.q);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/** Backward-compatible: returns the rows array only. */
export function fetchManagerReports(filters: AuditListFilters = {}) {
  return apiGet<ManagerReportRow[]>(
    `/audit/manager-reports${buildAuditQuery(filters)}`,
  );
}

export function fetchManagerReportsPaged(filters: AuditListFilters = {}) {
  return apiGetPaged<ManagerReportRow[]>(
    `/audit/manager-reports${buildAuditQuery(filters)}`,
  );
}

export function fetchAuditLogs(filters: AuditListFilters = {}) {
  return apiGet<import('../types/it-manager').AuditLogRow[]>(
    `/audit/logs${buildAuditQuery(filters)}`,
  );
}

export function fetchAuditLogsPaged(filters: AuditListFilters = {}) {
  return apiGetPaged<import('../types/it-manager').AuditLogRow[]>(
    `/audit/logs${buildAuditQuery(filters)}`,
  );
}

export function fetchSystemEvents(filters: AuditListFilters = {}) {
  return apiGet<import('../types/admins').SystemEventRow[]>(
    `/audit/system-events${buildAuditQuery(filters)}`,
  );
}

export function fetchSystemEventsPaged(filters: AuditListFilters = {}) {
  return apiGetPaged<import('../types/admins').SystemEventRow[]>(
    `/audit/system-events${buildAuditQuery(filters)}`,
  );
}

export function fetchLogsBadgeCount() {
  return apiGet<{ count: number }>('/audit/logs/badge-count');
}

export type { ApiPagedResult };
