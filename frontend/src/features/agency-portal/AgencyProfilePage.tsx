import { useEffect, useRef, useState } from 'react';
import { fetchDocuments, fetchProfile, uploadDocument } from '../../api/agency-portal';
import { formatLocaleDate } from '../../lib/locale-format';
import { ApiRequestError } from '../../api/envelope';
import { useLocale, type StoredLocale } from '../../hooks/useLocale';
import type { AgencyDocument, AgencyDocumentType, AgencyProfile } from '../../types/agency-portal';

// پروفایل و مدارک — field labels and document status match
// design-reference-v2/پنل آژانس.dc.html's own isEN `profileFields`/
// `documents` sample data for this exact tab; AR has no counterpart
// there and is hand-translated. This page keeps its own local
// tier/document-type/status label maps rather than translating the
// shared `frontend/src/features/agencies/agency-labels.ts` module — that
// module backs the staff-side AgencyDetailPage.tsx, which stays
// Persian-only per CLAUDE.md (staff panels aren't locale-switchable).
interface Tr {
  fa: string;
  en: string;
  ar: string;
}

const TIER_LABEL_LOCAL: Record<NonNullable<AgencyProfile['tier']>, Tr> = {
  GOLD: { fa: 'طلایی', en: 'Gold', ar: 'ذهبية' },
  SILVER: { fa: 'نقره‌ای', en: 'Silver', ar: 'فضية' },
  NORMAL: { fa: 'عادی', en: 'Standard', ar: 'عادية' },
};

const DOC_TYPE_LABEL: Record<AgencyDocumentType, Tr> = {
  LICENSE: { fa: 'مجوز فعالیت', en: 'Operating License', ar: 'ترخيص النشاط' },
  CONTRACT: { fa: 'قرارداد همکاری', en: 'Partnership Contract', ar: 'عقد الشراكة' },
  OTHER: { fa: 'سایر', en: 'Other', ar: 'أخرى' },
};

const DOC_STATUS_LABEL: Record<AgencyDocument['status'], { label: Tr; className: string }> = {
  PENDING: { label: { fa: 'در انتظار بررسی', en: 'Pending', ar: 'قيد المراجعة' }, className: 'bg-[#f59e0b24] text-[#b45309]' },
  APPROVED: { label: { fa: 'تأیید شد', en: 'Approved', ar: 'تمت الموافقة' }, className: 'bg-[#10b98124] text-[#059669]' },
  REJECTED: { label: { fa: 'رد شد', en: 'Rejected', ar: 'مرفوض' }, className: 'bg-danger/15 text-danger' },
};

