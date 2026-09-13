import { Injectable } from '@nestjs/common';
import { parseAgencyProjectionEvent } from './agency-projection-event';
import {
  type AgencyEventDelivery,
  AgencyProjectionStore,
  type AgencyProjectionResult,
} from './agency-projection.store';

@Injectable()
export class AgencyProjectionConsumer {
  constructor(private readonly store: AgencyProjectionStore) {}

  consume(
    input: unknown,
    delivery?: AgencyEventDelivery,
  ): Promise<AgencyProjectionResult> {
    const event = parseAgencyProjectionEvent(input);
    return delivery === undefined
      ? this.store.project(event)
      : this.store.project(event, delivery);
  }
}
