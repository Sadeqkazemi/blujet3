import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchSeatMap } from '../../api/reservation';
import { faDigits, faMoney } from '../../lib/fa-format';
import { formatJalaliDateTime } from '../../lib/jalali';
import { isMd80Aircraft } from '../public-site/checkout/md80-seat-layout';
import ReservationMd80SeatMap from './ReservationMd80SeatMap';
import type { BookingStatus, SeatCell, SeatMap, SeatStatus } from '../../types/reservation';

const BOOKING_STATUS_FA: Record<BookingStatus, string> = {
  TICKETED: 'رزرو قطعی',
  PAID: 'پرداخت‌شده',
  HELD: 'در انتظار',
  DRAFT: 'پیش‌نویس',
  CANCELLED: 'لغوشده',
  EXPIRED: 'منقضی',
  REFUNDED: 'مستردشده',
  FLOWN: 'پرواز شده',
  NO_SHOW: 'عدم حضور',
};

const SEAT_STYLE: Record<SeatStatus, string> = {
  FREE: 'border-[#2a3550] bg-[#1a2438] text-[#9fb0c7] hover:border-[#3b82f6]',
  HELD: 'border-[#0284c7] bg-[#0ea5e9] text-white hover:brightness-110',
  SOLD: 'border-[#2563eb] bg-[#3b82f6] text-white hover:brightness-110',
  LOCKED: 'border-[#d97706] bg-[#f59e0b] text-[#1a1305] hover:brightness-110',
  BLOCKED: 'border-[#9333ea] bg-[#a855f7] text-white hover:brightness-110',
};

function genericCabinLabel(cabin: string, prevCabin: string | null): string | null {
  if (cabin === prevCabin) return null;
  return cabin === 'BUSINESS' ? 'کلاس بیزینس' : 'کلاس اقتصادی';
}

