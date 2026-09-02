/**
 * Commercial manager ancillary/seat-type service pricing.
 * Shapes match GET /ancillary-services. Money is a decimal string.
 */
export interface SeatServiceRow {
  key: string;
  titleFa: string;
  descriptionFa: string;
  priceIrr: string;
  enabled: boolean;
}

export interface AncillaryServiceRow {
  key: string;
  titleFa: string;
  descriptionFa: string;
  priceIrr: string;
  enabled: boolean;
  /** Custom (manager-added) services can be deleted; built-in ones cannot. */
  isCustom: boolean;
}

export interface PublicAncillaryService {
  key: string;
  titleFa: string;
  titleEn?: string | null;
  titleAr?: string | null;
  descriptionFa: string;
  priceIrr: string;
}
