import { Injectable } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import {
  PRICE_SUGGESTION_PROVIDER,
  type PriceSuggestionProvider,
} from '../ai/price-suggestion.provider';
import { SearchService } from './search.service';
import { CabinClass } from '../../database/enums';

export type SearchAdvisoryRecommendation = 'buy' | 'wait';

export interface SearchAdvisoryResult {
  available: boolean;
  recommendation?: SearchAdvisoryRecommendation;
  reasonFa?: string;
  predictedPriceIrr?: string;
  confidence?: number;
  modelVersion?: string;
  cheapestDayLabel?: string;
  priceIncreaseProbPct?: number;
}

@Injectable()
export class SearchAdvisoryService {
  constructor(
    private readonly search: SearchService,
    @Inject(PRICE_SUGGESTION_PROVIDER)
    private readonly priceSuggestions: PriceSuggestionProvider,
  ) {}

  async advise(
    origin: string,
    dest: string,
    date: string,
    cabin: CabinClass,
    requestId?: string,
  ): Promise<SearchAdvisoryResult> {
    const calendar = await this.search.priceCalendar(origin, dest, date, 3, cabin);
    const dayResults = (await this.search.search(origin, dest, date, cabin)) as {
      cabins: { cabin: string; priceIrr: string }[];
    }[];

    if (dayResults.length === 0) {
      return { available: false };
    }

    const cheapestToday = dayResults.reduce(
      (min, row) => {
        const selected = row.cabins.find((c) => c.cabin === cabin);
        const p = BigInt(selected?.priceIrr ?? row.cabins[0].priceIrr);
        return p < min ? p : min;
      },
      BigInt(
        dayResults[0].cabins.find((c) => c.cabin === cabin)?.priceIrr ??
          dayResults[0].cabins[0].priceIrr,
      ),
    );

    const pricedDays = calendar.filter((row) => BigInt(row.minPriceIrr) > 0n);
    const calendarMin =
      pricedDays.length > 0
        ? pricedDays.reduce((min, row) => {
            const p = BigInt(row.minPriceIrr);
            return p < min ? p : min;
          }, BigInt(pricedDays[0].minPriceIrr))
        : cheapestToday;

    const cheapestEntry = pricedDays.find(
      (c) => BigInt(c.minPriceIrr) === calendarMin,
    );

    const basePrice = Number(cheapestToday);
    const item = {
      proposal_id: `${origin}-${dest}-${date}`,
      origin_code: origin.toUpperCase(),
      dest_code: dest.toUpperCase(),
      departure_at: `${date}T12:00:00.000Z`,
      base_price_irr: basePrice,
      competitor_price_irr: Math.round(basePrice * 1.05),
      proposed_price_irr: basePrice,
      capacity: 146,
      charter_seats: 0,
    };

    const ml = await this.priceSuggestions.suggest([item], requestId);
    if (!ml?.suggestions[0]) {
      const wait = cheapestToday > calendarMin;
      return {
        available: true,
        recommendation: wait ? 'wait' : 'buy',
        reasonFa: wait
          ? 'قیمت این مسیر در روزهای نزدیک پایین‌تر است — اگر انعطاف دارید کمی صبر کنید.'
          : 'قیمت امروز در محدوده مناسب است — برای سفر قطعی همین حالا بخرید.',
        predictedPriceIrr: String(cheapestToday),
        cheapestDayLabel: cheapestEntry?.dateLabelFa,
        priceIncreaseProbPct: wait ? 65 : 35,
      };
    }

    const s = ml.suggestions[0];
    const suggested = BigInt(Math.round(s.price_irr));
    const recommendation: SearchAdvisoryRecommendation =
      suggested <= cheapestToday ? 'buy' : 'wait';

    return {
      available: true,
      recommendation,
      reasonFa: s.reason_fa,
      predictedPriceIrr: String(suggested),
      confidence: s.confidence,
      modelVersion: ml.model_version,
      cheapestDayLabel: cheapestEntry?.dateLabelFa,
      priceIncreaseProbPct: recommendation === 'buy' ? 72 : 38,
    };
  }
}
