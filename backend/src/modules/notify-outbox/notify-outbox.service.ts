import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { encryptPii } from '../../common/pii-crypto';
import { NotifyOutboxEvent } from '../../database/entities/notify-outbox-event.entity';
import { isUniqueViolation } from '../../database/utils/pg-errors';
import type {
  NotifyOutboxEventType,
  NotifyOutboxPayloadByType,
} from './notify-outbox.contract';

@Injectable()
export class NotifyOutboxService {
  constructor(
    @InjectRepository(NotifyOutboxEvent)
    private readonly repo: Repository<NotifyOutboxEvent>,
  ) {}

  async enqueue<T extends NotifyOutboxEventType>(
    eventType: T,
    payload: NotifyOutboxPayloadByType[T],
    dedupeKey?: string,
    manager?: EntityManager,
  ): Promise<{ eventId: string; queued: true }> {
    const repo = manager?.getRepository(NotifyOutboxEvent) ?? this.repo;
    const eventId = randomUUID();
    const stableKey = dedupeKey ?? `${eventType}:${eventId}`;
    const existing = await repo.findOneBy({ dedupeKey: stableKey });
    if (existing) return { eventId: existing.id, queued: true };

    try {
      const saved = await repo.save(
        repo.create({
          id: eventId,
          eventType,
          payloadEncrypted: encryptPii(JSON.stringify(payload)),
          dedupeKey: stableKey,
          attempts: 0,
          nextAttemptAt: new Date(),
          claimedAt: null,
          claimToken: null,
          deliveredAt: null,
          lastError: null,
        }),
      );
      return { eventId: saved.id, queued: true };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // A unique violation aborts an externally-owned PostgreSQL transaction;
      // let the domain transaction roll back so its normal retry can observe
      // the already-committed event instead of querying an aborted session.
      if (manager) throw error;
      const raced = await repo.findOneByOrFail({ dedupeKey: stableKey });
      return { eventId: raced.id, queued: true };
    }
  }
}
