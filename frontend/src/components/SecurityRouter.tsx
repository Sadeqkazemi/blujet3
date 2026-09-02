import SecurityPage from '../features/it-manager/SecurityPage';
import OwnSecurityPage from '../features/own-security/OwnSecurityPage';
import { useAuth } from '../hooks/useAuth';

/** The `security` tab key backs two different designs: IT's Phase 8
 * «رمزها و امنیت» page and CEO/Senior's Phase 12 «امنیت و رمز عبور». */
export default function SecurityRouter() {
  const { user } = useAuth();
  if (user?.role === 'IT_MANAGER' || user?.role === 'EMPLOYEE') return <SecurityPage />;
  return <OwnSecurityPage />;
}
