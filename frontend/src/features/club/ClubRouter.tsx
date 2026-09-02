import { useAuth } from '../../hooks/useAuth';
import ClubPage from './ClubPage';
import SiteAdminClubPage from './SiteAdminClubPage';

/** Role-scoped club tab: site-admin design vs executive VIP layout. */
export default function ClubRouter() {
  const { user } = useAuth();
  if (user?.role === 'SITE_ADMIN') return <SiteAdminClubPage />;
  return <ClubPage />;
}
