export type TravelExtraFixedCode =
  | 'EXTRA_BAGGAGE'
  | 'SEAT_SELECTION'
  | 'TRAVEL_INSURANCE'
  | 'SPECIAL_MEAL'
  | 'DATE_CHANGE'
  | 'REFUND_FEE'
  | 'CIP'
  | 'PET'
  | 'WHEELCHAIR';

export type TravelExtraCode = TravelExtraFixedCode | `CUSTOM_${string}`;

export type TravelExtraBillingUnit = 'PER_BOOKING' | 'PER_PASSENGER' | 'PER_KG';

export interface TravelCost {
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
  active: boolean;
  purchaseEnabled: boolean;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface TravelCostPayload {
  code: TravelExtraCode;
  titleFa: string;
  titleEn?: string;
  titleAr?: string;
  descriptionFa?: string;
  descriptionEn?: string;
  descriptionAr?: string;
  billingUnit: TravelExtraBillingUnit;
  priceIrr: string;
  active?: boolean;
  purchaseEnabled?: boolean;
  sortOrder?: number;
}

export type PublicTravelCost = Pick<
  TravelCost,
  | 'id'
  | 'code'
  | 'titleFa'
  | 'titleEn'
  | 'titleAr'
  | 'descriptionFa'
  | 'descriptionEn'
  | 'descriptionAr'
  | 'billingUnit'
  | 'priceIrr'
  | 'purchaseEnabled'
  | 'sortOrder'
>;
