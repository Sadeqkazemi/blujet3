import { useRef, useState } from 'react';
import { useLocale, type StoredLocale } from '../../hooks/useLocale';
import type { CustomerIdentityView } from '../../types/public-site';

const STR: Record<
  StoredLocale,
  {
    warnTitle: string;
    warnSub: string;
    approvedTitle: string;
    pendingTitle: string;
    rejectedTitle: string;
    stepsHdr: string;
    stepProfile: string;
    stepProfileHintDone: string;
    stepProfileHintTodo: string;
    stepIdCard: string;
    stepIdCardHint: string;
    upload: string;
    uploading: string;
    done: string;
    submit: string;
    submitting: string;
    goProfile: string;
    uploadError: string;
  }
> = {
  fa: {
    warnTitle: 'احراز هویت شما هنوز کامل نشده است',
    warnSub: 'برای استرداد وجه و خرید بیش از سقف، احراز هویت لازم است.',
    approvedTitle: 'احراز هویت شما تأیید شده است',
    pendingTitle: 'مدارک شما در حال بررسی است',
    rejectedTitle: 'مدارک رد شد — لطفاً مجدداً بارگذاری کنید',
    stepsHdr: 'مراحل احراز هویت',
    stepProfile: 'اطلاعات هویتی (نام، کد ملی، تاریخ تولد)',
    stepProfileHintDone: 'از پروفایل شما تکمیل شده است',
    stepProfileHintTodo: 'در تب پروفایل نام، کد ملی و تاریخ تولد را وارد کنید',
    stepIdCard: 'بارگذاری تصویر کارت ملی',
    stepIdCardHint: 'تصویر واضح پشت و روی کارت ملی',
    upload: 'بارگذاری',
    uploading: 'در حال بارگذاری…',
    done: '✓ تکمیل',
    submit: 'ثبت و ارسال برای بررسی',
    submitting: 'در حال ارسال…',
    goProfile: 'رفتن به پروفایل',
    uploadError: 'خطا در بارگذاری فایل.',
  },
  en: {
    warnTitle: 'Your identity verification is incomplete',
    warnSub: 'Verification is required for refunds and purchases above the limit.',
    approvedTitle: 'Your identity is verified',
    pendingTitle: 'Your documents are under review',
    rejectedTitle: 'Documents rejected — please upload again',
    stepsHdr: 'Verification steps',
    stepProfile: 'Identity info (name, national ID, birth date)',
    stepProfileHintDone: 'Completed from your profile',
    stepProfileHintTodo: 'Complete name, national ID and birth date in Profile',
    stepIdCard: 'Upload national ID card image',
    stepIdCardHint: 'Clear photo of front and back of national ID',
    upload: 'Upload',
    uploading: 'Uploading…',
    done: '✓ Done',
    submit: 'Submit for review',
    submitting: 'Submitting…',
    goProfile: 'Go to profile',
    uploadError: 'File upload failed.',
  },
  ar: {
    warnTitle: 'لم يكتمل التحقق من هويتك',
    warnSub: 'التحقق مطلوب للاسترداد والمشتريات فوق الحد.',
    approvedTitle: 'تم التحقق من هويتك',
    pendingTitle: 'مستنداتك قيد المراجعة',
    rejectedTitle: 'تم رفض المستندات — يرجى الرفع مجدداً',
    stepsHdr: 'خطوات التحقق',
    stepProfile: 'بيانات الهوية (الاسم، الرقم الوطني، تاريخ الميلاد)',
    stepProfileHintDone: 'مكتمل من ملفك الشخصي',
    stepProfileHintTodo: 'أكمل الاسم والرقم الوطني وتاريخ الميلاد في الملف',
    stepIdCard: 'رفع صورة بطاقة الهوية',
    stepIdCardHint: 'صورة واضحة للوجه والظهر',
    upload: 'رفع',
    uploading: 'جارٍ الرفع…',
    done: '✓ مكتمل',
    submit: 'إرسال للمراجعة',
    submitting: 'جارٍ الإرسال…',
    goProfile: 'الذهاب إلى الملف',
    uploadError: 'فشل رفع الملف.',
  },
};

interface Props {
  data: CustomerIdentityView;
  uploadBusy: boolean;
  submitBusy: boolean;
  uploadError: string | null;
  submitError: string | null;
  onUpload: (file: File) => Promise<void>;
  onSubmit: () => Promise<void>;
  onGoProfile: () => void;
}

