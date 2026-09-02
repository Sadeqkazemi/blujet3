import type { Irr } from '../../common/money';

export type SalesGranularity =
  'day' | 'month' | 'q3' | 'q6' | 'year' | 'flight';

export interface Bucket {
  key: string;
  start: Date;
  end: Date;
}

export interface SalesChartPeriod {
  periodKey: string;
  startDate: string;
  endDate: string;
  systemIrr: Irr;
  charterIrr: Irr;
  agencyIrr: Irr;
}

export interface KpiTrends {
  revenuePct: number;
  profitPct: number;
  operatingCostPct: number;
  agencyDebtPct: number;
}

export interface KpiResult {
  revenueIrr: Irr;
  profitIrr: Irr;
  marginPct: number;
  operatingCostIrr: Irr;
  agencyDebtIrr: Irr;
  agencyDebtCount: number;
  trends: KpiTrends;
}

export interface FinanceDashboardStats {
  activeAgencies: number;
  activeAgenciesTrendPct: number;
  passengersThisMonth: number;
  passengersTrendPct: number;
  ticketsSoldThisMonth: number;
  ticketsTrendPct: number;
  revenueThisMonthIrr: Irr;
  revenueTrendPct: number;
}

export type TransactionStatusTone = 'success' | 'warning' | 'danger';

export interface CompletedFlightsSummary {
  flightCount: number;
  totalSeats: number;
  soldSeats: number;
  unsoldSeats: number;
}

/** One departed instance for the analytic مالی «شماره پرواز» picker. */
export interface FlightSalesRow {
  flightInstanceId: string;
  flightNo: string;
  originCode: string;
  destCode: string;
  originCityFa: string;
  destCityFa: string;
  departureAt: string;
  systemIrr: Irr;
  charterIrr: Irr;
  agencyIrr: Irr;
  totalIrr: Irr;
  capacity: number;
  soldSeats: number;
}

export interface FlightSalesResult {
  rows: FlightSalesRow[];
}

export interface CommercialOverview {
  activeAgencies: number;
  passengersThisMonth: number;
  pendingAgencyRequests: number;
}

/** SITE_ADMIN dashboard KPI row — design-reference-v2/پنل ادمین سایت.dc.html */
export interface SiteAdminOverview {
  activeAgencies: number;
  passengersThisMonth: number;
  ticketsSoldThisMonth: number;
  pendingActionCount: number;
  /** MoM % change vs previous calendar month; null when previous month is 0. */
  agenciesTrendPct: number | null;
  passengersTrendPct: number | null;
  ticketsTrendPct: number | null;
}
