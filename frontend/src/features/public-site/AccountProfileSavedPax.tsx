import { useLocale, type StoredLocale } from '../../hooks/useLocale';
import type { SavedPassenger } from '../../types/public-site';
import { passengerInitials, passengerMeta } from './AccountPassengersTab';

const STR: Record<
  StoredLocale,
  {
    hdr: string;
    add: string;
    empty: string;
    childSuffix: string;
  }
> = {
  fa: {
    hdr: 'مسافران ذخیره‌شده',
    add: 'افزودن مسافر',
    empty: 'مسافری ذخیره نشده است.',
    childSuffix: ' (کودک)',
  },
  en: {
    hdr: 'Saved Passengers',
    add: 'Add Passenger',
    empty: 'No passengers saved.',
    childSuffix: ' (child)',
  },
  ar: {
    hdr: 'المسافرون المحفوظون',
    add: 'إضافة مسافر',
    empty: 'لا يوجد مسافرون محفوظون.',
    childSuffix: ' (طفل)',
  },
};

interface Props {
  passengers: SavedPassenger[];
  onAdd: () => void;
}

export default function AccountProfileSavedPax({ passengers, onAdd }: Props) {
  const { locale } = useLocale();
  const t = STR[locale];

  return (
    <div
      data-testid="profile-saved-pax"
      style={{ background: '#fff', border: '1px solid #eef1f5', borderRadius: 16, padding: 18 }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
        }}
      >
        <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>{t.hdr}</h3>
        <button
          type="button"
          data-testid="profile-saved-pax-add"
          onClick={onAdd}
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
          + {t.add}
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {passengers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 20, color: '#9aa4b2', fontSize: 11.5 }}>{t.empty}</div>
        ) : (
          passengers.map((p) => (
            <div
              key={p.id}
              data-testid="profile-saved-pax-row"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 11,
                border: '1px solid #eef1f5',
                borderRadius: 12,
                padding: '11px 13px',
              }}
            >
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: '50%',
                  background: '#eef4fb',
                  color: '#1668c4',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: 12,
                  flex: 'none',
                }}
              >
                {passengerInitials(p.fullName)}
              </div>
              <div style={{ lineHeight: 1.5, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700 }}>
                  {p.fullName}
                  {p.isChild ? t.childSuffix : ''}
                </div>
                <div
                  dir="ltr"
                  style={{
                    fontSize: 10.5,
                    color: '#9aa4b2',
                    fontFamily: 'Roboto Mono, monospace',
                  }}
                >
                  {passengerMeta(p)}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
