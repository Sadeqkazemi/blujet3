import type {
  CoreOfferDto,
  CoreOfferRepriceDto,
  CoreOfferRepriceResultDto,
  CoreOfferSearchDto,
} from './dto/core-offer.dto';

export const OFFER_PRICING_CLIENT = Symbol('OFFER_PRICING_CLIENT');

export interface OfferPricingClient {
  search(dto: CoreOfferSearchDto): Promise<CoreOfferDto>;
  reprice(
    offerId: string,
    dto: CoreOfferRepriceDto,
  ): Promise<CoreOfferRepriceResultDto>;
}
