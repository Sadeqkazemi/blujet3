import { Injectable, Logger } from '@nestjs/common';

/** Mirrors ml-service's pydantic schemas (snake_case on the wire). */
export interface PriceSuggestionItem {
  proposal_id: string;
  origin_code: string;
  dest_code: string;
  departure_at: string;
  base_price_irr: number;
  competitor_price_irr: number;
  proposed_price_irr: number;
  capacity: number;
  charter_seats: number;
}

export interface PriceSuggestion {
  proposal_id: string;
  price_irr: number;
  reason_fa: string;
  factors_fa: string[];
  season_fa: string;
  occasion_fa: string;
  confidence: number;
}

export interface PriceSuggestionResult {
  model_version: string;
  suggestions: PriceSuggestion[];
}

export const PRICE_SUGGESTION_PROVIDER = Symbol('PRICE_SUGGESTION_PROVIDER');

export interface PriceSuggestionProvider {
  /** Returns null on any failure — callers must degrade gracefully
   * (CLAUDE.md: if the ML service is down, everything else keeps working). */
  suggest(
    items: PriceSuggestionItem[],
    requestId?: string,
  ): Promise<PriceSuggestionResult | null>;
}

const ML_TIMEOUT_MS = 2000;

@Injectable()
export class MlPriceSuggestionProvider implements PriceSuggestionProvider {
  private readonly logger = new Logger(MlPriceSuggestionProvider.name);

  async suggest(
    items: PriceSuggestionItem[],
    requestId?: string,
  ): Promise<PriceSuggestionResult | null> {
    const baseUrl = process.env.ML_SERVICE_URL;
    const token = process.env.ML_SERVICE_INTERNAL_TOKEN;
    if (!baseUrl || !token) return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ML_TIMEOUT_MS);
    try {
      const res = await fetch(`${baseUrl}/internal/v1/price-suggestion`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Token': token,
          'X-Request-Id': requestId ?? '-',
        },
        body: JSON.stringify({ items }),
        signal: controller.signal,
      });
      if (!res.ok) {
        this.logger.warn(`ml-service price-suggestion returned ${res.status}`);
        return null;
      }
      return (await res.json()) as PriceSuggestionResult;
    } catch (err) {
      this.logger.warn(
        `ml-service price-suggestion unavailable: ${err instanceof Error ? err.message : 'unknown'}`,
      );
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
