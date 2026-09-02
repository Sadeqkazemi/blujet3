import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function AgencyProtectedRoute() {
  const { status, user } = useAuth();

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-body font-sans text-ink">
        <p className="text-sm text-muted">در حال بررسی نشست…</p>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/agency/login" replace />;
  }

  if (user?.mustChangePassword) {
    return <Navigate to="/required-password-change" replace />;
  }

  // Agency Portal is AGENCY-only — a staff session belongs in /panel, not here.
  if (user?.role !== 'AGENCY') {
    return <Navigate to="/panel" replace />;
  }

  return <Outlet />;
}
