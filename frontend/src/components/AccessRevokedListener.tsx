import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
  ACCESS_REVOKED_MESSAGE,
  onAccessRevoked,
} from '../lib/access-revoked';
import { setAccessToken } from '../api/token-store';

/** Central session teardown on access-revoked / failed refresh. */
export default function AccessRevokedListener() {
  const { signOut, user, status } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState(ACCESS_REVOKED_MESSAGE);
  const loginTargetRef = useRef('/login');

  useEffect(() => {
    return onAccessRevoked((detail) => {
      setMessage(detail.message || ACCESS_REVOKED_MESSAGE);
      setOpen(true);
      const role = user?.role;
      loginTargetRef.current =
        role === 'AGENCY' ? '/agency/login' : role === 'USER' || !role ? '/signin' : '/login';
      setAccessToken(null);
      void signOut();
    });
  }, [navigate, signOut, user?.role]);

  // Also listen for DOM CustomEvent from non-React callers.
  useEffect(() => {
    if (status !== 'authenticated') return;
    function onWindowEvent(e: Event) {
      const ce = e as CustomEvent<{ message?: string }>;
      setMessage(ce.detail?.message || ACCESS_REVOKED_MESSAGE);
      setOpen(true);
    }
    window.addEventListener('access-revoked', onWindowEvent);
    return () => window.removeEventListener('access-revoked', onWindowEvent);
  }, [status]);

  if (!open) return null;

  return (
    <div
      data-testid="access-revoked-page"
      className="fixed inset-0 z-[9999] flex min-h-dvh items-center justify-center bg-[#0b1f35] p-5"
      dir="rtl"
    >
      <div
        data-testid="access-revoked-dialog"
        className="w-full max-w-md rounded-2xl border border-white/10 bg-[#102b48] p-8 text-center shadow-2xl shadow-black/30"
      >
        <span className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 text-[#7fb5ff]">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M12 3 5 6v5.5c0 4.1 2.8 7.3 7 8.5 4.2-1.2 7-4.4 7-8.5V6l-7-3Z" />
            <path d="m9.5 9.5 5 5m0-5-5 5" />
          </svg>
        </span>
        <h1 className="mb-3 text-xl font-black text-white">قطع دسترسی به پنل</h1>
        <p className="m-0 text-sm leading-7 text-[#c7d2e3]">{message}</p>
        <button
          type="button"
          data-testid="access-revoked-ack"
          onClick={() => {
            setOpen(false);
            navigate(loginTargetRef.current, { replace: true });
          }}
          className="mt-6 w-full rounded-xl bg-[#2f74d0] px-4 py-3 text-sm font-extrabold text-white transition hover:bg-[#3b82f6]"
        >
          بازگشت به صفحه ورود
        </button>
      </div>
    </div>
  );
}
