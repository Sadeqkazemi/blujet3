import type { CabinClass } from '../../../types/public-site';
import type { CheckoutDraft, FlightSnapshot } from './checkout-types';

const KEY = 'blujet_checkout_draft';

export function saveCheckoutDraft(draft: CheckoutDraft): void {
  sessionStorage.setItem(KEY, JSON.stringify(draft));
}

export function loadCheckoutDraft(): CheckoutDraft | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as CheckoutDraft;
    return {
      ...draft,
      passengerMix: draft.passengerMix ?? {
        adults: 1,
        children: 0,
        infants: 0,
      },
    };
  } catch {
    return null;
  }
}

export function clearCheckoutDraft(): void {
  sessionStorage.removeItem(KEY);
}

export function buildDraftFromFlight(
  flight: FlightSnapshot,
  cabin: CabinClass,
  selectedSeats: string[] = [],
): CheckoutDraft {
  return {
    flightInstanceId: flight.flightInstanceId,
    cabin,
    selectedSeats,
    flight,
    passengerMix: { adults: 1, children: 0, infants: 0 },
  };
}
