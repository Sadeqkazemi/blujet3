import type { CabinClass } from '../../../types/public-site';
import type {
  PublicTravelCost,
  TravelExtraBillingUnit,
  TravelExtraCode,
} from '../../../types/travel-costs';

export interface FlightSnapshot {
  flightInstanceId: string;
  flightNo: string;
  originCode: string;
  destCode: string;
  departureAt: string;
  arrivalAt: string;
  aircraftType?: string;
  priceIrr: string;
}

export type PassengerType = 'ADULT' | 'CHILD' | 'INFANT';
export interface PassengerMix {
  adults: number;
  children: number;
  infants: number;
}

export type PassengerAgeValidationCode =
  | 'ADULT_TOO_YOUNG'
  | 'CHILD_AGE_INVALID'
  | 'INFANT_AGE_INVALID'
  | 'TOO_MANY_LAP_INFANTS';

export interface CheckoutDraft {
  flightInstanceId: string;
  cabin: CabinClass;
  selectedSeats: string[];
  flight: FlightSnapshot;
  passengerMix: PassengerMix;
  /** Guest-entered manifest, persisted while OTP authentication completes. */
  passengers?: PassengerFormDraft[];
  /** Outbound leg when the user booked a round-trip return flight. */
  outboundLeg?: {
    flightInstanceId: string;
    cabin: CabinClass;
    selectedSeats: string[];
    flight: FlightSnapshot;
  };
}

export type DocType = 'NATIONAL_ID' | 'PASSPORT';
export type Gender = '' | 'male' | 'female';

export interface PassengerFormDraft {
  passengerType: PassengerType;
  firstNameLatin: string;
  lastNameLatin: string;
  gender: Gender;
  docType: DocType;
  nationalId: string;
  passportNo: string;
  birthDay: string;
  birthMonth: string;
  birthYear: string;
  seatCode: string;
  /** One additional adjacent seat for this passenger; no baggage entitlement. */
  extraSeatRequested?: boolean;
}

export interface ExtraServiceState {
  id: string;
  code: TravelExtraCode;
  titleFa: string;
  titleEn: string | null;
  titleAr: string | null;
  descriptionFa: string | null;
  descriptionEn: string | null;
  descriptionAr: string | null;
  billingUnit: TravelExtraBillingUnit;
  priceIrr: string;
  selected: boolean;
  quantity: number;
}

export type CheckoutWizardStep = 'pax' | 'extras' | 'review';

export function emptyPassenger(
  seatCode: string,
  passengerType: PassengerType = 'ADULT',
): PassengerFormDraft {
  return {
    passengerType,
    firstNameLatin: '',
    lastNameLatin: '',
    gender: '',
    docType: 'NATIONAL_ID',
    nationalId: '',
    passportNo: '',
    birthDay: '',
    birthMonth: '',
    birthYear: '',
    seatCode,
    extraSeatRequested: false,
  };
}

/** Search / checkout passenger counts — adults ≥ 1, infants ≤ adults. */
export function normalizePassengerMix(mix: PassengerMix): PassengerMix {
  const adults = Math.max(1, Math.floor(Number(mix.adults)) || 1);
  const children = Math.max(0, Math.floor(Number(mix.children)) || 0);
  const infants = Math.max(
    0,
    Math.min(Math.floor(Number(mix.infants)) || 0, adults),
  );
  return { adults, children, infants };
}

export function passengerMixTotal(mix: PassengerMix): number {
  const normalized = normalizePassengerMix(mix);
  return normalized.adults + normalized.children + normalized.infants;
}

export function mixFromPassengers(
  passengers: PassengerFormDraft[],
): PassengerMix {
  return normalizePassengerMix({
    adults: passengers.filter((p) => p.passengerType === 'ADULT').length,
    children: passengers.filter((p) => p.passengerType === 'CHILD').length,
    infants: passengers.filter((p) => p.passengerType === 'INFANT').length,
  });
}

/**
 * Build one form card per search mix slot. Reuses previous rows of the same
 * type so editing is not wiped when the mix is re-applied.
 */
export function buildPassengersFromMix(
  mix: PassengerMix,
  previous: PassengerFormDraft[] = [],
): PassengerFormDraft[] {
  const normalized = normalizePassengerMix(mix);
  const pools: Record<PassengerType, PassengerFormDraft[]> = {
    ADULT: previous.filter((p) => p.passengerType === 'ADULT'),
    CHILD: previous.filter((p) => p.passengerType === 'CHILD'),
    INFANT: previous.filter((p) => p.passengerType === 'INFANT'),
  };
  const take = (passengerType: PassengerType): PassengerFormDraft => {
    const existing = pools[passengerType].shift();
    if (!existing) return emptyPassenger('', passengerType);
    return {
      ...existing,
      passengerType,
      seatCode: passengerType === 'INFANT' ? '' : existing.seatCode,
    };
  };
  return [
    ...Array.from({ length: normalized.adults }, () => take('ADULT')),
    ...Array.from({ length: normalized.children }, () => take('CHILD')),
    ...Array.from({ length: normalized.infants }, () => take('INFANT')),
  ];
}

