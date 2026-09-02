import { apiGet } from './http';
import type {
  AgencySettlementsResult,
  CompletedFlightsSummary,
  EmployeeActivityResult,
  FinanceDashboardStats,
  FlightSalesResult,
  KpiResult,
  LowSalesAlert,
  PassengerReportHit,
  PeriodQuery,
  RecentTransactionsResult,
  RevenueMixResult,
  SalesChartPeriod,
  StaffReportsResult,
  CommercialOverview,
  SiteAdminOverview,
} from '../types/reporting';

function toQueryString(query: PeriodQuery): string {
  const params = new URLSearchParams();
  params.set('granularity', query.granularity);
  if (query.periodStart) params.set('periodStart', query.periodStart);
  if (query.date) params.set('date', query.date);
  if (query.flightNo) params.set('flightNo', query.flightNo);
  if (query.periodKey) params.set('periodKey', query.periodKey);
  return params.toString();
}

export function fetchSalesChart(query: PeriodQuery) {
  return apiGet<SalesChartPeriod[]>(`/reporting/sales-chart?${toQueryString(query)}`);
}

export function fetchFlightSales() {
  return apiGet<FlightSalesResult>('/reporting/flight-sales');
}

export function fetchKpis(query: PeriodQuery) {
  return apiGet<KpiResult>(`/reporting/kpis?${toQueryString(query)}`);
}

export function fetchCompletedFlightsSummary(query: PeriodQuery) {
  return apiGet<CompletedFlightsSummary>(`/reporting/completed-flights-summary?${toQueryString(query)}`);
}

export function fetchLowSalesAlerts() {
  return apiGet<LowSalesAlert[]>('/reporting/low-sales-alerts');
}

export function fetchFinanceDashboardStats() {
  return apiGet<FinanceDashboardStats>('/reporting/finance-dashboard-stats');
}

export function fetchCommercialOverview() {
  return apiGet<CommercialOverview>('/reporting/commercial-overview');
}

export function fetchSiteAdminOverview() {
  return apiGet<SiteAdminOverview>('/reporting/site-admin-overview');
}

export function fetchRecentTransactions() {
  return apiGet<RecentTransactionsResult>('/reporting/recent-transactions');
}

export function fetchRevenueMix(query: PeriodQuery) {
  return apiGet<RevenueMixResult>(`/reporting/revenue-mix?${toQueryString(query)}`);
}

export function fetchAgencySettlements() {
  return apiGet<AgencySettlementsResult>('/reporting/agency-settlements');
}

export function searchPassengers(q: string) {
  return apiGet<PassengerReportHit[]>(`/passenger-reports/search?q=${encodeURIComponent(q)}`);
}

export function fetchStaffReports(staffId?: string) {
  const qs = staffId ? `?staffId=${encodeURIComponent(staffId)}` : '';
  return apiGet<StaffReportsResult>(`/staff-reports${qs}`);
}

/** EMPLOYEE activity feed for «گزارش‌های من» */
export function fetchMyActivity() {
  return apiGet<EmployeeActivityResult>('/staff-reports/mine');
}