const STR: Record<StoredLocale, {
  heading: string;
  subtitle: string;
  errorFallback: string;
  loading: string;
  agencyInfoHeading: string;
  fieldManager: string;
  fieldLicenseNo: string;
  fieldCity: string;
  fieldPhone: string;
  fieldEmail: string;
  fieldPartnershipType: string;
  partnershipValue: (tier: string) => string;
  emptyValue: string;
  readOnlyNotice: string;
  uploadHeading: string;
  noFileSelected: string;
  uploadErrorFallback: string;
  uploadBtn: string;
  addDocumentBtn: string;
  uploadingBtn: string;
  documentsHeading: string;
  documentsEmpty: string;
}> = {
  fa: {
    heading: 'پروفایل و مدارک',
    subtitle: 'اطلاعات ثبت‌شده آژانس شما و مدارک ارسالی',
    errorFallback: 'خطا در دریافت پروفایل.',
    loading: 'در حال بارگذاری…',
    agencyInfoHeading: 'اطلاعات آژانس',
    fieldManager: 'مدیر عامل',
    fieldLicenseNo: 'شماره مجوز',
    fieldCity: 'شهر',
    fieldPhone: 'تلفن',
    fieldEmail: 'ایمیل',
    fieldPartnershipType: 'نوع همکاری',
    partnershipValue: (tier) => `آژانس همکار ${tier}`,
    emptyValue: '—',
    readOnlyNotice: 'اطلاعات ثبتی این حساب آزمایشی فقط خواندنی است؛ ارسال مدرک برای بررسی فعال است.',
    uploadHeading: 'آپلود مدرک جدید',
    noFileSelected: 'فایلی انتخاب نشده است.',
    uploadErrorFallback: 'خطا در آپلود مدرک.',
    uploadBtn: 'ارسال مدرک',
    addDocumentBtn: 'افزودن مدرک',
    uploadingBtn: 'در حال آپلود…',
    documentsHeading: 'مدارک ارسالی',
    documentsEmpty: 'مدرکی آپلود نشده است.',
  },
  en: {
    heading: 'Profile & Documents',
    subtitle: "Your agency's registered information and submitted documents",
    errorFallback: 'Error loading the profile.',
    loading: 'Loading…',
    agencyInfoHeading: 'Agency Information',
    fieldManager: 'CEO',
    fieldLicenseNo: 'License Number',
    fieldCity: 'City',
    fieldPhone: 'Phone',
    fieldEmail: 'Email',
    fieldPartnershipType: 'Partnership Type',
    partnershipValue: (tier) => `${tier} Partner Agency`,
    emptyValue: '—',
    readOnlyNotice: 'Registration fields are read-only; document submission is available for review.',
    uploadHeading: 'Upload New Document',
    noFileSelected: 'No file selected.',
    uploadErrorFallback: 'Error uploading the document.',
    uploadBtn: 'Submit document',
    addDocumentBtn: 'Add document',
    uploadingBtn: 'Uploading…',
    documentsHeading: 'Submitted Documents',
    documentsEmpty: 'No documents uploaded yet.',
  },
  ar: {
    heading: 'الملف الشخصي والمستندات',
    subtitle: 'معلومات وكالتك المسجّلة والمستندات المُرسلة',
    errorFallback: 'خطأ في تحميل الملف الشخصي.',
    loading: 'جارٍ التحميل…',
    agencyInfoHeading: 'معلومات الوكالة',
    fieldManager: 'المدير العام',
    fieldLicenseNo: 'رقم الترخيص',
    fieldCity: 'المدينة',
    fieldPhone: 'الهاتف',
    fieldEmail: 'البريد الإلكتروني',
    fieldPartnershipType: 'نوع الشراكة',
    partnershipValue: (tier) => `وكالة شريكة ${tier}`,
    emptyValue: '—',
    readOnlyNotice: 'بيانات التسجيل للقراءة فقط؛ إرسال المستندات متاح للمراجعة.',
    uploadHeading: 'رفع مستند جديد',
    noFileSelected: 'لم يتم اختيار ملف.',
    uploadErrorFallback: 'خطأ في رفع المستند.',
    uploadBtn: 'إرسال المستند',
    addDocumentBtn: 'إضافة مستند',
    uploadingBtn: 'جارٍ الرفع…',
    documentsHeading: 'المستندات المُرسلة',
    documentsEmpty: 'لم يتم رفع أي مستند بعد.',
  },
};

