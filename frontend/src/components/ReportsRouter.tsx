import { useAuth } from '../hooks/useAuth';
import PassengerReportsPage from '../features/passenger-reports/PassengerReportsPage';
import EmployeeReportsPage from '../features/staff-reports/EmployeeReportsPage';

/** EMPLOYEE → گزارش‌های من (activity feed); other roles keep passenger search. */
export default function ReportsRouter() {
  const { user } = useAuth();
  if (user?.role === 'EMPLOYEE') return <EmployeeReportsPage />;
  return <PassengerReportsPage />;
}
