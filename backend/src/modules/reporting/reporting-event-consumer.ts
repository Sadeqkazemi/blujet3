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
export const REPORTING_READ_MODEL_SINK = Symbol('REPORTING_READ_MODEL_SINK');
export interface ReportingReadModelSink {
  project(event: CoreItineraryEvent): Promise<ReportingProjectionResult>;
}

@Injectable()
export class ReportingEventConsumer {
  constructor(
    @Inject(REPORTING_READ_MODEL_SINK)
    private readonly sink: ReportingReadModelSink,
  ) {}

  async consume(input: unknown): Promise<ReportingProjectionResult> {
    const event = parseCoreItineraryEvent(input);
    return this.sink.project(event);
  }
}
