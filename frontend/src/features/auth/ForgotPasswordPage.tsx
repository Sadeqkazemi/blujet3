import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { setPassword as apiSetPassword } from '../../api/auth';
import { ApiRequestError } from '../../api/envelope';
import { faDigits } from '../../lib/fa-format';
import { useLocale, type StoredLocale } from '../../hooks/useLocale';
import { DIR, FONT } from '../../lib/i18n';

// فراموشی رمز — visual parity with design-reference-v2/فراموشی رمز.dc.html.
// Backend unchanged (Phase 51): phone OTP + email reset in every locale.
// OTP cells are 6-digit to match the real backend (design mock shows 5).

const RESEND_SECONDS = 120;
const OTP_LEN = 6;

type Method = 'phone' | 'email';
type Step = 'id' | 'code' | 'password' | 'done';

const inputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  height: 56,
  border: '1.5px solid #dfe6ef',
  borderRadius: 13,
  background: '#fafbfd',
  padding: '0 16px',
  fontFamily: 'inherit',
  fontSize: 15,
  fontWeight: 600,
  color: '#16202e',
  outline: 'none',
};

const STR: Record<
  StoredLocale,
  {
    stepPhone: string;
    stepEmail: string;
    stepCode: string;
    stepPassword: string;
    titleIdPhone: string;
    titleIdEmail: string;
    titleCode: string;
    titlePassword: string;
    subtitleIdPhone: string;
    subtitleIdEmail: string;
    subtitleCodePhone: string;
    subtitleCodeEmail: string;
    subtitlePassword: string;
    methodPhone: string;
    methodEmail: string;
    phoneLabel: string;
    emailLabel: string;
    phonePlaceholder: string;
    emailPlaceholder: string;
    phoneHintExample: string;
    phoneHintOk: string;
    phoneHintBad: string;
    sendCode: string;
    confirmCode: string;
    resendQuestion: string;
    resendNow: string;
    resendIn: string;
    editPhone: string;
    editEmail: string;
    otpSentPhone: string;
    otpSentEmail: string;
    newPasswordLabel: string;
    newPasswordPlaceholder: string;
    repeatPasswordLabel: string;
    repeatPasswordPlaceholder: string;
    strengthEmpty: string;
    strengthLabels: [string, string, string, string];
    savePassword: string;
    doneTitle: string;
    doneBody: string;
    loginBtn: string;
    backToLogin: string;
    secureNote: string;
    visualTitle: string;
    visualSub: string;
    errShort: string;
    errMismatch: string;
    errSendPhone: string;
    errSendEmail: string;
    errCode: string;
    errSave: string;
    p2Mismatch: string;
  }
