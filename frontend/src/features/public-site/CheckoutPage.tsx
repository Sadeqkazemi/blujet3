import { useEffect, useMemo, useState } from 'react';
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import {
  createBooking,
  fetchClubPoints,
  fetchMyBooking,
  fetchSavedPassengers,
  fetchSeatMap,
} from '../../api/publicSite';
import { fetchPublicTravelCosts } from '../../api/travel-costs';
import { fetchPublicSeatServices } from '../../api/ancillary-services';
import { ApiRequestError } from '../../api/envelope';
import { useAuth } from '../../hooks/useAuth';
import { useLocale } from '../../hooks/useLocale';
import { useIsMobile } from '../../hooks/useIsMobile';
import { localeMoney } from '../../lib/fa-format';
import { parseLocaleDateToIso } from '../../lib/locale-format';
import { nationalIdsExceedingSeatLimit } from './checkout/national-id-seat-limit';
import { isPassengerValid } from './checkout/passenger-validation';
import type {
  BookingDetail,
  CabinClass,
  SavedPassenger,
  SeatMapCell,
} from '../../types/public-site';
import PublicPageShell from '../../components/public/PublicPageShell';
import FlowStepper from '../../components/public/FlowStepper';
import { CHECKOUT_COPY, passengerAgeErrorMessage } from './checkout/checkout-copy';
import {
  clearCheckoutDraft,
  loadCheckoutDraft,
  saveCheckoutDraft,
} from './checkout/checkout-draft';
import CheckoutStepBar from './checkout/CheckoutStepBar';
import ExtrasStep from './checkout/ExtrasStep';
import FlightSummaryCard from './checkout/FlightSummaryCard';
import PassengerStep from './checkout/PassengerStep';
import PricingSidebar from './checkout/PricingSidebar';
import ReviewStep from './checkout/ReviewStep';
import ReviewPassengerEditModal from './checkout/ReviewPassengerEditModal';
import OtpLoginInline from './OtpLoginInline';
import {
  buildPassengersFromMix,
  emptyPassenger,
  extraTotalIrr,
  mixFromPassengers,
  normalizePassengerMix,
  passengerTotalIrr,
  validatePassengerAges,
  passengerFullName,
  type CheckoutDraft,
  type CheckoutWizardStep,
  type ExtraServiceState,
  type FlightSnapshot,
  type PassengerFormDraft,
  toExtraState,
} from './checkout/checkout-types';
import {
  buildMd80Seats,
  looksLikeLegacyA320SeatPayload,
  looksLikeMd80SeatPayload,
  mapLegacyTakenSeatsToMd80,
  shouldUseMd80SeatMap,
} from './checkout/md80-seat-layout';
import { seatTypeTotalIrr } from './checkout/seat-type-pricing';
import type { PublicAncillaryService } from '../../types/ancillary-services';
import { syncGuestPrimaryProfile } from './checkout/checkout-guest-profile';

const BUSINESS_SEAT_MIN_POINTS = 15_000;
const STEP_ORDER: CheckoutWizardStep[] = ['pax', 'extras', 'review'];

