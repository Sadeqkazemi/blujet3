import type { DataSourceOptions } from 'typeorm';
import { ReportingItineraryEventProjection } from './entities/reporting-itinerary-event-projection.entity';
import { ReportingItineraryEventReceipt } from './entities/reporting-itinerary-event-receipt.entity';
import { ReportingKafkaConsumerCheckpoint } from './entities/reporting-kafka-consumer-checkpoint.entity';
import { ReportingKafkaProcessingFailure } from './entities/reporting-kafka-processing-failure.entity';
import { CreateReportingDatabase1793088000000 } from './reporting-migrations/1793088000000-CreateReportingDatabase';

export const reportingEntities = [
  ReportingItineraryEventProjection,
  ReportingItineraryEventReceipt,
  ReportingKafkaConsumerCheckpoint,
  ReportingKafkaProcessingFailure,
];

export const reportingMigrations = [CreateReportingDatabase1793088000000];

export function reportingDataSourceOptions(
  databaseUrl: string | undefined,
): DataSourceOptions {
  if (databaseUrl === undefined || databaseUrl.trim() === '') {
    throw new Error('REPORTING_DATABASE_URL is required');
  }

  return {
    type: 'postgres',
    url: databaseUrl,
    synchronize: false,
    logging: false,
    entities: reportingEntities,
    migrations: reportingMigrations,
    migrationsTableName: 'reporting_migrations',
  };
}
