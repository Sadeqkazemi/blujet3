import type { CabinClass } from '../../database/enums';

export interface InitialCabinFareDefinition {
  cabin: CabinClass;
  seats: number;
  basePriceIrr: bigint;
  defaultClassCode: string;
}

export function buildInitialFareRuleRows(
  flightInstanceIds: string[],
  cabins: InitialCabinFareDefinition[],
  createId: () => string,
) {
  return flightInstanceIds.flatMap((flightInstanceId) =>
    cabins.map((cabin) => ({
      id: createId(),
      flightInstanceId,
      cabin: cabin.cabin,
      classCode: cabin.defaultClassCode,
      priceIrr: cabin.basePriceIrr,
      sitePriceIrr: null,
      seatsAllocated: cabin.seats,
      siteSeatsReleased: 0,
      agencySeatsReleased: 0,
      agencyReleasePriceIrr: null,
      agencySpecialOffer: false,
      refundable: true,
      allowedChannels: [],
      baggageAllowanceKg: null,
      changeable: true,
      taxIrr: 0n,
      validFrom: null,
      validUntil: null,
    })),
  );
}
