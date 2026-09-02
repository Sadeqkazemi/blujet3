import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useLocale, type StoredLocale } from '../../hooks/useLocale';
import { useIsMobile } from '../../hooks/useIsMobile';
import { ApiRequestError } from '../../api/envelope';
import { latinDigits } from '../../lib/fa-format';
import { FONT } from '../../lib/i18n';
import { localeDigits } from '../../lib/locale-format';

/**
 * ورود و ثبت‌نام مشتریان — matches uploaded design + design-reference-v2
 * (customer-only card; agency is a header link to /agency/login).
 * Real auth: phone + 6-digit OTP (API). Google sign-in from the EN design
 * mock is out of scope.
 */

const RESEND_SECONDS = 120;
const OTP_LEN = 6;
const ACCENT = '#1668c4';

function sanitizeMobileInput(raw: string) {
  return latinDigits(raw).replace(/[^\d]/g, '').slice(0, 11);
}

function phoneOk(phone: string) {
  return /^09\d{9}$/.test(phone);
}

function cycleLocale(locale: StoredLocale): StoredLocale {
  if (locale === 'fa') return 'ar';
  if (locale === 'ar') return 'en';
  return 'fa';
}

function useCountdown() {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (left <= 0) return;
    const t = setInterval(() => setLeft((v) => v - 1), 1000);
    return () => clearInterval(t);
  }, [left > 0]); // eslint-disable-line react-hooks/exhaustive-deps
  return { left, start: () => setLeft(RESEND_SECONDS) };
}

function fmtTimer(s: number, locale: StoredLocale) {
  const raw = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  return localeDigits(raw, locale);
}

const STR: Record<
  StoredLocale,
  {
    langLabel: string;
    forgotLabel: string;
    agencyLoginLink: string;
    tabLogin: string;
    tabSignup: string;
    titleLogin: string;
    titleSignup: string;
    titleOtp: string;
    subtitleLogin: string;
    subtitleSignup: string;
    subtitleOtp: string;
    mobileLabel: string;
    phoneHintEmpty: string;
    phoneHintOk: string;
    phoneHintBad: string;
    fullNameLabel: string;
    namePlaceholder: string;
    termsLink: string;
    termsSuffix: string;
    sendLogin: string;
    sendSignup: string;
    otpSentPrefix: string;
    editPhone: string;
    resend: string;
    resendIn: string;
    confirmLogin: string;
    confirmSignup: string;
    secureNote: string;
    visualTitle: string;
    visualSub: string;
    errSendCode: string;
    errInvalidCode: string;
    errPhone: string;
    errName: string;
    errTerms: string;
  }
