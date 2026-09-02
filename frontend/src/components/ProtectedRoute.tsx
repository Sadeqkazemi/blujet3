import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function ProtectedRoute() {
  const { status, user } = useAuth();

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-body font-sans text-ink">
        <p className="text-sm text-muted">در حال بررسی نشست…</p>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace />;
  }

  if (user?.mustChangePassword) {
    return <Navigate to="/required-password-change" replace />;
  }

  // The management panels are staff-only — an AGENCY session belongs in its
  // own self-service portal, not this shell (role isolation, both directions).
  if (user?.role === 'AGENCY') {
    return <Navigate to="/agency" replace />;
  }

  return <Outlet />;
}
