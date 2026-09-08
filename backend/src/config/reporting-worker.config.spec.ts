import { ReportingItineraryEventProjection } from '../database/entities/reporting-itinerary-event-projection.entity';
import { ReportingItineraryEventReceipt } from '../database/entities/reporting-itinerary-event-receipt.entity';
import { ReportingKafkaConsumerCheckpoint } from '../database/entities/reporting-kafka-consumer-checkpoint.entity';
import {
  reportingWorkerDataSourceOptions,
  validateReportingWorkerEnv,
} from './reporting-worker.config';

describe('reporting worker configuration', () => {
  const valid = {
    NODE_ENV: 'test',
    PORT: '3501',
    REPORTING_DATABASE_URL: 'postgresql://reporting:secret@localhost/reporting',
    REPORTING_KAFKA_CONSUMER_ENABLED: 'true',
    KAFKA_BROKERS: 'localhost:9092',
  };

  it('accepts an enabled worker with a dedicated database URL', () => {
    expect(validateReportingWorkerEnv(valid)).toBe(valid);
  });

  it.each([
    [{ ...valid, REPORTING_DATABASE_URL: '' }, 'REPORTING_DATABASE_URL'],
    [{ ...valid, REPORTING_KAFKA_CONSUMER_ENABLED: 'false' }, 'must be true'],
    [{ ...valid, PORT: '0' }, 'PORT'],
    [{ ...valid, PORT: '65536' }, 'PORT'],
  ] as const)('rejects invalid worker configuration', (env, message) => {
    expect(() => validateReportingWorkerEnv(env)).toThrow(message);
  });

  it('registers only Reporting-owned entities and never synchronizes', () => {
    const options = reportingWorkerDataSourceOptions(valid);

    expect(options).toMatchObject({
      type: 'postgres',
      url: valid.REPORTING_DATABASE_URL,
      synchronize: false,
      logging: false,
    });
    expect(options.entities).toEqual([
      ReportingItineraryEventProjection,
      ReportingItineraryEventReceipt,
      ReportingKafkaConsumerCheckpoint,
    ]);
    expect(options).not.toHaveProperty('migrationsRun');
  });
});
