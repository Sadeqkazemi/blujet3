import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { resolveBookingExpiryPollMs } from '../booking-engine/booking-hold-expiry.worker';
import { CoreItineraryHoldExpiryService } from './core-itinerary-hold-expiry.service';

@Injectable()
export class CoreItineraryHoldExpiryWorker
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(CoreItineraryHoldExpiryWorker.name);
  private timer?: NodeJS.Timeout;
  private sweeping = false;

  constructor(private readonly expiry: CoreItineraryHoldExpiryService) {}

  onApplicationBootstrap(): void {
    if (
      process.env.NODE_ENV === 'test' ||
      process.env.BOOKING_EXPIRY_WORKER_ENABLED?.toLowerCase() === 'false'
    ) {
      return;
    }
    this.timer = setInterval(
      () => void this.sweepSafely(),
      resolveBookingExpiryPollMs(process.env.BOOKING_EXPIRY_POLL_MS),
    );
    this.timer.unref();
    void this.sweepSafely();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async sweepOnce(): Promise<number> {
    if (this.sweeping) return 0;
    this.sweeping = true;
    try {
      return await this.expiry.expireDueBatch();
    } finally {
      this.sweeping = false;
    }
  }

  private async sweepSafely(): Promise<void> {
    try {
      const expired = await this.sweepOnce();
      if (expired > 0) {
        this.logger.log(
          { expired },
          'expired Core itinerary holds materialized',
        );
      }
    } catch (error) {
      this.logger.error(
        { error: error instanceof Error ? error.name : 'UnknownError' },
        'Core itinerary hold expiry sweep failed',
      );
    }
  }
}
