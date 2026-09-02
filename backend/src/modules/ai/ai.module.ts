import { Module } from '@nestjs/common';
import {
  MlPriceSuggestionProvider,
  PRICE_SUGGESTION_PROVIDER,
} from './price-suggestion.provider';
import {
  AnthropicSurveySummaryProvider,
  SURVEY_SUMMARY_PROVIDER,
} from './survey-summary.provider';
import {
  AnthropicRouteDistanceProvider,
  ROUTE_DISTANCE_PROVIDER,
} from './route-distance.provider';

/** All AI/ML vendor calls live behind provider interfaces here, per
 * CLAUDE.md's AI rules — swappable without touching business logic. */
@Module({
  providers: [
    { provide: PRICE_SUGGESTION_PROVIDER, useClass: MlPriceSuggestionProvider },
    {
      provide: SURVEY_SUMMARY_PROVIDER,
      useClass: AnthropicSurveySummaryProvider,
    },
    {
      provide: ROUTE_DISTANCE_PROVIDER,
      useClass: AnthropicRouteDistanceProvider,
    },
  ],
  exports: [
    PRICE_SUGGESTION_PROVIDER,
    SURVEY_SUMMARY_PROVIDER,
    ROUTE_DISTANCE_PROVIDER,
  ],
})
export class AiModule {}
