import { useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { ApiRequestError } from '../../api/envelope';
import { requestAgencySignupOtp, submitAgencyRequest } from '../../api/agencies';
import {
  requestAgencyFirstLogin,
  requestAgencyPasswordReset,
  setPassword as apiSetPassword,
  verifyAgencyPasswordReset,
} from '../../api/auth';
import { AgencyLoginLayout, AGENCY_LOGIN_GOLD, AGENCY_LOGIN_NAVY } from './AgencyLoginLayout';
import { useLocale, type StoredLocale } from '../../hooks/useLocale';
import { localeDigits } from '../../lib/locale-format';

const GOLD = AGENCY_LOGIN_GOLD;
const NAVY = AGENCY_LOGIN_NAVY;
const OTP_LEN = 6;
const LOCAL_DEMO_AGENCY = {
  phone: '09120000002',
  password: 'Blujet@1404',
} as const;

const STR: Record<
  StoredLocale,
  {
    tabLogin: string;
    tabSignup: string;
    titleLogin: string;
    titleSignup: string;
    titleOtp: string;
    subtitleLogin: string;
    subtitleSignup: string;
    phoneLabel: string;
    passwordLabel: string;
    loginRequiredError: string;
    loginFailedFallback: string;
    loginChecking: string;
    loginSubmit: string;
    agencyNameLabel: string;
    agencyNamePlaceholder: string;
    licenseLabel: string;
    managerLabel: string;
    managerPlaceholder: string;
    phoneMobileLabel: string;
    phoneHintEmpty: string;
    phoneHintOk: string;
    phoneHintBad: string;
    termsLinkLabel: string;
    termsSuffix: string;
    signupIncompleteError: string;
    signupSendCodeFallback: string;
    signupSending: string;
    signupSubmit: string;
    otpLabel: (phone: string) => string;
    otpIncompleteError: string;
    otpSubmitFallback: string;
    otpSubmitting: string;
    otpConfirm: string;
    editPhone: string;
    resend: string;
    doneTitle: string;
    agencyNote: string;
    secureNote: string;
    personalLoginLink: string;
    forgotPassword: string;
    forgotTitle: string;
    forgotSub: string;
    forgotSendCode: string;
    forgotConfirmCode: string;
    forgotNewPassword: string;
    forgotRepeatPassword: string;
    forgotSave: string;
    forgotDone: string;
    forgotBack: string;
    forgotIncompletePhone: string;
    forgotIncompleteOtp: string;
    forgotShortPassword: string;
    forgotMismatch: string;
    forgotSendFallback: string;
    forgotVerifyFallback: string;
    forgotSaveFallback: string;
  }
> = {
  fa: {
    tabLogin: 'ورود',
    tabSignup: 'ثبت‌نام آژانس',
    titleLogin: 'ورود آژانس همکار',
    titleSignup: 'ثبت‌نام آژانس',
    titleOtp: 'کد تأیید را وارد کن',
    subtitleLogin: 'با شماره موبایل ثبت‌شده‌ی آژانس وارد پنل B2B شوید.',
    subtitleSignup: 'اطلاعات آژانس را وارد کنید تا درخواست همکاری با blujet ثبت شود.',
    phoneLabel: 'شماره تماس آژانس',
    passwordLabel: 'رمز عبور',
    loginRequiredError: 'شماره تماس و رمز عبور را وارد کنید.',
    loginFailedFallback: 'خطا در ورود. دوباره تلاش کنید.',
    loginChecking: 'در حال بررسی…',
    loginSubmit: 'ورود به پنل آژانس',
    agencyNameLabel: 'نام آژانس',
    agencyNamePlaceholder: 'نام شرکت/آژانس',
    licenseLabel: 'شماره مجوز بند ب',
    managerLabel: 'نام مدیر آژانس',
    managerPlaceholder: 'نام مسئول',
    phoneMobileLabel: 'شماره موبایل آژانس',
    phoneHintEmpty: 'مثال: ۰۹۱۲۳۴۵۶۷۸۹',
    phoneHintOk: '✓ شماره معتبر است',
    phoneHintBad: 'شماره باید با ۰۹ شروع شود و ۱۱ رقم باشد',
    termsLinkLabel: 'قوانین و مقررات',
    termsSuffix: 'و ضوابط همکاری B2B blujet را می‌پذیرم.',
    signupIncompleteError: 'همهٔ فیلدها را کامل و شرایط را تأیید کنید.',
    signupSendCodeFallback: 'خطا در ارسال کد تأیید.',
    signupSending: 'در حال ارسال…',
    signupSubmit: 'ثبت درخواست و دریافت کد',
    otpLabel: (phone) => `کد تأیید ۶ رقمی (پیامک‌شده به ${phone})`,
    otpIncompleteError: 'کد ۶ رقمی را کامل وارد کنید.',
    otpSubmitFallback: 'خطا در ثبت درخواست.',
    otpSubmitting: 'در حال ثبت…',
    otpConfirm: 'تأیید و ثبت درخواست',
    editPhone: '✎ ویرایش شماره',
    resend: 'ارسال مجدد کد',
    doneTitle: 'درخواست همکاری شما ثبت شد.',
    agencyNote:
      'حساب آژانس پس از تأیید مدارک و مجوز فعالیت توسط کارشناسان blujet فعال می‌شود و به نرخ‌های ویژه B2B و کمیسیون دسترسی خواهید داشت.',
    secureNote: 'ورود امن با کد یک‌بارمصرف',
    personalLoginLink: 'ورود کاربر عادی ←',
    forgotPassword: 'فراموشی رمز عبور؟',
    forgotTitle: 'بازیابی رمز عبور آژانس',
    forgotSub: 'شماره تماس ثبت‌شدهٔ آژانس را وارد کنید تا کد تأیید پیامک شود.',
    forgotSendCode: 'ارسال کد تأیید',
    forgotConfirmCode: 'تأیید کد',
    forgotNewPassword: 'رمز عبور جدید',
    forgotRepeatPassword: 'تکرار رمز عبور',
    forgotSave: 'ذخیره رمز جدید',
    forgotDone: 'رمز عبور با موفقیت تغییر کرد. اکنون می‌توانید وارد شوید.',
    forgotBack: 'بازگشت به ورود',
    forgotIncompletePhone: 'شماره موبایل معتبر وارد کنید.',
    forgotIncompleteOtp: 'کد ۶ رقمی را کامل وارد کنید.',
    forgotShortPassword: 'رمز عبور باید حداقل ۸ کاراکتر باشد.',
    forgotMismatch: 'تکرار رمز با رمز جدید یکسان نیست.',
    forgotSendFallback: 'خطا در ارسال کد تأیید.',
    forgotVerifyFallback: 'کد وارد شده نادرست است.',
    forgotSaveFallback: 'خطا در ذخیره رمز عبور.',
  },
  en: {
    tabLogin: 'Log in',
    tabSignup: 'Register agency',
    titleLogin: 'Agency partner log in',
    titleSignup: 'Register your agency',
    titleOtp: 'Enter verification code',
    subtitleLogin: 'Log in with your registered agency mobile number to access the B2B panel.',
    subtitleSignup: 'Enter your agency details to request a B2B partnership with blujet.',
    phoneLabel: 'Agency Phone Number',
    passwordLabel: 'Password',
    loginRequiredError: 'Enter your phone number and password.',
    loginFailedFallback: 'Login failed. Please try again.',
    loginChecking: 'Checking…',
    loginSubmit: 'Log In to Agency Panel',
    agencyNameLabel: 'Agency name',
    agencyNamePlaceholder: 'Company / agency name',
    licenseLabel: 'License number',
    managerLabel: 'Manager name',
    managerPlaceholder: "Manager's name",
    phoneMobileLabel: 'Agency mobile number',
    phoneHintEmpty: 'e.g. 09123456789',
    phoneHintOk: '✓ Looks good',
    phoneHintBad: 'Number must start with 09 and be 11 digits',
    termsLinkLabel: 'Terms & Conditions',
    termsSuffix: ' and B2B Partnership Policy of blujet.',
    signupIncompleteError: 'Complete all fields and accept the terms.',
    signupSendCodeFallback: 'Error sending the verification code.',
    signupSending: 'Sending…',
    signupSubmit: 'Submit request & get code',
    otpLabel: (phone) => `6-digit verification code (sent by SMS to ${phone})`,
    otpIncompleteError: 'Enter the full 6-digit code.',
    otpSubmitFallback: 'Error submitting the request.',
    otpSubmitting: 'Submitting…',
    otpConfirm: 'Confirm & submit request',
    editPhone: '✎ Edit number',
    resend: 'Resend code',
    doneTitle: 'Your partnership request has been submitted.',
    agencyNote:
      'Agency accounts are activated after blujet reviews your license and documents, unlocking special B2B fares and commission rates.',
    secureNote: 'Secure OTP sign-in',
    personalLoginLink: 'Personal account login →',
    forgotPassword: 'Forgot password?',
    forgotTitle: 'Reset Agency Password',
    forgotSub: 'Enter your agency phone number to receive a verification code by SMS.',
    forgotSendCode: 'Send Verification Code',
    forgotConfirmCode: 'Verify Code',
    forgotNewPassword: 'New Password',
    forgotRepeatPassword: 'Confirm Password',
    forgotSave: 'Save New Password',
    forgotDone: 'Password changed successfully. You can now log in.',
    forgotBack: 'Back to login',
    forgotIncompletePhone: 'Enter a valid mobile number.',
    forgotIncompleteOtp: 'Enter the full 6-digit code.',
    forgotShortPassword: 'Password must be at least 8 characters.',
    forgotMismatch: 'Password confirmation does not match.',
    forgotSendFallback: 'Error sending the verification code.',
    forgotVerifyFallback: 'The code entered is incorrect.',
    forgotSaveFallback: 'Error saving the new password.',
  },
  ar: {
    tabLogin: 'تسجيل الدخول',
    tabSignup: 'تسجيل الوكالة',
    titleLogin: 'تسجيل دخول الوكالة الشريكة',
    titleSignup: 'تسجيل وكالتك',
    titleOtp: 'أدخل رمز التحقق',
    subtitleLogin: 'سجّل الدخول برقم هاتف الوكالة المسجّل للوصول إلى لوحة B2B.',
    subtitleSignup: 'أدخل بيانات الوكالة لتقديم طلب الشراكة مع blujet.',
    phoneLabel: 'رقم هاتف الوكالة',
    passwordLabel: 'كلمة المرور',
    loginRequiredError: 'أدخل رقم الهاتف وكلمة المرور.',
    loginFailedFallback: 'فشل تسجيل الدخول. حاول مرة أخرى.',
    loginChecking: 'جارٍ التحقق…',
    loginSubmit: 'تسجيل الدخول إلى لوحة الوكالة',
    agencyNameLabel: 'اسم الوكالة',
    agencyNamePlaceholder: 'اسم الشركة / الوكالة',
    licenseLabel: 'رقم الترخيص',
    managerLabel: 'اسم المدير',
    managerPlaceholder: 'اسم المدير',
    phoneMobileLabel: 'رقم جوال الوكالة',
    phoneHintEmpty: 'مثال: 09123456789',
    phoneHintOk: '✓ الرقم صحيح',
    phoneHintBad: 'يجب أن يبدأ الرقم بـ 09 ويتكون من 11 رقمًا',
    termsLinkLabel: 'الشروط والأحكام',
    termsSuffix: ' وسياسة شراكة B2B لـ blujet.',
    signupIncompleteError: 'أكمل جميع الحقول ووافق على الشروط.',
    signupSendCodeFallback: 'خطأ في إرسال رمز التحقق.',
    signupSending: 'جارٍ الإرسال…',
    signupSubmit: 'إرسال الطلب واستلام الرمز',
    otpLabel: (phone) => `رمز التحقق المكوّن من 6 أرقام (أُرسل عبر الرسائل القصيرة إلى ${phone})`,
    otpIncompleteError: 'أدخل الرمز المكوّن من 6 أرقام كاملاً.',
    otpSubmitFallback: 'خطأ في إرسال الطلب.',
    otpSubmitting: 'جارٍ الإرسال…',
    otpConfirm: 'تأكيد وإرسال الطلب',
    editPhone: '✎ تعديل الرقم',
    resend: 'إعادة إرسال الرمز',
    doneTitle: 'تم تقديم طلب الشراكة الخاص بك.',
    agencyNote:
      'تُفعَّل حسابات الوكالات بعد مراجعة blujet لترخيصك ومستنداتك، لتحصل على أسعار B2B ونسب عمولة خاصة.',
    secureNote: 'تسجيل دخول آمن برمز لمرة واحدة',
    personalLoginLink: 'تسجيل دخول شخصي ←',
    forgotPassword: 'نسيت كلمة المرور؟',
    forgotTitle: 'استعادة كلمة مرور الوكالة',
    forgotSub: 'أدخل رقم هاتف الوكالة المسجّل ليصلك رمز التحقق عبر رسالة نصية.',
    forgotSendCode: 'إرسال رمز التحقق',
    forgotConfirmCode: 'تأكيد الرمز',
    forgotNewPassword: 'كلمة مرور جديدة',
    forgotRepeatPassword: 'تأكيد كلمة المرور',
    forgotSave: 'حفظ كلمة المرور الجديدة',
    forgotDone: 'تم تغيير كلمة المرور بنجاح. يمكنك تسجيل الدخول الآن.',
    forgotBack: 'العودة إلى تسجيل الدخول',
    forgotIncompletePhone: 'أدخل رقم جوال صالحًا.',
    forgotIncompleteOtp: 'أدخل الرمز المكوّن من 6 أرقام كاملاً.',
    forgotShortPassword: 'يجب أن تتكوّن كلمة المرور من 8 أحرف على الأقل.',
    forgotMismatch: 'تكرار كلمة المرور غير مطابق.',
    forgotSendFallback: 'خطأ في إرسال رمز التحقق.',
    forgotVerifyFallback: 'الرمز المُدخل غير صحيح.',
    forgotSaveFallback: 'خطأ في حفظ كلمة المرور الجديدة.',
  },
};

function sanitizeMobileInput(raw: string): string {
  return raw
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/\D/g, '')
    .slice(0, 11);
}

