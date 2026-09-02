import { Inject, Injectable } from '@nestjs/common';
import {
  NIRA_PROVIDER,
  type NiraManifestPassenger,
  type NiraProvider,
} from '../../common/nira/nira-provider.interface';

/** Thin wrapper around NiraProvider (Phase 24) — mirrors SmsService's
 * role of being the only caller of the swappable provider. Persisting
 * FlightInstance.niraSubmittedAt is flightops-specific business logic and
 * stays in FlightopsService, not here. */
@Injectable()
export class NiraService {
  constructor(@Inject(NIRA_PROVIDER) private readonly provider: NiraProvider) {}

  submitManifest(
    flightNo: string,
    departureAt: Date,
    passengers: NiraManifestPassenger[],
  ) {
    return this.provider.submitManifest(flightNo, departureAt, passengers);
  }
}
