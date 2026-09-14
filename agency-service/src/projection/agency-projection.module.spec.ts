import { MODULE_METADATA } from '@nestjs/common/constants';
import { AGENCY_DLQ_CONFIG } from '../agency-dlq.config';
import { AgencyDlqStore } from './agency-dlq.store';
import { AgencyKafkaHandler } from './agency-kafka.handler';
import { AgencyProjectionConsumer } from './agency-projection.consumer';
import { AgencyProjectionModule } from './agency-projection.module';
import { AgencyProjectionStore } from './agency-projection.store';

function metadata(key: string): unknown[] {
  const value = Reflect.getMetadata(key, AgencyProjectionModule) as unknown;
  return Array.isArray(value) ? (value as unknown[]) : [];
}

describe('AgencyProjectionModule', () => {
  it('exports the Kafka adapter without a broker runtime provider', () => {
    const providers = metadata(MODULE_METADATA.PROVIDERS);
    const exports = metadata(MODULE_METADATA.EXPORTS);

    expect(providers).toEqual(
      expect.arrayContaining([
        AgencyProjectionStore,
        AgencyProjectionConsumer,
        AgencyDlqStore,
        AgencyKafkaHandler,
      ]),
    );
    expect(exports).toContain(AgencyProjectionConsumer);
    expect(exports).toContain(AgencyKafkaHandler);
    expect(exports).toContain(AgencyDlqStore);
    expect(exports).toContain(AGENCY_DLQ_CONFIG);
    expect(
      providers.some(
        (provider) =>
          typeof provider === 'function' && provider.name.includes('Runtime'),
      ),
    ).toBe(false);
  });
});
