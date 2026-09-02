import { useNavigate } from 'react-router-dom';
import { useLocale, type StoredLocale } from '../../hooks/useLocale';
import { localeDigits } from '../../lib/locale-format';

export type FlowStep = 'search' | 'results' | 'seat' | 'checkout' | 'payment' | 'ticket';

const STEP_KEYS: FlowStep[] = ['search', 'results', 'seat', 'checkout', 'payment', 'ticket'];

const STR: Record<
  StoredLocale,
  Record<FlowStep, string> & { backTitle: string }
> = {
  fa: {
    search: 'انتخاب پرواز',
    results: 'مشخصات مسافران',
    seat: 'خدمات سفر',
    checkout: 'تأیید اطلاعات',
    payment: 'پرداخت',
    ticket: 'صدور بلیط',
    backTitle: 'بازگشت',
  },
  en: {
    search: 'Select flight',
    results: 'Passenger details',
    seat: 'Travel extras',
    checkout: 'Confirm details',
    payment: 'Payment',
    ticket: 'Ticket issued',
    backTitle: 'Back',
  },
  ar: {
    search: 'اختيار الرحلة',
    results: 'بيانات المسافرين',
    seat: 'خدمات السفر',
    checkout: 'تأكيد البيانات',
    payment: 'الدفع',
    ticket: 'إصدار التذكرة',
    backTitle: 'رجوع',
  },
};

const BACK: Record<FlowStep, string> = {
  search: '/',
  results: '/results',
  seat: '#',
  checkout: '#',
  payment: '#',
  ticket: '#',
};

export default function FlowStepper({ current, onBack }: { current: FlowStep; onBack?: () => void }) {
  const navigate = useNavigate();
  const { locale } = useLocale();
  const t = STR[locale];
  const currentIndex = STEP_KEYS.findIndex((s) => s === current);

  return (
    <div style={{ maxWidth: 1140, margin: '0 auto', padding: '12px 26px 0' }}>
      <div
        style={{
          background: '#fff',
          border: '1px solid #e6eaf0',
          borderRadius: 14,
          boxShadow: '0 10px 26px -18px rgba(13,38,102,.35)',
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          overflowX: 'auto',
        }}
      >
        {onBack && (
          <>
            <div
              data-testid="flow-back"
              onClick={onBack}
              title={t.backTitle}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flex: 'none',
                cursor: 'pointer',
                width: 38,
                height: 38,
                borderRadius: '50%',
                background: '#fff',
                border: '1.5px solid #dfe6ef',
                color: '#1668c4',
                fontSize: 16,
                lineHeight: 1,
              }}
            >
              →
            </div>
            <span style={{ flex: 'none', width: 1.5, height: 24, background: '#eef1f5' }} />
          </>
        )}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
          {STEP_KEYS.map((key, i) => {
            const done = i < currentIndex;
            const active = i === currentIndex;
            const back = BACK[key];
            const clickable = done && back !== '#';
            const pillBg = active ? '#1668c4' : done ? '#eef4fb' : '#f4f6fa';
            const pillBorder = active ? '#1668c4' : done ? '#dce8f7' : '#e6eaf0';
            const labelColor = active ? '#fff' : done ? '#1668c4' : '#9aa4b2';
            return (
              <div
                key={key}
                style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 0, overflow: 'hidden' }}
              >
                <div
                  data-testid={`flow-step-${key}`}
                  onClick={clickable ? () => navigate(back) : undefined}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    flex: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    cursor: clickable ? 'pointer' : 'default',
                    background: pillBg,
                    border: `1px solid ${pillBorder}`,
                    borderRadius: 22,
                    padding: '6px 6px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span
                    style={{
                      width: 21,
                      height: 21,
                      borderRadius: '50%',
                      background: active ? '#fff' : done ? '#1668c4' : '#fff',
                      color: active ? '#1668c4' : done ? '#fff' : '#9aa4b2',
                      border: `1.5px solid ${active ? '#fff' : done ? '#1668c4' : '#e2e7ee'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 10,
                      fontWeight: 800,
                      flex: 'none',
                    }}
                  >
                    {done ? '✓' : localeDigits(i + 1, locale)}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: active ? 800 : 600,
                      color: labelColor,
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {t[key]}
                  </span>
                </div>
                {i < STEP_KEYS.length - 1 && (
                  <span style={{ flex: 'none', width: 14, height: 1.5, background: '#e2e7ee' }} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