> = {
  fa: {
    stepPhone: 'شماره موبایل',
    stepEmail: 'ایمیل',
    stepCode: 'کد تأیید',
    stepPassword: 'رمز جدید',
    titleIdPhone: 'بازیابی رمز عبور',
    titleIdEmail: 'بازیابی رمز عبور',
    titleCode: 'کد تأیید را وارد کن',
    titlePassword: 'رمز عبور جدید بساز',
    subtitleIdPhone: 'شماره موبایل حساب‌ات را وارد کن تا کد بازیابی برایت پیامک شود.',
    subtitleIdEmail: 'ایمیل تأییدشدهٔ حساب خود را وارد کنید تا کد بازیابی برایتان ایمیل شود.',
    subtitleCodePhone: 'کد ۶ رقمی به موبایلت ارسال شد. وارد کردن کد، هویتت را تأیید می‌کند.',
    subtitleCodeEmail: 'کد ۶ رقمی به ایمیلت ارسال شد. وارد کردن کد، هویتت را تأیید می‌کند.',
    subtitlePassword: 'یک رمز قوی انتخاب کن؛ ترکیبی از حرف، عدد و نماد بهترین است.',
    methodPhone: 'موبایل',
    methodEmail: 'ایمیل',
    phoneLabel: 'شماره موبایل',
    emailLabel: 'ایمیل حساب',
    phonePlaceholder: '0912 345 6789',
    emailPlaceholder: 'name@email.com',
    phoneHintExample: 'مثال: ۰۹۱۲۳۴۵۶۷۸۹',
    phoneHintOk: '✓ شماره معتبر است',
    phoneHintBad: 'شماره باید با ۰۹ شروع شود و ۱۱ رقم باشد',
    sendCode: 'ارسال کد بازیابی',
    confirmCode: 'تأیید کد',
    resendQuestion: 'کد را دریافت نکردید؟',
    resendNow: 'ارسال مجدد',
    resendIn: 'ارسال مجدد',
    editPhone: '✎ ویرایش شماره',
    editEmail: '✎ ویرایش ایمیل',
    otpSentPhone: 'کد ۶ رقمی پیامک‌شده به',
    otpSentEmail: 'کد ۶ رقمی ارسال‌شده به',
    newPasswordLabel: 'رمز عبور جدید',
    newPasswordPlaceholder: 'حداقل ۸ کاراکتر',
    repeatPasswordLabel: 'تکرار رمز عبور',
    repeatPasswordPlaceholder: 'تکرار همان رمز',
    strengthEmpty: 'قدرت رمز',
    strengthLabels: ['ضعیف — حداقل ۸ کاراکتر', 'قابل قبول', 'خوب', 'عالی'],
    savePassword: 'ذخیره رمز جدید',
    doneTitle: 'رمز عبور با موفقیت تغییر کرد',
    doneBody: 'اکنون می‌توانید با رمز جدید وارد حساب خود شوید.',
    loginBtn: 'ورود به حساب',
    backToLogin: '‹ صفحه ورود',
    secureNote: 'ارتباط امن — اطلاعات شما رمزنگاری می‌شود',
    visualTitle: 'بازیابی سریع و امن\nحساب کاربری',
    visualSub: 'در سه گام کوتاه، دوباره به سفرهایت برگرد — شماره‌ات را بده، کد را تأیید کن و رمز تازه بساز.',
    errShort: 'رمز عبور باید حداقل ۸ کاراکتر باشد.',
    errMismatch: 'تکرار رمز با رمز جدید یکسان نیست.',
    errSendPhone: 'خطا در ارسال کد بازیابی.',
    errSendEmail: 'خطا در ارسال کد بازیابی به ایمیل.',
    errCode: 'کد وارد شده نادرست است.',
    errSave: 'خطا در ذخیره رمز عبور.',
    p2Mismatch: 'رمزها یکسان نیستند',
  },
  en: {
    stepPhone: 'Mobile',
    stepEmail: 'Email',
    stepCode: 'Code',
    stepPassword: 'New password',
    titleIdPhone: 'Reset your password',
    titleIdEmail: 'Reset your password',
    titleCode: 'Enter the verification code',
    titlePassword: 'Create a new password',
    subtitleIdPhone: 'Enter your account mobile number to receive a recovery code by SMS.',
    subtitleIdEmail: "Enter your account's verified email to receive a recovery code by email.",
    subtitleCodePhone: 'A 6-digit code was sent to your mobile. Enter it to verify your identity.',
    subtitleCodeEmail: 'A 6-digit code was sent to your email. Enter it to verify your identity.',
    subtitlePassword: 'Choose a strong password — a mix of letters, numbers and symbols works best.',
    methodPhone: 'Mobile',
    methodEmail: 'Email',
    phoneLabel: 'Account Mobile Number',
    emailLabel: 'Account Email',
    phonePlaceholder: '0912 345 6789',
    emailPlaceholder: 'you@gmail.com',
    phoneHintExample: 'Example: 09123456789',
    phoneHintOk: '✓ Looks good',
    phoneHintBad: 'Must start with 09 and be 11 digits',
    sendCode: 'Send Recovery Code',
    confirmCode: 'Verify Code',
    resendQuestion: "Didn't receive the code?",
    resendNow: 'Resend',
    resendIn: 'Resend',
    editPhone: '✎ Edit number',
    editEmail: '✎ Edit email',
    otpSentPhone: '6-digit code sent to',
    otpSentEmail: '6-digit code sent to',
    newPasswordLabel: 'New Password',
    newPasswordPlaceholder: 'At least 8 characters',
    repeatPasswordLabel: 'Confirm Password',
    repeatPasswordPlaceholder: 'Repeat the same password',
    strengthEmpty: 'Password strength',
    strengthLabels: ['Weak — at least 8 characters', 'Fair', 'Good', 'Great'],
    savePassword: 'Save New Password',
    doneTitle: 'Password changed successfully',
    doneBody: 'You can now log in to your account with your new password.',
    loginBtn: 'Log in',
    backToLogin: '‹ Log in',
    secureNote: 'Secure connection — your information is encrypted',
    visualTitle: 'Fast, secure account\nrecovery',
    visualSub: 'Get back to your trips in a few steps — enter your details, verify the code, and set a new password.',
    errShort: 'Password must be at least 8 characters.',
    errMismatch: 'Password confirmation does not match.',
    errSendPhone: 'Error sending the recovery code.',
    errSendEmail: 'Error sending the recovery code by email.',
    errCode: 'The code entered is incorrect.',
    errSave: 'Error saving the new password.',
    p2Mismatch: "Passwords don't match",
  },
  ar: {
    stepPhone: 'رقم الجوال',
    stepEmail: 'البريد الإلكتروني',
    stepCode: 'رمز التحقق',
    stepPassword: 'كلمة مرور جديدة',
    titleIdPhone: 'استعادة تعيين كلمة المرور',
    titleIdEmail: 'استعادة تعيين كلمة المرور',
    titleCode: 'أدخل رمز التحقق',
    titlePassword: 'أنشئ كلمة مرور جديدة',
    subtitleIdPhone: 'أدخل رقم جوالك لنرسل لك رمز استعادة عبر رسالة نصية.',
    subtitleIdEmail: 'أدخل البريد الإلكتروني الموثّق لحسابك ليصلك رمز الاستعادة عبر البريد.',
    subtitleCodePhone: 'تم إرسال رمز مكوّن من 6 أرقام إلى جوالك. أدخله لتأكيد هويتك.',
    subtitleCodeEmail: 'تم إرسال رمز مكوّن من 6 أرقام إلى بريدك. أدخله لتأكيد هويتك.',
    subtitlePassword: 'اختر كلمة مرور قوية؛ مزيج من الأحرف والأرقام والرموز أفضل.',
    methodPhone: 'الجوال',
    methodEmail: 'البريد الإلكتروني',
    phoneLabel: 'رقم جوال الحساب',
    emailLabel: 'البريد الإلكتروني للحساب',
    phonePlaceholder: '0912 345 6789',
    emailPlaceholder: 'name@email.com',
    phoneHintExample: 'مثال: 09123456789',
    phoneHintOk: '✓ الرقم صحيح',
    phoneHintBad: 'يجب أن يبدأ الرقم بـ 09 ويتكون من 11 رقمًا',
    sendCode: 'إرسال رمز الاستعادة',
    confirmCode: 'تأكيد الرمز',
    resendQuestion: 'لم يصلك الرمز؟',
    resendNow: 'إعادة الإرسال',
    resendIn: 'إعادة الإرسال',
    editPhone: '✎ تعديل الرقم',
    editEmail: '✎ تعديل البريد',
    otpSentPhone: 'تم إرسال رمز مكوّن من 6 أرقام إلى',
    otpSentEmail: 'تم إرسال رمز مكوّن من 6 أرقام إلى',
    newPasswordLabel: 'كلمة مرور جديدة',
    newPasswordPlaceholder: '8 أحرف على الأقل',
    repeatPasswordLabel: 'تأكيد كلمة المرور',
    repeatPasswordPlaceholder: 'أعد كتابة نفس كلمة المرور',
    strengthEmpty: 'قوة كلمة المرور',
    strengthLabels: ['ضعيف — 8 أحرف على الأقل', 'مقبول', 'جيد', 'ممتاز'],
    savePassword: 'حفظ كلمة المرور الجديدة',
    doneTitle: 'تم تغيير كلمة المرور بنجاح',
    doneBody: 'يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة.',
    loginBtn: 'تسجيل الدخول',
    backToLogin: '‹ تسجيل الدخول',
    secureNote: 'اتصال آمن — معلوماتك مشفرة',
    visualTitle: 'استعادة سريعة وآمنة\nللحساب',
    visualSub: 'ارجع إلى رحلاتك في خطوات قليلة — أدخل بياناتك، تحقق من الرمز، وأنشئ كلمة مرور جديدة.',
    errShort: 'يجب أن تتكوّن كلمة المرور من ٨ أحرف على الأقل.',
    errMismatch: 'تكرار كلمة المرور غير مطابق.',
    errSendPhone: 'خطأ في إرسال رمز الاستعادة.',
    errSendEmail: 'خطأ في إرسال رمز الاستعادة عبر البريد الإلكتروني.',
    errCode: 'الرمز المُدخل غير صحيح.',
    errSave: 'خطأ في حفظ كلمة المرور الجديدة.',
    p2Mismatch: 'كلمتا المرور غير متطابقتين',
  },
};

