import {
  offerWorkerDataSourceOptions,
  validateOfferWorkerEnv,
} from './offer-worker.config';

describe('Offer worker configuration', () => {
  const valid = {
    NODE_ENV: 'test',
    PORT: '3600',
    OFFER_DATABASE_URL:
      'postgresql://blujet_offer_reader:password@localhost/blujet',
    OFFER_INTERNAL_TOKEN: 'i'.repeat(32),
    CORE_OFFER_SIGNING_SECRET: 's'.repeat(32),
    CORE_OFFER_TTL_SECONDS: '900',
  };

  it('requires isolated credentials and a bounded Offer lifetime', () => {
    expect(validateOfferWorkerEnv(valid)).toBe(valid);
    expect(() =>
      validateOfferWorkerEnv({ ...valid, OFFER_DATABASE_URL: '' }),
    ).toThrow('OFFER_DATABASE_URL');
    expect(() =>
      validateOfferWorkerEnv({
        ...valid,
        OFFER_DATABASE_URL: 'postgresql://owner:password@localhost/blujet',
      }),
    ).toThrow('blujet_offer_reader');
    expect(() =>
      validateOfferWorkerEnv({ ...valid, OFFER_INTERNAL_TOKEN: 'short' }),
    ).toThrow('OFFER_INTERNAL_TOKEN');
    expect(() =>
      validateOfferWorkerEnv({ ...valid, CORE_OFFER_TTL_SECONDS: '901' }),
    ).toThrow('between 60 and 900');
  });

  it('uses only the dedicated Offer URL and disables migrations', () => {
    const options = offerWorkerDataSourceOptions(valid);
    expect(options).toMatchObject({
      type: 'postgres',
      url: valid.OFFER_DATABASE_URL,
      synchronize: false,
      migrations: [],
    });
  });
});