export default function AgencyProfilePage() {
  const { locale } = useLocale();
  const t = STR[locale];
  const [profile, setProfile] = useState<AgencyProfile | null>(null);
  const [documents, setDocuments] = useState<AgencyDocument[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [docType, setDocType] = useState<AgencyDocumentType>('LICENSE');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reload() {
    Promise.all([fetchProfile(), fetchDocuments()])
      .then(([p, d]) => {
        setProfile(p);
        setDocuments(d);
      })
      .catch(() => setError(t.errorFallback));
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(reload, []);

  async function onUpload() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setUploadError(t.noFileSelected);
      return;
    }
    setUploadError(null);
    setUploading(true);
    try {
      await uploadDocument(file, docType);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setSelectedFileName('');
      reload();
    } catch (err) {
      setUploadError(err instanceof ApiRequestError ? err.message : t.uploadErrorFallback);
    } finally {
      setUploading(false);
    }
  }

  if (error) return <p className="p-8 text-sm text-danger">{error}</p>;
  if (!profile) return <p className="p-8 text-sm text-muted">{t.loading}</p>;

  const tierLabel = profile.tier ? TIER_LABEL_LOCAL[profile.tier][locale] : null;
  const fields: [string, string | null][] = [
    [t.fieldManager, profile.managerName],
    [t.fieldLicenseNo, profile.licenseNo],
    [t.fieldCity, profile.city],
    [t.fieldPhone, profile.phone],
    [t.fieldEmail, profile.email],
    [t.fieldPartnershipType, tierLabel ? t.partnershipValue(tierLabel) : null],
  ];

  return (
    <div>
      {profile.isTemporaryReadOnly && (
        <p
          data-testid="agency-profile-readonly-notice"
          role="status"
          className="mb-6 rounded-xl border border-border bg-[#f59e0b14] p-4 text-xs font-bold text-[#b45309]"
        >
          {t.readOnlyNotice}
        </p>
      )}

      <div className="mb-6 rounded-xl border border-border bg-white p-5">
        <div className="mb-4 text-sm font-bold text-ink">{t.agencyInfoHeading}</div>
        <dl className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {fields.map(([label, value]) => (
            <div key={label}>
              <dt className="text-[11px] text-muted">{label}</dt>
              <dd className="ltr mt-1 text-sm font-bold text-ink">{value ?? t.emptyValue}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="mb-6 rounded-2xl border border-[#dbe7f5] bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-black text-ink">{t.uploadHeading}</div>
              <div className="mt-1 text-[11px] text-muted">PDF، JPG یا PNG تا حداکثر ۵ مگابایت</div>
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-xl border border-accent bg-[#eef6ff] px-4 py-2.5 text-xs font-black text-accent"
            >
              + {t.addDocumentBtn}
            </button>
          </div>
          <div className="grid gap-3 rounded-xl border border-dashed border-[#c7d9ed] bg-[#f8fbff] p-4 sm:grid-cols-[minmax(150px,0.7fr)_minmax(220px,1fr)_auto] sm:items-end">
            <select
              aria-label={locale === 'fa' ? 'نوع مدرک' : locale === 'ar' ? 'نوع المستند' : 'Document type'}
              value={docType}
              onChange={(e) => setDocType(e.target.value as AgencyDocumentType)}
              className="rounded-lg border border-border bg-white px-3 py-2 text-xs"
            >
              {(Object.keys(DOC_TYPE_LABEL) as AgencyDocumentType[]).map((dt) => (
                <option key={dt} value={dt}>
                  {DOC_TYPE_LABEL[dt][locale]}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="h-10 truncate rounded-lg border border-border bg-white px-3 text-start text-xs text-muted"
            >
              {selectedFileName || t.noFileSelected}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              className="sr-only"
              onChange={(event) => setSelectedFileName(event.target.files?.[0]?.name ?? '')}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => void onUpload()}
              className="rounded-lg bg-accent px-4 py-2 text-xs font-bold text-white transition hover:brightness-110 disabled:opacity-60"
            >
              {uploading ? t.uploadingBtn : t.uploadBtn}
            </button>
          </div>
          {uploadError && (
            <p role="alert" className="mt-3 text-xs text-danger">
              {uploadError}
            </p>
          )}
      </div>

      <div className="rounded-xl border border-border bg-white p-5">
        <div className="mb-4 text-sm font-bold text-ink">{t.documentsHeading}</div>
        {documents.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted">{t.documentsEmpty}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {documents.map((d) => {
              const st = DOC_STATUS_LABEL[d.status];
              return (
                <div
                  key={d.id}
                  className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-xs"
                >
                  <div>
                    <div className="font-bold">{DOC_TYPE_LABEL[d.docType][locale]}</div>
                    <div className="text-[10px] text-muted">
                      {d.file.fileName} — {formatLocaleDate(d.createdAt, locale)}
                    </div>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${st.className}`}>
                    {st.label[locale]}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
