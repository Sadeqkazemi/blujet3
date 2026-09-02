import { useLocale, type StoredLocale } from '../../hooks/useLocale';
import type { SavedPassenger } from '../../types/public-site';

const STR: Record<
  StoredLocale,
  { label: string; childSuffix: string }
> = {
  fa: {
    label: 'مسافران ذخیره‌شده — انتخاب برای پرکردن خودکار',
    childSuffix: ' (کودک)',
  },
  en: {
    label: 'Saved passengers — select to autofill',
    childSuffix: ' (child)',
  },
  ar: {
    label: 'المسافرون المحفوظون — اختر للملء التلقائي',
    childSuffix: ' (طفل)',
  },
};

interface Props {
  passengers: SavedPassenger[];
  activeIndex: number;
  usedIds: Set<string>;
  onSelect: (passenger: SavedPassenger, index: number) => void;
}

export default function SavedPassengerAutofill({
  passengers,
  activeIndex,
  usedIds,
  onSelect,
}: Props) {
  const { locale } = useLocale();
  const t = STR[locale];

  if (passengers.length === 0) return null;

  return (
    <div
      data-testid="saved-pax-autofill"
      style={{
        background: '#eef4fb',
        border: '1px solid #dce8f7',
        borderRadius: 12,
        padding: '10px 11px',
        marginBottom: 16,
      }}
    >
      <div
        style={{
          fontSize: 13.5,
          fontWeight: 700,
          color: '#0d2640',
          marginBottom: 10,
        }}
      >
        {t.label}
      </div>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
        {passengers.map((p) => {
          const selected = usedIds.has(p.id);
          return (
            <button
              key={p.id}
              type="button"
              data-testid={`saved-pax-chip-${p.id}`}
              onClick={() => onSelect(p, activeIndex)}
              style={{
                padding: '6px 11px',
                borderRadius: 18,
                border: `1.5px solid ${selected ? '#1668c4' : '#c8d9ef'}`,
                background: selected ? '#1668c4' : '#fff',
                color: selected ? '#fff' : '#0d2640',
                fontSize: 13.5,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {p.fullName}
              {p.isChild ? t.childSuffix : ''}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Map a saved passenger row into the book-page draft shape. */
export function savedPassengerToDraft(p: SavedPassenger) {
  return {
    fullName: p.fullName,
    nationalId: p.nationalId ?? '',
    mobile: p.mobile ?? '',
  };
}
