import { Injectable } from '@nestjs/common';
import { parseLoyaltyProjectionEvent } from './loyalty-projection-event';
import {
  LoyaltyProjectionStore,
  type LoyaltyProjectionResult,
} from './loyalty-projection.store';

@Injectable()
export class LoyaltyProjectionConsumer {
  constructor(private readonly store: LoyaltyProjectionStore) {}

  consume(input: unknown): Promise<LoyaltyProjectionResult> {
    return this.store.project(parseLoyaltyProjectionEvent(input));
  }
}
