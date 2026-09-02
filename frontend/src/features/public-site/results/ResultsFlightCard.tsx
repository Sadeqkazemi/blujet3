import { useEffect, useState } from 'react';
import type { StoredLocale } from '../../../hooks/useLocale';
import { localeMoney } from '../../../lib/fa-format';
import { formatLocaleDate, localeDigits } from '../../../lib/locale-format';
import { publicCabinLabel } from '../../../lib/flight-definition';
import type {
  CabinClass,
  SearchFlightResult,
} from '../../../types/public-site';
import {
  passengerTotalIrr,
  seatCountForMix,
  type PassengerMix,
} from '../checkout/checkout-types';
import type { ResultsCopy } from './results-copy';
import {
  flightAirlineLabel,
  formatDuration,
  formatFlightClock,
  flightDurationMinutes,
  primaryCabin,
  stopLabel,
} from './results-utils';

type Props = {
  flight: SearchFlightResult;
  locale: StoredLocale;
  isMobile: boolean;
  isRTL: boolean;
  expanded: boolean;
  isAiPick: boolean;
  copy: ResultsCopy;
  originTz?: string;
  destTz?: string;
  cityName: (code: string) => string;
  lockBusyKey: string | null;
  showGoldLock: boolean;
  passengerMix: PassengerMix;
  preferredCabin?: CabinClass;
  buyLabel?: string;
  onToggle: () => void;
  onBuy: (cabin: CabinClass) => void;
  onLock: (cabin: CabinClass) => void;
};

