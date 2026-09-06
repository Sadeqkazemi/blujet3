import {
  parseCoreItineraryEvent,
  type CoreItineraryEvent,
} from '../../common/events/core-itinerary-events';

/**
 * Reporting owns its eventual projection store. The sink is deliberately a
 * port so event admission can be tested before a separate read-model service
 * and database are introduced.
 */
export interface ReportingReadModelSink {
  project(event: CoreItineraryEvent): Promise<void>;
}

export class ReportingEventConsumer {
  constructor(private readonly sink: ReportingReadModelSink) {}

  async consume(input: unknown): Promise<void> {
    const event = parseCoreItineraryEvent(input);
    await this.sink.project(event);
  }
}
