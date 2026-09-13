import { Injectable } from '@nestjs/common';
import { parseAgencyProjectionEvent } from './agency-projection-event';
import {
  AgencyProjectionStore,
  type AgencyProjectionResult,
} from './agency-projection.store';

@Injectable()
export class AgencyProjectionConsumer {
  constructor(private readonly store: AgencyProjectionStore) {}

  consume(input: unknown): Promise<AgencyProjectionResult> {
    return this.store.project(parseAgencyProjectionEvent(input));
  }
}
