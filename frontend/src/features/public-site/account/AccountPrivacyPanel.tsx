import { useLocale, type StoredLocale } from '../../../hooks/useLocale';

const STR: Record<
  StoredLocale,
  {
    privacyHeading: string;
    privacyDesc: string;
    exportBtn: string;
    exportBusyBtn: string;
    deleteHeading: string;
    deleteWarning: string;
    deleteConfirmBtn: string;
    deleteBusyBtn: string;
    deleteCancelBtn: string;
  }
> = {
  fa: {
    privacyHeading: 'حریم خصوصی و داده‌های من',
    privacyDesc:
      'می‌توانید خروجی کامل اطلاعات شخصی خود (سفرها، مسافران، کیف پول، استرداد‌ها) را دریافت کنید یا حساب کاربری خود را برای همیشه حذف کنید.',
    exportBtn: 'دانلود اطلاعات من',
    exportBusyBtn: 'در حال آماده‌سازی…',
    deleteHeading: 'حذف حساب کاربری',
    deleteWarning:
      'این عملیات غیرقابل بازگشت است. حساب شما غیرفعال می‌شود، اطلاعات هویتی مسافران شما حذف/ناشناس می‌شود و تمام نشست‌های فعال شما بسته خواهد شد.',
    deleteConfirmBtn: 'بله، حساب من حذف شود',
    deleteBusyBtn: 'در حال حذف…',
    deleteCancelBtn: 'انصراف',
  },
  en: {
    privacyHeading: 'Privacy & My Data',
    privacyDesc:
      'You can download a full export of your personal data (trips, passengers, wallet, refunds) or permanently delete your account.',
    exportBtn: 'Download My Data',
    exportBusyBtn: 'Preparing…',
    deleteHeading: 'Delete Account',
    deleteWarning:
      'This action is irreversible. Your account will be deactivated, your passengers’ identity data will be deleted/anonymized, and all your active sessions will be closed.',
    deleteConfirmBtn: 'Yes, delete my account',
    deleteBusyBtn: 'Deleting…',
    deleteCancelBtn: 'Cancel',
  },
  ar: {
    privacyHeading: 'الخصوصية وبياناتي',
    privacyDesc:
      'يمكنك تنزيل نسخة كاملة من بياناتك الشخصية (الرحلات، المسافرون، المحفظة، الاستردادات) أو حذف حسابك نهائيًا.',
    exportBtn: 'تنزيل بياناتي',
    exportBusyBtn: 'جارٍ التحضير…',
    deleteHeading: 'حذف الحساب',
    deleteWarning:
      'هذا الإجراء لا رجعة فيه. سيتم إلغاء تفعيل حسابك، وحذف/إخفاء هوية بيانات المسافرين، وإغلاق جميع جلساتك النشطة.',
    deleteConfirmBtn: 'نعم، احذف حسابي',
    deleteBusyBtn: 'جارٍ الحذف…',
    deleteCancelBtn: 'إلغاء',
  },
};

interface Props {
  exportBusy: boolean;
  exportError: string | null;
  onExportData: () => void;
  deleteConfirmOpen: boolean;
  deleteBusy: boolean;
  deleteError: string | null;
  onDeleteOpen: () => void;
  onDeleteCancel: () => void;
  onDeleteConfirm: () => void;
}

export default function AccountPrivacyPanel({
  exportBusy,
  exportError,
  onExportData,
  deleteConfirmOpen,
  deleteBusy,
  deleteError,
  onDeleteOpen,
  onDeleteCancel,
  onDeleteConfirm,
}: Props) {
  const { locale } = useLocale();
  const t = STR[locale];

  return (
    <div
      data-testid="account-privacy-panel"
      style={{ background: '#fff', border: '1px solid #eef1f5', borderRadius: 16, padding: 18 }}
    >
      <h3 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 12px' }}>{t.privacyHeading}</h3>
      {exportError && (
        <p role="alert" style={{ fontSize: 12, color: '#e5484d', marginBottom: 10 }}>
          {exportError}
        </p>
      )}
      <p style={{ fontSize: 12, color: '#5a6678', marginBottom: 12 }}>{t.privacyDesc}</p>
      <button
        type="button"
        data-testid="privacy-export-button"
        disabled={exportBusy}
        onClick={() => void onExportData()}
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
          marginBottom: 18,
        }}
      >
        {exportBusy ? t.exportBusyBtn : t.exportBtn}
      </button>
      <div style={{ borderTop: '1px solid #f1f4f8', paddingTop: 16 }}>
        <h4 style={{ fontSize: 12.5, fontWeight: 800, color: '#e5484d', margin: '0 0 8px' }}>{t.deleteHeading}</h4>
        {!deleteConfirmOpen ? (
          <button
            type="button"
            data-testid="privacy-delete-open"
            onClick={onDeleteOpen}
            style={{
              border: '1px solid #e5484d',
              borderRadius: 10,
              background: 'transparent',
              color: '#e5484d',
              padding: '9px 18px',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {t.deleteHeading}
          </button>
        ) : (
          <div style={{ background: '#fef2f2', border: '1px solid #fbd0d0', borderRadius: 12, padding: '14px 16px' }}>
            <p style={{ fontSize: 12, color: '#8a2c2c', marginBottom: 12 }}>{t.deleteWarning}</p>
            {deleteError && (
              <p role="alert" style={{ fontSize: 12, color: '#e5484d', marginBottom: 10 }}>
                {deleteError}
              </p>
            )}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                data-testid="privacy-delete-confirm"
                disabled={deleteBusy}
                onClick={() => void onDeleteConfirm()}
                style={{
                  border: 'none',
                  borderRadius: 10,
                  background: '#e5484d',
                  color: '#fff',
                  padding: '9px 18px',
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {deleteBusy ? t.deleteBusyBtn : t.deleteConfirmBtn}
              </button>
              <button
                type="button"
                data-testid="privacy-delete-cancel"
                disabled={deleteBusy}
                onClick={onDeleteCancel}
                style={{
                  border: '1px solid #e3e9f1',
                  borderRadius: 10,
                  background: '#fff',
                  color: '#5a6678',
                  padding: '9px 18px',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {t.deleteCancelBtn}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
