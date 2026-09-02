import { useEffect, useMemo, useState } from 'react';
import { fetchClubPoints, fetchSeatMap } from '../../../api/publicSite';
import type { StoredLocale } from '../../../hooks/useLocale';
import { localeMoney } from '../../../lib/fa-format';
import { localeDigits } from '../../../lib/locale-format';
import { publicCabinLabel } from '../../../lib/flight-definition';
import type { CabinClass, SearchFlightResult, SeatMapCell } from '../../../types/public-site';
import { CHECKOUT_COPY } from '../checkout/checkout-copy';
import {
  passengerTotalIrr,
  seatCountForMix,
  type PassengerMix,
} from '../checkout/checkout-types';
import Md80SeatMap from '../checkout/Md80SeatMap';
import {
  buildMd80Seats,
  looksLikeLegacyA320SeatPayload,
  looksLikeMd80SeatPayload,
  mapLegacyTakenSeatsToMd80,
  shouldUseMd80SeatMap,
} from '../checkout/md80-seat-layout';
import type { ResultsCopy } from './results-copy';
import { flightAirlineLabel, formatFlightClock, primaryCabin } from './results-utils';

const BUSINESS_SEAT_MIN_POINTS = 15_000;

type Props = {
  open: boolean;
  locale: StoredLocale;
  copy: ResultsCopy;
  flight: SearchFlightResult;
  cabin: CabinClass;
  passengerMix: PassengerMix;
  cityName: (code: string) => string;
  onClose: () => void;
  onContinue: (selectedSeats: string[]) => void;
};

