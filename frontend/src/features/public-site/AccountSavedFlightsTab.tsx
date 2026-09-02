import { useNavigate } from 'react-router-dom';
import { localeMoney } from '../../lib/fa-format';
import { formatLocaleDateTime } from '../../lib/locale-format';
import { useLocale, type StoredLocale } from '../../hooks/useLocale';
import type { SavedFlight } from '../../types/public-site';

const STR: Record<StoredLocale, {
  hdr: string;
  sub: string;
  empty: string;
  book: string;
  remove: string;
  toman: string;
  unavailable: string;
  airline: string;
}> = {
  fa: {
    hdr: 'نشان‌شده‌ها',
    sub: 'پروازهایی که برای بعد ذخیره کرده‌اید',
    empty: 'هنوز پروازی ذخیره نکرده‌اید.',
    book: 'رزرو',
    remove: 'حذف',
    toman: 'تومان',
    unavailable: 'دیگر قابل رزرو نیست',
    airline: 'blujet',
  },
  en: {
    hdr: 'Saved Flights',
    sub: 'Flights you saved for later',
    empty: "You haven't saved any flights yet.",
    book: 'Book',
    remove: 'Remove',
    toman: 'Toman',
    unavailable: 'No longer bookable',
    airline: 'blujet',
  },
  ar: {
    hdr: 'الرحلات المحفوظة',
    sub: 'رحلات حفظتها للاحقاً',
    empty: 'لم تحفظ أي رحلة بعد.',
    book: 'حجز',
    remove: 'إزالة',
    toman: 'تومان',
    unavailable: 'لم يعد متاحاً للحجز',
    airline: 'blujet',
  },
};

interface Props {
  flights: SavedFlight[];
  busyId: string | null;
  onRemove: (id: string) => void;
}

export default function AccountSavedFlightsTab({ flights, busyId, onRemove }: Props) {
  const { locale } = useLocale();
  const t = STR[locale];
  const navigate = useNavigate();

  return (
    <div
      data-testid="account-saved-flights"
      style={{ background: '#fff', border: '1px solid #eef1f5', borderRadius: 16, padding: 18 }}
    >
      <h2 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 6px' }}>{t.hdr}</h2>
      <p style={{ fontSize: 11.5, color: '#8a96a6', margin: '0 0 20px' }}>{t.sub}</p>

      {flights.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 26, color: '#9aa4b2', fontSize: 12 }}>{t.empty}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
          {flights.map((f) => (
            <div
              key={f.id}
              data-testid="saved-flight-card"
              style={{
                border: '1px solid #eef1f5',
                borderRadius: 14,
                padding: '13px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <div style={{ lineHeight: 1.5 }}>
                  <div style={{ fontSize: 14, fontWeight: 800 }}>
                    {f.originCityFa} ← {f.destCityFa}
                  </div>
                  <div style={{ fontSize: 11, color: '#9aa4b2' }}>
                    {t.airline} · {formatLocaleDateTime(f.departureAt, locale)}
                  </div>
                </div>
                <span
                  dir="ltr"
                  style={{
                    fontSize: 11,
                    fontFamily: 'Roboto Mono, monospace',
                    color: '#5a6678',
                    background: '#f6f8fb',
                    padding: '4px 10px',
                    borderRadius: 8,
                  }}
                >
                  {f.flightNo}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ textAlign: 'left' }}>
                  {f.bookable ? (
                    <>
                      <div style={{ fontSize: 14, fontWeight: 900, color: '#1668c4' }}>
                        {localeMoney(f.priceIrr, locale)}
                      </div>
                      <div style={{ fontSize: 10, color: '#9aa4b2' }}>{t.toman}</div>
                    </>
                  ) : (
                    <div style={{ fontSize: 11, color: '#9aa4b2' }}>{t.unavailable}</div>
                  )}
                </div>
                {f.bookable && (
                  <button
                    type="button"
                    onClick={() => navigate(`/book/${f.flightInstanceId}?cabin=${f.cabin}`)}
                    style={{
                      fontSize: 11.5,
                      fontWeight: 800,
                      color: '#fff',
                      background: '#1668c4',
                      padding: '9px 14px',
                      borderRadius: 10,
                      border: 'none',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    {t.book}
                  </button>
                )}
                <button
                  type="button"
                  aria-label={t.remove}
                  disabled={busyId === f.id}
                  onClick={() => onRemove(f.id)}
                  style={{
                    fontSize: 14,
                    color: '#c2cad6',
                    background: 'none',
                    border: 'none',
                    cursor: busyId === f.id ? 'wait' : 'pointer',
                    padding: 4,
                  }}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
