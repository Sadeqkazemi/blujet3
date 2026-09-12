import { MODULE_METADATA } from '@nestjs/common/constants';
import { LoyaltyKafkaHandler } from './loyalty-kafka.handler';
import { LoyaltyProjectionConsumer } from './loyalty-projection.consumer';
import { LoyaltyProjectionModule } from './loyalty-projection.module';
import { LoyaltyProjectionStore } from './loyalty-projection.store';

function metadata(key: string): unknown[] {
  const value = Reflect.getMetadata(key, LoyaltyProjectionModule) as unknown;
  return Array.isArray(value) ? (value as unknown[]) : [];
}

describe('LoyaltyProjectionModule', () => {
  it('exports the Kafka adapter without a broker runtime provider', () => {
    const providers = metadata(MODULE_METADATA.PROVIDERS);
    const exports = metadata(MODULE_METADATA.EXPORTS);

    expect(providers).toEqual(
      expect.arrayContaining([
        LoyaltyProjectionStore,
        LoyaltyProjectionConsumer,
        LoyaltyKafkaHandler,
      ]),
    );
    expect(exports).toContain(LoyaltyKafkaHandler);
    expect(
      providers.some(
        (provider) =>
          typeof provider === 'function' && provider.name.includes('Runtime'),
      ),
    ).toBe(false);
  });
});