export default function ResultsBuyModal({
  open,
  locale,
  copy,
  flight,
  cabin,
  passengerMix,
  cityName,
  onClose,
  onContinue,
}: Props) {
  const checkoutCopy = CHECKOUT_COPY[locale];
  const [seats, setSeats] = useState<SeatMapCell[] | null>(null);
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  const [clubBalance, setClubBalance] = useState(0);

  const cabinOpt =
    flight.cabins.find((c) => c.cabin === cabin) ?? primaryCabin(flight);
  const priceIrr = cabinOpt?.priceIrr ?? '0';
  const totalIrr = passengerTotalIrr(priceIrr, passengerMix);
  const seatNeed = seatCountForMix(passengerMix);
  const aircraft = flight.aircraftType?.trim() || 'MD-80';

  useEffect(() => {
    if (!open) return;
    setSelectedSeats([]);
    setSeats(null);
    fetchClubPoints()
      .then((c) => setClubBalance(c.balance))
      .catch(() => setClubBalance(0));
    fetchSeatMap(flight.flightInstanceId)
      .then((m) => {
        const useMd80 = shouldUseMd80SeatMap(aircraft, m.seats);
        if (useMd80 && !looksLikeMd80SeatPayload(m.seats)) {
          const takenRaw = m.seats.filter((s) => s.status === 'TAKEN').map((s) => s.seatCode);
          const taken = looksLikeLegacyA320SeatPayload(m.seats)
            ? mapLegacyTakenSeatsToMd80(takenRaw)
            : takenRaw;
          setSeats(buildMd80Seats(taken));
          return;
        }
        setSeats(m.seats.length ? m.seats : useMd80 ? buildMd80Seats() : []);
      })
      .catch(() => {
        setSeats(shouldUseMd80SeatMap(aircraft, []) ? buildMd80Seats() : []);
      });
  }, [open, flight.flightInstanceId, aircraft]);

  const useMd80 = shouldUseMd80SeatMap(aircraft, seats ?? []);
  const displaySeats = useMemo(() => {
    const raw = seats ?? [];
    if (!useMd80) return raw;
    const takenRaw = raw.filter((s) => s.status === 'TAKEN').map((s) => s.seatCode);
    const taken = looksLikeLegacyA320SeatPayload(raw)
      ? mapLegacyTakenSeatsToMd80(takenRaw)
      : takenRaw;
    return buildMd80Seats(taken).map((built) => raw.find((s) => s.seatCode === built.seatCode) ?? built);
  }, [seats, useMd80]);

  const businessLocked = clubBalance < BUSINESS_SEAT_MIN_POINTS;
  const sold = displaySeats.filter((s) => s.status === 'TAKEN').length;
  const cap = displaySeats.length || (useMd80 ? 140 : 0);

  function toggleSeat(seatCode: string) {
    setSelectedSeats((prev) => {
      if (prev.includes(seatCode)) {
        return prev.filter((s) => s !== seatCode);
      }
      if (prev.length >= seatNeed) {
        return prev;
      }
      return [...prev, seatCode];
    });
  }

  if (!open) return null;

  const seatLabel =
    selectedSeats.length === 0
      ? checkoutCopy.noneSelected
      : selectedSeats.join('، ');

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-[210] flex items-start justify-center overflow-y-auto bg-[rgba(13,38,64,.55)] p-4 sm:p-5"
      onClick={onClose}
      data-testid="results-buy-modal"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={copy.buyModalTitle}
        className="my-auto w-full max-w-[980px] overflow-hidden rounded-[18px] bg-[#f6f8fb] shadow-[0_30px_70px_-20px_rgba(0,0,0,.5)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[#e6eaf0] bg-white px-4 py-3 sm:px-5">
          <div>
            <h2 className="m-0 text-base font-black text-[#0d2640]">{copy.buyModalTitle}</h2>
            <p className="mt-1 mb-0 text-xs text-[#6b7787]">
              {flightAirlineLabel(flight.flightNo)} · {aircraft} · {publicCabinLabel(cabin, locale)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={copy.close}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-[#e6eaf0] bg-[#f3f5f8] text-lg text-[#0d2640]"
          >
            ×
          </button>
        </div>

        <div className="grid gap-0 md:grid-cols-[1fr_280px]">
          <div className="border-b border-[#e6eaf0] bg-white p-4 sm:p-5 md:border-b-0 md:border-e">
            <div className="mb-3 text-sm font-extrabold text-[#0d2640]">
              {cityName(flight.originCode)} {locale === 'en' ? '→' : '←'} {cityName(flight.destCode)} ·{' '}
              {formatFlightClock(flight.departureAt, locale)}
            </div>
            <p className="mb-3 text-xs leading-relaxed text-[#96701a]">{copy.seatSelectionHint}</p>
            <p className="mb-3 text-xs text-[#6b7787]">
              {copy.yourSelectionLabel}:{' '}
              <strong className="text-[#1668c4]">{seatLabel}</strong>
            </p>
            <div className="mb-3 flex flex-wrap gap-2 text-[10.5px] text-[#5a6678]">
              <span className="rounded-[10px] border border-[#e6eaf0] bg-[#f6f8fb] px-2.5 py-1.5">
                {checkoutCopy.totalSold}: {localeDigits(sold, locale)}{' '}
                {checkoutCopy.ofLabel} {localeDigits(cap, locale)}
              </span>
            </div>
            {seats === null ? (
              <p className="text-xs text-[#8a96a6]">{checkoutCopy.loading}</p>
            ) : useMd80 ? (
              <Md80SeatMap
                locale={locale}
                seats={displaySeats}
                selectedSeats={selectedSeats}
                onToggleSeat={toggleSeat}
                businessLocked={businessLocked}
                bookedCabin={cabin}
                selectionLimitReached={selectedSeats.length >= seatNeed}
              />
            ) : (
              <p className="text-xs text-[#8a96a6]">{checkoutCopy.loading}</p>
            )}
          </div>

          <div className="flex flex-col gap-3 bg-white p-4 sm:p-5">
            <div className="text-sm font-extrabold text-[#0d2640]">{copy.priceDetailsLabel}</div>
            <div className="text-xs text-[#6b7787]">
              {copy.adultPaxLabel} × {passengerMix.adults}
              {passengerMix.children ? ` · ${copy.childPaxLabel} × ${passengerMix.children}` : ''}
              {passengerMix.infants ? ` · ${copy.infantPaxLabel} × ${passengerMix.infants}` : ''}
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[#6b7787]">{copy.totalLabel}</span>
              <span className="font-extrabold text-[#1668c4]">
                {localeMoney(totalIrr.toString(), locale)} {copy.toman}
              </span>
            </div>
            <button
              type="button"
              data-testid="results-buy-continue"
              onClick={() => onContinue(selectedSeats)}
              className="mt-auto h-12 rounded-xl bg-[#1668c4] text-sm font-extrabold text-white"
            >
              {copy.buyModalContinue}
            </button>
            <button
              type="button"
              data-testid="results-buy-skip-seats"
              onClick={() => onContinue([])}
              className="h-10 rounded-xl border border-[#d5e1f0] bg-white text-xs font-bold text-[#1668c4]"
            >
              {copy.buyModalSkipSeats}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