function normalizePhone(raw: string): string {
  return raw
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/\D/g, '')
    .slice(0, 11);
}

function phoneOk(phone: string): boolean {
  return /^09\d{9}$/.test(phone);
}

function emailOk(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function passwordStrength(p1: string): number {
  return (
    (p1.length >= 8 ? 1 : 0) +
    (/[A-Za-z]/.test(p1) && /\d/.test(p1) ? 1 : 0) +
    (p1.length >= 12 || /[^A-Za-z0-9]/.test(p1) ? 1 : 0)
  );
}

function stepIndex(step: Step): number {
  if (step === 'id') return 1;
  if (step === 'code') return 2;
  if (step === 'password') return 3;
  return 4;
}

function btnStyle(ok: boolean, green = false): CSSProperties {
  return {
    height: 56,
    borderRadius: 13,
    border: 'none',
    background: ok ? (green ? '#1f8a5b' : '#1668c4') : '#c3cedd',
    color: '#fff',
    fontSize: 15,
    fontWeight: 800,
    cursor: ok ? 'pointer' : 'not-allowed',
    boxShadow: ok
      ? green
        ? '0 14px 30px -12px rgba(31,138,91,.6)'
        : '0 14px 30px -12px rgba(22,104,196,.65)'
      : 'none',
    fontFamily: 'inherit',
    width: '100%',
    transition: 'background .2s',
  };
}

function OtpCells({
  digits,
  onChange,
  onComplete,
}: {
  digits: string[];
  onChange: (next: string[]) => void;
  onComplete?: () => void;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const setDigit = useCallback(
    (index: number, value: string) => {
      const d = value.replace(/[۰-۹]/g, (x) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(x))).replace(/\D/g, '').slice(-1);
      const next = digits.slice();
      next[index] = d;
      onChange(next);
      if (d && index < OTP_LEN - 1) {
        refs.current[index + 1]?.focus();
      }
      if (d && index === OTP_LEN - 1 && next.every((v) => v !== '')) {
        onComplete?.();
      }
    },
    [digits, onChange, onComplete],
  );

  const onKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      refs.current[index - 1]?.focus();
    }
  };

  return (
    <div style={{ display: 'flex', gap: 10, direction: 'ltr' }}>
      {digits.map((v, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          data-testid={`fp-code-cell-${i}`}
          type="tel"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          dir="ltr"
          value={v}
          onChange={(e) => setDigit(i, e.target.value)}
          onKeyDown={(e) => onKeyDown(i, e)}
          style={{
            flex: 1,
            width: '100%',
            height: 60,
            border: `1.5px solid ${v ? '#1668c4' : '#dfe6ef'}`,
            borderRadius: 13,
            background: v ? '#f3f7fc' : '#fafbfd',
            textAlign: 'center',
            fontSize: 22,
            fontWeight: 800,
            color: '#16202e',
            padding: 0,
            outline: 'none',
            fontFamily: 'inherit',
          }}
        />
      ))}
    </div>
  );
}

