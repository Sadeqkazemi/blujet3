import { Injectable } from '@nestjs/common';
import { parseCartableTaskProjectedEvent } from '../../common/events/ops-admin-events';
import {
  type OpsAdminEventDelivery,
  OpsAdminProjectionStore,
  type OpsAdminProjectionResult,
} from './ops-admin-projection.store';

@Injectable()
export class OpsAdminProjectionConsumer {
  constructor(private readonly store: OpsAdminProjectionStore) {}

  async consume(
    input: unknown,
    delivery?: OpsAdminEventDelivery,
  ): Promise<OpsAdminProjectionResult> {
    const event = parseCartableTaskProjectedEvent(input);
    return delivery === undefined
      ? this.store.project(event)
      : this.store.project(event, delivery);
  }
}