/** 1-based ordinal within the same passenger type (design: adultN/childN/infantN). */
export function passengerTypeOrdinal(
  passengers: PassengerFormDraft[],
  index: number,
): number {
  const type = passengers[index]?.passengerType ?? 'ADULT';
  let ordinal = 0;
  for (let i = 0; i <= index; i += 1) {
    if (passengers[i]?.passengerType === type) ordinal += 1;
  }
  return ordinal;
}

export function passengerFullName(p: PassengerFormDraft): string {
  return `${p.firstNameLatin.trim()} ${p.lastNameLatin.trim()}`.trim();
}

export function seatCountForMix(mix: PassengerMix): number {
  return Math.max(1, mix.adults) + Math.max(0, mix.children);
}

export function passengerTotalIrr(
  adultUnitIrr: string,
  mix: PassengerMix,
  charter = false,
): bigint {
  const unit = BigInt(adultUnitIrr || '0');
  const childBps = charter ? 10_000n : 5_000n;
  return (
    unit * BigInt(Math.max(1, mix.adults)) +
    (unit * childBps * BigInt(Math.max(0, mix.children))) / 10_000n +
    (unit * 1_000n * BigInt(Math.max(0, mix.infants))) / 10_000n
  );
}

function ageOnDeparture(birthDate: string, departureAt: string): number {
  const birth = new Date(`${birthDate}T00:00:00.000Z`);
  const departure = new Date(departureAt);
  if (
    Number.isNaN(birth.getTime()) ||
    Number.isNaN(departure.getTime()) ||
    birth > departure
  ) {
    return -1;
  }
  let years = departure.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday =
    departure.getUTCMonth() < birth.getUTCMonth() ||
    (departure.getUTCMonth() === birth.getUTCMonth() &&
      departure.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) years -= 1;
  return years;
}

export function validatePassengerAges(
  passengers: Array<{ passengerType: PassengerType; birthDate: string }>,
  departureAt: string,
): PassengerAgeValidationCode | null {
  const adults = passengers.filter(
    ({ passengerType }) => passengerType === 'ADULT',
  ).length;
  const infants = passengers.filter(
    ({ passengerType }) => passengerType === 'INFANT',
  ).length;
  if (infants > adults) return 'TOO_MANY_LAP_INFANTS';
  for (const passenger of passengers) {
    const age = ageOnDeparture(passenger.birthDate, departureAt);
    if (passenger.passengerType === 'ADULT' && age < 12) {
      return 'ADULT_TOO_YOUNG';
    }
    // A child-fare passenger may also be an infant travelling in a dedicated
    // seat (for example, the second infant accompanying one adult). Lap
    // infants remain INFANT and are limited to one per adult.
    if (passenger.passengerType === 'CHILD' && (age < 0 || age >= 12)) {
      return 'CHILD_AGE_INVALID';
    }
    if (passenger.passengerType === 'INFANT' && (age < 0 || age >= 2)) {
      return 'INFANT_AGE_INVALID';
    }
  }
  return null;
}

export function toExtraState(value: PublicTravelCost): ExtraServiceState {
  return { ...value, selected: false, quantity: 1 };
}

export function extraTitle(
  extra: ExtraServiceState,
  locale: 'fa' | 'en' | 'ar',
): string {
  if (locale === 'en') {
    return extra.titleEn || extra.code.replace(/^CUSTOM_/, '').replaceAll('_', ' ');
  }
  if (locale === 'ar') return extra.titleAr || 'خدمة إضافية';
  return extra.titleFa;
}

export function extraDescription(
  extra: ExtraServiceState,
  locale: 'fa' | 'en' | 'ar',
): string | null {
  if (locale === 'en') return extra.descriptionEn;
  if (locale === 'ar') return extra.descriptionAr;
  return extra.descriptionFa;
}

export function extraTotalIrr(
  extra: ExtraServiceState,
  passengerCount: number,
): bigint {
  const quantity =
    extra.billingUnit === 'PER_PASSENGER'
      ? Math.max(1, passengerCount)
      : Math.max(1, extra.quantity);
  return BigInt(extra.priceIrr) * BigInt(quantity);
}
