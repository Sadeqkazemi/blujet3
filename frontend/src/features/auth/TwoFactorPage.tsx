import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { ApiRequestError } from '../../api/envelope';
import { StaffLoginLayout } from './StaffLoginLayout';

interface LocationState {
  challengeId?: string;
  firstLogin?: boolean;
  phone?: string;
}

export default function TwoFactorPage() {
  const { confirmTwoFactor } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState | null;
  const challengeId = state?.challengeId;

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!challengeId) navigate('/login', { replace: true });
  }, [challengeId, navigate]);

  if (!challengeId) {
    return null;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (code.trim().length !== 6) {
      setError('کد ۶ رقمی را کامل وارد کنید.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const loggedIn = await confirmTwoFactor(challengeId!, code.trim());
      navigate(loggedIn.mustChangePassword ? '/required-password-change' : '/panel', { replace: true });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'خطا در تأیید کد.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <StaffLoginLayout>
      <div className="mb-4 flex h-[46px] w-[46px] items-center justify-center rounded-2xl bg-gradient-to-br from-accent/10 to-accent/20 text-accent">
        <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="10" width="16" height="10" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        </svg>
      </div>
      <div className="mb-1.5 text-[19px] font-black text-[#0f172a]">تأیید هویت دومرحله‌ای</div>
      <div className="mb-5 text-[11.5px] leading-[1.9] text-[#64748b]">
        کد ۶ رقمی ارسال‌شده به موبایل ثبت‌شده را وارد کنید.
      </div>

      {(import.meta.env.DEV || import.meta.env.VITE_SANDBOX_AUTH === 'true') && (
        <div data-testid="staff-otp-sandbox-hint" className="mb-4 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-[11px] leading-5 text-blue-700">
          حالت Sandbox فعال است؛ اگر پیامک دریافت نشد، کد ۱۲۳۴۵۶ را وارد کنید.
        </div>
      )}

      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div>
          <label htmlFor="code" className="mb-1.5 block text-[11px] font-bold text-[#334155]">
            کد تأیید
          </label>
          <input
            id="code"
            dir="ltr"
            inputMode="numeric"
            maxLength={6}
            className="font-num h-[46px] w-full rounded-xl border border-[#e2e8f0] bg-[#f8fafc] px-3.5 text-center text-lg tracking-[0.4em] text-[#0f172a] outline-none focus:border-accent"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            autoComplete="one-time-code"
          />
        </div>

        {error && (
          <p role="alert" className="rounded-[10px] border border-red-200 bg-red-50 px-3 py-2.5 text-[11.5px] text-red-600">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="mt-2 flex h-12 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-navy-2 text-[13.5px] font-extrabold text-white shadow-lg transition hover:brightness-110 disabled:opacity-60"
        >
          {submitting ? 'در حال بررسی…' : 'تأیید و ورود'}
        </button>
      </form>

      <Link
        to="/login"
        className="mt-5 block text-center text-[11.5px] font-semibold text-[#64748b] hover:text-accent"
      >
        ‹ بازگشت به ورود
      </Link>
    </StaffLoginLayout>
  );
}