export default function AccountIdentityTab({
  data,
  uploadBusy,
  submitBusy,
  uploadError,
  submitError,
  onUpload,
  onSubmit,
  onGoProfile,
}: Props) {
  const { locale } = useLocale();
  const t = STR[locale];
  const inputRef = useRef<HTMLInputElement>(null);
  const [localUploadError, setLocalUploadError] = useState<string | null>(null);

  const profileDone = data.steps.find((s) => s.key === 'profile')?.done ?? false;
  const idCardDone = data.steps.find((s) => s.key === 'id_card')?.done ?? false;

  async function onFileChange(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    setLocalUploadError(null);
    try {
      await onUpload(file);
    } catch {
      setLocalUploadError(t.uploadError);
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  const banner =
    data.status === 'APPROVED'
      ? { title: t.approvedTitle, sub: '', bg: '#f4fbf7', border: '#bfe6cf', iconBg: '#1f8a5b' }
      : data.status === 'SUBMITTED'
        ? { title: t.pendingTitle, sub: '', bg: '#eef4fb', border: '#cfe0f2', iconBg: '#1668c4' }
        : data.status === 'REJECTED'
          ? {
              title: t.rejectedTitle,
              sub: data.rejectReason ?? '',
              bg: '#fbf0ef',
              border: '#f0d4d4',
              iconBg: '#e5484d',
            }
          : { title: t.warnTitle, sub: t.warnSub, bg: '#fff8ec', border: '#f6e0bb', iconBg: '#f0a83c' };

  return (
    <div data-testid="account-identity" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div
        style={{
          background: `linear-gradient(135deg,${banner.bg},#fff)`,
          border: `1px solid ${banner.border}`,
          borderRadius: 16,
          padding: '16px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: 13,
        }}
      >
        <span
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: banner.iconBg,
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flex: 'none',
            fontSize: 18,
          }}
        >
          🛡
        </span>
        <div style={{ lineHeight: 1.6 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#16202e' }}>{banner.title}</div>
          {banner.sub && (
            <div style={{ fontSize: 11.5, color: '#8a96a6', marginTop: 4 }}>{banner.sub}</div>
          )}
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid #eef1f5', borderRadius: 16, padding: 18 }}>
        <h3 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 16px' }}>{t.stepsHdr}</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
          <StepRow
            icon={profileDone ? '✓' : '1'}
            done={profileDone}
            label={t.stepProfile}
            hint={profileDone ? t.stepProfileHintDone : t.stepProfileHintTodo}
            action={
              !profileDone ? (
                <button
                  type="button"
                  data-testid="identity-go-profile"
                  onClick={onGoProfile}
                  style={actionBtnStyle}
                >
                  {t.goProfile}
                </button>
              ) : (
                <span style={doneTagStyle}>{t.done}</span>
              )
            }
          />
          <StepRow
            icon={idCardDone ? '✓' : '2'}
            done={idCardDone}
            label={t.stepIdCard}
            hint={
              data.idCardFile
                ? data.idCardFile.fileName
                : t.stepIdCardHint
            }
            action={
              data.status === 'SUBMITTED' || data.status === 'APPROVED' ? (
                <span style={doneTagStyle}>{t.done}</span>
              ) : data.status === 'REJECTED' || !idCardDone ? (
                <>
                  <button
                    type="button"
                    data-testid="identity-upload"
                    disabled={uploadBusy}
                    onClick={() => inputRef.current?.click()}
                    style={actionBtnStyle}
                  >
                    {uploadBusy ? t.uploading : t.upload}
                  </button>
                  <input
                    ref={inputRef}
                    type="file"
                    accept=".pdf,image/*"
                    hidden
                    onChange={(e) => void onFileChange(e.target.files)}
                  />
                </>
              ) : (
                <span style={doneTagStyle}>{t.done}</span>
              )
            }
          />
        </div>
        {(localUploadError || uploadError || submitError) && (
          <p role="alert" style={{ fontSize: 12, color: '#e5484d', margin: '12px 0 0' }}>
            {localUploadError ?? uploadError ?? submitError}
          </p>
        )}
        {data.canSubmit && (
          <button
            type="button"
            data-testid="identity-submit"
            disabled={submitBusy}
            onClick={() => void onSubmit()}
            style={{
              marginTop: 16,
              width: '100%',
              height: 50,
              borderRadius: 12,
              background: '#1668c4',
              color: '#fff',
              fontSize: 13.5,
              fontWeight: 800,
              border: 'none',
              cursor: submitBusy ? 'wait' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {submitBusy ? t.submitting : t.submit}
          </button>
        )}
      </div>
    </div>
  );
}

function StepRow({
  icon,
  done,
  label,
  hint,
  action,
}: {
  icon: string;
  done: boolean;
  label: string;
  hint: string;
  action: React.ReactNode;
}) {
  return (
    <div
      data-testid="identity-step"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        border: `1px solid ${done ? '#bfe6cf' : '#eef1f5'}`,
        background: done ? '#f4fbf7' : '#fff',
        borderRadius: 13,
        padding: '13px 14px',
      }}
    >
      <span
        style={{
          width: 30,
          height: 30,
          borderRadius: '50%',
          background: done ? '#1f8a5b' : '#cbd5e1',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 13,
          fontWeight: 800,
          flex: 'none',
        }}
      >
        {icon}
      </span>
      <div style={{ flex: 1, lineHeight: 1.5, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: '#16202e' }}>{label}</div>
        <div style={{ fontSize: 10.5, color: '#9aa4b2' }}>{hint}</div>
      </div>
      {action}
    </div>
  );
}

const actionBtnStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: '#1668c4',
  border: '1.5px solid #1668c4',
  padding: '7px 12px',
  borderRadius: 9,
  cursor: 'pointer',
  background: '#fff',
  fontFamily: 'inherit',
  whiteSpace: 'nowrap',
};

const doneTagStyle: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 700,
  color: '#1f8a5b',
  whiteSpace: 'nowrap',
};
