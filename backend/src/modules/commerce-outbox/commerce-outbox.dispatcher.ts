import { randomUUID } from 'node:crypto';
import {
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { DataSource } from 'typeorm';
import { decryptPii } from '../../common/pii-crypto';
import { isCanonicalEvent } from '../../common/events/canonical-events';
import { KafkaEventPublisher } from '../../common/events/kafka-event-publisher';
import { CommerceOutboxEvent } from '../../database/entities/commerce-outbox-event.entity';
import { COMMERCE_OUTBOX_LEASE_MS } from './commerce-outbox.constants';

const MAX_ATTEMPTS = 10;

@Injectable()
export class CommerceOutboxDispatcher
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private timer?: NodeJS.Timeout;
  private active?: Promise<void>;
  private stopping = false;

  constructor(
    private readonly db: DataSource,
    private readonly publisher: KafkaEventPublisher,
    private readonly logger: Logger,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.publisher.enabled()) return;
    this.timer = setInterval(() => {
      void this.drainOnce().catch(() =>
        this.logger.error('Commerce outbox drain failed'),
      );
    }, 1000);
    this.timer.unref();
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    await this.active?.catch(() => undefined);
    await this.publisher.disconnect();
  }

  async drainOnce(): Promise<void> {
    if (this.stopping || !this.publisher.enabled()) return;
    if (this.active) return this.active;
    this.active = this.deliverOne();
    try {
      await this.active;
    } finally {
      this.active = undefined;
    }
  }

  private claim(): Promise<CommerceOutboxEvent | null> {
    return this.db.transaction(async (manager) => {
      const repo = manager.getRepository(CommerceOutboxEvent);
      const event = await repo
        .createQueryBuilder('event')
        .where('event.deliveredAt IS NULL AND event.deadLetterAt IS NULL')
        .andWhere('event.nextAttemptAt <= :now', { now: new Date() })
        .andWhere('(event.claimedAt IS NULL OR event.claimedAt < :stale)', {
          stale: new Date(Date.now() - COMMERCE_OUTBOX_LEASE_MS),
        })
        .orderBy('event.createdAt', 'ASC')
        .addOrderBy('event.id', 'ASC')
        .take(1)
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .getOne();
      if (!event) return null;
      if (event.attempts >= MAX_ATTEMPTS) {
        await repo.update(event.id, {
          deadLetterAt: new Date(),
          claimToken: null,
          claimedAt: null,
          lastError: 'ATTEMPTS_EXHAUSTED',
        });
        return null;
      }
      event.claimToken = randomUUID();
      event.claimedAt = new Date();
      event.attempts += 1;
      return repo.save(event);
    });
  }

  private async deliverOne(): Promise<void> {
    const event = await this.claim();
    if (!event || !event.claimToken) return;
    const repo = this.db.getRepository(CommerceOutboxEvent);
    const fence = { id: event.id, claimToken: event.claimToken };
    let failure = 'INVALID_ENVELOPE';
    try {
      const envelope: unknown = JSON.parse(decryptPii(event.envelopeEncrypted));
      if (
        !isCanonicalEvent(envelope) ||
        envelope.eventId !== event.id ||
        envelope.producer !== event.producer ||
        envelope.idempotencyKey !== event.idempotencyKey
      ) {
        throw new Error('Invalid persisted event');
      }
      failure = 'KAFKA_DELIVERY_FAILED';
      const sent = await this.publisher.publish(envelope);
      if (!sent) {
        await repo.update(fence, {
          claimToken: null,
          claimedAt: null,
          attempts: event.attempts - 1,
        });
        return;
      }
      await repo.update(fence, {
        deliveredAt: new Date(),
        claimToken: null,
        claimedAt: null,
        lastError: null,
      });
    } catch {
      const dead =
        failure === 'INVALID_ENVELOPE' || event.attempts >= MAX_ATTEMPTS;
      await repo.update(fence, {
        claimedAt: null,
        claimToken: null,
        lastError: failure,
        deadLetterAt: dead ? new Date() : null,
        nextAttemptAt: new Date(
          Date.now() + Math.min(60000, 1000 * 2 ** event.attempts),
        ),
      });
      this.logger.warn(
        { eventId: event.id, attempts: event.attempts, deadLetter: dead },
        'Commerce outbox delivery deferred',
      );
    }
  }
}
