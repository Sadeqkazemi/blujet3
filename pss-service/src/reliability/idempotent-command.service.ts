import { ConflictException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { IdempotencyRecord } from '../database/entities/idempotency-record.entity';
import { OutboxEvent } from '../database/entities/outbox-event.entity';

export interface PendingOutboxEvent {
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: unknown;
  payloadVersion?: number;
}

export interface CommandOutcome<T> {
  response: T;
  events?: PendingOutboxEvent[];
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function stableDigest(value: unknown): string {
  return createHash('sha256').update(stableJson(value), 'utf8').digest('hex');
}

@Injectable()
export class IdempotentCommandService {
  constructor(private readonly dataSource: DataSource) {}

  async execute<T>(
    caller: string,
    operation: string,
    key: string,
    payload: unknown,
    handler: (manager: EntityManager) => Promise<CommandOutcome<T>>,
  ): Promise<T> {
    const requestHash = stableDigest(payload);
    return this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `${caller}:${operation}:${key}`,
      ]);
      const repository = manager.getRepository(IdempotencyRecord);
      const existing = await repository.findOne({
        where: { caller, operation, key },
      });
      if (existing) {
        if (existing.requestDigest !== requestHash) {
          throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED' });
        }
        return existing.responsePayload as T;
      }

      const outcome = await handler(manager);
      if (outcome.events?.length) {
        await manager.getRepository(OutboxEvent).save(
          outcome.events.map((event) =>
            manager.getRepository(OutboxEvent).create({
              ...event,
              payloadVersion: event.payloadVersion ?? 1,
              attempts: 0,
              availableAt: new Date(),
              publishedAt: null,
              deadLetteredAt: null,
            }),
          ),
        );
      }
      await repository.save(
        repository.create({
          caller,
          operation,
          key,
          requestDigest: requestHash,
          state: 'COMPLETED',
          responsePayload: outcome.response,
          responseReference: null,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        }),
      );
      return outcome.response;
    });
  }
}