export default function CheckoutPage() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { locale } = useLocale();
  const { status } = useAuth();
  const isMobile = useIsMobile();
  const t = CHECKOUT_COPY[locale];

  const isWizard = bookingId === 'new';

  const [heldBooking, setHeldBooking] = useState<BookingDetail | null>(null);
  const [draft, setDraft] = useState<CheckoutDraft | null>(null);
  const [step, setStep] = useState<CheckoutWizardStep>('pax');
  const [passengers, setPassengers] = useState<PassengerFormDraft[]>([
    emptyPassenger(''),
  ]);
  const [extras, setExtras] = useState<ExtraServiceState[]>([]);
  const [seatServices, setSeatServices] = useState<PublicAncillaryService[]>([]);
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  const [seats, setSeats] = useState<SeatMapCell[] | null>(null);
  const [savedPassengers, setSavedPassengers] = useState<SavedPassenger[]>([]);
  const [clubBalance, setClubBalance] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [editPaxOpen, setEditPaxOpen] = useState(false);
  const [showPassengerErrors, setShowPassengerErrors] = useState(false);

  useEffect(() => {
    if (!isWizard || !draft) return;
    if (params.get('step') === 'extras') setStep('extras');
  }, [isWizard, draft, params]);

  // Load held booking (legacy /payment-bound path)
  useEffect(() => {
    if (!bookingId || bookingId === 'new') return;
    fetchMyBooking(bookingId)
      .then(setHeldBooking)
      .catch(() => setLoadError(t.notFound));
  }, [bookingId, t.notFound]);

  // Resolve wizard draft from location state, query, or sessionStorage.
  // Must run even while OTP gate is showing so cities survive login remount.
  useEffect(() => {
    if (!isWizard) return;
    const stateFlight = (
      location.state as { flight?: FlightSnapshot; cabin?: CabinClass } | null
    )?.flight;
    const stateCabin = (location.state as { cabin?: CabinClass } | null)?.cabin;
    const fromStorage = loadCheckoutDraft();
    const flightInstanceId =
      params.get('flightInstanceId') ||
      stateFlight?.flightInstanceId ||
      fromStorage?.flightInstanceId;
    const cabin =
      (params.get('cabin') as CabinClass | null) ||
      stateCabin ||
      fromStorage?.cabin ||
      'ECONOMY';
    const originFromQuery = (params.get('origin') || '').toUpperCase();
    const destFromQuery = (params.get('dest') || '').toUpperCase();
    const hasUrlMix =
      params.has('adults') ||
      params.has('children') ||
      params.has('infants');
    const passengerMix = normalizePassengerMix(
      hasUrlMix
        ? {
            adults: Number(params.get('adults') || 1),
            children: Number(params.get('children') || 0),
            infants: Number(params.get('infants') || 0),
          }
        : (fromStorage?.passengerMix ?? {
            adults: 1,
            children: 0,
            infants: 0,
          }),
    );

    const mergeFlight = (base: FlightSnapshot): FlightSnapshot => ({
      ...base,
      originCode:
        base.originCode && base.originCode !== '—'
          ? base.originCode
          : originFromQuery ||
            fromStorage?.flight.originCode ||
            base.originCode,
      destCode:
        base.destCode && base.destCode !== '—'
          ? base.destCode
          : destFromQuery || fromStorage?.flight.destCode || base.destCode,
      flightNo:
        base.flightNo !== '—'
          ? base.flightNo
          : fromStorage?.flight.flightNo || base.flightNo,
      priceIrr:
        base.priceIrr && base.priceIrr !== '0'
          ? base.priceIrr
          : fromStorage?.flight.priceIrr || base.priceIrr,
      aircraftType: base.aircraftType || fromStorage?.flight.aircraftType,
      departureAt:
        base.departureAt ||
        fromStorage?.flight.departureAt ||
        new Date().toISOString(),
      arrivalAt:
        base.arrivalAt ||
        fromStorage?.flight.arrivalAt ||
        new Date().toISOString(),
    });

    if (stateFlight) {
      const d: CheckoutDraft = {
        flightInstanceId: stateFlight.flightInstanceId,
        cabin,
        selectedSeats: fromStorage?.selectedSeats ?? [],
        flight: mergeFlight(stateFlight),
        passengerMix,
        passengers: fromStorage?.passengers,
        outboundLeg: fromStorage?.outboundLeg,
      };
      setDraft(d);
      setPassengers(buildPassengersFromMix(d.passengerMix, d.passengers ?? []));
      saveCheckoutDraft(d);
      setSelectedSeats(d.selectedSeats);
      return;
    }
    if (
      fromStorage &&
      (!flightInstanceId || fromStorage.flightInstanceId === flightInstanceId)
    ) {
      const d: CheckoutDraft = {
        ...fromStorage,
        cabin,
        flight: mergeFlight(fromStorage.flight),
        passengerMix,
      };
      setDraft(d);
      setPassengers(buildPassengersFromMix(d.passengerMix, d.passengers ?? []));
      saveCheckoutDraft(d);
      setSelectedSeats(d.selectedSeats);
      return;
    }
    if (flightInstanceId) {
      const d: CheckoutDraft = {
        flightInstanceId,
        cabin,
        selectedSeats: [],
        passengerMix,
        flight: mergeFlight({
          flightInstanceId,
          flightNo: '—',
          originCode: originFromQuery || '—',
          destCode: destFromQuery || '—',
          departureAt: '',
          arrivalAt: '',
          priceIrr: '0',
        }),
      };
      setDraft(d);
      setPassengers(buildPassengersFromMix(d.passengerMix));
      saveCheckoutDraft(d);
      return;
    }
    setLoadError(t.notFound);
  }, [isWizard, location.state, params, t.notFound]);

  const passengerMix = draft?.passengerMix;

  useEffect(() => {
    if (!passengerMix) return;
    setPassengers((previous) =>
      buildPassengersFromMix(passengerMix, previous),
    );
  }, [passengerMix]);

  useEffect(() => {
    if (!isWizard) return;
    fetchPublicTravelCosts()
      .then((values) =>
        setExtras(
          values.filter((value) => value.purchaseEnabled).map(toExtraState),
        ),
      )
      .catch(() => setExtras([]));
    fetchPublicSeatServices()
      .then(setSeatServices)
      .catch(() => setSeatServices([]));
  }, [isWizard]);

  useEffect(() => {
    if (!draft) return;
    // Full aircraft map. For MD-80, if the API is empty or still on legacy
    // lettering, fall back to the PDF chart inventory so the picker is never blank.
    const aircraft = draft.flight.aircraftType ?? 'MD-80';
    fetchSeatMap(draft.flightInstanceId)
      .then((m) => {
        const useMd80 = shouldUseMd80SeatMap(aircraft, m.seats);
        if (useMd80 && !looksLikeMd80SeatPayload(m.seats)) {
          const takenRaw = m.seats
            .filter((s) => s.status === 'TAKEN')
            .map((s) => s.seatCode);
          const taken = looksLikeLegacyA320SeatPayload(m.seats)
            ? mapLegacyTakenSeatsToMd80(takenRaw)
            : takenRaw;
          setSeats(buildMd80Seats(taken));
          return;
        }
        setSeats(m.seats.length ? m.seats : useMd80 ? buildMd80Seats() : []);
      })
      .catch(() => {
        const useMd80 = shouldUseMd80SeatMap(aircraft, []);
        setSeats(useMd80 ? buildMd80Seats() : []);
      });
  }, [draft]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    fetchSavedPassengers()
      .then(setSavedPassengers)
      .catch(() => setSavedPassengers([]));
    fetchClubPoints()
      .then((c) => setClubBalance(c.balance))
      .catch(() => setClubBalance(0));
  }, [status]);

  // Keep passenger seat codes in sync with selected seats
  useEffect(() => {
    if (!isWizard) return;
    setPassengers((prev) => {
      if (selectedSeats.length === 0) {
        return prev.length ? prev : [emptyPassenger('')];
      }
      let seatIndex = 0;
      return prev.map((passenger) =>
        passenger.passengerType === 'INFANT'
          ? { ...passenger, seatCode: '' }
          : {
              ...passenger,
              seatCode: selectedSeats[seatIndex++] ?? passenger.seatCode,
            },
      );
    });
  }, [selectedSeats, isWizard]);

  // Design: business seats need ≥15,000 club points (hint + locked styling).
  const businessLocked = clubBalance < BUSINESS_SEAT_MIN_POINTS;

  const nextLabel = useMemo(() => {
    if (step === 'pax') return t.nextPax;
    if (step === 'extras') return t.nextExtras;
    return t.nextReview;
  }, [step, t]);

  function toggleSeat(seatCode: string) {
    setSelectedSeats((prev) => {
      const seatSelectionLimit = passengers.filter(
        (passenger) => passenger.passengerType !== 'INFANT',
      ).length;
      if (!prev.includes(seatCode) && prev.length >= seatSelectionLimit) {
        return prev;
      }
      const next = prev.includes(seatCode)
        ? prev.filter((s) => s !== seatCode)
        : [...prev, seatCode];
      if (draft) {
        const updated = { ...draft, selectedSeats: next };
        setDraft(updated);
        saveCheckoutDraft(updated);
      }
      return next;
    });
  }

  function toggleExtra(id: ExtraServiceState['id']) {
    setExtras((arr) => {
      const target = arr.find((extra) => extra.id === id);
      if (target?.code === 'SEAT_SELECTION' && target.selected) {
        setSelectedSeats([]);
        if (draft) {
          const updated = { ...draft, selectedSeats: [] };
          setDraft(updated);
          saveCheckoutDraft(updated);
        }
      }
      return arr.map((e) =>
        e.id === id ? { ...e, selected: !e.selected } : e,
      );
    });
  }

  function changeExtraQuantity(id: ExtraServiceState['id'], quantity: number) {
    setExtras((arr) => arr.map((e) => (e.id === id ? { ...e, quantity } : e)));
  }

  function changePassengers(next: PassengerFormDraft[]) {
    setPassengers(next);
    if (draft) {
      const updated = { ...draft, passengers: next };
      setDraft(updated);
      saveCheckoutDraft(updated);
    }
    setError(null);
  }

  function validatePassengerStep(): boolean {
    setShowPassengerErrors(true);
    if (passengers.some((p) => !isPassengerValid(p))) {
      setError(t.completePaxError);
      return false;
    }
    if (nationalIdsExceedingSeatLimit(passengers).length > 0) {
      setError(t.nidSeatLimitError);
      return false;
    }
    const ageError = passengerAgeError();
    if (ageError) {
      setError(ageError);
      return false;
    }
    return true;
  }

  function requestCheckoutLogin() {
    setError(null);
    if (!validatePassengerStep()) return;
    setLoginOpen(true);
  }

  function goNext() {
    setError(null);
    if (step === 'pax') {
      if (!validatePassengerStep()) return;
      if (status !== 'authenticated') {
        return;
      }
      setStep('extras');
      return;
    }
    if (step === 'extras') {
      // Seat selection is optional per design («انتخاب صندلی (اختیاری)»).
      setStep('review');
      return;
    }
    void submitBooking();
  }

  function passengerAgeError(): string | null {
    if (!draft) return null;
    const manifest = passengers.map((passenger) => ({
      passengerType: passenger.passengerType,
      birthDate:
        parseLocaleDateToIso(
          `${passenger.birthYear}/${passenger.birthMonth}/${passenger.birthDay}`,
          locale,
        )?.slice(0, 10) ?? '',
    }));
    const code = validatePassengerAges(manifest, draft.flight.departureAt);
    if (!code) return null;
    return passengerAgeErrorMessage(code, locale) ?? CHECKOUT_COPY.fa.completePaxError;
  }

  function goBack() {
    setError(null);
    const idx = STEP_ORDER.indexOf(step);
    if (idx > 0) setStep(STEP_ORDER[idx - 1]!);
  }

  function resolveSeatCodesForBooking(): string[] {
    if (!draft) return [];
    const needed = passengers.filter(
      (p) => p.passengerType !== 'INFANT',
    ).length;
    return selectedSeats.filter((code) => {
      const cell = seats?.find((s) => s.seatCode === code);
      return cell?.cabin === draft.cabin && cell.status === 'FREE';
    }).slice(0, needed);
  }

  async function submitBooking() {
    if (!draft) return;
    if (status !== 'authenticated') {
      setLoginOpen(true);
      return;
    }
    if (passengers.some((p) => !isPassengerValid(p))) {
      setShowPassengerErrors(true);
      setError(t.completePaxError);
      setStep('pax');
      return;
    }
    if (nationalIdsExceedingSeatLimit(passengers).length > 0) {
      setError(t.nidSeatLimitError);
      setStep('pax');
      return;
    }
    const ageError = passengerAgeError();
    if (ageError) {
      setError(ageError);
      setStep('pax');
      return;
    }
    if (!draft.flight.priceIrr || draft.flight.priceIrr === '0') {
      setError(
        locale === 'en'
          ? 'The flight price is unavailable.'
          : 'نرخ واقعی این پرواز دریافت نشد؛ امکان ثبت رزرو وجود ندارد.',
      );
      return;
    }
    if (
      draft.outboundLeg &&
      (!draft.outboundLeg.flight.priceIrr ||
        draft.outboundLeg.flight.priceIrr === '0')
    ) {
      setError(
        locale === 'en'
          ? 'The outbound flight price is unavailable.'
          : 'نرخ پرواز رفت دریافت نشد؛ امکان ثبت رزرو وجود ندارد.',
      );
      return;
    }
    const seatCodes = resolveSeatCodesForBooking();
    setBusy(true);
    setError(null);
    try {
      const passengerPayload = (seatList: string[]) => {
        let seatIndex = 0;
        return passengers.map((p) => {
          const birthDate = parseLocaleDateToIso(
            `${p.birthYear}/${p.birthMonth}/${p.birthDay}`,
            locale,
          )?.slice(0, 10);
          if (!birthDate) throw new Error(t.completePaxError);
          return {
            fullName: passengerFullName(p),
            passengerType: p.passengerType,
            birthDate,
            gender: p.gender || undefined,
            nationalId:
              p.docType === 'NATIONAL_ID'
                ? p.nationalId || undefined
                : undefined,
            passportNo:
              p.docType === 'PASSPORT' ? p.passportNo || undefined : undefined,
            seatCode:
              p.passengerType === 'INFANT'
                ? undefined
                : seatList[seatIndex++]!,
            extraSeatRequested: p.passengerType === 'INFANT' ? false : p.extraSeatRequested,
          };
        });
      };

      if (draft.outboundLeg) {
        const outbound = draft.outboundLeg;
        const outboundSeats =
          outbound.selectedSeats.length > 0 ? outbound.selectedSeats : [];
        const outboundBooking = await createBooking({
          flightInstanceId: outbound.flightInstanceId,
          cabin: outbound.cabin,
          passengers: passengerPayload(outboundSeats),
        });
        const returnBooking = await createBooking({
          flightInstanceId: draft.flightInstanceId,
          cabin: draft.cabin,
          passengers: passengerPayload(seatCodes),
          extras: extras
            .filter((extra) => extra.selected)
            .map((extra) => ({ id: extra.id, quantity: extra.quantity })),
        });
        sessionStorage.setItem(
          'blujet_pending_return_payment',
          returnBooking.id,
        );
        clearCheckoutDraft();
        navigate(`/payment/${outboundBooking.id}`);
        return;
      }

      let seatIndex = 0;
      const booking = await createBooking({
        flightInstanceId: draft.flightInstanceId,
        cabin: draft.cabin,
        passengers: passengers.map((p) => {
          const birthDate = parseLocaleDateToIso(
            `${p.birthYear}/${p.birthMonth}/${p.birthDay}`,
            locale,
          )?.slice(0, 10);
          if (!birthDate) throw new Error(t.completePaxError);
          return {
            fullName: passengerFullName(p),
            passengerType: p.passengerType,
            birthDate,
            gender: p.gender || undefined,
            nationalId:
              p.docType === 'NATIONAL_ID'
                ? p.nationalId || undefined
                : undefined,
            passportNo:
              p.docType === 'PASSPORT' ? p.passportNo || undefined : undefined,
            seatCode:
              p.passengerType === 'INFANT'
                ? undefined
                : seatCodes[seatIndex++]!,
            extraSeatRequested: p.passengerType === 'INFANT' ? false : p.extraSeatRequested,
          };
        }),
        extras: extras
          .filter((extra) => extra.selected)
          .map((extra) => ({ id: extra.id, quantity: extra.quantity })),
      });
      clearCheckoutDraft();
      navigate(`/payment/${booking.id}`);
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'UNAUTHORIZED') {
        setError(
          locale === 'en'
            ? 'Your session expired. Please sign in again.'
            : 'نشست شما منقضی شده است. لطفاً دوباره وارد شوید.',
        );
        navigate('/signin', {
          state: { from: location.pathname + location.search },
        });
        return;
      }
      setError(
        err instanceof ApiRequestError
          ? err.code === 'POOL_EXHAUSTED'
            ? locale === 'en'
              ? 'Capacity is full; two adjacent seats are not available.'
              : locale === 'ar'
                ? 'اكتملت السعة؛ لا يتوفر مقعدان متجاوران.'
                : 'ظرفیت تکمیل است؛ دو صندلی کنار هم موجود نیست.'
            : err.message
          : locale === 'en'
            ? 'Booking failed. Please try again.'
            : 'ثبت رزرو ناموفق بود. لطفاً دوباره تلاش کنید.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <PublicPageShell>
        <p className="p-8 text-sm text-red-600">{loadError}</p>
      </PublicPageShell>
    );
  }

  // Legacy held-booking summary (after booking already created)
  if (!isWizard) {
    if (!heldBooking) {
      return (
        <PublicPageShell>
          <p className="p-8 text-sm text-[#6b7b94]">{t.loading}</p>
        </PublicPageShell>
      );
    }
    if (heldBooking.status === 'EXPIRED') {
      return (
        <PublicPageShell>
          <div className="mx-auto max-w-md p-8 text-center">
            <p className="mb-4 text-sm text-red-600">{t.expired}</p>
            <button
              onClick={() => navigate('/')}
              className="rounded-lg bg-[#1668c4] px-6 py-2.5 text-sm font-bold text-white"
            >
              {t.searchAgain}
            </button>
          </div>
        </PublicPageShell>
      );
    }
    // Redirect held bookings straight into payment — wizard already happened
    return (
      <PublicPageShell>
        <FlowStepper current="checkout" onBack={() => navigate(-1)} />
        <div className="mx-auto max-w-lg p-6">
          <FlightSummaryCard
            flight={{
              flightInstanceId: heldBooking.flightInstanceId,
              flightNo: heldBooking.flightNo,
              originCode: heldBooking.originCode,
              destCode: heldBooking.destCode,
              departureAt: heldBooking.departureAt,
              arrivalAt: heldBooking.arrivalAt,
              priceIrr: heldBooking.priceIrr,
            }}
            cabin={heldBooking.cabin}
            locale={locale}
          />
          <div className="mt-4 rounded-2xl border border-[#eef1f5] bg-white p-5">
            <div className="mb-3 text-[11px] font-black text-[#0d2640]">
              {t.enterPax}
            </div>
            {heldBooking.passengers.map((p) => (
              <div
                key={p.seatCode}
                className="mb-1 flex justify-between text-xs text-[#6b7b94]"
              >
                <span>{p.fullName}</span>
                <span dir="ltr">{p.seatCode}</span>
              </div>
            ))}
          </div>
          <button
            onClick={() => navigate(`/payment/${bookingId}`)}
            data-testid="continue-to-payment"
            className="mt-4 w-full rounded-xl bg-[#1668c4] px-6 py-3 text-sm font-bold text-white"
          >
            {t.nextPay}
          </button>
        </div>
      </PublicPageShell>
    );
  }

  if (!draft) {
    return (
      <PublicPageShell>
        <p className="p-8 text-sm text-[#6b7b94]">{t.loading}</p>
      </PublicPageShell>
    );
  }

  const priceIrr =
    draft.flight.priceIrr && draft.flight.priceIrr !== '0'
      ? draft.flight.priceIrr
      : '0';
  const passengerCount = Math.max(1, passengers.length);
  const currentPassengerMix = mixFromPassengers(passengers);
  const returnTicketIrr = passengerTotalIrr(priceIrr, currentPassengerMix);
  const outboundTicketIrr = draft.outboundLeg
    ? passengerTotalIrr(draft.outboundLeg.flight.priceIrr, currentPassengerMix)
    : 0n;
  const baseTicketIrr = returnTicketIrr + outboundTicketIrr;
  const extraSeatCount = passengers.filter(
    (passenger) => passenger.passengerType !== 'INFANT' && passenger.extraSeatRequested,
  ).length;
  const extraSeatUnitIrr =
    BigInt(priceIrr) + (draft.outboundLeg ? BigInt(draft.outboundLeg.flight.priceIrr || '0') : 0n);
  const extraSeatIrr = extraSeatUnitIrr * BigInt(extraSeatCount);
  const extrasIrr = extras
    .filter((extra) => extra.selected)
    .reduce((sum, extra) => sum + extraTotalIrr(extra, passengerCount), 0n);
  const selectedSeatTypesIrr = seatTypeTotalIrr(
    selectedSeats,
    draft.flight.aircraftType ?? 'MD-80',
    seatServices,
  );
  const grandIrr = baseTicketIrr + extraSeatIrr + extrasIrr + selectedSeatTypesIrr;
  const grandDisplay = localeMoney(grandIrr.toString(), locale);
  const passengerFormIncomplete =
    step === 'pax' &&
    (passengers.some((passenger) => !isPassengerValid(passenger)) ||
      nationalIdsExceedingSeatLimit(passengers).length > 0 ||
      passengerAgeError() !== null);
  const passengerCompletionNotice =
    showPassengerErrors && passengerFormIncomplete ? t.completePaxError : null;
  // Passenger validation is intentionally submit-driven: customers can type
  // without the whole form turning red, then see precise errors after confirm.
  const signInRequired = step === 'pax' && status !== 'authenticated';
  const nextDisabled = busy || signInRequired;

  const loginModal = loginOpen ? (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center overflow-y-auto bg-[#0d1b33]/65 px-3 py-4 backdrop-blur-[4px]"
      role="dialog"
      aria-modal="true"
      data-testid="checkout-login-modal"
    >
      <div className="relative my-auto w-full max-w-[340px] rounded-[18px] bg-white px-4 pb-5 pt-8 shadow-[0_20px_56px_rgba(8,20,40,.28)] sm:max-w-[360px] sm:px-5">
        <button
          type="button"
          data-testid="checkout-login-close"
          aria-label={locale === 'en' ? 'Close' : locale === 'ar' ? 'إغلاق' : 'بستن'}
          onClick={() => setLoginOpen(false)}
          className="absolute start-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg bg-[#f2f5f9] text-lg text-[#66758a]"
        >
          ×
        </button>
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#eef4fb] text-xl text-[#1668c4]">
          ✈
        </div>
        <div className="mb-3.5 text-center">
          <h2 className="m-0 text-base font-black text-[#0d2640]">
            {locale === 'en'
              ? 'Sign in or register'
              : locale === 'ar'
                ? 'تسجيل الدخول أو إنشاء حساب'
                : 'ورود یا ثبت‌نام'}
          </h2>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-[#7b8798]">
            {locale === 'en'
              ? 'Enter your mobile number to continue your booking.'
              : locale === 'ar'
                ? 'أدخل رقم جوالك لمتابعة الحجز.'
                : 'برای ادامه رزرو، شماره موبایل خود را وارد کنید.'}
          </p>
        </div>
        <OtpLoginInline
          embedded
          showHeader={false}
          checkoutStyle
          onAuthenticated={async () => {
            try {
              if (step === 'pax') {
                await syncGuestPrimaryProfile(passengers, locale);
                setStep('extras');
              } else if (step === 'review') {
                void submitBooking();
              }
              setLoginOpen(false);
            } catch (syncError) {
              setError(
                syncError instanceof Error
                  ? syncError.message
                  : locale === 'en'
                    ? 'Your profile could not be saved. Please try again.'
                    : 'ذخیره اطلاعات حساب انجام نشد؛ لطفاً دوباره تلاش کنید.',
              );
            }
          }}
        />
        <button
          type="button"
          onClick={() => setLoginOpen(false)}
          className="mt-3.5 w-full text-center text-[12.5px] font-bold text-[#7d8797] transition hover:text-[#0d2640]"
        >
          {locale === 'en' ? 'Cancel' : locale === 'ar' ? 'إلغاء' : 'انصراف'}
        </button>
      </div>
    </div>
  ) : null;

  const editPaxModal =
    editPaxOpen && draft ? (
      <ReviewPassengerEditModal
        locale={locale}
        passengers={passengers}
        savedPassengers={savedPassengers}
        departureAt={draft.flight.departureAt}
        onClose={() => setEditPaxOpen(false)}
        onSave={(next) => {
          changePassengers(next);
          setEditPaxOpen(false);
        }}
      />
    ) : null;

  const isAuthenticated = status === 'authenticated';
  const stepBody = (
    <>
      {step === 'pax' && (
        <PassengerStep
          locale={locale}
          passengers={passengers}
          onChange={changePassengers}
          savedPassengers={savedPassengers}
          savedPassengersEnabled={isAuthenticated}
          departureAt={draft.flight.departureAt}
          showValidationErrors={showPassengerErrors}
        />
      )}
      {step === 'extras' && (
        <ExtrasStep
          locale={locale}
          extras={extras}
          onToggleExtra={toggleExtra}
          onExtraQuantityChange={changeExtraQuantity}
          passengerCount={passengerCount}
          seatSelectionLimit={passengers.filter((passenger) => passenger.passengerType !== 'INFANT').length}
          seats={seats}
          selectedSeats={selectedSeats}
          onToggleSeat={toggleSeat}
          businessLocked={businessLocked}
          bookedCabin={draft?.cabin ?? 'ECONOMY'}
          aircraftType={draft?.flight.aircraftType ?? 'MD-80'}
          clubBalance={clubBalance}
          seatServices={seatServices}
        />
      )}
      {step === 'review' && (
        <ReviewStep
          locale={locale}
          passengers={passengers}
          extras={extras}
          selectedSeats={selectedSeats}
          onEditPassengers={() => setEditPaxOpen(true)}
        />
      )}
    </>
  );

  // Explicit mobile/desktop trees (design bundle) — do not rely on Tailwind
  // breakpoints alone; Cursor/device preview can desync CSS media queries.
  if (isMobile) {
    return (
      <PublicPageShell>
        <div
          className="flex items-center gap-3 border-b border-[#eef1f5] bg-white px-4 py-3"
          data-testid="checkout-mobile-titlebar"
        >
          <button
            type="button"
            onClick={() => (step === 'pax' ? navigate(-1) : goBack())}
            data-testid="checkout-mobile-back"
            className="flex h-9 w-9 flex-none items-center justify-center rounded-full border border-[#e6eaf0] bg-[#f3f5f8] text-[#0d2640]"
          >
            →
          </button>
          <span className="text-sm font-extrabold text-[#16202e]">
            {t.title}
          </span>
        </div>

        <div
          className="mx-auto flex w-full max-w-[1180px] flex-col gap-[15px] px-3.5 py-3.5 pb-28"
          data-testid="checkout-mobile-main"
        >
          <FlightSummaryCard
            flight={draft.flight}
            cabin={draft.cabin}
            locale={locale}
          />
          {draft.outboundLeg && (
            <FlightSummaryCard
              flight={draft.outboundLeg.flight}
              cabin={draft.outboundLeg.cabin}
              locale={locale}
            />
          )}
          {stepBody}
          {error && (
            <div
              className="rounded-[10px] border border-[#f5c6c6] bg-[#fdecec] px-3.5 py-2.5 text-xs font-semibold text-[#c0343a]"
              data-testid="checkout-error"
            >
              {error}
            </div>
          )}
          {/* Design: full CTA in price card + sticky duplicate at bottom */}
          <PricingSidebar
            locale={locale}
            priceIrr={baseTicketIrr.toString()}
            extraSeatCount={extraSeatCount}
            extraSeatIrr={extraSeatIrr.toString()}
            seatSelectionIrr={selectedSeatTypesIrr.toString()}
            paxCount={Math.max(1, passengers.length)}
            passengerMix={currentPassengerMix}
            extras={extras}
            nextLabel={nextLabel}
            onNext={goNext}
            onBack={goBack}
            canBack={step !== 'pax'}
            busy={busy}
            error={error}
            disabled={nextDisabled}
            disabledHint={passengerCompletionNotice}
            signInRequired={signInRequired}
            onSignIn={requestCheckoutLogin}
          />
        </div>

        <div
          className="sticky bottom-0 z-[80] flex items-center justify-between gap-2.5 border-t border-[#e6eaf0] bg-white px-4 py-2.5 shadow-[0_-8px_24px_-14px_rgba(13,38,102,.3)]"
          data-testid="checkout-mobile-sticky"
          style={{ paddingBottom: 'max(10px, env(safe-area-inset-bottom))' }}
        >
          {step !== 'pax' && (
            <button
              type="button"
              onClick={goBack}
              className="flex h-12 w-12 flex-none items-center justify-center rounded-xl border border-[#e6eaf0] bg-[#f2f5f9]"
            >
              →
            </button>
          )}
          <div className="min-w-0">
            <div className="text-[10.5px] text-[#9aa4b2]">{t.total}</div>
            <div className="whitespace-nowrap text-[15px] font-black text-[#1668c4]">
              {grandDisplay} {t.toman}
            </div>
          </div>
          <button
            type="button"
            disabled={nextDisabled}
            onClick={goNext}
            data-testid="checkout-next-mobile"
            className="flex h-12 max-w-[220px] flex-1 items-center justify-center rounded-xl bg-[#1668c4] text-[12.5px] font-extrabold text-white disabled:opacity-60"
          >
            {busy ? t.loading : nextLabel}
          </button>
          {signInRequired && (
            <button
              type="button"
              onClick={requestCheckoutLogin}
              data-testid="checkout-sign-in-required-mobile"
              className="flex h-12 max-w-[220px] flex-1 items-center justify-center rounded-xl border border-[#1668c4] bg-[#eef4fb] px-2 text-center text-[11px] font-extrabold text-[#1668c4]"
            >
              {locale === 'en' ? 'Sign in to continue' : locale === 'ar' ? 'تسجيل الدخول للمتابعة' : 'ورود برای ادامه'}
            </button>
          )}
        </div>
        {loginModal}
        {editPaxModal}
      </PublicPageShell>
    );
  }

  return (
    <PublicPageShell>
      <CheckoutStepBar current={step} locale={locale} />
      <div
        className="mx-auto grid max-w-[1180px] items-start gap-2.5 px-6 py-5"
        data-testid="checkout-desktop-main"
        style={{ gridTemplateColumns: 'minmax(0, 1fr) 340px' }}
      >
        <div className="flex min-w-0 flex-col gap-[15px]">
          <FlightSummaryCard
            flight={draft.flight}
            cabin={draft.cabin}
            locale={locale}
          />
          {draft.outboundLeg && (
            <FlightSummaryCard
              flight={draft.outboundLeg.flight}
              cabin={draft.outboundLeg.cabin}
              locale={locale}
            />
          )}
          {stepBody}
        </div>
        <PricingSidebar
          locale={locale}
          priceIrr={baseTicketIrr.toString()}
          extraSeatCount={extraSeatCount}
          extraSeatIrr={extraSeatIrr.toString()}
          seatSelectionIrr={selectedSeatTypesIrr.toString()}
          paxCount={Math.max(1, passengers.length)}
          passengerMix={currentPassengerMix}
          extras={extras}
          nextLabel={nextLabel}
          onNext={goNext}
          onBack={goBack}
          canBack={step !== 'pax'}
          busy={busy}
          error={error}
          disabled={nextDisabled}
          disabledHint={passengerCompletionNotice}
          signInRequired={signInRequired}
          onSignIn={requestCheckoutLogin}
        />
      </div>
      {loginModal}
      {editPaxModal}
    </PublicPageShell>
  );
}
