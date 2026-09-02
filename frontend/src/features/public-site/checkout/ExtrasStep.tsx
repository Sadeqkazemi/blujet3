import { useEffect, useState, type ReactNode } from 'react';
import { fetchPublicSiteRules } from '../../../api/settings';
import { useIsMobile } from '../../../hooks/useIsMobile';
import type { StoredLocale } from '../../../hooks/useLocale';
import { localeMoney } from '../../../lib/fa-format';
import { localeDigits } from '../../../lib/locale-format';
import type { CabinClass, SeatMapCell } from '../../../types/public-site';
import type { PublicAncillaryService } from '../../../types/ancillary-services';
import { CHECKOUT_COPY } from './checkout-copy';
import {
  extraDescription,
  extraTitle,
  extraTotalIrr,
  type ExtraServiceState,
} from './checkout-types';
import Md80SeatMap from './Md80SeatMap';
import {
  buildMd80Seats,
  looksLikeLegacyA320SeatPayload,
  mapLegacyTakenSeatsToMd80,
  shouldUseMd80SeatMap,
} from './md80-seat-layout';
import {
  classifySeatType,
  seatTypeTotalIrr,
} from './seat-type-pricing';

function SvgBag() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M3 12h18" />
    </svg>
  );
}

function SvgMeal() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 17h18" />
      <path d="M4 17a8 6 0 0 1 16 0" />
      <path d="M12 8V5" />
      <circle cx="12" cy="4" r="1" />
    </svg>
  );
}

function SvgIns() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function SvgCip() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3l2.6 5.6 6 .7-4.4 4.2 1.1 6-5.3-3-5.3 3 1.1-6-4.4-4.2 6-.7z" />
    </svg>
  );
}

const EXTRA_ICONS: Partial<Record<ExtraServiceState['code'], ReactNode>> = {
  EXTRA_BAGGAGE: <SvgBag />,
  SPECIAL_MEAL: <SvgMeal />,
  TRAVEL_INSURANCE: <SvgIns />,
  CIP: <SvgCip />,
};

function seatServiceTitle(service: PublicAncillaryService, locale: StoredLocale): string {
  if (locale === 'en') return service.titleEn || 'Seat option';
  if (locale === 'ar') return service.titleAr || 'خيار المقعد';
  return service.titleFa;
}

/** Left block is always 2 seats for generic maps; aisle before index 2. */
const AISLE_BEFORE_INDEX = 2;