function primaryButtonStyle(enabled: boolean): CSSProperties {
  return {
    height: 56,
    borderRadius: 13,
    background: enabled ? NAVY : '#c3cedd',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 15,
    fontWeight: 800,
    cursor: enabled ? 'pointer' : 'not-allowed',
    boxShadow: enabled ? '0 14px 30px -12px rgba(13,38,64,.55)' : 'none',
    border: 'none',
    fontFamily: 'inherit',
    width: '100%',
    transition: 'background .2s',
  };
}

const inputStyle: CSSProperties = {
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
};

function AgencyLoginForm() {
  const { agencyLogin, confirmAgencyTwoFactor, signOut } = useAuth();
  const { locale } = useLocale();
  const t = STR[locale];
  const tr = (en: string, ar: string, fa: string) => locale === 'en' ? en : locale === 'ar' ? ar : fa;
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [phase, setPhase] = useState<'login' | 'setup' | 'otp'>('login');
  const [challengeId, setChallengeId] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);

  const phoneValid = /^09\d{9}$/.test(phone.trim()) || /^\+989\d{9}$/.test(phone.trim());
  const phoneHint = phone === '' ? t.phoneHintEmpty : phoneValid ? t.phoneHintOk : t.phoneHintBad;
  const phoneHintColor = phone === '' ? '#9aa7b8' : phoneValid ? '#1f8a5b' : '#d64545';
  const formLooksReady = phone.trim().length > 0 && password.trim().length > 0;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!phone.trim() || !password.trim()) {
      setError(t.loginRequiredError);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const result = await agencyLogin(phone.trim(), password);
      if ('challengeId' in result) {
        setChallengeId(result.challengeId);
        setPhase('otp');
      } else {
        navigate(result.mustChangePassword ? '/required-password-change' : '/agency', { replace: true });
      }
    } catch (err) {
      setError(
        err instanceof ApiRequestError && err.status === 429
          ? tr(
              'Too many login attempts. Wait 60 seconds and try again.',
              'محاولات تسجيل الدخول كثيرة. انتظر ٦٠ ثانية ثم حاول مرة أخرى.',
              'تعداد تلاش‌های ورود زیاد است؛ ۶۰ ثانیه صبر کنید و دوباره تلاش کنید.',
            )
          : err instanceof ApiRequestError
            ? err.message
            : t.loginFailedFallback,
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function onSetupSubmit(e: FormEvent) {
    e.preventDefault();
    if (!phoneValid || password.length < 8) {
      setError(tr('Enter a valid mobile number and a strong password of at least 8 characters.', 'أدخل رقم هاتف صالحًا وكلمة مرور قوية لا تقل عن 8 أحرف.', 'شماره موبایل معتبر و رمز عبور قوی حداقل ۸ کاراکتری وارد کنید.'));
      return;
    }
    if (password !== passwordConfirm) {
      setError(tr('The password confirmation does not match.', 'تأكيد كلمة المرور غير مطابق.', 'تکرار رمز عبور با رمز جدید یکسان نیست.'));
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const result = await requestAgencyFirstLogin(phone, password);
      setChallengeId(result.challengeId);
      setPhase('otp');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : tr('Agency first-login activation failed.', 'تعذر تفعيل تسجيل الدخول الأول للوكالة.', 'خطا در فعال‌سازی اولین ورود آژانس.'));
    } finally {
      setSubmitting(false);
    }
  }

  async function onOtpSubmit(e: FormEvent) {
    e.preventDefault();
    if (otp.length !== 6 || !confirmAgencyTwoFactor) {
      setError(tr('Enter the complete 6-digit code.', 'أدخل الرمز المكون من 6 أرقام بالكامل.', 'کد ۶ رقمی را کامل وارد کنید.'));
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const loggedIn = await confirmAgencyTwoFactor(challengeId, otp);
      navigate(loggedIn.mustChangePassword ? '/required-password-change' : '/agency', { replace: true });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : tr('Verification failed.', 'تعذر التحقق من الرمز.', 'خطا در تأیید کد.'));
    } finally {
      setSubmitting(false);
    }
  }

  if (phase === 'otp') {
    return (
      <form onSubmit={onOtpSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }} noValidate>
        <button type="button" onClick={() => { setPhase('login'); setOtp(''); setError(null); }} style={{ alignSelf: 'flex-start', border: 0, background: 'none', color: NAVY, cursor: 'pointer', fontFamily: 'inherit' }}>
          {tr('Edit login information', 'تعديل بيانات تسجيل الدخول', 'ویرایش اطلاعات ورود')}
        </button>
        <h2 style={{ margin: 0, fontSize: 20, color: NAVY }}>{tr('Enter verification code', 'أدخل رمز التحقق', 'کد تأیید را وارد کنید')}</h2>
        <p style={{ margin: 0, fontSize: 12, color: '#7d8ba0', lineHeight: 2 }}>
          {tr('Enter the 6-digit code sent to the agency mobile.', 'أدخل الرمز المكون من 6 أرقام المرسل إلى هاتف الوكالة.', 'کد ۶ رقمی ارسال‌شده به موبایل آژانس را وارد کنید.')}
        </p>
        <input
          data-testid="agency-login-otp"
          aria-label={tr('Verification code', 'رمز التحقق', 'کد تأیید')}
          inputMode="numeric"
          dir="ltr"
          maxLength={6}
          value={otp}
          onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
          autoComplete="one-time-code"
          style={{ ...inputStyle, textAlign: 'center', fontSize: 20, letterSpacing: '0.35em' }}
        />
        {(import.meta.env.DEV || import.meta.env.VITE_SANDBOX_AUTH === 'true') && (
          <div data-testid="agency-sandbox-hint" style={{ border: '1px solid #dbeafe', background: '#eff6ff', color: '#1d4ed8', borderRadius: 12, padding: '9px 12px', fontSize: 11, lineHeight: 1.8 }}>
            {tr('Sandbox: if no SMS arrives, use 123456.', 'وضع الاختبار: إذا لم تصلك رسالة، استخدم ١٢٣٤٥٦.', 'حالت Sandbox: اگر پیامک دریافت نشد، کد ۱۲۳۴۵۶ را وارد کنید.')}
          </div>
        )}
        {error && <p role="alert" style={{ margin: 0, fontSize: 12, color: '#e5484d' }}>{error}</p>}
        <button type="submit" disabled={submitting || otp.length !== 6} style={primaryButtonStyle(!submitting && otp.length === 6)}>
          {submitting ? tr('Checking…', 'جارٍ التحقق…', 'در حال بررسی…') : tr('Verify and enter panel', 'تحقق وادخل إلى اللوحة', 'تأیید و ورود به پنل')}
        </button>
      </form>
    );
  }

  if (phase === 'setup') {
    return (
      <form onSubmit={onSetupSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }} noValidate>
        <button type="button" onClick={() => { setPhase('login'); setError(null); }} style={{ alignSelf: 'flex-start', border: 0, background: 'none', color: NAVY, cursor: 'pointer', fontFamily: 'inherit' }}>
          {tr('Back to login', 'العودة إلى تسجيل الدخول', 'بازگشت به ورود')}
        </button>
        <h2 style={{ margin: 0, fontSize: 20, color: NAVY }}>{tr('First login activation', 'تفعيل تسجيل الدخول الأول', 'فعال‌سازی اولین ورود آژانس')}</h2>
        <p style={{ margin: 0, fontSize: 12, color: '#7d8ba0', lineHeight: 2 }}>
          {tr('Set your portal password; ownership is verified by SMS.', 'عيّن كلمة مرور اللوحة؛ سيتم التحقق من ملكية الرقم برسالة نصية.', 'رمز پنل را تعیین کنید؛ مالکیت شماره با کد پیامکی تأیید می‌شود.')}
        </p>
        <input aria-label={t.phoneLabel} type="tel" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09121234567" style={inputStyle} />
        <input data-testid="agency-first-password" aria-label={tr('New password', 'كلمة المرور الجديدة', 'رمز عبور جدید')} type="password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" placeholder={tr('Strong password', 'كلمة مرور قوية من 8 أحرف على الأقل', 'رمز قوی حداقل ۸ کاراکتر')} style={inputStyle} />
        <input data-testid="agency-first-password-confirm" aria-label={tr('Confirm password', 'تأكيد كلمة المرور', 'تکرار رمز عبور')} type="password" dir="ltr" value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} autoComplete="new-password" placeholder={tr('Repeat password', 'أعد إدخال كلمة المرور', 'تکرار رمز عبور')} style={inputStyle} />
        {(import.meta.env.DEV || import.meta.env.VITE_SANDBOX_AUTH === 'true') && (
          <div style={{ border: '1px solid #dbeafe', background: '#eff6ff', color: '#1d4ed8', borderRadius: 12, padding: '9px 12px', fontSize: 11 }}>
            {tr('Sandbox OTP: 123456', 'رمز الاختبار: ١٢٣٤٥٦', 'کد OTP در Sandbox: ۱۲۳۴۵۶')}
          </div>
        )}
        {error && <p role="alert" style={{ margin: 0, fontSize: 12, color: '#e5484d' }}>{error}</p>}
        <button type="submit" disabled={submitting} style={primaryButtonStyle(!submitting)}>
          {submitting ? tr('Saving…', 'جارٍ الحفظ…', 'در حال ثبت…') : tr('Save and send code', 'حفظ وإرسال الرمز', 'ثبت و ارسال کد')}
        </button>
      </form>
    );
  }

  return (
    <>
      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }} noValidate>
        <div>
          <label htmlFor="phone" style={{ display: 'block', fontSize: 12, color: '#42506a', fontWeight: 700, marginBottom: 8 }}>
            {t.phoneLabel}
          </label>
          <div style={{ position: 'relative' }}>
            <input
              id="phone"
              className="agency-signin-input"
              type="tel"
              dir="ltr"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
              placeholder="0912 345 6789"
              style={{
                ...inputStyle,
                height: 54,
                padding: '0 16px 0 52px',
                fontSize: 16,
                fontWeight: 700,
                letterSpacing: 1,
              }}
            />
            <span
              style={{
                position: 'absolute',
                left: 14,
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: 12,
                color: '#9aa7b8',
                fontWeight: 700,
              }}
            >
              +98
            </span>
          </div>
          <div style={{ fontSize: 11, color: phoneHintColor, marginTop: 7, fontWeight: 600 }}>{phoneHint}</div>
        </div>

        <div>
          <label htmlFor="password" style={{ display: 'block', fontSize: 12, color: '#42506a', fontWeight: 700, marginBottom: 8 }}>
            {t.passwordLabel}
          </label>
          <input
            id="password"
            className="agency-signin-input"
            type="password"
            dir="ltr"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            style={inputStyle}
          />
        </div>

        <button
          type="button"
          data-testid="agency-forgot-link"
          onClick={() => setForgotOpen(true)}
          style={{
            alignSelf: 'flex-start',
            fontSize: 11.5,
            fontWeight: 700,
            color: NAVY,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'inherit',
            padding: 0,
          }}
        >
          {t.forgotPassword}
        </button>

        {(import.meta.env.DEV || import.meta.env.VITE_SANDBOX_AUTH === 'true') && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
            <button
              type="button"
              data-testid="agency-demo-login"
              onClick={() => {
                setPhone(LOCAL_DEMO_AGENCY.phone);
                setPassword(LOCAL_DEMO_AGENCY.password);
                setError(null);
              }}
              style={{
                fontSize: 11.5,
                fontWeight: 800,
                color: NAVY,
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: 9,
                cursor: 'pointer',
                fontFamily: 'inherit',
                padding: '7px 10px',
              }}
            >
              {tr('Fill local demo account', 'تعبئة حساب العرض المحلي', 'پرکردن حساب آزمایشی لوکال')}
            </button>
            <button
              type="button"
              data-testid="agency-first-login"
              onClick={() => { setPhase('setup'); setPassword(''); setError(null); }}
              style={{
                fontSize: 11.5,
                fontWeight: 800,
                color: GOLD,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
                padding: 0,
              }}
            >
              {tr('First login / activate account', 'تسجيل الدخول الأول / تفعيل الحساب', 'اولین ورود / فعال‌سازی حساب')}
            </button>
          </div>
        )}

        {error && (
          <p role="alert" style={{ margin: 0, fontSize: 12, color: '#e5484d' }}>
            {error}
          </p>
        )}

        <button type="submit" disabled={submitting} style={primaryButtonStyle(formLooksReady && !submitting)}>
          {submitting ? t.loginChecking : t.loginSubmit}
        </button>
      </form>

      {forgotOpen && (
        <AgencyForgotPasswordModal
          t={t}
          locale={locale}
          onClose={() => setForgotOpen(false)}
          onSignedOut={() => void signOut()}
        />
      )}
    </>
  );
}

