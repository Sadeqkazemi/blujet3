import { Injectable } from '@nestjs/common';
import { parseLoyaltyProjectionEvent } from './loyalty-projection-event';
import {
  LoyaltyProjectionStore,
  type LoyaltyEventDelivery,
  type LoyaltyProjectionResult,
} from './loyalty-projection.store';

@Injectable()
export class LoyaltyProjectionConsumer {
  constructor(private readonly store: LoyaltyProjectionStore) {}

  consume(
    input: unknown,
    delivery?: LoyaltyEventDelivery,
  ): Promise<LoyaltyProjectionResult> {
    const event = parseLoyaltyProjectionEvent(input);
    return delivery === undefined
      ? this.store.project(event)
      : this.store.project(event, delivery);
  }
}
