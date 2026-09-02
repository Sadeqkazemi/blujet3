import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { ApiRequestError } from '../../api/envelope';
import { requestStaffFirstLogin, resolveStaffLoginMode } from '../../api/auth';
import { StaffLoginLayout } from './StaffLoginLayout';

const FORGOT_TOAST =
  'برای بازیابی رمز عبور، با واحد فناوری اطلاعات (مدیر IT) تماس بگیرید';

type LoginPhase = 'username' | 'password' | 'firstSetup';

function ArrowLeftIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function ErrorMessage({ children }: { children: string }) {
  return (
    <p role="alert" className="flex items-center gap-2 rounded-[10px] border border-red-200 bg-red-50 px-3 py-2.5 text-[11.5px] text-red-600">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v4M12 16h.01" />
      </svg>
      {children}
    </p>
  );
}

function UserIcon({ size = 21 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
    </svg>
  );
}

function LockIcon({ size = 21 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4.5" y="10" width="15" height="9" rx="2" />
      <path d="M7.5 10V7a4.5 4.5 0 0 1 9 0v3" />
    </svg>
  );
}

function EyeIcon({ hidden }: { hidden: boolean }) {
  return hidden ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a21.6 21.6 0 0 1 5.06-6.06M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a21.6 21.6 0 0 1-2.61 3.68" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24M1 1l22 22" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export default function LoginPage() {
  const { requestLogin, status, user } = useAuth();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<LoginPhase>('username');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [phone, setPhone] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (status !== 'authenticated' || !user) return;
    if (user.mustChangePassword) {
      navigate('/required-password-change', { replace: true });
      return;
    }
    if (user.role === 'AGENCY') {
      navigate('/agency', { replace: true });
      return;
    }
    if (user.role === 'USER') {
      navigate('/account', { replace: true });
      return;
    }
    navigate('/panel', { replace: true });
  }, [navigate, status, user]);

  if (status === 'authenticated' && user) return null;

  async function onUsernameSubmit(e: FormEvent) {
    e.preventDefault();
    if (!username.trim()) {
      setError('نام کاربری را وارد کنید.');
      return;
    }
    setError(null);
    setPassword('');
    setSubmitting(true);
    try {
      const { mode } = await resolveStaffLoginMode(username.trim());
      setPhase(mode === 'FIRST_LOGIN_SETUP' ? 'firstSetup' : 'password');
    } catch {
      // A mode lookup failure must not block established password login.
      setPhase('password');
    } finally {
      setSubmitting(false);
    }
  }

  async function onFirstSetupSubmit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError('رمز عبور باید حداقل ۸ کاراکتر و شامل حروف بزرگ، کوچک، عدد و نماد باشد.');
      return;
    }
    if (password !== passwordConfirm) {
      setError('تکرار رمز عبور با رمز جدید یکسان نیست.');
      return;
    }
    if (!/^09\d{9}$/.test(phone.replace(/\s/g, ''))) {
      setError('شماره موبایل معتبر وارد کنید؛ مثال: 09121234567');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const { challengeId } = await requestStaffFirstLogin(
        username.trim(),
        phone,
        password,
      );
      navigate('/two-factor', {
        state: { challengeId, firstLogin: true, phone },
      });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'خطا در راه‌اندازی اولین ورود.');
    } finally {
      setSubmitting(false);
    }
  }

  async function onPasswordSubmit(e: FormEvent) {
    e.preventDefault();
    if (!password.trim()) {
      setError('رمز عبور را وارد کنید.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const result = await requestLogin(username.trim(), password);
      if (
        result.loginMode === 'TEMPORARY_PASSWORD_ONLY' ||
        result.loginMode === 'PASSWORD_ONLY'
      ) {
        navigate(
          result.user.mustChangePassword
            ? '/required-password-change'
            : '/panel',
          { replace: true },
        );
      } else {
        navigate('/two-factor', { state: { challengeId: result.challengeId } });
      }
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'خطا در ورود. دوباره تلاش کنید.');
    } finally {
      setSubmitting(false);
    }
  }

  function editUsername() {
    setPhase('username');
    setPassword('');
    setPasswordConfirm('');
    setPhone('');
    setShowPassword(false);
    setError(null);
  }

  return (
    <StaffLoginLayout>
      {phase === 'username' ? (
        <form onSubmit={onUsernameSubmit} noValidate>
          <div className="mb-4 flex h-[46px] w-[46px] items-center justify-center rounded-[14px] bg-gradient-to-br from-[#eff6ff] to-[#dbeafe] text-accent">
            <UserIcon />
          </div>
          <h2 className="mb-1.5 text-[19px] font-black text-[#0f172a]">ورود به سامانه</h2>
          <p className="mb-5 text-[11.5px] leading-[1.9] text-[#64748b]">نام کاربری سازمانی خود را وارد کنید.</p>

          <div className="mb-4">
            <label htmlFor="username" className="mb-[7px] block text-[11px] font-bold text-[#334155]">
              نام کاربری
            </label>
            <div className="relative">
              <input
                id="username"
                placeholder="username"
                dir="ltr"
                className="font-num h-[46px] w-full rounded-xl border-[1.5px] border-[#e2e8f0] bg-[#f8fafc] py-0 pl-[13px] pr-10 text-left font-mono text-[13px] text-[#0f172a] outline-none focus:border-accent focus:bg-white"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
              />
              <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[#94a3b8]">
                <UserIcon size={15} />
              </span>
            </div>
          </div>

          {error && <div className="mb-4"><ErrorMessage>{error}</ErrorMessage></div>}

          <button type="submit" className="flex h-12 w-full items-center justify-center gap-[9px] rounded-xl bg-gradient-to-br from-accent to-navy-2 text-[13.5px] font-extrabold text-white shadow-[0_14px_28px_-10px_rgba(37,99,235,.55)] transition hover:brightness-110">
            ادامه
            <ArrowLeftIcon />
          </button>
        </form>
      ) : phase === 'firstSetup' ? (
        <div className="animate-[fadeUp_.25s_ease]">
          <button type="button" onClick={editUsername} className="mb-4 inline-flex items-center gap-1.5 text-[11.5px] font-bold text-[#64748b] transition hover:text-accent">
            <span aria-hidden>‹</span>
            ویرایش نام کاربری
          </button>
          <div className="mb-4 flex h-[46px] w-[46px] items-center justify-center rounded-[14px] bg-gradient-to-br from-[#eff6ff] to-[#dbeafe] text-accent">
            <UserIcon />
          </div>
          <h2 className="mb-1.5 text-[19px] font-black text-[#0f172a]">راه‌اندازی اولین ورود</h2>
          <p className="mb-5 text-[11.5px] leading-[1.9] text-[#64748b]">
            برای <span dir="ltr" className="font-bold text-[#0f172a]">{username.trim()}</span> رمز عبور و شماره موبایل خود را ثبت کنید.
          </p>

          <form onSubmit={onFirstSetupSubmit} className="space-y-3.5" noValidate>
            <div>
              <label htmlFor="first-password" className="mb-[7px] block text-[11px] font-bold text-[#334155]">رمز عبور جدید</label>
              <input
                id="first-password"
                data-testid="staff-first-password"
                type="password"
                dir="ltr"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="حداقل ۸ کاراکتر"
                className="h-[46px] w-full rounded-xl border-[1.5px] border-[#e2e8f0] bg-[#f8fafc] px-3.5 text-left text-[13px] outline-none focus:border-accent focus:bg-white"
              />
            </div>
            <div>
              <label htmlFor="first-password-confirm" className="mb-[7px] block text-[11px] font-bold text-[#334155]">تکرار رمز عبور</label>
              <input
                id="first-password-confirm"
                data-testid="staff-first-password-confirm"
                type="password"
                dir="ltr"
                autoComplete="new-password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                placeholder="تکرار رمز عبور"
                className="h-[46px] w-full rounded-xl border-[1.5px] border-[#e2e8f0] bg-[#f8fafc] px-3.5 text-left text-[13px] outline-none focus:border-accent focus:bg-white"
              />
            </div>
            <div>
              <label htmlFor="first-phone" className="mb-[7px] block text-[11px] font-bold text-[#334155]">شماره موبایل</label>
              <input
                id="first-phone"
                data-testid="staff-first-phone"
                type="tel"
                inputMode="numeric"
                dir="ltr"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, '').slice(0, 11))}
                placeholder="09121234567"
                className="font-num h-[46px] w-full rounded-xl border-[1.5px] border-[#e2e8f0] bg-[#f8fafc] px-3.5 text-left text-[13px] outline-none focus:border-accent focus:bg-white"
              />
            </div>
            {(import.meta.env.DEV || import.meta.env.VITE_SANDBOX_AUTH === 'true') && (
              <div data-testid="staff-sandbox-hint" className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-[11px] leading-5 text-blue-700">
                حالت Sandbox فعال است؛ اگر پیامک دریافت نشد، کد ۱۲۳۴۵۶ را وارد کنید.
              </div>
            )}
            {error && <ErrorMessage>{error}</ErrorMessage>}
            <button type="submit" disabled={submitting} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-accent to-navy-2 text-[13.5px] font-extrabold text-white shadow-lg disabled:opacity-60">
              {submitting ? 'در حال ثبت…' : 'ثبت و ارسال کد یک‌بارمصرف'}
              {!submitting && <ArrowLeftIcon />}
            </button>
          </form>
        </div>
      ) : (
        <div className="animate-[fadeUp_.25s_ease]">
          <button type="button" onClick={editUsername} className="mb-4 inline-flex items-center gap-1.5 text-[11.5px] font-bold text-[#64748b] transition hover:text-accent">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
            ویرایش نام کاربری
          </button>

          <div className="mb-4 flex h-[46px] w-[46px] items-center justify-center rounded-[14px] bg-gradient-to-br from-[#eff6ff] to-[#dbeafe] text-accent">
            <LockIcon />
          </div>
          <h2 className="mb-1.5 text-[19px] font-black text-[#0f172a]">رمز عبور خود را وارد کنید</h2>
          <p className="mb-5 text-[11.5px] leading-[1.9] text-[#64748b]">
            ورود با نام کاربری <span dir="ltr" className="font-bold text-[#0f172a]">{username.trim()}</span>
          </p>

          <form onSubmit={onPasswordSubmit} noValidate>
            <div className="mb-4">
              <label htmlFor="password" className="mb-[7px] block text-[11px] font-bold text-[#334155]">
                رمز عبور
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  dir="ltr"
                  className="h-[46px] w-full rounded-xl border-[1.5px] border-[#e2e8f0] bg-[#f8fafc] py-0 pl-[52px] pr-10 text-left text-[13px] text-[#0f172a] outline-none focus:border-accent focus:bg-white"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  autoFocus
                />
                <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[#94a3b8]">
                  <LockIcon size={15} />
                </span>
                <button
                  type="button"
                  aria-label={showPassword ? 'پنهان کردن رمز عبور' : 'نمایش رمز عبور'}
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute left-[13px] top-1/2 flex -translate-y-1/2 text-accent"
                >
                  <EyeIcon hidden={showPassword} />
                </button>
              </div>
            </div>

            <div className="mb-5 flex justify-end">
              <button type="button" data-testid="staff-forgot-password" onClick={() => setToast(FORGOT_TOAST)} className="text-[11.5px] font-semibold text-accent">
                فراموشی رمز عبور؟
              </button>
            </div>

            {error && <div className="mb-4"><ErrorMessage>{error}</ErrorMessage></div>}

            <button type="submit" disabled={submitting} className="flex h-12 w-full items-center justify-center gap-[9px] rounded-xl bg-gradient-to-br from-accent to-navy-2 text-[13.5px] font-extrabold text-white shadow-[0_14px_28px_-10px_rgba(37,99,235,.55)] transition hover:brightness-110 disabled:opacity-60">
              {submitting ? 'در حال بررسی…' : 'ارسال کد یک‌بارمصرف'}
              {!submitting && <ArrowLeftIcon />}
            </button>
          </form>
        </div>
      )}

      <p className="mt-5 border-t border-[#eef1f6] pt-4 text-[10.5px] leading-[1.9] text-[#94a3b8]">
        حساب کاربری ندارید؟ ایجاد نام کاربری کارکنان تنها از طریق{' '}
        <span className="font-bold text-accent">واحد فناوری اطلاعات (مدیر IT)</span> انجام می‌شود.
      </p>

      {toast && (
        <div role="status" data-testid="staff-forgot-toast" className="fixed bottom-6 left-1/2 z-[9000] flex max-w-[90vw] -translate-x-1/2 items-center gap-[9px] rounded-xl border border-[#1e293b] bg-[#0f172a] px-[18px] py-3 text-[12.5px] font-bold text-[#f1f5f9] shadow-xl">
          <span className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full bg-[#34d39933] text-[12px] text-[#34d399]">✓</span>
          <span>{toast}</span>
        </div>
      )}
    </StaffLoginLayout>
  );
}
