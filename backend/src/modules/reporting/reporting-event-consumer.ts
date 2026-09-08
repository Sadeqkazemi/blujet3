import { Inject, Injectable } from '@nestjs/common';
import {
  parseCoreItineraryEvent,
  type CoreItineraryEvent,
} from '../../common/events/core-itinerary-events';

/**
 * Reporting owns its eventual projection store. The sink is deliberately a
 * port so event admission can be tested before a separate read-model service
 * and database are introduced.
 */
export type ReportingProjectionResult = 'applied' | 'duplicate' | 'stale';
export type ReportingEventDelivery = {
  consumerGroup: string;
  topic: string;
  partition: number;
  nextOffset: string;
  highWatermark?: string;
};
export type ReportingCheckpointSummary = {
  partitions: number;
  maxLag: string | null;
  lastCheckpointAt: string | null;
};
export const REPORTING_READ_MODEL_SINK = Symbol('REPORTING_READ_MODEL_SINK');
export interface ReportingReadModelSink {
  project(
    event: CoreItineraryEvent,
    delivery?: ReportingEventDelivery,
  ): Promise<ReportingProjectionResult>;
}

@Injectable()
export class ReportingEventConsumer {
  constructor(
    @Inject(REPORTING_READ_MODEL_SINK)
    private readonly sink: ReportingReadModelSink,
  ) {}

  async consume(
    input: unknown,
    delivery?: ReportingEventDelivery,
  ): Promise<ReportingProjectionResult> {
    const event = parseCoreItineraryEvent(input);
    return delivery === undefined
      ? this.sink.project(event)
      : this.sink.project(event, delivery);
  }
}