function AgencyForgotPasswordModal({
  t,
  locale,
  onClose,
  onSignedOut,
}: {
  t: (typeof STR)['fa'];
  locale: StoredLocale;
  onClose: () => void;
  onSignedOut: () => void | Promise<void>;
}) {
  const [step, setStep] = useState<'phone' | 'otp' | 'password' | 'done'>('phone');
  const [phone, setPhone] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [code, setCode] = useState('');
  const [pass1, setPass1] = useState('');
  const [pass2, setPass2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    if (!/^09\d{9}$/.test(phone.trim())) {
      setError(t.forgotIncompletePhone);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const { challengeId: id } = await requestAgencyPasswordReset(phone.trim());
      setChallengeId(id);
      setStep('otp');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t.forgotSendFallback);
    } finally {
      setSubmitting(false);
    }
  }

  async function verifyCode(e: FormEvent) {
    e.preventDefault();
    if (code.trim().length !== 6) {
      setError(t.forgotIncompleteOtp);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await verifyAgencyPasswordReset(challengeId, code.trim());
      setStep('password');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t.forgotVerifyFallback);
    } finally {
      setSubmitting(false);
    }
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault();
    if (pass1.length < 8) {
      setError(t.forgotShortPassword);
      return;
    }
    if (pass1 !== pass2) {
      setError(t.forgotMismatch);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await apiSetPassword(pass1);
      await onSignedOut();
      setStep('done');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t.forgotSaveFallback);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      data-testid="agency-forgot-modal"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(13,38,64,.55)',
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 380,
          borderRadius: 18,
          background: '#fff',
          padding: 24,
          boxShadow: '0 40px 100px -30px rgba(4,16,34,.6)',
        }}
      >
        <h2 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 900, color: '#16202e' }}>{t.forgotTitle}</h2>
        {step !== 'done' && (
          <p style={{ margin: '0 0 16px', fontSize: 11.5, lineHeight: 1.8, color: '#7d8ba0' }}>{t.forgotSub}</p>
        )}

        {step === 'phone' && (
          <form onSubmit={(e) => void sendCode(e)} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              data-testid="agency-forgot-phone"
              dir="ltr"
              className="agency-signin-input"
              style={inputStyle}
              value={phone}
              onChange={(e) => setPhone(sanitizeMobileInput(e.target.value))}
              placeholder={locale === 'fa' ? '۰۹xxxxxxxxx' : '09xxxxxxxxx'}
            />
            {error && (
              <p role="alert" style={{ margin: 0, fontSize: 12, color: '#e5484d' }}>
                {error}
              </p>
            )}
            <button type="submit" disabled={submitting} style={primaryButtonStyle(!submitting)}>
              {t.forgotSendCode}
            </button>
          </form>
        )}

        {step === 'otp' && (
          <form onSubmit={(e) => void verifyCode(e)} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label style={{ fontSize: 11.5, color: '#7d8ba0' }}>{t.otpLabel(phone)}</label>
            <input
              data-testid="agency-forgot-code"
              dir="ltr"
              inputMode="numeric"
              maxLength={6}
              style={{
                ...inputStyle,
                textAlign: 'center',
                fontSize: 18,
                letterSpacing: '0.4em',
                fontFamily: "'Roboto Mono', monospace",
              }}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
            {error && (
              <p role="alert" style={{ margin: 0, fontSize: 12, color: '#e5484d' }}>
                {error}
              </p>
            )}
            <button type="submit" disabled={submitting} style={primaryButtonStyle(!submitting)}>
              {t.forgotConfirmCode}
            </button>
          </form>
        )}

        {step === 'password' && (
          <form onSubmit={(e) => void savePassword(e)} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              data-testid="agency-forgot-pass1"
              type="password"
              dir="ltr"
              placeholder={t.forgotNewPassword}
              className="agency-signin-input"
              style={inputStyle}
              value={pass1}
              onChange={(e) => setPass1(e.target.value)}
            />
            <input
              data-testid="agency-forgot-pass2"
              type="password"
              dir="ltr"
              placeholder={t.forgotRepeatPassword}
              className="agency-signin-input"
              style={inputStyle}
              value={pass2}
              onChange={(e) => setPass2(e.target.value)}
            />
            {error && (
              <p role="alert" style={{ margin: 0, fontSize: 12, color: '#e5484d' }}>
                {error}
              </p>
            )}
            <button type="submit" disabled={submitting} style={primaryButtonStyle(!submitting)}>
              {t.forgotSave}
            </button>
          </form>
        )}

        {step === 'done' && (
          <p data-testid="agency-forgot-done" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.9, color: '#5a6678' }}>
            {t.forgotDone}
          </p>
        )}

        <button
          type="button"
          onClick={onClose}
          style={{
            marginTop: 16,
            width: '100%',
            fontSize: 12,
            fontWeight: 700,
            color: '#8a96a6',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {t.forgotBack}
        </button>
      </div>
    </div>
  );
}