export default function ResultsFlightCard({
  flight,
  locale,
  isMobile,
  isRTL,
  expanded,
  isAiPick,
  copy,
  originTz,
  destTz,
  cityName,
  lockBusyKey,
  showGoldLock,
  passengerMix,
  preferredCabin,
  buyLabel,
  onToggle,
  onBuy,
  onLock,
}: Props) {
  const defaultCabin = preferredCabin
    ? flight.cabins.find((c) => c.cabin === preferredCabin)
    : primaryCabin(flight);
  const [selectedCabinClass, setSelectedCabinClass] = useState<CabinClass>(
    defaultCabin?.cabin ?? preferredCabin ?? 'ECONOMY',
  );

  useEffect(() => {
    const preferred = preferredCabin
      ? flight.cabins.find((c) => c.cabin === preferredCabin)
      : undefined;
    const next = preferredCabin ? preferred : primaryCabin(flight);
    if (next) setSelectedCabinClass(next.cabin);
  }, [flight, preferredCabin]);

  const cabin = flight.cabins.find((c) => c.cabin === selectedCabinClass);
  if (!cabin) return null;

  const cabinLabel = publicCabinLabel(cabin.cabin, locale);

  const airline = flightAirlineLabel(flight.flightNo);
  const dep = formatFlightClock(flight.departureAt, locale, originTz);
  const arr = formatFlightClock(flight.arrivalAt, locale, destTz);
  const dur = formatDuration(
    flightDurationMinutes(flight.departureAt, flight.arrivalAt),
    locale,
  );
  const stops = stopLabel(Boolean(flight.connection), locale);
  const priceIrr = passengerTotalIrr(cabin.priceIrr, passengerMix);
  const seatDemand = seatCountForMix(passengerMix);
  const canBook = cabin.seatsLeft >= seatDemand;
  const lowSeats = cabin.seatsLeft > 0 && cabin.seatsLeft <= 3;
  const key = `${flight.flightInstanceId}:${cabin.cabin}`;
  const dateShort = formatLocaleDate(flight.departureAt, locale);

  return (
    <div
      data-testid="result-card"
      dir={isRTL ? 'rtl' : 'ltr'}
      style={{
        background: '#fff',
        border: '1px solid #eef1f5',
        borderRadius: 14,
        overflow: 'hidden',
      }}
    >
      {isAiPick && (
        <div
          style={{
            background: 'linear-gradient(90deg,#1668c4,#0d3b66)',
            color: '#fff',
            padding: '6px 15px',
            fontSize: 13.5,
            fontWeight: 800,
          }}
        >
          ✨ {copy.aiRecoLabel}
        </div>
      )}
      <div
        style={{
          padding: isMobile ? '14px 14px 0' : '16px 20px',
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          alignItems: isMobile ? 'stretch' : 'center',
          gap: isMobile ? 12 : 25,
          flexWrap: 'wrap',
        }}
      >
        {!isMobile && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
              width: 96,
              flex: 'none',
            }}
          >
            <div
              style={{
                width: 58,
                height: 58,
                borderRadius: 14,
                background: '#f0f2f5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#6b7787',
                fontSize: 21,
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  transform: isRTL ? 'scaleX(-1)' : undefined,
                }}
              >
                ✈
              </span>
            </div>
            <span
              style={{
                fontSize: 13.5,
                color: '#16202e',
                fontWeight: 700,
                textAlign: 'center',
              }}
            >
              {airline}
            </span>
          </div>
        )}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: isMobile ? 14 : 25,
            flex: 1,
            minWidth: isMobile ? 0 : 280,
          }}
        >
          <div style={{ textAlign: 'center', minWidth: 70 }}>
            <div style={{ fontSize: isMobile ? 17 : 19, fontWeight: 800 }}>
              {dep}
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#5a6678' }}>
              {flight.originCode}
            </div>
          </div>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: '#6b7787', marginBottom: 6 }}>
              {dur}
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                justifyContent: 'center',
              }}
            >
              <span style={{ flex: 1, height: 1.5, background: '#e0e5ec' }} />
              <span
                data-testid="route-airplane-icon"
                style={{
                  color: '#c2cad4',
                  fontSize: 14.5,
                  display: 'inline-block',
                  transform: isRTL ? 'scaleX(-1)' : undefined,
                }}
              >
                ✈
              </span>
              <span style={{ flex: 1, height: 1.5, background: '#e0e5ec' }} />
            </div>
            <div style={{ marginTop: 8 }}>
              <span
                style={{
                  fontSize: 12.5,
                  color: '#1f8a5b',
                  background: '#e8f5ee',
                  padding: '2px 10px',
                  borderRadius: 14,
                  fontWeight: 600,
                }}
              >
                {stops}
              </span>
            </div>
          </div>
          <div style={{ textAlign: 'center', minWidth: 70 }}>
            <div style={{ fontSize: isMobile ? 17 : 19, fontWeight: 800 }}>
              {arr}
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#5a6678' }}>
              {flight.destCode}
            </div>
          </div>
        </div>

        {!isMobile ? (
          <div
            style={{
              textAlign: 'center',
              minWidth: 210,
              minHeight: 122,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 7,
              borderRight: isRTL ? undefined : '1px solid #eef1f5',
              borderLeft: isRTL ? '1px solid #eef1f5' : undefined,
              paddingRight: isRTL ? 0 : 21,
              paddingLeft: isRTL ? 21 : 0,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 4,
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{ fontSize: 19, fontWeight: 900, color: '#1668c4' }}>
                {localeMoney(priceIrr.toString(), locale)}
              </span>
              <span style={{ fontSize: 11, color: '#6b7585' }}>
                {copy.toman}
              </span>
            </div>
            {lowSeats && (
              <span
                style={{ fontSize: 12.5, color: '#d9730d', fontWeight: 600 }}
              >
                {copy.lowSeatsLabel}
              </span>
            )}
            <button
              type="button"
              onClick={onToggle}
              style={{
                marginTop: 2,
                padding: '9px 22px',
                background: '#1668c4',
                color: '#fff',
                borderRadius: 10,
                fontSize: 13.5,
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {copy.detailsBookLabel} ▾
            </button>
          </div>
        ) : (
          <button
            type="button"
            data-testid="mobile-expand-flight"
            onClick={onToggle}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: 11,
              background: 'linear-gradient(90deg,#1668c4,#0d3b66)',
              color: '#fff',
              borderRadius: 10,
              fontSize: 17,
              fontWeight: 800,
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              whiteSpace: 'nowrap',
              marginBottom: 14,
            }}
          >
            {localeMoney(priceIrr.toString(), locale)} {copy.toman}
          </button>
        )}
      </div>

      {expanded && (
        <div
          style={{
            background: '#e9f1fb',
            borderTop: '1px solid #d4e3f5',
            padding: isMobile ? '14px' : '15px 20px',
            display: 'flex',
            flexDirection: isMobile ? 'column' : 'row',
            gap: 16,
            alignItems: 'stretch',
          }}
        >
          <div
            style={{
              flex: 1.5,
              minWidth: isMobile ? 0 : 280,
              background: '#fff',
              border: '1px solid #e0e9f5',
              borderRadius: 14,
              padding: 14,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                marginBottom: 9,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 9,
                    background: '#edf4fd',
                    color: '#1668c4',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 15,
                    flex: 'none',
                    transform: isRTL ? 'scaleX(-1)' : undefined,
                  }}
                >
                  ✈
                </span>
                <span
                  style={{ fontSize: 16, fontWeight: 900, color: '#16202e' }}
                >
                  {copy.flightDetailsLabel}
                </span>
              </div>
              <span
                style={{
                  fontSize: 12,
                  color: '#6f7d90',
                  background: '#f2f5f9',
                  padding: '4px 10px',
                  borderRadius: 12,
                  whiteSpace: 'nowrap',
                }}
              >
                {copy.automatedLabel}
              </span>
            </div>
            <div style={{ fontSize: 13.5, color: '#5a6678', marginBottom: 20 }}>
              {copy.outboundLabel}:{' '}
              <span
                data-testid="flight-detail-route-flow"
                dir="ltr"
                style={{
                  display: 'inline-flex',
                  flexDirection: isRTL ? 'row-reverse' : 'row',
                  alignItems: 'center',
                  gap: 7,
                  color: '#253246',
                  fontWeight: 700,
                }}
              >
                <span data-route-point="origin">{cityName(flight.originCode)}</span>
                <span
                  data-testid="flight-detail-route-airplane"
                  aria-hidden="true"
                  style={{
                    display: 'inline-flex',
                    width: 26,
                    height: 26,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '50%',
                    background: '#edf4fd',
                    color: '#1668c4',
                    fontSize: 13,
                    transform: isRTL ? 'scaleX(-1)' : undefined,
                  }}
                >
                  ✈
                </span>
                <span data-route-point="destination">{cityName(flight.destCode)}</span>
              </span>
            </div>
            <div
              data-testid="flight-detail-schedule"
              dir={isRTL ? 'rtl' : 'ltr'}
              style={{
                display: 'grid',
                gridTemplateColumns: isMobile
                  ? 'minmax(0, 1fr) 96px minmax(0, 1fr)'
                  : 'minmax(0, 1fr) minmax(150px, 1.3fr) minmax(0, 1fr)',
                alignItems: 'center',
                gap: isMobile ? 8 : 16,
                padding: isMobile ? '12px 2px 17px' : '14px 8px 22px',
              }}
            >
              <div
                data-schedule-point="origin"
                style={{ textAlign: isRTL ? 'right' : 'left', minWidth: 0 }}
              >
                <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 900, color: '#10233e' }}>
                  {dep}
                </div>
                <div style={{ marginTop: 4, fontSize: 13, color: '#66758a' }}>
                  {cityName(flight.originCode)} · <b dir="ltr">{flight.originCode}</b>
                </div>
                <div style={{ marginTop: 7, fontSize: 12.5, color: '#8793a4' }}>
                  {dateShort}
                </div>
              </div>

              <div
                style={{
                  minWidth: 0,
                  textAlign: 'center',
                  padding: isMobile ? '5px 3px' : '7px 4px',
                }}
              >
                <div
                  style={{
                    marginBottom: 11,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 5,
                    fontSize: isMobile ? 10.5 : 12.5,
                    color: '#53657b',
                    fontWeight: 800,
                    lineHeight: 1.4,
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span aria-hidden="true" style={{ color: '#8aa0bb', fontSize: 13 }}>◷</span>
                  {dur}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', width: '100%', gap: 0 }}>
                  <span
                    data-testid="flight-detail-origin-dot"
                    style={{
                      width: 9,
                      height: 9,
                      borderRadius: '50%',
                      background: '#1668c4',
                      flex: 'none',
                      boxShadow: '0 0 0 3px #e6f0fb',
                    }}
                  />
                  <span style={{ height: 1, flex: 1, background: '#b9cce4' }} />
                  <span
                    data-testid="flight-detail-schedule-airplane"
                    aria-hidden="true"
                    style={{
                      width: isMobile ? 31 : 38,
                      height: isMobile ? 31 : 38,
                      borderRadius: '50%',
                      border: '4px solid #fff',
                      background: '#1668c4',
                      color: '#fff',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flex: 'none',
                      fontSize: isMobile ? 14 : 17,
                      boxShadow: '0 5px 16px rgba(22,104,196,.25)',
                      transform: isRTL ? 'scaleX(-1)' : undefined,
                    }}
                  >
                    ✈
                  </span>
                  <span style={{ height: 1, flex: 1, background: '#b9cce4' }} />
                  <span
                    data-testid="flight-detail-destination-dot"
                    style={{
                      width: 9,
                      height: 9,
                      borderRadius: '50%',
                      border: '2px solid #9db8da',
                      background: '#fff',
                      flex: 'none',
                    }}
                  />
                </div>
                <span
                  style={{
                    display: 'inline-flex',
                    marginTop: 11,
                    padding: 0,
                    borderRadius: 0,
                    border: 'none',
                    background: 'transparent',
                    color: '#268252',
                    fontSize: isMobile ? 10.5 : 11.5,
                    fontWeight: 800,
                    whiteSpace: 'nowrap',
                    gap: 5,
                    alignItems: 'center',
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{ width: 6, height: 6, borderRadius: '50%', background: '#35a267' }}
                  />
                  {stops}
                </span>
              </div>

              <div
                data-schedule-point="destination"
                style={{ textAlign: isRTL ? 'left' : 'right', minWidth: 0 }}
              >
                <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 900, color: '#10233e' }}>
                  {arr}
                </div>
                <div style={{ marginTop: 4, fontSize: 13, color: '#66758a' }}>
                  {cityName(flight.destCode)} · <b dir="ltr">{flight.destCode}</b>
                </div>
                <div style={{ marginTop: 7, fontSize: 12.5, color: '#8793a4' }}>
                  {dateShort}
                </div>
              </div>
            </div>
            <div
              data-testid="flight-detail-metadata"
              style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, minmax(0, 1fr))',
                gap: 8,
                marginTop: 8,
                paddingTop: 22,
                borderTop: '1px solid #eef1f5',
              }}
            >
              {[
                [copy.flightNoLabel, flight.flightNo],
                [copy.aircraftLabel, flight.aircraftType],
                [copy.baggageLabel, '20 kg'],
                [copy.cabinLabel, cabinLabel],
              ].map(([label, value]) => (
                <div
                  key={label}
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #edf1f6',
                    borderRadius: 10,
                    padding: '9px 10px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                    fontSize: 13,
                  }}
                >
                  <span
                    style={{
                      width: '100%',
                      color: '#7a8798',
                      fontSize: 11.5,
                      textAlign: isRTL ? 'right' : 'left',
                    }}
                  >
                    {label}
                  </span>
                  <span
                    style={{
                      width: '100%',
                      fontWeight: 800,
                      color: '#16202e',
                      textAlign: 'center',
                    }}
                    dir="ltr"
                  >
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              flex: 1,
              minWidth: isMobile ? 0 : 240,
              background: '#fff',
              border: '1px solid #e0e9f5',
              borderRadius: 14,
              padding: isMobile ? 14 : '14px 16px',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                fontSize: 14.5,
                fontWeight: 800,
                color: '#16202e',
                marginBottom: 18,
              }}
            >
              {copy.priceDetailsLabel}
            </div>
            <div
              data-testid={`selected-cabin-${cabin.cabin}`}
              style={{
                alignSelf: 'flex-start',
                marginBottom: 14,
                padding: '6px 12px',
                borderRadius: 10,
                border: '1.5px solid #1668c4',
                background: '#eef4fb',
                color: '#1668c4',
                fontSize: 12.5,
                fontWeight: 700,
              }}
            >
              {cabinLabel}
            </div>
            <div style={{ fontSize: 13.5, color: '#5a6678', marginBottom: 12 }}>
              {copy.adultPaxLabel} × {passengerMix.adults}
              {passengerMix.children
                ? ` · ${copy.childPaxLabel} × ${passengerMix.children}`
                : ''}
              {passengerMix.infants
                ? ` · ${copy.infantPaxLabel} × ${passengerMix.infants}`
                : ''}
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 9,
                fontSize: 13.5,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#6b7787' }}>{copy.basePriceLabel}</span>
                <span style={{ fontWeight: 600, color: '#16202e' }}>
                  {localeMoney(priceIrr.toString(), locale)}
                </span>
              </div>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: 16,
                paddingTop: 11,
                borderTop: '1px solid #eef1f5',
              }}
            >
              <span style={{ fontWeight: 700, color: '#16202e' }}>
                {copy.totalLabel}
              </span>
              <span style={{ fontSize: 18, fontWeight: 900, color: '#1668c4' }}>
                {localeMoney(priceIrr.toString(), locale)}
              </span>
            </div>
            <div
              style={{
                marginTop: 14,
                background: '#fff4e8',
                border: '1px solid #f6dcbb',
                color: '#d9730d',
                borderRadius: 10,
                padding: '8px 11px',
                fontSize: 13.5,
                fontWeight: 700,
                textAlign: 'center',
              }}
            >
              {copy.seatsRemainingLabel}: {localeDigits(cabin.seatsLeft, locale)}
            </div>
            <button
              type="button"
              disabled={!canBook}
              onClick={() => onBuy(cabin.cabin)}
              style={{
                marginTop: 14,
                height: 50,
                borderRadius: 12,
                background: '#1668c4',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 15.5,
                fontWeight: 800,
                border: 'none',
                cursor: canBook ? 'pointer' : 'not-allowed',
                fontFamily: 'inherit',
                opacity: canBook ? 1 : 0.5,
              }}
            >
              {buyLabel ?? copy.buyTicketLabel}
            </button>
            {showGoldLock && (
              <button
                type="button"
                disabled={lockBusyKey === key}
                onClick={() => onLock(cabin.cabin)}
                data-testid={`real-lock-${flight.flightInstanceId}-${cabin.cabin}`}
                style={{
                  marginTop: 10,
                  height: 46,
                  borderRadius: 12,
                  border: '1.5px solid #1668c4',
                  color: '#1668c4',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 7,
                  fontSize: 13,
                  fontWeight: 700,
                  background: '#fff',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                🔒 {copy.aiFareLockGoldLabel}
              </button>
            )}
            {!showGoldLock && (
              <button
                type="button"
                disabled={lockBusyKey === key}
                onClick={() => onLock(cabin.cabin)}
                data-testid={`real-lock-${flight.flightInstanceId}-${cabin.cabin}`}
                style={{
                  marginTop: 10,
                  height: 40,
                  borderRadius: 10,
                  border: '1px solid #d5e1f0',
                  color: '#1668c4',
                  fontSize: 12,
                  fontWeight: 700,
                  background: '#fff',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {lockBusyKey === key
                  ? copy.aiAnalyzing
                  : `🔒 ${copy.priceLock}`}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
