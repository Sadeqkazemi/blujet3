import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { changeOwnPassword } from '../../api/auth';
import { ApiRequestError } from '../../api/envelope';
import { useAuth } from '../../hooks/useAuth';
import { StaffLoginLayout } from './StaffLoginLayout';

/** Gate shown after staff/agency login when `mustChangePassword` is set —
 * typically after IT/admin issued a temporary password. */
export default function ForcePasswordChangePage() {
  const { status, user, refreshMe } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') navigate('/login', { replace: true });
    else if (status === 'authenticated' && user && !user.mustChangePassword) {
      navigate(user.role === 'AGENCY' ? '/agency' : '/panel', { replace: true });
    }
  }, [status, user, navigate]);

  if (status !== 'authenticated' || !user?.mustChangePassword) return null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (newPassword.length < 6) {
      setError('رمز عبور جدید باید حداقل ۶ کاراکتر باشد.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('تکرار رمز عبور جدید مطابقت ندارد.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await changeOwnPassword(currentPassword, newPassword);
      await refreshMe();
      navigate(user!.role === 'AGENCY' ? '/agency' : '/panel', { replace: true });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'خطا در تغییر رمز عبور.');
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
      <div className="mb-1.5 text-[19px] font-black text-[#0f172a]">تغییر رمز عبور</div>
      <div className="mb-5 text-[11.5px] leading-[1.9] text-[#64748b]">
        رمز موقت شما باید قبل از ورود به سامانه با یک رمز جدید جایگزین شود.
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
        <div>
          <label htmlFor="current-password" className="mb-1.5 block text-[11px] font-bold text-[#334155]">
            رمز عبور فعلی (موقت)
          </label>
          <input
            id="current-password"
            type="password"
            dir="ltr"
            className="h-[46px] w-full rounded-xl border border-[#e2e8f0] bg-[#f8fafc] px-3.5 text-right text-[13px] text-[#0f172a] outline-none focus:border-accent"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        <div>
          <label htmlFor="new-password" className="mb-1.5 block text-[11px] font-bold text-[#334155]">
            رمز عبور جدید
          </label>
          <input
            id="new-password"
            type="password"
            dir="ltr"
            placeholder="حداقل ۶ کاراکتر"
            className="h-[46px] w-full rounded-xl border border-[#e2e8f0] bg-[#f8fafc] px-3.5 text-right text-[13px] text-[#0f172a] outline-none focus:border-accent"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
          />
        </div>
        <div>
          <label htmlFor="confirm-password" className="mb-1.5 block text-[11px] font-bold text-[#334155]">
            تکرار رمز عبور جدید
          </label>
          <input
            id="confirm-password"
            type="password"
            dir="ltr"
            className="h-[46px] w-full rounded-xl border border-[#e2e8f0] bg-[#f8fafc] px-3.5 text-right text-[13px] text-[#0f172a] outline-none focus:border-accent"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
          />
        </div>

        {error && (
          <p role="alert" className="flex items-center gap-2 rounded-[10px] border border-red-200 bg-red-50 px-3 py-2.5 text-[11.5px] text-red-600">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="mt-1 flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-accent to-navy-2 text-[13.5px] font-extrabold text-white shadow-lg transition hover:brightness-110 disabled:opacity-60"
        >
          {submitting ? 'در حال ذخیره…' : 'ذخیره و ورود به سامانه'}
        </button>
      </form>
    </StaffLoginLayout>
  );
}