export default function FlightSeatMapModal({
  flightInstanceId,
  onClose,
  /** When set (e.g. IT Manager), seat locking is unavailable and copy explains why. */
  lockDisabledNote = 'امکان قفل دستی صندلی در این نقش وجود ندارد؛ فقط مشاهدهٔ وضعیت و رزرو.',
}: {
  flightInstanceId: string;
  onClose: () => void;
  lockDisabledNote?: string;
}) {
  const [map, setMap] = useState<SeatMap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [selected, setSelected] = useState<SeatCell | null>(null);
  const detailRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (selected) {
      detailRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selected]);

  useEffect(() => {
    let cancelled = false;
    setMap(null);
    setSelected(null);
    setError(null);
    void fetchSeatMap(flightInstanceId)
      .then((data) => {
        if (!cancelled) setMap(data);
      })
      .catch(() => {
        if (!cancelled) setError('خطا در دریافت نقشهٔ صندلی.');
      });
    return () => {
      cancelled = true;
    };
  }, [flightInstanceId]);

  const matchSet = useMemo(() => {
    const q = appliedQuery.trim().toLowerCase();
    if (!q || !map) return null;
    const hits = new Set<string>();
    for (const row of map.rows) {
      for (const seat of row.seats) {
        const name = seat.passenger?.fullName?.toLowerCase() ?? '';
        const pnr = seat.passenger?.pnr?.toLowerCase() ?? '';
        if (
          seat.seatCode.toLowerCase().includes(q) ||
          name.includes(q) ||
          pnr.includes(q)
        ) {
          hits.add(seat.seatCode);
        }
      }
    }
    return hits;
  }, [appliedQuery, map]);

  const seatsByCode = useMemo(() => {
    const m = new Map<string, SeatCell>();
    for (const row of map?.rows ?? []) {
      for (const s of row.seats) m.set(s.seatCode, s);
    }
    return m;
  }, [map]);

  const useMd80Chart = isMd80Aircraft(map?.aircraftType ?? 'MD-80');

  function onSeatClick(seat: SeatCell) {
    setSelected(seat);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#070b14]/75 p-3 backdrop-blur-[3px] sm:p-5"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="نقشه صندلی‌ها"
        className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[#2a3550] bg-[#141d2e] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#1f2a3d] px-5 py-4">
          <div>
            <h3 className="text-[15px] font-black text-white">
              نقشه صندلی‌ها
              {map ? (
                <span className="font-num ltr ms-2 text-[#60a5fa]">— {map.flightNo}</span>
              ) : null}
            </h3>
            {map && (
              <p className="mt-1 text-[11.5px] text-[#6b7b94]">
                {map.originCityFa} ← {map.destCityFa}
                <span className="mx-1.5 text-[#28344c]">|</span>
                <span className="ltr font-num">{map.aircraftType}</span>
                <span className="mx-1.5 text-[#28344c]">|</span>
                {formatJalaliDateTime(map.departureAt)}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="بستن"
            className="text-[#6b7b94] transition hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-3 overflow-y-auto px-5 py-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="min-w-0 flex-1">
              <span className="mb-1.5 block text-[10.5px] text-[#6b7b94]">
                جستجو بر اساس نام مسافر یا شماره صندلی
              </span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setAppliedQuery(query);
                }}
                placeholder='مثلاً «رضایی» یا «12A»'
                className="h-11 w-full rounded-[10px] border border-[#28344c] bg-[#0f1623] px-3 text-xs text-[#e7ecf3] outline-none placeholder:text-[#6b7b94] focus:border-[#3b82f6]"
              />
            </label>
            <button
              type="button"
              onClick={() => setAppliedQuery(query)}
              className="h-11 rounded-[10px] bg-[#3b82f6] px-4 text-xs font-extrabold text-white"
            >
              جستجوی صندلی
            </button>
          </div>

          {map && (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-3 text-[11px]">
                <LegendSwatch
                  className="border-[#2a3550] bg-[#1a2438]"
                  label={`آزاد (${faDigits(map.freeCount)})`}
                />
                <LegendSwatch
                  className="border-[#d97706] bg-[#f59e0b]"
                  label={`قفل موقت (${faDigits(map.lockedCount)})`}
                />
                <LegendSwatch
                  className="border-[#2563eb] bg-[#3b82f6]"
                  label={`رزرو قطعی (${faDigits(map.soldCount)})`}
                />
                <LegendSwatch
                  className="border-[#7c3aed] bg-[#a855f7]"
                  label={`مسدود توسط شرکت (${faDigits(0)})`}
                />
              </div>
              <p className="text-[10.5px] text-[#6b7b94]">{lockDisabledNote}</p>
            </div>
          )}

          {error && (
            <p className="rounded-lg bg-[rgba(248,113,113,.12)] p-3 text-sm text-[#f87171]" role="alert">
              {error}
            </p>
          )}
          {!map && !error && (
            <p className="py-10 text-center text-xs text-[#6b7b94]">در حال بارگذاری نقشهٔ صندلی…</p>
          )}

          {map && useMd80Chart && (
            <ReservationMd80SeatMap
              seatsByCode={seatsByCode}
              selectedSeatCode={selected?.seatCode ?? null}
              highlightSeatCode={
                matchSet && matchSet.size === 1 ? [...matchSet][0] : null
              }
              canLock={false}
              onSeatClick={onSeatClick}
            />
          )}

          {map && !useMd80Chart && (
            <div className="rounded-[14px] border border-[#1f2a3d] bg-[#0f1623] p-3 sm:p-4">
              <div className="mx-auto flex w-max max-w-full flex-col gap-1.5">
                {(() => {
                  let prevCabin: string | null = null;
                  return map.rows.map((row) => {
                    const aisleAfter =
                      map.cabinLayout[row.cabin]?.aisleAfterIndex ??
                      map.cabinLayout.ECONOMY?.aisleAfterIndex ??
                      2;
                    const label = genericCabinLabel(row.cabin, prevCabin);
                    prevCabin = row.cabin;

                    return (
                      <div key={row.row}>
                        {label && (
                          <div className="mb-1.5 mt-2 text-center text-[10.5px] font-bold text-[#6b7b94]">
                            {label}
                          </div>
                        )}
                        <div className="flex items-center gap-1.5" dir="ltr">
                          <span className="font-num w-6 text-center text-[10px] font-bold text-[#6b7b94]">
                            {faDigits(row.row)}
                          </span>
                          <div className="flex items-center gap-1">
                            {row.seats.map((seat, idx) => (
                              <span key={seat.seatCode} className="contents">
                                {idx === aisleAfter && (
                                  <span
                                    data-testid={`aisle-gap-${row.row}`}
                                    className="mx-1 w-3"
                                    aria-hidden
                                  />
                                )}
                                <button
                                  type="button"
                                  aria-label={seat.seatCode}
                                  onClick={() => onSeatClick(seat)}
                                  className={`font-num flex h-8 w-8 items-center justify-center rounded-md border text-[10px] font-bold transition ${
                                    SEAT_STYLE[seat.status]
                                  } ${
                                    matchSet && !matchSet.has(seat.seatCode)
                                      ? 'opacity-25'
                                      : matchSet?.has(seat.seatCode)
                                        ? 'ring-2 ring-[#fcd34d]'
                                        : ''
                                  } ${
                                    selected?.seatCode === seat.seatCode
                                      ? 'ring-2 ring-white'
                                      : ''
                                  }`}
                                >
                                  {seat.seatCode.replace(String(row.row), '')}
                                </button>
                              </span>
                            ))}
                          </div>
                          <span className="font-num w-6 text-center text-[10px] font-bold text-[#6b7b94]">
                            {faDigits(row.row)}
                          </span>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}

          {selected && (
            <div
              ref={detailRef}
              data-testid="seat-detail-panel"
              className="rounded-[14px] border border-[#1f2a3d] bg-[#18223a] p-4"
            >
              {selected.status === 'SOLD' && selected.passenger ? (
                <>
                  <div className="mb-2 text-[13px] font-extrabold text-white">
                    صندلی{' '}
                    <span className="font-num ltr text-[#60a5fa]">{selected.seatCode}</span>
                    <span className="mx-2 text-[#28344c]">·</span>
                    مشخصات رزروکننده
                  </div>
                  <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                    <InfoRow label="مسافر" value={selected.passenger.fullName} />
                    <InfoRow label="PNR" value={selected.passenger.pnr} ltr />
                    <InfoRow
                      label="کد ملی"
                      value={selected.passenger.nationalId ?? '—'}
                      ltr
                    />
                    <InfoRow
                      label="وضعیت"
                      value={
                        BOOKING_STATUS_FA[selected.passenger.bookingStatus] ??
                        selected.passenger.bookingStatus
                      }
                    />
                    <InfoRow
                      label="مبلغ"
                      value={`${faMoney(selected.passenger.priceIrr)} تومان`}
                    />
                    {map && (
                      <InfoRow label="تاریخ پرواز" value={formatJalaliDateTime(map.departureAt)} />
                    )}
                  </div>
                  <p className="mt-3 text-[10.5px] text-[#6b7b94]">{lockDisabledNote}</p>
                </>
              ) : selected.status === 'LOCKED' ? (
                <>
                  <div className="mb-1 text-[13px] font-extrabold text-white">
                    صندلی{' '}
                    <span className="font-num ltr text-[#f59e0b]">{selected.seatCode}</span>
                    <span className="mx-2 text-[#28344c]">·</span>
                    قفل موقت
                  </div>
                  {selected.lockExpiresAt && (
                    <p className="text-xs text-[#9fb0c7]">
                      آزادسازی خودکار تا {formatJalaliDateTime(selected.lockExpiresAt)}
                    </p>
                  )}
                  <p className="mt-2 text-[10.5px] text-[#6b7b94]">{lockDisabledNote}</p>
                </>
              ) : (
                <>
                  <div className="mb-1 text-[13px] font-extrabold text-white">
                    صندلی{' '}
                    <span className="font-num ltr text-[#9fb0c7]">{selected.seatCode}</span>
                    <span className="mx-2 text-[#28344c]">·</span>
                    آزاد
                  </div>
                  <p className="text-[10.5px] text-[#6b7b94]">
                    این صندلی هنوز فروخته نشده است. {lockDisabledNote}
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LegendSwatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[#9fb0c7]">
      <span className={`h-3.5 w-3.5 rounded border ${className}`} />
      {label}
    </span>
  );
}

function InfoRow({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="flex justify-between gap-3 rounded-lg border border-[#22304a] bg-[#0f1623] px-3 py-2">
      <span className="text-[#6b7b94]">{label}</span>
      <span className={`font-bold text-[#e7ecf3] ${ltr ? 'font-num ltr' : ''}`}>{value}</span>
    </div>
  );
}
