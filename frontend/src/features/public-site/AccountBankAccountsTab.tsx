import { useState } from 'react';
import { useLocale, type StoredLocale } from '../../hooks/useLocale';
import { useIsMobile } from '../../hooks/useIsMobile';
import { latinDigits } from '../../lib/fa-format';
import type { SavedBankAccount } from '../../types/public-site';

const STR: Record<
  StoredLocale,
  {
    hdr: string;
    sub: string;
    empty: string;
    addHdr: string;
    cardPh: string;
    shebaPh: string;
    submit: string;
    default: string;
    remove: string;
    setDefault: string;
    cardRequired: string;
    shebaRequired: string;
  }
> = {
  fa: {
    hdr: 'حساب‌های بانکی',
    sub: 'کارت‌ها و شماره شبای ثبت‌شده برای واریز مبلغ استرداد',
    empty: 'حساب بانکی ثبت نشده است.',
    addHdr: 'افزودن کارت / شبای جدید',
    cardPh: 'شماره کارت ۱۶ رقمی',
    shebaPh: 'شماره شبا (۲۴ رقم)',
    submit: 'ثبت حساب بانکی',
    default: 'پیش‌فرض',
    remove: 'حذف',
    setDefault: 'پیش‌فرض کن',
    cardRequired: 'شماره کارت ۱۶ رقمی الزامی است.',
    shebaRequired: 'شماره شبا الزامی است.',
  },
  en: {
    hdr: 'Bank Accounts',
    sub: 'Saved cards and IBANs for refund payouts',
    empty: 'No bank accounts saved.',
    addHdr: 'Add card / IBAN',
    cardPh: '16-digit card number',
    shebaPh: 'IBAN (24 digits)',
    submit: 'Save bank account',
    default: 'Default',
    remove: 'Remove',
    setDefault: 'Set default',
    cardRequired: 'A 16-digit card number is required.',
    shebaRequired: 'IBAN is required.',
  },
  ar: {
    hdr: 'الحسابات البنكية',
    sub: 'البطاقات وأرقام الشبا المحفوظة لاسترداد المبالغ',
    empty: 'لا توجد حسابات بنكية.',
    addHdr: 'إضافة بطاقة / شبا',
    cardPh: 'رقم البطاقة (16 رقمًا)',
    shebaPh: 'رقم الشبا (24 رقمًا)',
    submit: 'حفظ الحساب البنكي',
    default: 'افتراضي',
    remove: 'إزالة',
    setDefault: 'تعيين كافتراضي',
    cardRequired: 'رقم البطاقة المكوّن من 16 رقمًا مطلوب.',
    shebaRequired: 'رقم الشبا مطلوب.',
  },
};

export interface BankAccountForm {
  cardNo: string;
  sheba: string;
}

export const emptyBankForm = (): BankAccountForm => ({ cardNo: '', sheba: '' });

interface Props {
  accounts: SavedBankAccount[];
  busyId: string | null;
  formBusy: boolean;
  formError: string | null;
  onRemove: (id: string) => void;
  onSetDefault: (id: string) => void;
  onCreate: (form: BankAccountForm) => Promise<void>;
}

