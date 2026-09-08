import type { EntityManager } from 'typeorm';

export const TRAVEL_EXTRA_PRICING = Symbol('TRAVEL_EXTRA_PRICING');

export interface TravelExtraPricing {
  overlayTravelExtras<
    T extends {
      code: string;
      priceIrr: bigint;
      purchaseEnabled: boolean;
      active: boolean;
      titleFa: string;
      descriptionFa: string | null;
    },
  >(
    extras: T[],
    manager?: EntityManager,
  ): Promise<T[]>;
}