function AgencySignupForm({ onDoneNote }: { onDoneNote?: boolean }) {
  const { locale } = useLocale();
  const t = STR[locale];
  const [step, setStep] = useState<'form' | 'otp' | 'done'>('form');
  const [applicantName, setApplicantName] = useState('');
  const [managerName, setManagerName] = useState('');
  const [licenseNo, setLicenseNo] = useState('');
  const [phone, setPhone] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [otp, setOtp] = useState<string[]>(Array(OTP_LEN).fill(''));
  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const phoneValid = /^09\d{9}$/.test(phone.trim());
  const nameMin = locale === 'en' ? 2 : 3;
  const formValid =
    applicantName.trim().length >= 2 &&
    managerName.trim().length >= nameMin &&
    licenseNo.trim().length >= 2 &&
    phoneValid &&
    accepted;
  const code = otp.join('');
  const otpOk = otp.every((v) => v !== '');
  const phoneHint = phone === '' ? t.phoneHintEmpty : phoneValid ? t.phoneHintOk : t.phoneHintBad;
  const phoneHintColor = phone === '' ? '#9aa7b8' : phoneValid ? '#1f8a5b' : '#d64545';
  const displayPhone = localeDigits(phone, locale);

  function onOtpChange(index: number, raw: string) {
    const digit = raw
      .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
      .replace(/\D/g, '')
      .slice(-1);
    const next = otp.slice();
    next[index] = digit;
    setOtp(next);
    if (digit && index < OTP_LEN - 1) otpRefs.current[index + 1]?.focus();
  }

  function onOtpKeyDown(index: number, key: string) {
    if (key === 'Backspace' && !otp[index] && index > 0) otpRefs.current[index - 1]?.focus();
  }

  async function onSubmitForm(e: FormEvent) {
    e.preventDefault();
    if (!formValid) {
      setError(t.signupIncompleteError);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const { challengeId: id } = await requestAgencySignupOtp(phone.trim());
      setChallengeId(id);
      setOtp(Array(OTP_LEN).fill(''));
      setStep('otp');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t.signupSendCodeFallback);
    } finally {
      setSubmitting(false);
    }
  }

  async function onResend() {
    setError(null);
    setSubmitting(true);
    try {
      const { challengeId: id } = await requestAgencySignupOtp(phone.trim());
      setChallengeId(id);
      setOtp(Array(OTP_LEN).fill(''));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t.signupSendCodeFallback);
    } finally {
      setSubmitting(false);
    }
  }

  async function onSubmitOtp(e: FormEvent) {
    e.preventDefault();
    if (!challengeId || code.length !== OTP_LEN) {
      setError(t.otpIncompleteError);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await submitAgencyRequest({
        applicantName: applicantName.trim(),
        managerName: managerName.trim(),
        licenseNo: licenseNo.trim(),
        phone: phone.trim(),
        challengeId,
        code,
      });
      setStep('done');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t.otpSubmitFallback);
    } finally {
      setSubmitting(false);
    }
  }

  if (step === 'done') {
    return (
      <div
        style={{
          borderRadius: 14,
          border: '1px solid #f0e3bf',
          background: '#fbf7ec',
          padding: 18,
          textAlign: 'center',
          fontSize: 12.5,
          lineHeight: 1.9,
          color: '#6b5620',
        }}
      >
        {t.doneTitle} {onDoneNote !== false ? t.agencyNote : null}
      </div>
    );
  }

  if (step === 'otp') {
    return (
      <form onSubmit={(e) => void onSubmitOtp(e)} style={{ display: 'flex', flexDirection: 'column', gap: 16 }} noValidate>
        <div>
          <div style={{ fontSize: 12, color: '#42506a', fontWeight: 700, marginBottom: 10 }}>
            {t.otpLabel('')} <span dir="ltr" style={{ color: NAVY }}>{displayPhone}</span>
          </div>
          <div style={{ display: 'flex', gap: 10, direction: 'ltr' }}>
            {otp.map((v, i) => (
              <input
                key={i}
                ref={(el) => {
                  otpRefs.current[i] = el;
                }}
                type="tel"
                inputMode="numeric"
                maxLength={1}
                aria-label={i === 0 ? t.otpLabel(phone) : undefined}
                value={v}
                onChange={(e) => onOtpChange(i, e.target.value)}
                onKeyDown={(e) => onOtpKeyDown(i, e.key)}
                style={{
                  flex: 1,
                  width: '100%',
                  height: 60,
                  border: `1.5px solid ${v ? NAVY : '#dfe6ef'}`,
                  borderRadius: 13,
                  background: v ? '#f4f6f9' : '#fafbfd',
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
          <button
            type="button"
            onClick={() => setStep('form')}
            style={{ color: '#8a96a6', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            {t.editPhone}
          </button>
          <button
            type="button"
            onClick={() => void onResend()}
            disabled={submitting}
            style={{ color: NAVY, fontWeight: 800, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            {t.resend}
          </button>
        </div>
        {error && (
          <p role="alert" style={{ margin: 0, fontSize: 12, color: '#e5484d' }}>
            {error}
          </p>
        )}
        <button type="submit" disabled={submitting || !otpOk} style={primaryButtonStyle(!submitting && otpOk)}>
          {submitting ? t.otpSubmitting : t.otpConfirm}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={(e) => void onSubmitForm(e)} style={{ display: 'flex', flexDirection: 'column', gap: 14 }} noValidate>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label htmlFor="applicantName" style={{ display: 'block', fontSize: 12, color: '#42506a', fontWeight: 700, marginBottom: 8 }}>
            {t.agencyNameLabel}
          </label>
          <input
            id="applicantName"
            className="agency-signin-input"
            value={applicantName}
            onChange={(e) => setApplicantName(e.target.value)}
            placeholder={t.agencyNamePlaceholder}
            style={inputStyle}
          />
        </div>
        <div>
          <label htmlFor="licenseNo" style={{ display: 'block', fontSize: 12, color: '#42506a', fontWeight: 700, marginBottom: 8 }}>
            {t.licenseLabel}
          </label>
          <input
            id="licenseNo"
            className="agency-signin-input"
            dir="ltr"
            value={licenseNo}
            onChange={(e) => setLicenseNo(e.target.value)}
            placeholder="XXXX-XXXX"
            style={inputStyle}
          />
        </div>
      </div>

      <div>
        <label htmlFor="managerName" style={{ display: 'block', fontSize: 12, color: '#42506a', fontWeight: 700, marginBottom: 8 }}>
          {t.managerLabel}
        </label>
        <input
          id="managerName"
          className="agency-signin-input"
          value={managerName}
          onChange={(e) => setManagerName(e.target.value)}
          placeholder={t.managerPlaceholder}
          style={inputStyle}
        />
      </div>

      <div>
        <label htmlFor="signup-phone" style={{ display: 'block', fontSize: 12, color: '#42506a', fontWeight: 700, marginBottom: 8 }}>
          {t.phoneMobileLabel}
        </label>
        <div style={{ position: 'relative' }}>
          <input
            id="signup-phone"
            className="agency-signin-input"
            type="tel"
            dir="ltr"
            value={phone}
            onChange={(e) => setPhone(sanitizeMobileInput(e.target.value))}
            placeholder="0912 345 6789"
            maxLength={11}
            style={{
              ...inputStyle,
              height: 54,
              padding: '0 16px 0 52px',
              fontSize: 16,
              fontWeight: 700,
              letterSpacing: 1,
            }}
          />
          <span
            style={{
              position: 'absolute',
              left: 14,
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: 12,
              color: '#9aa7b8',
              fontWeight: 700,
            }}
          >
            +98
          </span>
        </div>
        <div style={{ fontSize: 11, color: phoneHintColor, marginTop: 7, fontWeight: 600 }}>{phoneHint}</div>
      </div>

      <div
        role="checkbox"
        aria-checked={accepted}
        tabIndex={0}
        onClick={() => setAccepted((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            setAccepted((v) => !v);
          }
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 11.5,
          color: '#3b4554',
          cursor: 'pointer',
        }}
      >
        <span
          style={{
            width: 19,
            height: 19,
            border: `1.5px solid ${accepted ? GOLD : '#ccd3dd'}`,
            borderRadius: 6,
            flex: 'none',
            background: accepted ? GOLD : '#fff',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
          }}
        >
          {accepted ? '✓' : ''}
        </span>
        {/* Hidden native checkbox for testing / a11y label association */}
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }}
          aria-hidden
          tabIndex={-1}
        />
        <Link to="/support" style={{ color: GOLD, fontWeight: 700, textDecoration: 'none' }} onClick={(e) => e.stopPropagation()}>
          {t.termsLinkLabel}
        </Link>
        <span>{t.termsSuffix}</span>
      </div>

      {error && (
        <p role="alert" style={{ margin: 0, fontSize: 12, color: '#e5484d' }}>
          {error}
        </p>
      )}

      <button type="submit" disabled={submitting || !formValid} style={primaryButtonStyle(!submitting && formValid)}>
        {submitting ? t.signupSending : t.signupSubmit}
      </button>
    </form>
  );
}

export default function AgencyLoginPage() {
  const { locale } = useLocale();
  const t = STR[locale];
  const [tab, setTab] = useState<'login' | 'signup'>('login');

  return (
    <AgencyLoginLayout>
      <div style={{ display: 'flex', gap: 21, borderBottom: '1.5px solid #eef1f5', marginBottom: 22 }}>
        {(
          [
            ['login', t.tabLogin],
            ['signup', t.tabSignup],
          ] as const
        ).map(([key, label]) => {
          const active = tab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              style={{
                paddingBottom: 11,
                fontSize: 14.5,
                fontWeight: 800,
                color: active ? NAVY : '#9aa4b2',
                borderBottom: `3px solid ${active ? GOLD : 'transparent'}`,
                cursor: 'pointer',
                marginBottom: -1.5,
                background: 'none',
                borderTop: 'none',
                borderLeft: 'none',
                borderRight: 'none',
                fontFamily: 'inherit',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      <h1 style={{ fontSize: 21, fontWeight: 900, margin: '0 0 8px' }}>
        {tab === 'login' ? t.titleLogin : t.titleSignup}
      </h1>
      <p style={{ fontSize: 12.5, color: '#7d8ba0', margin: '0 0 20px', lineHeight: 2 }}>
        {tab === 'login' ? t.subtitleLogin : t.subtitleSignup}
      </p>

      {tab === 'login' ? <AgencyLoginForm /> : <AgencySignupForm />}

      <div
        style={{
          marginTop: 18,
          background: '#fbf7ec',
          border: '1px solid #f0e3bf',
          borderRadius: 12,
          padding: 11,
          fontSize: 11.5,
          color: '#6b5620',
          lineHeight: 1.9,
        }}
      >
        {t.agencyNote}
      </div>

      <div
        style={{
          marginTop: 'auto',
          paddingTop: 22,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 7,
          fontSize: 11,
          color: '#9aa7b8',
          fontWeight: 600,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#1f8a5b' }} />
          {t.secureNote}
        </div>
        <Link
          to="/signin"
          data-testid="agency-passenger-link"
          style={{ color: '#8a96a6', fontWeight: 700, textDecoration: 'none' }}
        >
          {t.personalLoginLink}
        </Link>
      </div>
    </AgencyLoginLayout>
  );
}