function VisualPanel({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div
      data-testid="fp-visual-panel"
      style={{
        background: 'linear-gradient(160deg,#0d2640,#1668c4)',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        padding: '30px 28px',
      }}
    >
      <div style={{ position: 'absolute', top: -80, left: -60, width: 260, height: 260, borderRadius: '50%', background: '#ffffff14' }} />
      <div style={{ position: 'absolute', top: 130, right: -50, width: 150, height: 150, borderRadius: '50%', background: '#ffffff0d' }} />
      <svg viewBox="0 0 400 600" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.5 }}>
        <path d="M 430 560 C 300 430, 210 320, 60 150" fill="none" stroke="rgba(255,255,255,.55)" strokeWidth="2" strokeDasharray="2 12" strokeLinecap="round" />
      </svg>
      <svg
        viewBox="0 0 200 80"
        aria-hidden
        style={{
          position: 'absolute',
          top: '11%',
          left: '-10%',
          width: '120%',
          animation: 'fpPlaneFloat 7s ease-in-out infinite',
          filter: 'drop-shadow(0 30px 40px rgba(5,18,36,.45))',
          pointerEvents: 'none',
        }}
      >
        <path
          d="M10 45 L190 35 L160 42 L175 55 L140 50 L120 65 L100 50 L65 55 L80 42 L50 35 Z"
          fill="rgba(255,255,255,0.92)"
        />
        <path d="M95 50 L105 50 L102 58 L98 58 Z" fill="#1668c4" />
      </svg>
      <div style={{ position: 'relative', color: '#fff' }}>
        <div style={{ fontSize: 21, fontWeight: 900, lineHeight: 1.7, marginBottom: 10, whiteSpace: 'pre-line' }}>{title}</div>
        <p style={{ fontSize: 12, color: '#d6e4f7', lineHeight: 2.1, margin: 0 }}>{subtitle}</p>
      </div>
    </div>
  );
}