> = {
  fa: {
    langLabel: 'FA',
    forgotLabel: 'فراموشی رمز',
    agencyLoginLink: 'ورود آژانس همکار',
    tabLogin: 'ورود',
    tabSignup: 'ثبت‌نام',
    titleLogin: 'ورود به حساب',
    titleSignup: 'ساخت حساب کاربری',
    titleOtp: 'کد تأیید را وارد کن',
    subtitleLogin: 'شماره موبایلت را وارد کن؛ کد ورود برایت پیامک می‌شود.',
    subtitleSignup: 'اطلاعاتت را وارد کن و با کد پیامکی حسابت را فعال کن.',
    subtitleOtp: 'کد ۶ رقمی به موبایلت پیامک شد؛ با وارد کردن آن هویتت تأیید می‌شود.',
    mobileLabel: 'شماره موبایل',
    phoneHintEmpty: 'مثال: ۰۹۱۲۳۴۵۶۷۸۹',
    phoneHintOk: '✓ شماره معتبر است',
    phoneHintBad: 'شماره باید با ۰۹ شروع شود و ۱۱ رقم باشد',
    fullNameLabel: 'نام و نام خانوادگی',
    namePlaceholder: 'نام و نام خانوادگی',
    termsLink: 'قوانین و مقررات',
    termsSuffix: 'و حریم خصوصی blujet را می‌پذیرم.',
    sendLogin: 'ارسال کد ورود',
    sendSignup: 'دریافت کد فعال‌سازی',
    otpSentPrefix: 'کد ۶ رقمی پیامک‌شده به',
    editPhone: '✎ ویرایش شماره',
    resend: 'ارسال مجدد کد',
    resendIn: 'ارسال مجدد کد',
    confirmLogin: 'تأیید و ورود',
    confirmSignup: 'تأیید و ساخت حساب',
    secureNote: 'ورود امن با کد یک‌بارمصرف — بدون نیاز به رمز عبور',
    visualTitle: 'سفرت را هوشمندانه\nآغاز کن',
    visualSub:
      'با حساب blujet سریع‌تر بلیط بخر، امتیاز جمع کن و از کش‌بک و خدمات باشگاه مشتریان بهره‌مند شو.',
    errSendCode: 'خطا در ارسال کد.',
    errInvalidCode: 'کد نامعتبر است.',
    errPhone: 'شماره موبایل معتبر نیست؛ باید با ۰۹ شروع شود و ۱۱ رقم باشد.',
    errName: 'نام و نام خانوادگی را کامل وارد کن.',
    errTerms: 'برای ادامه باید قوانین و مقررات را بپذیری.',
  },
  en: {
    langLabel: 'EN',
    forgotLabel: 'Forgot password?',
    agencyLoginLink: 'Agency partner login',
    tabLogin: 'Log in',
    tabSignup: 'Sign up',
    titleLogin: 'Log in to your account',
    titleSignup: 'Create your account',
    titleOtp: 'Enter the verification code',
    subtitleLogin: 'Enter your mobile number; a login code will be texted to you.',
    subtitleSignup: 'Enter your details and activate your account with an SMS code.',
    subtitleOtp: 'A 6-digit code was sent to your phone; enter it to verify your identity.',
    mobileLabel: 'Mobile number',
    phoneHintEmpty: 'e.g. 09123456789',
    phoneHintOk: '✓ Looks good',
    phoneHintBad: 'Number must start with 09 and be 11 digits',
    fullNameLabel: 'Full name',
    namePlaceholder: 'e.g. Sara Ahmadi',
    termsLink: 'Terms & Conditions',
    termsSuffix: ' and Privacy Policy of blujet.',
    sendLogin: 'Send login code',
    sendSignup: 'Get activation code',
    otpSentPrefix: '6-digit code sent to',
    editPhone: '✎ Edit number',
    resend: 'Resend code',
    resendIn: 'Resend code',
    confirmLogin: 'Confirm & log in',
    confirmSignup: 'Confirm & create account',
    secureNote: 'Secure sign-in with a one-time code — no password needed',
    visualTitle: 'Start your journey\nsmarter',
    visualSub:
      'With a blujet account, book faster, earn points, and enjoy cashback and loyalty club perks.',
    errSendCode: 'Error sending the code.',
    errInvalidCode: 'Invalid code.',
    errPhone: 'Invalid phone number; it must start with 09 and be 11 digits.',
    errName: 'Please enter your full name.',
    errTerms: 'You must accept the Terms & Conditions.',
  },
  ar: {
    langLabel: 'AR',
    forgotLabel: 'نسيت كلمة المرور؟',
    agencyLoginLink: 'دخول الوكالة الشريكة',
    tabLogin: 'تسجيل الدخول',
    tabSignup: 'إنشاء حساب',
    titleLogin: 'تسجيل الدخول إلى حسابك',
    titleSignup: 'إنشاء حسابك',
    titleOtp: 'أدخل رمز التحقق',
    subtitleLogin: 'أدخل رقم هاتفك؛ سيُرسل إليك رمز الدخول.',
    subtitleSignup: 'أدخل بياناتك وفعّل حسابك برمز عبر الرسائل النصية.',
    subtitleOtp: 'تم إرسال رمز مكوّن من 6 أرقام إلى هاتفك؛ أدخله لتأكيد هويتك.',
    mobileLabel: 'رقم الجوال',
    phoneHintEmpty: 'مثال: 09123456789',
    phoneHintOk: '✓ الرقم صحيح',
    phoneHintBad: 'يجب أن يبدأ الرقم بـ 09 ويتكون من 11 رقمًا',
    fullNameLabel: 'الاسم الكامل',
    namePlaceholder: 'مثلاً سارة أحمدي',
    termsLink: 'الشروط والأحكام',
    termsSuffix: ' وسياسة الخصوصية لـ blujet.',
    sendLogin: 'إرسال رمز الدخول',
    sendSignup: 'استلام رمز التفعيل',
    otpSentPrefix: 'تم إرسال رمز مكوّن من 6 أرقام إلى',
    editPhone: '✎ تعديل الرقم',
    resend: 'إعادة إرسال الرمز',
    resendIn: 'إعادة إرسال الرمز',
    confirmLogin: 'تأكيد وتسجيل الدخول',
    confirmSignup: 'تأكيد وإنشاء الحساب',
    secureNote: 'تسجيل دخول آمن برمز لمرة واحدة — دون الحاجة لكلمة مرور',
    visualTitle: 'ابدأ رحلتك\nبذكاء',
    visualSub:
      'مع حساب blujet، احجز أسرع، اجمع نقاطًا، واستمتع بالاسترداد النقدي ومزايا نادي العملاء.',
    errSendCode: 'خطأ في إرسال الرمز.',
    errInvalidCode: 'رمز غير صالح.',
    errPhone: 'رقم الهاتف غير صالح؛ يجب أن يبدأ بـ 09 ويتكون من 11 رقمًا.',
    errName: 'أدخل اسمك الكامل.',
    errTerms: 'يجب الموافقة على الشروط والأحكام للمتابعة.',
  },
};

