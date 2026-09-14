import { MODULE_METADATA } from '@nestjs/common/constants';
import { OpsAdminKafkaHandler } from './ops-admin-kafka.handler';
import { OpsAdminModule } from './ops-admin.module';
import { OpsAdminProjectionConsumer } from './ops-admin-projection.consumer';
import { OpsAdminProjectionStore } from './ops-admin-projection.store';

function metadata(key: string): unknown[] {
  const value = Reflect.getMetadata(key, OpsAdminModule) as unknown;
  return Array.isArray(value) ? (value as unknown[]) : [];
}

describe('OpsAdminModule', () => {
  it('exports the Kafka adapter without a broker runtime provider', () => {
    const providers = metadata(MODULE_METADATA.PROVIDERS);
    const exports = metadata(MODULE_METADATA.EXPORTS);

    expect(providers).toEqual(
      expect.arrayContaining([
        OpsAdminProjectionStore,
        OpsAdminProjectionConsumer,
        OpsAdminKafkaHandler,
      ]),
    );
    expect(exports).toContain(OpsAdminProjectionConsumer);
    expect(exports).toContain(OpsAdminKafkaHandler);
    expect(
      providers.some(
        (provider) =>
          typeof provider === 'function' && provider.name.includes('Runtime'),
      ),
    ).toBe(false);
  });
});