export default function ForgotPasswordPage() {
  const { requestOtp, verifyOtp, requestPasswordResetEmail, verifyPasswordResetEmail, signOut } = useAuth();
  const { locale, setLocale } = useLocale();
  const t = STR[locale];
  const dir = DIR[locale];
  const font = FONT[locale];

  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width:767px)').matches : false,
  );
  const [method, setMethod] = useState<Method>('phone');
  const [step, setStep] = useState<Step>('id');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [otpDigits, setOtpDigits] = useState<string[]>(() => Array(OTP_LEN).fill(''));
  const [pass1, setPass1] = useState('');
  const [pass2, setPass2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [left, setLeft] = useState(0);

  const code = otpDigits.join('');

  useEffect(() => {
    const mq = window.matchMedia('(max-width:767px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    setIsMobile(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    if (left <= 0) return;
    const timer = setInterval(() => setLeft((v) => v - 1), 1000);
    return () => clearInterval(timer);
  }, [left > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const rawTimer = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
  const timer = locale === 'fa' ? faDigits(rawTimer) : rawTimer;

  const idOk = method === 'phone' ? phoneOk(phone) : emailOk(email);
  const otpOk = otpDigits.every((d) => d !== '');
  const strength = passwordStrength(pass1);
  const passOk = pass1.length >= 8 && pass1 === pass2;

  const st = stepIndex(step);
  const step1Label = method === 'phone' ? t.stepPhone : t.stepEmail;
  const stepLabels = [step1Label, t.stepCode, t.stepPassword];

  const title =
    step === 'id'
      ? method === 'phone'
        ? t.titleIdPhone
        : t.titleIdEmail
      : step === 'code'
        ? t.titleCode
        : step === 'password'
          ? t.titlePassword
          : '';

  const subtitle =
    step === 'id'
      ? method === 'phone'
        ? t.subtitleIdPhone
        : t.subtitleIdEmail
      : step === 'code'
        ? method === 'phone'
          ? t.subtitleCodePhone
          : t.subtitleCodeEmail
        : step === 'password'
          ? t.subtitlePassword
          : '';

  const displayPhone = locale === 'fa' ? faDigits(phone) : phone;

  async function sendCode() {
    setError(null);
    setSubmitting(true);
    try {
      const id =
        method === 'phone' ? await requestOtp!(phone.trim()) : await requestPasswordResetEmail!(email.trim());
      setChallengeId(id);
      setOtpDigits(Array(OTP_LEN).fill(''));
      setStep('code');
      setLeft(RESEND_SECONDS);
    } catch (err) {
      const fallback = method === 'phone' ? t.errSendPhone : t.errSendEmail;
      setError(err instanceof ApiRequestError ? err.message : fallback);
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmCode(e?: React.FormEvent) {
    e?.preventDefault();
    if (!otpOk) return;
    setError(null);
    setSubmitting(true);
    try {
      if (method === 'phone') {
        await verifyOtp!(challengeId, code.trim());
      } else {
        await verifyPasswordResetEmail!(challengeId, code.trim());
      }
      setStep('password');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t.errCode);
    } finally {
      setSubmitting(false);
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    if (pass1.length < 8) {
      setError(t.errShort);
      return;
    }
    if (pass1 !== pass2) {
      setError(t.errMismatch);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await apiSetPassword(pass1);
      await signOut();
      setStep('done');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t.errSave);
    } finally {
      setSubmitting(false);
    }
  }

  const seg = (on: boolean): CSSProperties => ({
    flex: 1,
    textAlign: 'center',
    padding: '8px 0',
    borderRadius: 9,
    fontSize: 12.5,
    fontWeight: on ? 700 : 600,
    color: on ? '#1668c4' : '#6b7585',
    background: on ? '#fff' : 'transparent',
    boxShadow: on ? '0 2px 7px rgba(13,38,102,.14)' : 'none',
    cursor: 'pointer',
  });

  const langLabel = locale === 'en' ? 'EN' : locale === 'ar' ? 'AR' : 'FA';
  const cycleLocale = () => setLocale(locale === 'fa' ? 'en' : locale === 'en' ? 'ar' : 'fa');

  const phoneHint =
    phone === ''
      ? t.phoneHintExample
      : phoneOk(phone)
        ? t.phoneHintOk
        : t.phoneHintBad;
  const phoneHintColor = phone === '' ? '#9aa7b8' : phoneOk(phone) ? '#1f8a5b' : '#d64545';

  const strBar = (level: number) =>
    strength >= level ? (level === 1 ? '#d69b45' : level === 2 ? '#d6c245' : '#1f8a5b') : '#e8edf4';

  return (
    <>
      <style>{`
        @keyframes fpPlaneFloat {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-16px) rotate(-1.5deg); }
        }
        .fp-input:focus {
          outline: none;
          border-color: #1668c4 !important;
          background: #f3f7fc !important;
        }
      `}</style>
      <div
        dir={dir}
        style={{
          fontFamily: font,
          color: '#16202e',
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 26,
          background: '#ffffff',
        }}
      >
        <div
          style={{
            width: 960,
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
          <div
            style={{
              padding: isMobile ? '26px 22px 22px' : '36px 40px 30px',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 26 }}>
              <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none', color: '#16202e' }}>
                <div style={{ width: 40, height: 40, borderRadius: 11, background: '#1668c4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 18 }}>
                  ✈
                </div>
                <span style={{ fontWeight: 900, fontSize: 19 }}>blujet</span>
              </Link>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  type="button"
                  data-testid="fp-lang-switch"
                  onClick={cycleLocale}
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
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M3 12h18M12 3c2.5 2.5 4 5.7 4 9s-1.5 6.5-4 9c-2.5-2.5-4-5.7-4-9s1.5-6.5 4-9z" />
                  </svg>
                  {langLabel}
                </button>
                <Link
                  to="/signin"
                  data-testid="fp-back-login"
                  style={{
                    textDecoration: 'none',
                    fontSize: 11.5,
                    color: '#8a96a6',
                    fontWeight: 700,
                    border: '1.5px solid #e6ebf2',
                    borderRadius: 100,
                    padding: '8px 15px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {t.backToLogin}
                </Link>
              </div>
            </div>

            {step !== 'done' && (
              <div data-testid="fp-stepper" style={{ display: 'flex', gap: 8, marginBottom: 30 }}>
                {stepLabels.map((label, i) => {
                  const idx = i + 1;
                  const active = st === idx;
                  const done = st > idx;
                  return (
                    <div key={label} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
                      <div
                        data-testid={`fp-step-bar-${idx}`}
                        style={{
                          height: 5,
                          borderRadius: 100,
                          background: done ? '#1f8a5b' : active ? '#1668c4' : '#e8edf4',
                        }}
                      />
                      <div
                        style={{
                          fontSize: 10.5,
                          fontWeight: active ? 800 : 600,
                          color: active ? '#16202e' : done ? '#1f8a5b' : '#9aa7b8',
                        }}
                      >
                        {label}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {step !== 'done' && (
              <>
                <h1 style={{ fontSize: 24, fontWeight: 900, margin: '0 0 8px' }}>{title}</h1>
                <p style={{ fontSize: 12.5, color: '#7d8ba0', margin: '0 0 28px', lineHeight: 2 }}>{subtitle}</p>
              </>
            )}

            {error && (
              <p style={{ marginBottom: 14, borderRadius: 10, background: '#fef2f2', padding: 10, fontSize: 12, color: '#e5484d' }}>
                {error}
              </p>
            )}

            {step === 'id' && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void sendCode();
                }}
                style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
              >
                <div style={{ display: 'flex', background: '#eef1f5', borderRadius: 11, padding: 3, marginBottom: 2 }}>
                  <span data-testid="fp-method-phone" onClick={() => setMethod('phone')} style={seg(method === 'phone')}>
                    {t.methodPhone}
                  </span>
                  <span data-testid="fp-method-email" onClick={() => setMethod('email')} style={seg(method === 'email')}>
                    {t.methodEmail}
                  </span>
                </div>
                {method === 'phone' ? (
                  <div>
                    <div style={{ fontSize: 12, color: '#42506a', fontWeight: 700, marginBottom: 8 }}>{t.phoneLabel}</div>
                    <div style={{ position: 'relative' }}>
                      <input
                        data-testid="fp-id"
                        className="fp-input"
                        dir="ltr"
                        value={phone}
                        onChange={(e) => setPhone(normalizePhone(e.target.value))}
                        placeholder={t.phonePlaceholder}
                        maxLength={11}
                        style={{ ...inputStyle, paddingLeft: 52, fontSize: 16, fontWeight: 700, letterSpacing: 1 }}
                      />
                      <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#9aa7b8', fontWeight: 700 }}>
                        +98
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: phoneHintColor, marginTop: 7, fontWeight: 600 }}>{phoneHint}</div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: 12, color: '#42506a', fontWeight: 700, marginBottom: 8 }}>{t.emailLabel}</div>
                    <input
                      data-testid="fp-email"
                      className="fp-input"
                      dir="ltr"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={t.emailPlaceholder}
                      style={inputStyle}
                    />
                  </div>
                )}
                <button
                  type="submit"
                  data-testid="fp-send"
                  disabled={!idOk || submitting}
                  style={btnStyle(idOk && !submitting)}
                >
                  {t.sendCode}
                </button>
              </form>
            )}

            {step === 'code' && (
              <form onSubmit={(e) => void confirmCode(e)} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 12, color: '#42506a', fontWeight: 700, marginBottom: 10 }}>
                    {method === 'phone' ? t.otpSentPhone : t.otpSentEmail}{' '}
                    <span dir="ltr" style={{ color: '#1668c4' }}>
                      {method === 'phone' ? displayPhone : email}
                    </span>
                  </div>
                  <OtpCells digits={otpDigits} onChange={setOtpDigits} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
                  <span
                    data-testid="fp-edit-id"
                    onClick={() => {
                      setStep('id');
                      setOtpDigits(Array(OTP_LEN).fill(''));
                    }}
                    style={{ color: '#8a96a6', fontWeight: 700, cursor: 'pointer' }}
                  >
                    {method === 'phone' ? t.editPhone : t.editEmail}
                  </span>
                  {left > 0 ? (
                    <span style={{ color: '#6b7787', fontWeight: 700 }}>
                      {t.resendIn} ({timer})
                    </span>
                  ) : (
                    <span
                      data-testid="fp-resend"
                      onClick={() => void sendCode()}
                      style={{ color: '#1668c4', fontWeight: 800, cursor: 'pointer' }}
                    >
                      {t.resendNow}
                    </span>
                  )}
                </div>
                <button type="submit" data-testid="fp-verify" disabled={!otpOk || submitting} style={btnStyle(otpOk && !submitting)}>
                  {t.confirmCode}
                </button>
              </form>
            )}

            {step === 'password' && (
              <form onSubmit={(e) => void savePassword(e)} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 12, color: '#42506a', fontWeight: 700, marginBottom: 8 }}>{t.newPasswordLabel}</div>
                  <input
                    type="password"
                    data-testid="fp-pass1"
                    className="fp-input"
                    dir="ltr"
                    value={pass1}
                    onChange={(e) => setPass1(e.target.value)}
                    placeholder={t.newPasswordPlaceholder}
                    style={inputStyle}
                  />
                  <div style={{ display: 'flex', gap: 5, marginTop: 9 }}>
                    <span data-testid="fp-strength-1" style={{ flex: 1, height: 4, borderRadius: 100, background: strBar(1) }} />
                    <span data-testid="fp-strength-2" style={{ flex: 1, height: 4, borderRadius: 100, background: strBar(2) }} />
                    <span data-testid="fp-strength-3" style={{ flex: 1, height: 4, borderRadius: 100, background: strBar(3) }} />
                  </div>
                  <div data-testid="fp-strength-label" style={{ fontSize: 11, color: '#9aa7b8', marginTop: 6, fontWeight: 600 }}>
                    {pass1 === '' ? t.strengthEmpty : t.strengthLabels[strength]}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: '#42506a', fontWeight: 700, marginBottom: 8 }}>{t.repeatPasswordLabel}</div>
                  <input
                    type="password"
                    data-testid="fp-pass2"
                    className="fp-input"
                    dir="ltr"
                    value={pass2}
                    onChange={(e) => setPass2(e.target.value)}
                    placeholder={t.repeatPasswordPlaceholder}
                    style={{
                      ...inputStyle,
                      borderColor: pass2 && pass1 !== pass2 ? '#d64545' : '#dfe6ef',
                    }}
                  />
                  <div style={{ fontSize: 11, color: '#d64545', marginTop: 6, fontWeight: 600, minHeight: 14 }}>
                    {pass2 && pass1 !== pass2 ? t.p2Mismatch : ''}
                  </div>
                </div>
                <button type="submit" data-testid="fp-save" disabled={!passOk || submitting} style={btnStyle(passOk && !submitting, true)}>
                  {t.savePassword}
                </button>
              </form>
            )}

            {step === 'done' && (
              <div data-testid="fp-done" style={{ textAlign: 'center', padding: '14px 0 6px' }}>
                <div
                  style={{
                    width: 78,
                    height: 78,
                    borderRadius: '50%',
                    background: '#e8f5ee',
                    color: '#1f8a5b',
                    fontSize: 34,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 18px',
                  }}
                >
                  ✓
                </div>
                <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 9 }}>{t.doneTitle}</div>
                <p style={{ fontSize: 12.5, color: '#7d8ba0', lineHeight: 2, margin: '0 0 24px' }}>{t.doneBody}</p>
                <Link
                  to="/signin"
                  style={{
                    textDecoration: 'none',
                    display: 'flex',
                    height: 56,
                    borderRadius: 13,
                    background: '#1668c4',
                    color: '#fff',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 14.5,
                    fontWeight: 800,
                    boxShadow: '0 14px 30px -12px rgba(22,104,196,.65)',
                  }}
                >
                  {t.loginBtn}
                </Link>
              </div>
            )}

            <div
              data-testid="fp-secure-note"
              style={{
                marginTop: 'auto',
                paddingTop: 26,
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                fontSize: 11,
                color: '#9aa7b8',
                fontWeight: 600,
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#1f8a5b' }} />
              {t.secureNote}
            </div>
          </div>

          {!isMobile && <VisualPanel title={t.visualTitle} subtitle={t.visualSub} />}
        </div>
      </div>
    </>
  );
}
