/**
 * Extensibility stub for Phase-next pricing alerts / recommendations.
 * No job or endpoints are wired yet — rule-engine + AI adapter land later.
 */

export type PricingAlertType = 'LOW_SALES' | 'NO_SALES' | 'LOAD_FACTOR_DROP';

export interface PricingAlertDraft {
  flightInstanceId: string;
  alertType: PricingAlertType;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  salesCount: number;
  capacity: number;
  loadFactor: number;
  recommendedPriceIrr: string;
  recommendationJson: Record<string, unknown>;
}

/** Deterministic generator interface — implement in a later phase. */
export interface PricingAlertGenerator {
  generateForInstance(flightInstanceId: string): Promise<PricingAlertDraft[]>;
}
