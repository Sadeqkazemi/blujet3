import { randomUUID } from 'node:crypto';
import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { NotifyOutboxEvent } from '../../database/entities/notify-outbox-event.entity';
import { NotifyInternalClient } from './notify-internal.client';

const BATCH_SIZE = 20;
const CLAIM_LEASE_MS = 30_000;
const MAX_BACKOFF_MS = 60_000;

@Injectable()
export class NotifyOutboxDispatcher
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(NotifyOutboxDispatcher.name);
  private timer?: NodeJS.Timeout;
  private draining = false;

  constructor(
    private readonly dataSource: DataSource,
    private readonly client: NotifyInternalClient,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.client.enabled()) return;
    const pollMs = Number(process.env.NOTIFY_OUTBOX_POLL_MS ?? 1000);
    this.timer = setInterval(() => void this.drainOnce(), pollMs);
    this.timer.unref();
    void this.drainOnce();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async drainOnce(): Promise<void> {
    if (this.draining || !this.client.enabled()) return;
    this.draining = true;
    try {
      const events = await this.claimBatch();
      for (const event of events) await this.deliver(event);
    } finally {
      this.draining = false;
    }
  }

  private claimBatch(): Promise<NotifyOutboxEvent[]> {
    const claimToken = randomUUID();
    const now = new Date();
    const staleBefore = new Date(now.getTime() - CLAIM_LEASE_MS);

    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(NotifyOutboxEvent);
      const events = await repo
        .createQueryBuilder('event')
        .where('event.deliveredAt IS NULL')
        .andWhere('event.nextAttemptAt <= :now', { now })
        .andWhere(
          '(event.claimedAt IS NULL OR event.claimedAt < :staleBefore)',
          {
            staleBefore,
          },
        )
        .orderBy('event.createdAt', 'ASC')
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .take(BATCH_SIZE)
        .getMany();

      for (const event of events) {
        event.claimedAt = now;
        event.claimToken = claimToken;
      }
      return repo.save(events);
    });
  }

  private async deliver(event: NotifyOutboxEvent): Promise<void> {
    const repo: Repository<NotifyOutboxEvent> =
      this.dataSource.getRepository(NotifyOutboxEvent);
    const claimToken = event.claimToken;
    if (!claimToken) return;
    try {
      await this.client.dispatch(event);
      await repo.update(
        { id: event.id, claimToken },
        {
          deliveredAt: new Date(),
          claimedAt: null,
          claimToken: null,
          lastError: null,
        },
      );
    } catch (error) {
      const attempts = event.attempts + 1;
      const delayMs = Math.min(
        2 ** Math.min(attempts, 10) * 1000,
        MAX_BACKOFF_MS,
      );
      await repo.update(
        { id: event.id, claimToken },
        {
          attempts,
          nextAttemptAt: new Date(Date.now() + delayMs),
          claimedAt: null,
          claimToken: null,
          lastError: error instanceof Error ? error.name : 'DeliveryFailure',
        },
      );
      this.logger.warn(
        { eventId: event.id, eventType: event.eventType, attempts },
        'notify outbox delivery failed; retry scheduled',
      );
    }
  }
}
