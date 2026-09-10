import { Injectable } from '@nestjs/common';
import { parseCartableTaskProjectedEvent } from '../../common/events/ops-admin-events';
import {
  OpsAdminProjectionStore,
  type OpsAdminProjectionResult,
} from './ops-admin-projection.store';

@Injectable()
export class OpsAdminProjectionConsumer {
  constructor(private readonly store: OpsAdminProjectionStore) {}

  async consume(input: unknown): Promise<OpsAdminProjectionResult> {
    return this.store.project(parseCartableTaskProjectedEvent(input));
  }
}
