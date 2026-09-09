import type { DataSourceOptions } from 'typeorm';
import { ReportingItineraryEventProjection } from '../database/entities/reporting-itinerary-event-projection.entity';
import { ReportingItineraryEventReceipt } from '../database/entities/reporting-itinerary-event-receipt.entity';
import { ReportingKafkaConsumerCheckpoint } from '../database/entities/reporting-kafka-consumer-checkpoint.entity';
import { ReportingKafkaProcessingFailure } from '../database/entities/reporting-kafka-processing-failure.entity';
import { reportingDlqConfig } from './reporting-dlq.config';
import { reportingKafkaConsumerConfig } from './reporting-kafka-consumer.config';

const PORT_PATTERN = /^\d{1,5}$/;

export function validateReportingWorkerEnv(
  env: Record<string, unknown>,
): Record<string, unknown> {
  if (!['development', 'test', 'production'].includes(String(env.NODE_ENV))) {
    throw new Error('NODE_ENV must be development, test or production');
  }
  if (
    typeof env.REPORTING_DATABASE_URL !== 'string' ||
    env.REPORTING_DATABASE_URL.trim() === ''
  ) {
    throw new Error('REPORTING_DATABASE_URL is required');
  }
  const port = env.PORT ?? '3500';
  if (
    typeof port !== 'string' ||
    !PORT_PATTERN.test(port) ||
    Number(port) < 1 ||
    Number(port) > 65_535
  ) {
    throw new Error('PORT must be between 1 and 65535');
  }
  const kafka = reportingKafkaConsumerConfig(env);
  if (!kafka.enabled) {
    throw new Error('REPORTING_KAFKA_CONSUMER_ENABLED must be true');
  }
  reportingDlqConfig(env);
  return env;
}

export function reportingWorkerDataSourceOptions(
  env: Record<string, unknown> = process.env,
): DataSourceOptions {
  const url = env.REPORTING_DATABASE_URL;
  if (typeof url !== 'string' || url.trim() === '') {
    throw new Error('REPORTING_DATABASE_URL is required');
  }
  return {
    type: 'postgres',
    url,
    synchronize: false,
    logging: false,
    entities: [
      ReportingItineraryEventProjection,
      ReportingItineraryEventReceipt,
      ReportingKafkaConsumerCheckpoint,
      ReportingKafkaProcessingFailure,
    ],
  };
}
