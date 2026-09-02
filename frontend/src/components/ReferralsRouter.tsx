import ReferralsPage from '../features/referrals/ReferralsPage';
import MyReferralsPage from '../features/referrals/MyReferralsPage';
import { useAuth } from '../hooks/useAuth';

/** The `referrals` tab key backs two different views: SENIOR_MANAGER's
 * sender-side "ارجاعات من به مدیران" (ReferralsPage) and EMPLOYEE's
 * recipient-side "ارجاعات محول‌شده به من" (MyReferralsPage, Phase 26). */
export default function ReferralsRouter() {
  const { user } = useAuth();
  if (user?.role === 'EMPLOYEE') return <MyReferralsPage />;
  return <ReferralsPage />;
}
