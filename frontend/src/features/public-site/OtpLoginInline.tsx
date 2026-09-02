import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useLocale, type StoredLocale } from '../../hooks/useLocale';
import { fetchDevLastOtp } from '../../api/auth';
import { ApiRequestError } from '../../api/envelope';
import { faDigits, isValidIranMobile, normalizeIranMobile } from '../../lib/fa-format';
import { localeDigits } from '../../lib/locale-format';

const SHOW_TEST_OTP =
  import.meta.env.DEV && import.meta.env.VITE_SHOW_TEST_OTP === 'true';

const STR: Record<
  StoredLocale,
  {
    otpTitle: string;
    otpSub: string;
    otpRequest: string;
    otpVerify: string;
    otpPhonePlaceholder: string;
    otpCodePlaceholder: string;
    otpSendError: string;
    otpInvalid: string;
    otpPhoneInvalid: string;
    otpSent: (phone: string) => string;
    otpRequesting: string;
    otpResend: string;
    otpEditPhone: string;
    otpDevHint: (code: string) => string;
  }
> = {
  fa: {
    otpTitle: 'ورود با شماره موبایل',
    otpSub: 'برای ادامه رزرو، شماره موبایل خود را تأیید کنید.',
    otpRequest: 'دریافت کد',
    otpVerify: 'تأیید و ورود',
    otpPhonePlaceholder: '09121234567',
    otpCodePlaceholder: 'کد ۶ رقمی',
    otpSendError: 'خطا در ارسال کد.',
    otpInvalid: 'کد نامعتبر است.',
    otpPhoneInvalid: 'شماره موبایل معتبر نیست (مثال: 09121234567).',
    otpSent: (phone) => `کد تأیید به ${faDigits(phone)} ارسال شد.`,
    otpRequesting: 'در حال ارسال…',
    otpResend: 'ارسال مجدد کد',
    otpEditPhone: 'ویرایش شماره',
    otpDevHint: (code) => `کد آزمایشی: ${faDigits(code)}`,
  },
  en: {
    otpTitle: 'Sign in with mobile',
    otpSub: 'Verify your mobile number to continue booking.',
    otpRequest: 'Send code',
    otpVerify: 'Verify & sign in',
    otpPhonePlaceholder: '09121234567',
    otpCodePlaceholder: '6-digit code',
    otpSendError: 'Failed to send code.',
    otpInvalid: 'Invalid code.',
    otpPhoneInvalid: 'Enter a valid mobile number (e.g. 09121234567).',
    otpSent: (phone) => `Verification code sent to ${phone}.`,
    otpRequesting: 'Sending…',
    otpResend: 'Resend code',
    otpEditPhone: 'Edit number',
    otpDevHint: (code) => `Test code: ${code}`,
  },
  ar: {
    otpTitle: 'تسجيل الدخول برقم الجوال',
    otpSub: 'تحقق من رقم جوالك لمتابعة الحجز.',
    otpRequest: 'إرسال الرمز',
    otpVerify: 'تأكيد وتسجيل الدخول',
    otpPhonePlaceholder: '09121234567',
    otpCodePlaceholder: 'رمز من ٦ أرقام',
    otpSendError: 'فشل إرسال الرمز.',
    otpInvalid: 'رمز غير صالح.',
    otpPhoneInvalid: 'رقم جوال غير صالح (مثال: 09121234567).',
    otpSent: (phone) => `تم إرسال الرمز إلى ${phone}.`,
    otpRequesting: 'جارٍ الإرسال…',
    otpResend: 'إعادة إرسال الرمز',
    otpEditPhone: 'تعديل الرقم',
    otpDevHint: (code) => `رمز تجريبي: ${code}`,
  },
};

