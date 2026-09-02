import LogsPage from '../features/it-manager/LogsPage';
import CeoLogsPage from '../features/ceo-logs/CeoLogsPage';
import { useAuth } from '../hooks/useAuth';

/** The `logs` tab key backs IT's Phase 8 log page and CEO's Phase 12
 * «لاگ‌ها و رویدادهای سامانه». */
export default function LogsRouter() {
  const { user } = useAuth();
  if (user?.role === 'IT_MANAGER') return <LogsPage />;
  return <CeoLogsPage />;
}
