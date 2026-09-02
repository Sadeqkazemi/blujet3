import { useState } from 'react';
import JalaliDatePicker from '../../../components/JalaliDatePicker';
import { formatLocaleDate, parseLocaleDateToIso } from '../../../lib/locale-format';
import { useLocale, type StoredLocale } from '../../../hooks/useLocale';
import type { UserProfile } from '../../../types/public-site';
import { splitPersonName } from '../../../lib/person-name';

const STR: Record<
  StoredLocale,
  {
    accountInfoHeading: string;
    editInfoBtn: string;
    notCompleted: string;
    firstNameLabel: string;
    lastNameLabel: string;
    nationalIdLabel: string;
    birthDateLabel: string;
    passportLabel: string;
    addressLabel: string;
    birthDatePlaceholder: string;
    emailLabel: string;
    saveButton: string;
    savingButton: string;
    emailHeading: string;
    emailNotSet: string;
    emailVerifiedTag: string;
    sendVerifyCodeBtn: string;
    codeLabel: string;
    verifyBtn: string;
  }
> = {
  fa: {
    accountInfoHeading: 'اطلاعات حساب',
    editInfoBtn: 'ویرایش اطلاعات',
    notCompleted: 'تکمیل نشده',
    firstNameLabel: 'نام',
    lastNameLabel: 'نام خانوادگی',
    nationalIdLabel: 'کد ملی',
    birthDateLabel: 'تاریخ تولد',
    passportLabel: 'شماره گذرنامه',
    addressLabel: 'آدرس محل سکونت',
    birthDatePlaceholder: 'مثلاً ۱۳۷۰/۰۵/۱۲',
    emailLabel: 'ایمیل',
    saveButton: 'ذخیره اطلاعات',
    savingButton: 'در حال ذخیره…',
    emailHeading: 'ایمیل',
    emailNotSet: 'ایمیلی ثبت نشده است.',
    emailVerifiedTag: '· تأیید شده',
    sendVerifyCodeBtn: 'ارسال کد تأیید',
    codeLabel: 'کد تأیید',
    verifyBtn: 'تأیید',
  },
  en: {
    accountInfoHeading: 'Account Information',
    editInfoBtn: 'Edit Info',
    notCompleted: 'Not completed',
    firstNameLabel: 'First Name',
    lastNameLabel: 'Last Name',
    nationalIdLabel: 'National ID',
    birthDateLabel: 'Date of Birth',
    passportLabel: 'Passport Number',
    addressLabel: 'Residential Address',
    birthDatePlaceholder: 'e.g. 1991/07/21',
    emailLabel: 'Email',
    saveButton: 'Save Info',
    savingButton: 'Saving…',
    emailHeading: 'Email',
    emailNotSet: 'No email on file.',
    emailVerifiedTag: '· Verified',
    sendVerifyCodeBtn: 'Send Verification Code',
    codeLabel: 'Verification Code',
    verifyBtn: 'Verify',
  },
  ar: {
    accountInfoHeading: 'معلومات الحساب',
    editInfoBtn: 'تعديل المعلومات',
    notCompleted: 'لم يكتمل',
    firstNameLabel: 'الاسم الأول',
    lastNameLabel: 'اسم العائلة',
    nationalIdLabel: 'الرقم الوطني',
    birthDateLabel: 'تاريخ الميلاد',
    passportLabel: 'رقم جواز السفر',
    addressLabel: 'عنوان السكن',
    birthDatePlaceholder: 'مثلاً 1991/07/21',
    emailLabel: 'البريد الإلكتروني',
    saveButton: 'حفظ المعلومات',
    savingButton: 'جارٍ الحفظ…',
    emailHeading: 'البريد الإلكتروني',
    emailNotSet: 'لا يوجد بريد إلكتروني مسجّل.',
    emailVerifiedTag: '· تم التحقق',
    sendVerifyCodeBtn: 'إرسال رمز التحقق',
    codeLabel: 'رمز التحقق',
    verifyBtn: 'تحقق',
  },
};

