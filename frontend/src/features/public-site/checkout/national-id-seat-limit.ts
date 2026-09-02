import { latinDigits } from '../../../lib/fa-format';
import type { PassengerFormDraft } from './checkout-types';

export const MAX_SEATS_PER_NATIONAL_ID = 1;

function normalizeNationalIdInput(value: string): string {
  return latinDigits(value).replace(/\D/g, '');
}

/**
 * Returns national IDs used by more than one passenger in this checkout.
 * EXST belongs to the same passenger and is deliberately not counted again.
 */
export function nationalIdsExceedingSeatLimit(
  passengers: ReadonlyArray<
    Pick<PassengerFormDraft, 'nationalId' | 'docType' | 'passengerType' | 'extraSeatRequested'>
  >,
  max = MAX_SEATS_PER_NATIONAL_ID,
): string[] {
  const counts = new Map<string, number>();
  for (const passenger of passengers) {
    if (passenger.docType !== 'NATIONAL_ID') continue;
    const nid = normalizeNationalIdInput(passenger.nationalId);
    if (nid.length < 10) continue;
    counts.set(nid, (counts.get(nid) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count > max)
    .map(([nid]) => nid);
}