export default function AccountBankAccountsTab({
  accounts,
  busyId,
  formBusy,
  formError,
  onRemove,
  onSetDefault,
  onCreate,
}: Props) {
  const { locale } = useLocale();
  const isMobile = useIsMobile();
  const t = STR[locale];
  const [form, setForm] = useState<BankAccountForm>(emptyBankForm());
  const [localError, setLocalError] = useState<string | null>(null);
  const cols2 = isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))';

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const card = form.cardNo.replace(/\D/g, '');
    const shebaDigits = latinDigits(form.sheba).replace(/[^0-9]/g, '').slice(0, 24);
    const sheba = `IR${shebaDigits}`;
    if (card.length !== 16) {
      setLocalError(t.cardRequired);
      return;
    }
    if (shebaDigits.length !== 24) {
      setLocalError(t.shebaRequired);
      return;
    }
    setLocalError(null);
    void onCreate({ cardNo: card, sheba })
      .then(() => setForm(emptyBankForm()))
      .catch(() => undefined);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div
        data-testid="account-banks"
        style={{ background: '#fff', border: '1px solid #eef1f5', borderRadius: 16, padding: 18 }}
      >
        <h2 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 6px' }}>{t.hdr}</h2>
        <p style={{ fontSize: 11.5, color: '#8a96a6', margin: '0 0 18px' }}>{t.sub}</p>
        {accounts.length === 0 ? (
          <p style={{ fontSize: 12, color: '#9aa4b2', margin: 0 }}>{t.empty}</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {accounts.map((c) => (
              <div
                key={c.id}
                data-testid="account-bank-row"
                style={{
                  border: '1px solid #eef1f5',
                  borderRadius: 14,
                  padding: '14px 15px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  background: c.isDefault ? '#fbfdff' : '#fff',
                }}
              >
                <span
                  style={{
                    width: 44,
                    height: 32,
                    borderRadius: 7,
                    background: c.brandColor,
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 10,
                    fontWeight: 800,
                    flex: 'none',
                  }}
                >
                  {c.bankShort}
                </span>
                <div style={{ flex: 1, lineHeight: 1.6, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{c.bankName}</div>
                  {c.cardMasked && (
                    <div
                      dir="ltr"
                      style={{
                        fontSize: 12,
                        color: '#5a6678',
                        fontFamily: 'Roboto Mono, monospace',
                      }}
                    >
                      {c.cardMasked}
                    </div>
                  )}
                  <div
                    dir="ltr"
                    style={{
                      fontSize: 10,
                      color: '#9aa4b2',
                      fontFamily: 'Roboto Mono, monospace',
                    }}
                  >
                    شبا IR{c.shebaMasked}
                  </div>
                </div>
                {c.isDefault ? (
                  <span
                    data-testid="bank-default-badge"
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: '#1668c4',
                      background: '#eef4fb',
                      padding: '4px 10px',
                      borderRadius: 14,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {t.default}
                  </span>
                ) : (
                  <button
                    type="button"
                    data-testid={`bank-set-default-${c.id}`}
                    disabled={busyId === c.id}
                    onClick={() => onSetDefault(c.id)}
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      color: '#1668c4',
                      background: 'none',
                      border: 'none',
                      cursor: busyId === c.id ? 'wait' : 'pointer',
                      fontFamily: 'inherit',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {t.setDefault}
                  </button>
                )}
                <button
                  type="button"
                  aria-label={t.remove}
                  disabled={busyId === c.id}
                  data-testid={`bank-remove-${c.id}`}
                  onClick={() => onRemove(c.id)}
                  style={{
                    fontSize: 14,
                    color: '#c2cad6',
                    background: 'none',
                    border: 'none',
                    cursor: busyId === c.id ? 'wait' : 'pointer',
                    padding: 4,
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <form
        onSubmit={submit}
        data-testid="account-banks-form"
        style={{ background: '#fff', border: '1px solid #eef1f5', borderRadius: 16, padding: 18 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <span style={{ width: 38, height: 38, display: 'grid', placeItems: 'center', borderRadius: 11, color: '#1668c4', background: '#eef4fb' }} aria-hidden>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M7 15h4"/></svg>
          </span>
          <div>
            <h3 style={{ fontSize: 14.5, fontWeight: 800, margin: 0 }}>{t.addHdr}</h3>
            <div style={{ marginTop: 3, color: '#9aa4b2', fontSize: 10.5 }}>{t.sub}</div>
          </div>
        </div>
        {(localError || formError) && (
          <p role="alert" style={{ fontSize: 12, color: '#e5484d', margin: '0 0 12px' }}>
            {localError ?? formError}
          </p>
        )}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: cols2,
            gap: 11,
            maxWidth: 540,
          }}
        >
          <label style={fieldLabelStyle}>
            <span>{t.cardPh}</span>
            <input
              aria-label={t.cardPh}
              placeholder="••••  ••••  ••••  ••••"
              dir="ltr"
              inputMode="numeric"
              autoComplete="cc-number"
              value={form.cardNo}
              onChange={(e) => setForm((f) => ({ ...f, cardNo: latinDigits(e.target.value).replace(/\D/g, '').slice(0, 16) }))}
              data-testid="bank-input-card"
              style={inputStyle}
            />
          </label>
          <label style={fieldLabelStyle}>
            <span>{t.shebaPh}</span>
            <div style={{ position: 'relative' }}>
              <input
                aria-label={t.shebaPh}
                placeholder="۰۰۰۰۰۰۰۰۰۰۰۰۰۰۰۰۰۰۰۰۰۰۰۰"
                dir="ltr"
                inputMode="numeric"
                value={form.sheba.replace(/^IR/i, '')}
                onChange={(e) => setForm((f) => ({ ...f, sheba: latinDigits(e.target.value).replace(/\D/g, '').slice(0, 24) }))}
                data-testid="bank-input-sheba"
                style={{ ...inputStyle, paddingLeft: 42 }}
              />
              <span dir="ltr" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 12, fontWeight: 800, color: '#1668c4' }}>IR</span>
            </div>
          </label>
        </div>
        <button
          type="submit"
          data-testid="bank-submit"
          disabled={formBusy}
          style={{
            display: 'flex',
            marginTop: 14,
            height: 44,
            padding: '0 24px',
            alignItems: 'center',
            borderRadius: 11,
            background: '#1668c4',
            color: '#fff',
            fontSize: 12.5,
            fontWeight: 800,
            border: 'none',
            cursor: formBusy ? 'wait' : 'pointer',
            fontFamily: 'inherit',
            width: isMobile ? '100%' : 'auto',
            justifyContent: 'center',
          }}
        >
          {formBusy ? '…' : t.submit}
        </button>
      </form>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  height: 46,
  border: '1.5px solid #e3e8ef',
  borderRadius: 12,
  padding: '0 14px',
  fontSize: 13,
  color: '#16202e',
  textAlign: 'left',
  fontFamily: 'Roboto Mono, monospace',
  outline: 'none',
};

const fieldLabelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 7,
  color: '#5a6678',
  fontSize: 11.5,
  fontWeight: 700,
};
