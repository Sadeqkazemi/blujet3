import { Injectable } from '@nestjs/common';
import { CoreOfferPricingService } from './core-offer-pricing.service';
import type {
  CoreOfferRepriceDto,
  CoreOfferSearchDto,
} from './dto/core-offer.dto';
import type { OfferPricingClient } from './offer-pricing-client.interface';

@Injectable()
export class LocalOfferPricingClient implements OfferPricingClient {
  constructor(private readonly pricing: CoreOfferPricingService) {}

  search(dto: CoreOfferSearchDto) {
    return this.pricing.search(dto);
  }

  reprice(offerId: string, dto: CoreOfferRepriceDto) {
    return this.pricing.reprice(offerId, dto);
  }
}
