import { apiDelete, apiGet, apiGetBlob, apiPost } from './http';
import type {
  FinanceFlightDetail,
  FinanceFlightRow,
  FinanceReportPeriod,
  FinanceReportResult,
  FinanceReportScope,
  FinanceSalesResult,
  FinancialIntegrationsResult,
  FinancialProvider,
} from '../types/finance-manager';

export interface FinanceReportFilters {
  scope: FinanceReportScope;
  period: FinanceReportPeriod;
  from?: string;
  to?: string;
  flightInstanceId?: string;
}

export interface FinanceSalesFilters {
  flightInstanceId?: string;
  bookedFrom?: string;
  bookedTo?: string;
  flightFrom?: string;
  flightTo?: string;
  bookingStatus?: string;
  paymentStatus?: string;
  originCode?: string;
  destCode?: string;
  cabin?: string;
  channel?: string;
  agencyId?: string;
  limit?: number;
}

function salesQuery(filters: FinanceSalesFilters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value));
  });
  return params;
}

export function fetchFinanceSales(filters: FinanceSalesFilters) {
  return apiGet<FinanceSalesResult>(`/reporting/finance-sales?${salesQuery(filters)}`);
}

export function downloadFinanceSales(filters: FinanceSalesFilters, format: 'csv' | 'excel' | 'pdf') {
  const params = salesQuery(filters);
  params.set('format', format);
  return apiGetBlob(`/reporting/finance-sales/export?${params}`);
}

function reportQuery(filters: FinanceReportFilters) {
  const params = new URLSearchParams({ scope: filters.scope, period: filters.period });
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.flightInstanceId) params.set('flightInstanceId', filters.flightInstanceId);
  return params;
}

export function fetchFinanceReport(filters: FinanceReportFilters) {
  return apiGet<FinanceReportResult>(`/reporting/finance-reports?${reportQuery(filters)}`);
}

export function downloadFinanceReport(filters: FinanceReportFilters, format: 'csv' | 'excel' | 'pdf') {
  const params = reportQuery(filters);
  params.set('format', format);
  return apiGetBlob(`/reporting/finance-reports/export?${params}`);
}

export function searchFinanceFlights(query: { q?: string; from?: string; to?: string; limit?: number }) {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  if (query.limit) params.set('limit', String(query.limit));
  return apiGet<{ rows: FinanceFlightRow[] }>(`/reporting/finance-flight-search?${params}`);
}

export function fetchFinanceFlightDetail(id: string) {
  return apiGet<FinanceFlightDetail>(`/reporting/finance-flight-search/${encodeURIComponent(id)}`);
}

export function fetchFinancialIntegrations() {
  return apiGet<FinancialIntegrationsResult>('/financial-integrations');
}

export function connectFinancialIntegration(provider: FinancialProvider, apiKey: string) {
  return apiPost<FinancialIntegrationsResult>(`/financial-integrations/${provider}/connect`, { apiKey });
}

export function syncFinancialIntegration(provider: FinancialProvider) {
  return apiPost<FinancialIntegrationsResult>(`/financial-integrations/${provider}/sync`);
}

export function disconnectFinancialIntegration(provider: FinancialProvider) {
  return apiDelete<FinancialIntegrationsResult>(`/financial-integrations/${provider}`);
}
