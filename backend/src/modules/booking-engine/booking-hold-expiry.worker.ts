import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { BookingHoldExpiryService } from './booking-hold-expiry.service';

const DEFAULT_POLL_MS = 30_000;
const MIN_POLL_MS = 1_000;

export function resolveBookingExpiryPollMs(raw: string | undefined): number {
  if (!raw) return DEFAULT_POLL_MS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= MIN_POLL_MS
    ? Math.floor(parsed)
    : DEFAULT_POLL_MS;
}

@Injectable()
export class BookingHoldExpiryWorker
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(BookingHoldExpiryWorker.name);
  private timer?: NodeJS.Timeout;
  private sweeping = false;

  constructor(private readonly expiry: BookingHoldExpiryService) {}

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
        this.logger.log({ expired }, 'expired booking holds materialized');
      }
    } catch (error) {
      this.logger.error(
        { error: error instanceof Error ? error.name : 'UnknownError' },
        'booking hold expiry sweep failed',
      );
    }
  }
}