function FieldCell({ label, value, dir }: { label: string; value: string; dir?: 'ltr' | 'rtl' }) {
  return (
    <div style={{ background: '#f6f8fb', borderRadius: 12, padding: '11px 13px' }}>
      <div style={{ fontSize: 10.5, color: '#9aa4b2', marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: '#16202e' }} dir={dir}>
        {value}
      </div>
    </div>
  );
}

interface ProfileForm {
  firstName: string;
  lastName: string;
  nationalId: string;
  birthDate: string;
  passportNo: string;
  address: string;
  email: string;
}

interface Props {
  profile: UserProfile | null;
  profileForm: ProfileForm;
  onProfileFormChange: (next: ProfileForm) => void;
  onSaveProfile: (e: React.FormEvent) => void;
  profileSaving: boolean;
  profileError: string | null;
  profileNotice: string | null;
  isMobile: boolean;
  emailChallengeId: string | null;
  emailCode: string;
  onEmailCodeChange: (code: string) => void;
  onRequestEmailVerify: () => void;
  onVerifyEmail: (e: React.FormEvent) => void;
}

export default function AccountInfoTab({
  profile,
  profileForm,
  onProfileFormChange,
  onSaveProfile,
  profileSaving,
  profileError,
  profileNotice,
  isMobile,
  emailChallengeId,
  emailCode,
  onEmailCodeChange,
  onRequestEmailVerify,
  onVerifyEmail,
}: Props) {
  const { locale } = useLocale();
  const t = STR[locale];
  const [editing, setEditing] = useState(false);
  const fieldsCols = isMobile ? '1fr' : 'repeat(2, 1fr)';

  const fieldValue = (value: string | null | undefined) => value?.trim() || t.notCompleted;
  const profileName = splitPersonName(profile?.fullName);
  const birthDateIso = (() => {
    const raw = profileForm.birthDate.trim();
    if (!raw) return null;
    try {
      return parseLocaleDateToIso(raw, locale);
    } catch {
      return null;
    }
  })();

  const profileFields = [
    {
      label: t.firstNameLabel,
      value: fieldValue(profileName.firstName || profileForm.firstName),
      dir: locale === 'en' ? ('ltr' as const) : ('rtl' as const),
    },
    {
      label: t.lastNameLabel,
      value: fieldValue(profileName.lastName || profileForm.lastName),
      dir: locale === 'en' ? ('ltr' as const) : ('rtl' as const),
    },
    { label: t.nationalIdLabel, value: fieldValue(profile?.nationalId ?? profileForm.nationalId), dir: 'ltr' as const },
    {
      label: t.birthDateLabel,
      value: profile?.birthDate ? formatLocaleDate(profile.birthDate, locale) : fieldValue(profileForm.birthDate),
      dir: 'ltr' as const,
    },
    { label: t.passportLabel, value: fieldValue(profile?.passportNo ?? profileForm.passportNo), dir: 'ltr' as const },
    {
      label: t.addressLabel,
      value: fieldValue(profile?.address ?? profileForm.address),
      dir: locale === 'en' ? ('ltr' as const) : ('rtl' as const),
    },
    { label: t.emailLabel, value: fieldValue(profile?.email ?? undefined), dir: 'ltr' as const },
  ];

  return (
    <div data-testid="account-info-tab" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {profileNotice && <p style={{ fontSize: 12, color: '#1f8a5b', margin: 0 }}>{profileNotice}</p>}
      {profileError && (
        <p role="alert" style={{ fontSize: 12, color: '#e5484d', margin: 0 }}>
          {profileError}
        </p>
      )}

      <div style={{ background: '#fff', border: '1px solid #eef1f5', borderRadius: 16, padding: 18 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16,
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          <h2 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>{t.accountInfoHeading}</h2>
          <button
            type="button"
            data-testid="profile-edit-toggle"
            onClick={() => setEditing((v) => !v)}
            style={{
              fontSize: 11.5,
              fontWeight: 700,
              color: '#1668c4',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {t.editInfoBtn}
          </button>
        </div>
        {editing ? (
          <form onSubmit={onSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: fieldsCols, gap: 11 }}>
              <div>
              <label htmlFor="profile-firstName" style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: '#5a6678', marginBottom: 6 }}>
                {t.firstNameLabel}
              </label>
              <input
                id="profile-firstName"
                value={profileForm.firstName}
                onChange={(e) => onProfileFormChange({ ...profileForm, firstName: e.target.value })}
                style={{ width: '100%', boxSizing: 'border-box', padding: '10px 13px', border: '1.5px solid #e3e9f1', borderRadius: 10, fontFamily: 'inherit', fontSize: 13 }}
              />
              </div>
              <div>
              <label htmlFor="profile-lastName" style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: '#5a6678', marginBottom: 6 }}>
                {t.lastNameLabel}
              </label>
              <input
                id="profile-lastName"
                value={profileForm.lastName}
                onChange={(e) => onProfileFormChange({ ...profileForm, lastName: e.target.value })}
                style={{ width: '100%', boxSizing: 'border-box', padding: '10px 13px', border: '1.5px solid #e3e9f1', borderRadius: 10, fontFamily: 'inherit', fontSize: 13 }}
              />
              </div>
            </div>
            <div>
              <label htmlFor="profile-nationalId" style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: '#5a6678', marginBottom: 6 }}>
                {t.nationalIdLabel}
              </label>
              <input
                id="profile-nationalId"
                dir="ltr"
                value={profileForm.nationalId}
                onChange={(e) => onProfileFormChange({ ...profileForm, nationalId: e.target.value })}
                style={{ width: '100%', boxSizing: 'border-box', padding: '10px 13px', border: '1.5px solid #e3e9f1', borderRadius: 10, fontFamily: 'inherit', fontSize: 13 }}
              />
            </div>
            <div>
              <label htmlFor="profile-birthDate" style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: '#5a6678', marginBottom: 6 }}>
                {t.birthDateLabel}
              </label>
              <div style={{ display: 'flex', alignItems: 'stretch', gap: 8, flexWrap: 'wrap' }}>
                <input
                  id="profile-birthDate"
                  dir="ltr"
                  inputMode="numeric"
                  placeholder={t.birthDatePlaceholder}
                  value={profileForm.birthDate}
                  onChange={(e) => onProfileFormChange({ ...profileForm, birthDate: e.target.value })}
                  style={{ flex: '1 1 190px', minWidth: 0, boxSizing: 'border-box', padding: '10px 13px', border: '1.5px solid #e3e9f1', borderRadius: 10, fontFamily: 'inherit', fontSize: 13 }}
                />
                <div style={{ flex: '0 0 132px', height: 42, boxSizing: 'border-box', border: '1.5px solid #e3e9f1', borderRadius: 10, background: '#f8fafc', overflow: 'hidden' }}>
                  <JalaliDatePicker
                    label={t.birthDateLabel}
                    value={birthDateIso}
                    locale={locale}
                    compact
                    testId="profile-birthDate-calendar"
                    placeholder={locale === 'fa' ? 'تقویم شمسی' : locale === 'ar' ? 'التقويم الميلادي' : 'Calendar'}
                    onChange={(iso) => onProfileFormChange({ ...profileForm, birthDate: formatLocaleDate(iso, locale) })}
                  />
                </div>
              </div>
            </div>
            <div>
              <label htmlFor="profile-passportNo" style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: '#5a6678', marginBottom: 6 }}>
                {t.passportLabel}
              </label>
              <input
                id="profile-passportNo"
                dir="ltr"
                value={profileForm.passportNo}
                onChange={(e) => onProfileFormChange({ ...profileForm, passportNo: e.target.value })}
                style={{ width: '100%', boxSizing: 'border-box', padding: '10px 13px', border: '1.5px solid #e3e9f1', borderRadius: 10, fontFamily: 'inherit', fontSize: 13 }}
              />
            </div>
            <div>
              <label htmlFor="profile-address" style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: '#5a6678', marginBottom: 6 }}>
                {t.addressLabel}
              </label>
              <textarea
                id="profile-address"
                rows={3}
                value={profileForm.address}
                onChange={(e) => onProfileFormChange({ ...profileForm, address: e.target.value })}
                style={{ width: '100%', boxSizing: 'border-box', padding: '10px 13px', border: '1.5px solid #e3e9f1', borderRadius: 10, resize: 'vertical', fontFamily: 'inherit', fontSize: 13, lineHeight: 1.8 }}
              />
            </div>
            <div>
              <label htmlFor="profile-email" style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: '#5a6678', marginBottom: 6 }}>
                {t.emailLabel}
              </label>
              <input
                id="profile-email"
                dir="ltr"
                type="email"
                autoComplete="email"
                value={profileForm.email}
                onChange={(e) => onProfileFormChange({ ...profileForm, email: e.target.value })}
                style={{ width: '100%', boxSizing: 'border-box', padding: '10px 13px', border: '1.5px solid #e3e9f1', borderRadius: 10, fontFamily: 'inherit', fontSize: 13 }}
              />
            </div>
            <button
              type="submit"
              disabled={profileSaving}
              style={{
                border: 'none',
                borderRadius: 10,
                background: '#1668c4',
                color: '#fff',
                padding: '11px 22px',
                fontSize: 12.5,
                fontWeight: 800,
                cursor: 'pointer',
                fontFamily: 'inherit',
                alignSelf: 'flex-start',
              }}
            >
              {profileSaving ? t.savingButton : t.saveButton}
            </button>
          </form>
        ) : (
          <div data-testid="profile-fields-grid" style={{ display: 'grid', gridTemplateColumns: fieldsCols, gap: 11 }}>
            {profileFields.map((f) => (
              <FieldCell key={f.label} label={f.label} value={f.value} dir={f.dir} />
            ))}
          </div>
        )}
      </div>

      <div style={{ background: '#fff', border: '1px solid #eef1f5', borderRadius: 16, padding: 18 }}>
        <h3 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 12px' }}>{t.emailHeading}</h3>
        <p style={{ fontSize: 12, color: '#5a6678', marginBottom: 12 }}>
          {profile?.email ?? t.emailNotSet}{' '}
          {profile?.emailVerifiedAt && <span style={{ color: '#1f8a5b', fontWeight: 700 }}>{t.emailVerifiedTag}</span>}
        </p>
        {profile?.email && !profile.emailVerifiedAt && (
          <>
            {!emailChallengeId ? (
              <button
                type="button"
                onClick={() => void onRequestEmailVerify()}
                style={{
                  border: '1px solid #1668c4',
                  borderRadius: 10,
                  background: 'transparent',
                  color: '#1668c4',
                  padding: '9px 18px',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {t.sendVerifyCodeBtn}
              </button>
            ) : (
              <form onSubmit={onVerifyEmail} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div>
                  <label htmlFor="email-code" style={{ display: 'block', fontSize: 11, color: '#5a6678', marginBottom: 6 }}>
                    {t.codeLabel}
                  </label>
                  <input
                    id="email-code"
                    dir="ltr"
                    inputMode="numeric"
                    maxLength={6}
                    value={emailCode}
                    onChange={(e) => onEmailCodeChange(e.target.value.replace(/\D/g, ''))}
                    style={{
                      width: 140,
                      boxSizing: 'border-box',
                      padding: '10px 13px',
                      border: '1.5px solid #e3e9f1',
                      borderRadius: 10,
                      fontFamily: 'inherit',
                      fontSize: 13,
                      textAlign: 'center',
                      letterSpacing: 4,
                    }}
                  />
                </div>
                <button
                  type="submit"
                  style={{
                    border: 'none',
                    borderRadius: 10,
                    background: '#1668c4',
                    color: '#fff',
                    padding: '11px 18px',
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {t.verifyBtn}
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
