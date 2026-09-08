import { Injectable } from '@nestjs/common';
import { CoreOfferPricingService } from './core-offer-pricing.service';
import { CoreItineraryHoldService } from './core-itinerary-hold.service';
import type {
  CoreOfferHoldDto,
  CoreOfferRepriceDto,
  CoreOfferSearchDto,
} from './dto/core-offer.dto';

export type { CoreOfferHoldVerification } from './core-offer-pricing.service';

@Injectable()
export class CoreOfferService {
  constructor(
    private readonly pricing: CoreOfferPricingService,
    private readonly holds: CoreItineraryHoldService,
  ) {}

  search(dto: CoreOfferSearchDto) {
    return this.pricing.search(dto);
  }

  reprice(offerId: string, dto: CoreOfferRepriceDto) {
    return this.pricing.reprice(offerId, dto);
  }

  async hold(
    offerId: string,
    dto: CoreOfferHoldDto,
    idempotencyKey: string | undefined,
  ) {
    const { integrityToken, ...holdDto } = dto;
    return this.holds.hold(holdDto, idempotencyKey, {
      offerId,
      verify: () =>
        this.pricing.verifyForHold(offerId, integrityToken, holdDto),
    });
  }
}
