import { useOutletContext } from 'react-router-dom';
import DashboardPage from '../features/dashboard/DashboardPage';
import FinanceDashboardPage from '../features/dashboard/FinanceDashboardPage';
import CommercialDashboardPage from '../features/dashboard/CommercialDashboardPage';
import ItDashboardPage from '../features/it-manager/ItDashboardPage';
import SiteAdminDashboardPage from '../features/dashboard/SiteAdminDashboardPage';
import EmployeeDashboardPage from '../features/dashboard/EmployeeDashboardPage';
import OperationsDashboardPage from '../features/operations/OperationsDashboardPage';
import ComingSoonPage from './ComingSoonPage';
import { useAuth } from '../hooks/useAuth';
import type { PanelShellContext } from '../types/panel-shell';

/**
 * The shared sales/KPI dashboard only backs the roles reporting.controller
 * actually allows (CEO/Board Chair/Senior/Finance/Commercial) — it reads
 * financial revenue/profit data those roles are meant to see. SITE_ADMIN
 * and EMPLOYEE never had that access widened (out of scope — see Phase 18
 * notes in docs/DB_SCHEMA.md), so they each get a dedicated real dashboard
 * scoped to what they're actually authorized to see. IT Manager's
 * "dashboard" nav entry points at a different real page (service-health/
 * os-metrics, Phase 8). Any role whose entry isn't `implemented` gets the
 * coming-soon placeholder instead of a broken fetch-and-error dashboard.
 */
export default function DashboardRouter() {
  const { nav } = useOutletContext<PanelShellContext>();
  const { user } = useAuth();
  const dashboardEntry = nav?.find((item) => item.key === 'dashboard');

  if (nav !== null && dashboardEntry && !dashboardEntry.implemented) {
    return <ComingSoonPage />;
  }

  if (user?.role === 'IT_MANAGER') return <ItDashboardPage />;
  if (user?.role === 'FINANCE_MANAGER') return <FinanceDashboardPage />;
  if (user?.role === 'SITE_ADMIN') return <SiteAdminDashboardPage />;
  if (user?.role === 'EMPLOYEE') return <EmployeeDashboardPage />;
  if (user?.role === 'COMMERCIAL_MANAGER') return <CommercialDashboardPage />;
  if (user?.role === 'OPERATIONS_MANAGER') return <OperationsDashboardPage />;
  return <DashboardPage />;
}