function GenericSeatMap({
  locale,
  seats,
  selectedSeats,
  onToggleSeat,
  businessLocked,
  bookedCabin,
  selectionLimitReached,
}: {
  locale: StoredLocale;
  seats: SeatMapCell[];
  selectedSeats: string[];
  onToggleSeat: (seatCode: string) => void;
  businessLocked: boolean;
  bookedCabin: CabinClass;
  selectionLimitReached: boolean;
}) {
  const rows = (() => {
    const byRow = new Map<number, SeatMapCell[]>();
    for (const s of seats) {
      const list = byRow.get(s.row) ?? [];
      list.push(s);
      byRow.set(s.row, list);
    }
    return [...byRow.entries()]
      .sort(([a], [b]) => a - b)
      .map(([num, rowSeats]) => ({
        num,
        seats: rowSeats.sort((a, b) => a.seatCode.localeCompare(b.seatCode)),
      }));
  })();

  return (
    <div
      className="flex max-h-[300px] flex-col gap-[5px] overflow-auto rounded-[13px] border border-[#eef1f5] bg-[#f8fafc] p-[13px]"
      data-testid="checkout-seat-map"
    >
      {rows.map((r) => (
        <div key={r.num} className="flex items-center gap-[5px]">
          <span className="w-5 flex-none text-center text-[9.5px] text-[#9aa4b2]">
            {localeDigits(r.num, locale)}
          </span>
          {r.seats.map((st, idx) => {
            const selected = selectedSeats.includes(st.seatCode);
            const taken = st.status === 'TAKEN';
            const biz = st.cabin === 'BUSINESS';
            const locked =
              (biz && businessLocked && bookedCabin !== 'BUSINESS') ||
              st.cabin !== bookedCabin ||
              (selectionLimitReached && !selected);
            let bg = biz ? '#fff6e3' : '#eaf4ff';
            let border = biz ? '#e6c368' : '#bcd9f5';
            let color = biz ? '#a9781a' : '#1668c4';
            if (taken) {
              bg = '#e6eaf0';
              border = '#e6eaf0';
              color = '#c2c9d3';
            } else if (selected) {
              bg = '#1668c4';
              border = '#1668c4';
              color = '#fff';
            } else if (locked) {
              bg = biz ? '#f3f0e6' : '#f0f3f7';
              border = biz ? '#ddd6c0' : '#d5dbe5';
              color = biz ? '#b3a679' : '#9aa4b2';
            }
            return (
              <button
                key={st.seatCode}
                type="button"
                disabled={taken || locked}
                onClick={() => onToggleSeat(st.seatCode)}
                data-testid={`checkout-seat-${st.seatCode}`}
                className="flex h-[30px] w-[30px] items-center justify-center rounded-[7px] border-[1.5px] text-[9.5px] font-bold disabled:cursor-not-allowed"
                style={{
                  background: bg,
                  borderColor: border,
                  color,
                  marginInlineStart: idx === AISLE_BEFORE_INDEX ? 14 : 0,
                }}
              >
                {st.seatCode.replace(/^\d+/, '')}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export default function ExtrasStep({
  locale,
  extras,
  onToggleExtra,
  onExtraQuantityChange,
  passengerCount,
  seatSelectionLimit = passengerCount,
  seats,
  selectedSeats,
  onToggleSeat,
  businessLocked,
  bookedCabin,
  aircraftType,
  clubBalance,
  seatServices = [],
}: {
  locale: StoredLocale;
  extras: ExtraServiceState[];
  onToggleExtra: (id: ExtraServiceState['id']) => void;
  onExtraQuantityChange: (id: ExtraServiceState['id'], quantity: number) => void;
  passengerCount: number;
  seatSelectionLimit?: number;
  seats: SeatMapCell[] | null;
  selectedSeats: string[];
  onToggleSeat: (seatCode: string) => void;
  businessLocked: boolean;
  bookedCabin: CabinClass;
  aircraftType: string;
  clubBalance: number;
  seatServices?: PublicAncillaryService[];
}) {
  const t = CHECKOUT_COPY[locale];
  const isMobile = useIsMobile();
  const [seatOpen, setSeatOpen] = useState(false);
  const [petRulesOpen, setPetRulesOpen] = useState(false);
  const [petRulesAccepted, setPetRulesAccepted] = useState(false);
  const [petRulesText, setPetRulesText] = useState('');
  const seatSelectionExtra = extras.find((extra) => extra.code === 'SEAT_SELECTION');
  const petExtra = extras.find((extra) => extra.code === 'PET');
  const loyaltySeatAccess = clubBalance >= 15_000;
  const paidSeatAccess = Boolean(seatSelectionExtra?.selected);
  const seatAccessGranted = loyaltySeatAccess || paidSeatAccess;
  const normalizedSeatLimit = Math.max(0, seatSelectionLimit);
  const remainingSeatCount = Math.max(0, normalizedSeatLimit - selectedSeats.length);
  const selectionLimitReached = selectedSeats.length >= normalizedSeatLimit;
  const aircraft = aircraftType.trim() || 'MD-80';
  const seatServiceByKey = new Map(seatServices.map((service) => [service.key, service]));
  const selectedSeatTypesIrr = seatTypeTotalIrr(selectedSeats, aircraft, seatServices);
  const rawSeats = seats ?? [];
  const useMd80 = shouldUseMd80SeatMap(aircraft, rawSeats);

  const displaySeats = useMd80
    ? (() => {
        const takenRaw = rawSeats.filter((s) => s.status === 'TAKEN').map((s) => s.seatCode);
        const taken = looksLikeLegacyA320SeatPayload(rawSeats) ? mapLegacyTakenSeatsToMd80(takenRaw) : takenRaw;
        return buildMd80Seats(taken).map((built) => {
          const fromApi = rawSeats.find((s) => s.seatCode === built.seatCode);
          return fromApi ?? built;
        });
      })()
    : rawSeats.length > 0
      ? rawSeats
      : [];
  const sold = displaySeats.filter((s) => s.status === 'TAKEN').length;
  const cap = displaySeats.length || (useMd80 ? 140 : 0);

  useEffect(() => {
    let cancelled = false;
    void fetchPublicSiteRules(locale)
      .then((rules) => {
        if (!cancelled) {
          setPetRulesText(
            locale === 'fa'
              ? rules.categories.find((category) => category.id === 'pets')?.text ?? ''
              : '',
          );
        }
      })
      .catch(() => {
        if (!cancelled) setPetRulesText('');
      });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  useEffect(() => {
    if (!seatAccessGranted) setSeatOpen(false);
  }, [seatAccessGranted]);

  const handleSeatToggle = (seatCode: string) => {
    if (selectedSeats.includes(seatCode) || !selectionLimitReached) {
      onToggleSeat(seatCode);
    }
  };

  const toggleExtra = (extra: ExtraServiceState) => {
    if (extra.code === 'PET' && !extra.selected && !petRulesAccepted) {
      setPetRulesOpen(true);
      return;
    }
    onToggleExtra(extra.id);
    if (extra.code === 'SEAT_SELECTION') setSeatOpen(!extra.selected);
  };

  const seatAccessCopy =
    locale === 'en'
      ? {
          locked: 'Seat selection is available after paying its fee or with at least 15,000 club points.',
          pay: 'Accept seat-selection fee',
          loyalty: 'Unlocked with club points',
          limit: (maximum: string, remaining: string) =>
            `You may select up to ${maximum} seats; ${remaining} remaining.`,
        }
      : locale === 'ar'
        ? {
            locked: 'يتاح اختيار المقعد بعد دفع الرسوم أو بامتلاك ١٥٬٠٠٠ نقطة نادي على الأقل.',
            pay: 'قبول رسوم اختيار المقعد',
            loyalty: 'مفتوح بنقاط النادي',
            limit: (maximum: string, remaining: string) =>
              `يمكنك اختيار ${maximum} مقعد كحد أقصى؛ المتبقي ${remaining}.`,
          }
        : {
            locked: 'برای باز کردن نقشه، هزینه انتخاب صندلی را بپذیرید یا حداقل ۱۵٬۰۰۰ امتیاز باشگاه داشته باشید.',
            pay: 'پذیرش هزینه انتخاب صندلی',
            loyalty: 'بازشده با امتیاز باشگاه',
            limit: (maximum: string, remaining: string) =>
              `حداکثر ${maximum} صندلی مجاز است؛ ${remaining} صندلی باقی مانده.`,
          };

  return (
    <section
      className="rounded-[15px] border border-[#eef1f5] bg-white px-[17px] py-4"
      data-testid="checkout-extras-step"
    >
      <div className="mb-1.5 flex items-center gap-2.5">
        <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-[#eef4fb] text-[#1668c4]">
          <SvgBag />
        </span>
        <h2 className="m-0 text-[15.5px] font-extrabold text-[#0d2640]">{t.travelExtras}</h2>
      </div>
      <p className="mb-[15px] mt-0 text-[11.5px] text-[#9aa4b2]">{t.pickServices}</p>

      <div
        className="mb-4 grid gap-2.5"
        data-testid="checkout-extras-grid"
        style={{ gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}
      >
        {extras.map((sv) => {
          const title = extraTitle(sv, locale);
          const description = extraDescription(sv, locale);
          return (
            <div
              key={sv.id}
              data-testid={`checkout-extra-${sv.id}`}
              className={`flex items-center justify-between gap-2.5 rounded-[13px] border-[1.5px] px-3.5 py-[13px] text-start ${
                sv.selected ? 'border-[#1668c4] bg-[#f6faff]' : 'border-[#e6eaf0] bg-white'
              }`}
            >
              <button
                type="button"
                onClick={() => toggleExtra(sv)}
                data-testid={`checkout-extra-${sv.id}-toggle`}
                className="flex min-w-0 flex-1 items-center gap-[11px] text-start"
              >
                <span className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[11px] bg-[#f2f6fb] text-[#1668c4]">
                  {EXTRA_ICONS[sv.code] ?? <SvgCip />}
                </span>
                <div className="leading-relaxed">
                  <div className="text-[12.5px] font-extrabold text-[#0d2640]">{title}</div>
                  {description && <div className="text-[10.5px] text-[#8a96a6]">{description}</div>}
                </div>
              </button>
              <div className="flex flex-none flex-col items-end gap-1.5">
                <div className="text-xs font-extrabold text-[#1668c4]">
                  {localeMoney(extraTotalIrr(sv, passengerCount).toString(), locale)} {t.toman}
                </div>
                {sv.billingUnit === 'PER_KG' && sv.selected ? (
                  <div className="flex items-center gap-2" dir="ltr">
                    <button
                      type="button"
                      aria-label={locale === 'en' ? 'Decrease kilograms' : locale === 'ar' ? 'تقليل الكيلوغرامات' : 'کاهش کیلوگرم'}
                      onClick={() => onExtraQuantityChange(sv.id, Math.max(1, sv.quantity - 1))}
                      className="h-6 w-6 rounded bg-[#e8eef6] text-[#1668c4]"
                    >
                      −
                    </button>
                    <span className="min-w-8 text-center text-[11px] text-[#5a6678]">
                      {localeDigits(sv.quantity, locale)} kg
                    </span>
                    <button
                      type="button"
                      aria-label={locale === 'en' ? 'Increase kilograms' : locale === 'ar' ? 'زيادة الكيلوغرامات' : 'افزایش کیلوگرم'}
                      onClick={() => onExtraQuantityChange(sv.id, Math.min(50, sv.quantity + 1))}
                      className="h-6 w-6 rounded bg-[#e8eef6] text-[#1668c4]"
                    >
                      +
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    aria-label={title}
                    onClick={() => toggleExtra(sv)}
                    className={`relative inline-block h-5 w-[34px] rounded-xl transition-colors ${sv.selected ? 'bg-[#1668c4]' : 'bg-[#d7dee8]'}`}
                  >
                    <span
                      className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.25)] transition-all ${sv.selected ? 'right-0.5 left-auto' : 'left-0.5 right-auto'}`}
                    />
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {extras.length === 0 && (
          <p className="col-span-full rounded-[13px] border border-dashed border-[#d7dee8] px-4 py-6 text-center text-xs text-[#8a96a6]">
            {t.noExtrasAvailable}
          </p>
        )}
      </div>

      {petExtra && petRulesOpen && !petExtra.selected && (
        <div
          className="mb-4 rounded-xl border border-[#ead8ab] bg-[#fffaf0] px-4 py-3"
          data-testid="checkout-pet-rules"
        >
          <div className="text-[12px] font-extrabold text-[#73591f]">
            {locale === 'en' ? 'Pet travel rules' : locale === 'ar' ? 'قواعد نقل الحيوانات الأليفة' : 'قوانین حمل حیوان خانگی'}
          </div>
          <p className="mt-2 whitespace-pre-line text-[11px] leading-6 text-[#73591f]">
            {petRulesText || (locale === 'en'
              ? 'Pets must travel in a suitable carrier with valid health documents.'
              : locale === 'ar'
                ? 'يجب نقل الحيوانات في حاملة مناسبة مع وثائق صحية سارية.'
                : 'حمل حیوان خانگی فقط با قفس مناسب و مدارک سلامت معتبر امکان‌پذیر است.')}
          </p>
          <label className="mt-2 flex items-center gap-2 text-[11px] font-bold text-[#73591f]">
            <input
              type="checkbox"
              checked={petRulesAccepted}
              onChange={(event) => setPetRulesAccepted(event.target.checked)}
              data-testid="checkout-pet-rules-accept"
            />
            {locale === 'en' ? 'I accept the pet travel rules' : locale === 'ar' ? 'أوافق على قواعد نقل الحيوانات' : 'قوانین حمل حیوان خانگی را می‌پذیرم'}
          </label>
          <button
            type="button"
            disabled={!petRulesAccepted}
            onClick={() => {
              setPetRulesOpen(false);
              onToggleExtra(petExtra.id);
            }}
            className="mt-3 w-full rounded-lg bg-[#1668c4] px-3 py-2 text-[11px] font-extrabold text-white disabled:opacity-50"
            data-testid="checkout-pet-accept"
          >
            {locale === 'en' ? 'Confirm and add pet service' : locale === 'ar' ? 'تأكيد وإضافة خدمة الحيوان' : 'تأیید و افزودن خدمت حمل حیوان'}
          </button>
        </div>
      )}

      <div className="border-t border-[#f0f2f6] pt-[15px]">
        <button
          type="button"
          onClick={() => {
            if (seatAccessGranted) setSeatOpen((value) => !value);
          }}
          aria-expanded={seatOpen}
          aria-disabled={!seatAccessGranted}
          disabled={!seatAccessGranted}
          className="mb-2.5 flex w-full items-center justify-between gap-2 text-start"
          data-testid="checkout-seat-toggle"
        >
          <div>
            <div className="text-[13px] font-extrabold text-[#0d2640]">
              {seatAccessGranted
                ? t.seatMapCaption(useMd80 ? 'MD-80' : aircraft)
                : (locale === 'en' ? 'Seat selection' : locale === 'ar' ? 'اختيار المقعد' : 'انتخاب صندلی')}
            </div>
            {seatAccessGranted && businessLocked && <div className="mt-1 text-[10.5px] text-[#96701a]">🔒 {t.bizLockedHint}</div>}
            {loyaltySeatAccess && (
              <div className="mt-1 text-[10.5px] font-bold text-[#258b6a]" data-testid="checkout-seat-loyalty-access">
                {seatAccessCopy.loyalty}
              </div>
            )}
          </div>
          <span
            className="flex-none text-sm text-[#8a96a6] transition-transform"
            style={{ transform: seatOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
          >
            {seatAccessGranted ? '⌄' : '🔒'}
          </span>
        </button>

        {!seatAccessGranted && (
          <div
            className="mb-3 rounded-xl border border-[#ead8ab] bg-[#fffaf0] px-3.5 py-3"
            data-testid="checkout-seat-access-gate"
          >
            <p className="m-0 text-[11px] leading-6 text-[#73591f]">{seatAccessCopy.locked}</p>
            {seatSelectionExtra && (
              <button
                type="button"
                onClick={() => toggleExtra(seatSelectionExtra)}
                className="mt-2 rounded-lg bg-[#1668c4] px-3.5 py-2 text-[11px] font-extrabold text-white"
                data-testid="checkout-seat-accept-fee"
              >
                {seatAccessCopy.pay} — {localeMoney(extraTotalIrr(seatSelectionExtra, passengerCount).toString(), locale)} {t.toman}
              </button>
            )}
          </div>
        )}

        {seatOpen && seatAccessGranted && (
          <>
            <div
              data-testid="checkout-seat-instructions"
              className="mb-2.5 rounded-xl border border-[#cfe0f5] bg-[#f6faff] px-3.5 py-2.5 text-[11px] font-bold text-[#1668c4]"
            >
              {seatAccessCopy.limit(
                localeDigits(normalizedSeatLimit, locale),
                localeDigits(remainingSeatCount, locale),
              )}
            </div>
            <div className="mb-2.5 flex gap-[11px] text-[10.5px] text-[#5a6678]">
              <span className="flex items-center gap-1">
                <span className="h-[13px] w-[13px] rounded border-[1.5px] border-[#e6c368] bg-[#fff6e3]" />
                {t.business}
              </span>
              <span className="flex items-center gap-1">
                <span className="h-[13px] w-[13px] rounded border-[1.5px] border-[#bcd9f5] bg-[#eaf4ff]" />
                {t.available}
              </span>
              <span className="flex items-center gap-1">
                <span className="h-[13px] w-[13px] rounded bg-[#e6eaf0]" />
                {t.reserved}
              </span>
            </div>
            {seatServices.length > 0 && (
              <div className="mb-3 grid gap-2 sm:grid-cols-3" data-testid="checkout-seat-type-prices">
                {(['seat-normal', 'seat-legroom', 'seat-window-aisle'] as const).map((key) => {
                  const service = seatServiceByKey.get(key);
                  if (!service) return null;
                  return (
                    <div key={key} className="rounded-xl border border-[#dce8f5] bg-[#f8fbff] px-3 py-2 text-[10.5px] text-[#53647a]">
                      <span className="font-bold">{seatServiceTitle(service, locale)}</span>
                      <b className="font-num ms-2 text-[#1668c4]">{localeMoney(service.priceIrr, locale)} {t.toman}</b>
                    </div>
                  );
                })}
              </div>
            )}
            {seats === null && !useMd80 ? (
              <p className="text-xs text-[#8a96a6]">{t.loading}</p>
            ) : useMd80 ? (
              <Md80SeatMap
                locale={locale}
                seats={displaySeats}
                selectedSeats={selectedSeats}
                onToggleSeat={handleSeatToggle}
                businessLocked={businessLocked}
                bookedCabin={bookedCabin}
                selectionLimitReached={selectionLimitReached}
              />
            ) : (
              <GenericSeatMap
                locale={locale}
                seats={displaySeats}
                selectedSeats={selectedSeats}
                onToggleSeat={handleSeatToggle}
                businessLocked={businessLocked}
                bookedCabin={bookedCabin}
                selectionLimitReached={selectionLimitReached}
              />
            )}
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2.5 text-[11px] text-[#5a6678]">
              <div>
                {t.selectedSeat}:{' '}
                <b className="text-[#1668c4]" dir="ltr">
                  {selectedSeats.join(', ') || t.noneSelected}
                </b>
                {selectedSeats.length > 0 && seatServices.length > 0 && (
                  <span className="ms-2 text-[10px] text-[#6b7787]" data-testid="checkout-seat-type-subtotal">
                    ({selectedSeats.map((seatCode) => {
                      const service = seatServiceByKey.get(classifySeatType(seatCode, aircraft));
                      return service ? seatServiceTitle(service, locale) : null;
                    }).filter(Boolean).join(locale === 'en' ? ', ' : '، ')} · {localeMoney(selectedSeatTypesIrr.toString(), locale)} {t.toman})
                  </span>
                )}
              </div>
              <div>
                {t.totalSold}: <b className="text-[#c0343a]">{localeDigits(sold, locale)}</b> {t.ofLabel}{' '}
                <b>{localeDigits(cap, locale)}</b>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