export default function OtpLoginInline({
  onAuthenticated,
  embedded = false,
  showHeader = true,
  checkoutStyle = false,
}: {
  onAuthenticated?: () => void | Promise<void>;
  embedded?: boolean;
  showHeader?: boolean;
  checkoutStyle?: boolean;
} = {}) {
  const { requestOtp, verifyOtp } = useAuth();
  const { locale } = useLocale();
  const t = STR[locale];
  const [phone, setPhone] = useState('');
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);

  const normalizedPhone = normalizeIranMobile(phone);
  const phoneReady = isValidIranMobile(normalizedPhone);
  const checkoutPhoneValue = normalizedPhone.replace(/^0/, '');
  const checkoutCopy = {
    fa: {
      label: 'شماره موبایل',
      request: 'تأیید و دریافت کد',
      terms: 'با ادامه، شما با قوانین و مقررات سایت موافقت می‌کنید.',
    },
    en: {
      label: 'Mobile number',
      request: 'Confirm & get code',
      terms: 'By continuing, you agree to the website terms and conditions.',
    },
    ar: {
      label: 'رقم الجوال',
      request: 'تأكيد واستلام الرمز',
      terms: 'بالمتابعة، أنت توافق على شروط وأحكام الموقع.',
    },
  }[locale];

  async function sendOtp() {
    setError(null);
    setDevCode(null);
    if (!phoneReady) {
      setError(t.otpPhoneInvalid);
      return;
    }
    if (!requestOtp) {
      setError(t.otpSendError);
      return;
    }
    setBusy(true);
    try {
      const issuedChallengeId = await requestOtp(normalizedPhone);
      setChallengeId(issuedChallengeId);
      setCode('');
      if (SHOW_TEST_OTP) {
        try {
          const { code: devOtp } = await fetchDevLastOtp(normalizedPhone);
          setDevCode(devOtp);
        } catch {
          setDevCode(null);
        }
      }
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t.otpSendError);
    } finally {
      setBusy(false);
    }
  }

  async function onVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!verifyOtp) {
      setError(t.otpInvalid);
      return;
    }
    setBusy(true);
    try {
      await verifyOtp(challengeId!, normalizeIranMobile(code));
      await onAuthenticated?.();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t.otpInvalid);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={
        embedded
          ? `mx-auto w-full bg-white font-sans ${checkoutStyle ? 'max-w-[320px] p-0' : 'max-w-sm px-1 pb-1 pt-2'}`
          : 'mx-auto max-w-sm rounded-2xl border border-[#eef1f5] bg-white p-6 font-sans shadow-sm'
      }
    >
      {showHeader && (
        <>
          <h2 className="mb-1 text-sm font-extrabold text-[#0d2640]">{t.otpTitle}</h2>
          <p className="mb-4 text-xs text-[#6b7b94]">{t.otpSub}</p>
        </>
      )}
      {error && <p className="mb-3 rounded-lg bg-red-50 p-2.5 text-xs text-red-600">{error}</p>}
      {!challengeId ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void sendOtp();
          }}
          className={`flex flex-col ${checkoutStyle ? 'gap-3' : 'gap-3'}`}
        >
          {checkoutStyle ? (
            <label className="flex flex-col gap-1.5 text-start text-[12.5px] font-bold text-[#8a96a6]">
              <span>{checkoutCopy.label}</span>
              <span className="flex h-12 overflow-hidden rounded-xl border border-[#dce3ec] bg-[#f7f9fc] focus-within:border-[#1668c4] focus-within:ring-2 focus-within:ring-[#1668c4]/10" dir="ltr">
                <span className="flex items-center border-e border-[#dce3ec] px-3 text-sm font-bold text-[#4d596b]">+98</span>
                <input
                  data-testid="otp-phone"
                  type="tel"
                  inputMode="tel"
                  value={checkoutPhoneValue}
                  onChange={(e) => {
                    const digits = normalizeIranMobile(e.target.value);
                    const local = digits.startsWith('0') ? digits.slice(1) : digits;
                    setPhone(local ? `0${local.slice(0, 10)}` : '');
                  }}
                  placeholder="9xxxxxxxxx"
                  className="min-w-0 flex-1 bg-transparent px-3 text-sm font-semibold text-[#16202e] outline-none placeholder:text-[#9aa6b7]"
                />
              </span>
            </label>
          ) : (
            <input
              data-testid="otp-phone"
              type="tel"
              dir="ltr"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(normalizeIranMobile(e.target.value))}
              placeholder={t.otpPhonePlaceholder}
              className="rounded-lg border border-[#eef1f5] px-3.5 py-2.5 text-sm outline-none focus:border-[#1668c4]"
            />
          )}
          <button
            type="submit"
            disabled={busy || !phoneReady}
            className={checkoutStyle
              ? 'h-12 rounded-xl bg-[#3569be] px-4 text-sm font-black text-white transition hover:bg-[#285ba9] disabled:cursor-not-allowed disabled:opacity-60'
              : 'rounded-lg bg-[#1668c4] px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60'}
          >
            {busy ? t.otpRequesting : checkoutStyle ? checkoutCopy.request : t.otpRequest}
          </button>
          {checkoutStyle && <p className="m-0 text-center text-[11px] leading-5 text-[#9aa6b7]">{checkoutCopy.terms}</p>}
        </form>
      ) : (
        <form onSubmit={onVerify} className={`flex flex-col ${checkoutStyle ? 'gap-3.5' : 'gap-3'}`}>
          <p className={`${checkoutStyle ? 'text-center text-[12.5px] text-[#59677a]' : 'text-xs font-semibold text-[#059669]'}`} data-testid="otp-sent-notice">
            {t.otpSent(localeDigits(normalizedPhone, locale))}
          </p>
          {devCode && (
            <p
              className="rounded-lg bg-[#eff6ff] p-2.5 text-xs font-semibold text-[#1668c4]"
              data-testid="otp-dev-hint"
            >
              {t.otpDevHint(localeDigits(devCode, locale))}
            </p>
          )}
          {checkoutStyle ? (
            <label className="group relative block cursor-text" dir="ltr">
              <input
                data-testid="otp-code"
                aria-label={t.otpCodePlaceholder}
                type="tel"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(normalizeIranMobile(e.target.value).slice(0, 6))}
                className="absolute inset-0 z-10 h-full w-full cursor-text opacity-0"
              />
              <span className="grid grid-cols-6 gap-1.5">
                {Array.from({ length: 6 }, (_, index) => (
                  <span
                    key={index}
                    className="font-num flex h-11 items-center justify-center rounded-xl border border-[#dce3ec] bg-[#f7f9fc] text-base font-black text-[#0d2640] transition group-focus-within:border-[#79a6e3]"
                  >
                    {code[index] ? localeDigits(code[index]!, locale) : ''}
                  </span>
                ))}
              </span>
            </label>
          ) : (
            <input
              data-testid="otp-code"
              type="tel"
              dir="ltr"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(normalizeIranMobile(e.target.value).slice(0, 6))}
              placeholder={t.otpCodePlaceholder}
              className="font-num rounded-lg border border-[#eef1f5] px-3.5 py-2.5 text-sm outline-none focus:border-[#1668c4]"
            />
          )}
          <button
            type="submit"
            disabled={busy || code.length < 6}
            className={checkoutStyle
              ? 'h-12 rounded-xl bg-[#3569be] px-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-60'
              : 'rounded-lg bg-[#1668c4] px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60'}
          >
            {busy ? t.otpRequesting : t.otpVerify}
          </button>
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setChallengeId(null);
                setCode('');
                setError(null);
              }}
              className="text-xs font-bold text-[#657286] disabled:opacity-60"
            >
              {t.otpEditPhone}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void sendOtp()}
              className="text-xs font-bold text-[#1668c4] disabled:opacity-60"
            >
              {t.otpResend}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
