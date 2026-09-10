import { ReportingItineraryEventProjection } from './entities/reporting-itinerary-event-projection.entity';
import { ReportingItineraryEventReceipt } from './entities/reporting-itinerary-event-receipt.entity';
import { ReportingKafkaConsumerCheckpoint } from './entities/reporting-kafka-consumer-checkpoint.entity';
import { ReportingKafkaProcessingFailure } from './entities/reporting-kafka-processing-failure.entity';
import {
  reportingDataSourceOptions,
  reportingEntities,
  reportingMigrations,
} from './reporting-data-source.options';
import { CreateReportingDatabase1793088000000 } from './reporting-migrations/1793088000000-CreateReportingDatabase';

describe('reportingDataSourceOptions', () => {
  it('owns only the Reporting entities and standalone bootstrap migration', () => {
    const url = 'postgresql://reporting:secret@localhost/reporting';

    expect(reportingDataSourceOptions(url)).toMatchObject({
      type: 'postgres',
      url,
      synchronize: false,
      logging: false,
      migrationsTableName: 'reporting_migrations',
      entities: reportingEntities,
      migrations: reportingMigrations,
    });
    expect(reportingEntities).toEqual([
      ReportingItineraryEventProjection,
      ReportingItineraryEventReceipt,
      ReportingKafkaConsumerCheckpoint,
      ReportingKafkaProcessingFailure,
    ]);
    expect(reportingMigrations).toEqual([CreateReportingDatabase1793088000000]);
  });

  it.each([undefined, '', '   '])('rejects a missing database URL', (url) => {
    expect(() => reportingDataSourceOptions(url)).toThrow(
      'REPORTING_DATABASE_URL is required',
    );
  });
});
