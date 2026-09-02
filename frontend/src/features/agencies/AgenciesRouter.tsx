import { useAuth } from '../../hooks/useAuth';
import AgenciesListPage from './AgenciesListPage';
import EmployeeAgenciesPage from './EmployeeAgenciesPage';
import SiteAdminAgenciesPage from './SiteAdminAgenciesPage';

/** Role-scoped agencies list: employee table / site-admin design / managers full UI. */
export default function AgenciesRouter() {
  const { user } = useAuth();
  if (user?.role === 'EMPLOYEE') return <EmployeeAgenciesPage />;
  if (user?.role === 'SITE_ADMIN') return <SiteAdminAgenciesPage />;
  return <AgenciesListPage />;
}
