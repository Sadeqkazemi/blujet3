import { useEffect } from 'react';
import type { StoredLocale } from '../../../hooks/useLocale';
import OtpLoginInline from '../OtpLoginInline';

const COPY: Record<StoredLocale, { title: string; body: string; login: string; signup: string; close: string }> = {
  fa: {
    title: 'برای ادامه وارد شوید',
    body: 'لطفاً برای تکمیل رزرو این پرواز وارد شوید یا یک حساب رایگان بسازید.',
    login: 'ورود',
    signup: 'ثبت‌نام',
    close: 'بستن پنجره ورود',
  },
  en: {
    title: 'Sign in to continue',
    body: 'Please sign in to complete this booking, or create a free account.',
    login: 'Sign in',
    signup: 'Sign up',
    close: 'Close sign-in dialog',
  },
  ar: {
    title: 'سجّل الدخول للمتابعة',
    body: 'يرجى تسجيل الدخول لإكمال حجز هذه الرحلة أو إنشاء حساب مجاني.',
    login: 'تسجيل الدخول',
    signup: 'إنشاء حساب',
    close: 'إغلاق نافذة تسجيل الدخول',
  },
};

type Props = {
  locale: StoredLocale;
  open: boolean;
  onClose: () => void;
  onLogin: () => void;
  onSignup: () => void;
  desktopOtp?: boolean;
  onAuthenticated?: () => void;
};

export default function ResultsGuestAuthModal({
  locale,
  open,
  onClose,
  onLogin,
  onSignup,
  desktopOtp = false,
  onAuthenticated,
}: Props) {
  const copy = COPY[locale];

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  if (desktopOtp) {
    return (
      <div
        role="presentation"
        onClick={onClose}
        className="fixed inset-0 z-[300] flex items-center justify-center bg-[#0d2640]/65 p-3 backdrop-blur-[3px]"
      >
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="guest-auth-title"
          onClick={(event) => event.stopPropagation()}
          className="relative w-full max-w-[340px] rounded-[18px] bg-white px-4 pb-5 pt-7 text-center shadow-[0_24px_64px_-20px_rgba(0,0,0,.5)] sm:max-w-[360px]"
          data-testid="desktop-guest-otp-modal"
        >
          <button
            type="button"
            aria-label={copy.close}
            onClick={onClose}
            className="absolute left-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg bg-[#f2f5f9] text-lg text-[#6b7b94]"
          >
            ×
          </button>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-[#eef4fb] text-[#1668c4]">
            <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="m4 19 16-14M7 8l4 4M13 14l4 4M5 5l14 14" />
            </svg>
          </div>
          <h2 id="guest-auth-title" className="sr-only">
            {copy.title}
          </h2>
          <OtpLoginInline embedded onAuthenticated={onAuthenticated} />
        </section>
      </div>
    );
  }

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 300,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        background: 'rgba(13, 38, 64, .66)',
        backdropFilter: 'blur(3px)',
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="guest-auth-title"
        onClick={(event) => event.stopPropagation()}
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 450,
          borderRadius: 20,
          padding: '38px 30px 32px',
          color: '#fff',
          textAlign: 'center',
          background: 'linear-gradient(145deg, #0d2640 0%, #0f4d8c 55%, #1668c4 100%)',
          boxShadow: '0 32px 80px -22px rgba(0, 0, 0, .7)',
          boxSizing: 'border-box',
        }}
      >
        <button
          type="button"
          aria-label={copy.close}
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            width: 34,
            height: 34,
            border: 'none',
            borderRadius: 9,
            background: 'rgba(255, 255, 255, .16)',
            color: '#fff',
            fontSize: 21,
            lineHeight: 1,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          ×
        </button>

        <div
          aria-hidden="true"
          style={{
            width: 68,
            height: 68,
            margin: '0 auto 20px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(255, 255, 255, .16)',
          }}
        >
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
          </svg>
        </div>
        <h2 id="guest-auth-title" style={{ margin: '0 0 10px', fontSize: 21, fontWeight: 900 }}>
          {copy.title}
        </h2>
        <p style={{ margin: '0 auto 28px', maxWidth: 350, color: '#e1edf9', fontSize: 14, lineHeight: 2 }}>
          {copy.body}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button
            type="button"
            onClick={onLogin}
            style={{
              width: '100%',
              minHeight: 56,
              border: 'none',
              borderRadius: 28,
              background: '#fff',
              color: '#0d2640',
              fontSize: 15,
              fontWeight: 900,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {copy.login}
          </button>
          <button
            type="button"
            onClick={onSignup}
            style={{
              width: '100%',
              minHeight: 56,
              border: '1.5px solid rgba(255, 255, 255, .72)',
              borderRadius: 28,
              background: 'transparent',
              color: '#fff',
              fontSize: 15,
              fontWeight: 900,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {copy.signup}
          </button>
        </div>
      </section>
    </div>
  );
}