export default function CustomerLoginPage() {
  const { status, user, requestOtp, verifyOtp } = useAuth();
  const { locale, setLocale } = useLocale();
  const t = STR[locale];
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: string } };
  const [searchParams] = useSearchParams();

  const [mode, setMode] = useState<'login' | 'signup'>(() =>
    searchParams.get('mode') === 'signup' ? 'signup' : 'login',
  );
  const [phase, setPhase] = useState<'id' | 'otp'>('id');
  const [phone, setPhone] = useState('');
  const [fullName, setFullName] = useState('');
  const [terms, setTerms] = useState(false);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [otp, setOtp] = useState<string[]>(() => Array.from({ length: OTP_LEN }, () => ''));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useCountdown();
  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);

  const destination = location.state?.from ?? '/';
  const isRtl = locale !== 'en';
  const isLogin = mode === 'login';
  const phoneValid = phoneOk(phone);
  const nameMin = locale === 'en' ? 2 : 3;
  const canSend =
    phoneValid && (isLogin || (fullName.trim().length >= nameMin && terms));
  const otpCode = otp.join('');
  const otpOk = otp.every((d) => d !== '');

  useEffect(() => {
    if (status === 'authenticated' && user?.role === 'USER') navigate(destination, { replace: true });
  }, [status, user, navigate, destination]);

  function resetToId() {
    setPhase('id');
    setChallengeId(null);
    setOtp(Array.from({ length: OTP_LEN }, () => ''));
    setError(null);
  }

  async function sendOtp() {
    setError(null);
    if (!phoneValid) {
      setError(t.errPhone);
      return;
    }
    if (!isLogin && fullName.trim().length < nameMin) {
      setError(t.errName);
      return;
    }
    if (!isLogin && !terms) {
      setError(t.errTerms);
      return;
    }
    setBusy(true);
    try {
      const id = await requestOtp!(phone.trim());
      setChallengeId(id);
      setPhase('otp');
      setOtp(Array.from({ length: OTP_LEN }, () => ''));
      timer.start();
      requestAnimationFrame(() => otpRefs.current[0]?.focus());
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t.errSendCode);
    } finally {
      setBusy(false);
    }
  }

  async function onConfirm(e: React.FormEvent) {
    e.preventDefault();
    if (!challengeId || !otpOk) return;
    setError(null);
    setBusy(true);
    try {
      await verifyOtp!(challengeId, otpCode);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t.errInvalidCode);
    } finally {
      setBusy(false);
    }
  }

  function onOtpChange(index: number, raw: string) {
    const digit = latinDigits(raw).replace(/\D/g, '').slice(-1);
    const next = otp.slice();
    next[index] = digit;
    setOtp(next);
    if (digit && index < OTP_LEN - 1) otpRefs.current[index + 1]?.focus();
  }

  function onOtpKeyDown(index: number, key: string) {
    if (key === 'Backspace' && !otp[index] && index > 0) otpRefs.current[index - 1]?.focus();
  }

  const phoneHint = phone === '' ? t.phoneHintEmpty : phoneValid ? t.phoneHintOk : t.phoneHintBad;
  const phoneHintColor = phone === '' ? '#9aa7b8' : phoneValid ? '#1f8a5b' : '#d64545';
  const title = phase === 'otp' ? t.titleOtp : isLogin ? t.titleLogin : t.titleSignup;
  const subtitle = phase === 'otp' ? t.subtitleOtp : isLogin ? t.subtitleLogin : t.subtitleSignup;
  const displayPhone = localeDigits(phone, locale);

  const pillLink: React.CSSProperties = {
    display: 'inline-flex',
    textDecoration: 'none',
    fontSize: 11.5,
    color: '#8a96a6',
    fontWeight: 700,
    border: '1.5px solid #e6ebf2',
    borderRadius: 100,
    padding: '8px 12px',
    whiteSpace: 'nowrap',
    alignItems: 'center',
  };

  return (
    <div
      data-testid="customer-login-page"
      dir={isRtl ? 'rtl' : 'ltr'}
      style={{
        fontFamily: FONT[locale],
        color: '#16202e',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: isMobile ? 16 : 26,
        background: '#ffffff',
        boxSizing: 'border-box',
      }}
    >
      <style>{`
        @keyframes planeFloat {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-16px) rotate(-1.5deg); }
        }
        .signin-plane { animation: planeFloat 7s ease-in-out infinite; }
        .signin-input:focus { outline: none; border-color: ${ACCENT} !important; background: #f3f7fc !important; }
      `}</style>

      <div
        style={{
          width: 980,
          maxWidth: '100%',
          background: '#fff',
          borderRadius: 26,
          overflow: 'hidden',
          boxShadow: '0 50px 110px -38px rgba(13,38,102,.4)',
          border: '1px solid #e4edf8',
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1fr 400px',
        }}
      >
        {/* Form column */}
        <div
          style={{
            padding: isMobile ? '26px 22px 22px' : '34px 40px 28px',
            display: 'flex',
            flexDirection: 'column',
            minHeight: isMobile ? undefined : 560,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, gap: 10 }}>
            <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none', color: '#16202e' }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 11,
                  background: ACCENT,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontSize: 18,
                }}
              >
                ✈
              </div>
              <span style={{ fontWeight: 900, fontSize: 19 }}>blujet</span>
            </Link>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button
                type="button"
                data-testid="signin-lang"
                onClick={() => setLocale(cycleLocale(locale))}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: 'pointer',
                  color: '#5a6678',
                  border: '1.5px solid #e2e7ee',
                  borderRadius: 20,
                  padding: '7px 13px',
                  fontSize: 12,
                  fontWeight: 700,
                  background: '#fff',
                  fontFamily: 'inherit',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M3 12h18M12 3c2.5 2.5 4 5.7 4 9s-1.5 6.5-4 9c-2.5-2.5-4-5.7-4-9s1.5-6.5 4-9z" />
                </svg>
                {t.langLabel}
              </button>
              <Link to="/forgot-password" data-testid="signin-forgot" style={pillLink}>
                {t.forgotLabel}
              </Link>
              <Link to="/agency/login" data-testid="signin-agency-link" style={pillLink}>
                {t.agencyLoginLink}
              </Link>
              {isMobile && (
                <Link
                  to="/"
                  aria-label="close"
                  style={{
                    display: 'flex',
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    background: '#f3f5f8',
                    color: '#5a6678',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 18,
                    textDecoration: 'none',
                  }}
                >
                  ×
                </Link>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 21, borderBottom: '1.5px solid #eef1f5', marginBottom: 24 }}>
            {(
              [
                ['login', t.tabLogin],
                ['signup', t.tabSignup],
              ] as const
            ).map(([m, lbl]) => (
              <span
                key={m}
                data-testid={`signin-tab-${m}`}
                onClick={() => {
                  setMode(m);
                  resetToId();
                }}
                style={{
                  paddingBottom: 11,
                  fontSize: 14.5,
                  fontWeight: 800,
                  cursor: 'pointer',
                  color: mode === m ? ACCENT : '#9aa4b2',
                  borderBottom: `3px solid ${mode === m ? ACCENT : 'transparent'}`,
                  marginBottom: -1.5,
                }}
              >
                {lbl}
              </span>
            ))}
          </div>

          <h1 style={{ fontSize: 22, fontWeight: 900, margin: '0 0 8px' }}>{title}</h1>
          <p style={{ fontSize: 12.5, color: '#7d8ba0', margin: '0 0 22px', lineHeight: 2 }}>{subtitle}</p>

          {error && (
            <p
              role="alert"
              style={{
                marginBottom: 14,
                borderRadius: 12,
                background: '#fef2f2',
                padding: '10px 12px',
                fontSize: 12,
                color: '#e5484d',
              }}
            >
              {error}
            </p>
          )}

          {phase === 'id' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void sendOtp();
              }}
              style={{ display: 'flex', flexDirection: 'column', gap: 15 }}
            >
              {!isLogin && (
                <div>
                  <div style={{ fontSize: 12, color: '#42506a', fontWeight: 700, marginBottom: 8 }}>{t.fullNameLabel}</div>
                  <input
                    data-testid="signup-name"
                    className="signin-input"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder={t.namePlaceholder}
                    style={{
                      width: '100%',
                      height: 52,
                      border: '1.5px solid #dfe6ef',
                      borderRadius: 13,
                      background: '#fafbfd',
                      padding: '0 14px',
                      fontSize: 13.5,
                      color: '#16202e',
                      boxSizing: 'border-box',
                      fontFamily: 'inherit',
                    }}
                  />
                </div>
              )}

              <div>
                <div style={{ fontSize: 12, color: '#42506a', fontWeight: 700, marginBottom: 8 }}>{t.mobileLabel}</div>
                <div style={{ position: 'relative' }}>
                  <input
                    data-testid="signin-phone"
                    className="signin-input"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    dir="ltr"
                    value={phone}
                    onChange={(e) => setPhone(sanitizeMobileInput(e.target.value))}
                    placeholder="0912 345 6789"
                    maxLength={11}
                    style={{
                      width: '100%',
                      height: 54,
                      border: '1.5px solid #dfe6ef',
                      borderRadius: 13,
                      background: '#fafbfd',
                      padding: '0 16px 0 52px',
                      fontSize: 16,
                      fontWeight: 700,
                      letterSpacing: 1,
                      color: '#16202e',
                      boxSizing: 'border-box',
                      fontFamily: 'inherit',
                    }}
                  />
                  <span
                    dir="ltr"
                    style={{
                      position: 'absolute',
                      left: 14,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      fontSize: 12,
                      color: '#9aa7b8',
                      fontWeight: 700,
                      pointerEvents: 'none',
                    }}
                  >
                    +98
                  </span>
                </div>
                <div style={{ fontSize: 11, color: phoneHintColor, marginTop: 7, fontWeight: 600 }}>{phoneHint}</div>
              </div>

              {!isLogin && (
                <label
                  style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: '#3b4554', cursor: 'pointer' }}
                >
                  <span
                    onClick={() => setTerms((v) => !v)}
                    data-testid="signup-terms"
                    role="checkbox"
                    aria-checked={terms}
                    style={{
                      width: 19,
                      height: 19,
                      border: `1.5px solid ${terms ? ACCENT : '#ccd3dd'}`,
                      borderRadius: 6,
                      flex: 'none',
                      background: terms ? ACCENT : '#fff',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 11,
                    }}
                  >
                    {terms ? '✓' : ''}
                  </span>
                  <span>
                    <Link to="/travel-info" style={{ color: ACCENT, fontWeight: 700, textDecoration: 'none' }}>
                      {t.termsLink}
                    </Link>{' '}
                    {t.termsSuffix}
                  </span>
                </label>
              )}

              <button
                type="submit"
                data-testid="signin-request"
                disabled={busy || !canSend}
                style={{
                  height: 56,
                  borderRadius: 13,
                  border: 'none',
                  background: canSend && !busy ? ACCENT : '#c3cedd',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 15,
                  fontWeight: 800,
                  cursor: canSend && !busy ? 'pointer' : 'not-allowed',
                  boxShadow: canSend && !busy ? '0 14px 30px -12px rgba(22,104,196,.65)' : 'none',
                  fontFamily: 'inherit',
                  width: '100%',
                }}
              >
                {isLogin ? t.sendLogin : t.sendSignup}
              </button>
            </form>
          )}

          {phase === 'otp' && (
            <form onSubmit={(e) => void onConfirm(e)} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <div style={{ fontSize: 12, color: '#42506a', fontWeight: 700, marginBottom: 10 }}>
                  {t.otpSentPrefix}{' '}
                  <span dir="ltr" style={{ color: ACCENT }}>
                    {displayPhone}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 10, direction: 'ltr' }}>
                  {otp.map((digit, i) => (
                    <input
                      key={i}
                      ref={(el) => {
                        otpRefs.current[i] = el;
                      }}
                      data-testid={i === 0 ? 'signin-code' : `signin-otp-${i}`}
                      type="tel"
                      inputMode="numeric"
                      autoComplete={i === 0 ? 'one-time-code' : 'off'}
                      maxLength={1}
                      value={digit}
                      onChange={(e) => onOtpChange(i, e.target.value)}
                      onKeyDown={(e) => onOtpKeyDown(i, e.key)}
                      className="signin-input"
                      style={{
                        flex: 1,
                        width: '100%',
                        height: 60,
                        border: `1.5px solid ${digit ? ACCENT : '#dfe6ef'}`,
                        borderRadius: 13,
                        background: digit ? '#f3f7fc' : '#fafbfd',
                        textAlign: 'center',
                        fontSize: 22,
                        fontWeight: 800,
                        color: '#16202e',
                        padding: 0,
                        fontFamily: 'inherit',
                      }}
                    />
                  ))}
                </div>
              </div>
              {(import.meta.env.DEV || import.meta.env.VITE_SANDBOX_AUTH === 'true') && (
                <p data-testid="signin-dev-otp-hint" style={{ margin: 0, fontSize: 11, color: '#6b7585', textAlign: 'center' }}>
                  {locale === 'en' ? 'Dev OTP code: 123456' : locale === 'ar' ? 'رمز الاختبار: ١٢٣٤٥٦' : 'کد توسعه (OTP): ۱۲۳۴۵۶'}
                </p>
              )}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
                <button
                  type="button"
                  onClick={resetToId}
                  style={{
                    border: 'none',
                    background: 'none',
                    color: '#8a96a6',
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    padding: 0,
                  }}
                >
                  {t.editPhone}
                </button>
                {timer.left > 0 ? (
                  <span data-testid="signin-resend-timer" style={{ color: '#6b7787', fontWeight: 700 }}>
                    {t.resendIn} ({fmtTimer(timer.left, locale)})
                  </span>
                ) : (
                  <button
                    type="button"
                    data-testid="signin-resend"
                    onClick={() => void sendOtp()}
                    style={{
                      border: 'none',
                      background: 'none',
                      color: ACCENT,
                      fontWeight: 800,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      padding: 0,
                    }}
                  >
                    {t.resend}
                  </button>
                )}
              </div>
              <button
                type="submit"
                data-testid="signin-verify"
                disabled={busy || !otpOk}
                style={{
                  height: 56,
                  borderRadius: 13,
                  border: 'none',
                  background: otpOk && !busy ? ACCENT : '#c3cedd',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 15,
                  fontWeight: 800,
                  cursor: otpOk && !busy ? 'pointer' : 'not-allowed',
                  boxShadow: otpOk && !busy ? '0 14px 30px -12px rgba(22,104,196,.65)' : 'none',
                  fontFamily: 'inherit',
                  width: '100%',
                }}
              >
                {isLogin ? t.confirmLogin : t.confirmSignup}
              </button>
            </form>
          )}

          <div
            style={{
              marginTop: 'auto',
              paddingTop: 24,
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              fontSize: 11,
              color: '#9aa7b8',
              fontWeight: 600,
            }}
          >
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#1f8a5b', flex: 'none' }} />
            {t.secureNote}
          </div>
        </div>

        {/* Visual panel */}
        {!isMobile && (
          <div
            style={{
              background: `linear-gradient(160deg,#0d2640,${ACCENT})`,
              position: 'relative',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
              padding: '30px 28px',
              minHeight: 560,
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: -80,
                left: -60,
                width: 260,
                height: 260,
                borderRadius: '50%',
                background: '#ffffff14',
              }}
            />
            <div
              style={{
                position: 'absolute',
                top: 130,
                right: -50,
                width: 150,
                height: 150,
                borderRadius: '50%',
                background: '#ffffff0d',
              }}
            />
            <svg
              viewBox="0 0 400 600"
              preserveAspectRatio="none"
              aria-hidden
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.5 }}
            >
              <path
                d="M 430 560 C 300 430, 210 320, 60 150"
                fill="none"
                stroke="rgba(255,255,255,.55)"
                strokeWidth="2"
                strokeDasharray="2 12"
                strokeLinecap="round"
              />
            </svg>
            <img
              src="/signin-aircraft.png"
              alt=""
              className="signin-plane"
              style={{
                position: 'absolute',
                top: '11%',
                left: '-24%',
                width: '150%',
                filter: 'drop-shadow(0 30px 40px rgba(5,18,36,.45))',
                pointerEvents: 'none',
              }}
            />
            <div style={{ position: 'relative', color: '#fff', zIndex: 1 }}>
              <div style={{ fontSize: 21, fontWeight: 900, lineHeight: 1.7, marginBottom: 10, whiteSpace: 'pre-line' }}>
                {t.visualTitle}
              </div>
              <p style={{ fontSize: 12, color: '#d6e4f7', lineHeight: 2.1, margin: 0 }}>{t.visualSub}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
