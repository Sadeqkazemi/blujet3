import { CoreOfferPricingService } from '../pss/core-offer-pricing.service';
import { OfferPricingController } from './offer-pricing.controller';

describe('OfferPricingController boundary', () => {
  it('exposes read pricing operations and no Hold operation', () => {
    const controller = new OfferPricingController(
      {} as CoreOfferPricingService,
    ) as OfferPricingController & { hold?: unknown };
    expect(typeof controller.search).toBe('function');
    expect(typeof controller.reprice).toBe('function');
    expect(controller.hold).toBeUndefined();
  });
});
