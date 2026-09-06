import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  CanonicalEvent,
  isCanonicalEvent,
} from '../../common/events/canonical-events';
import { ErrorCode } from '../../common/errors';
import { CommerceInboxReceipt } from '../../database/entities/commerce-inbox-receipt.entity';
import {
  parseCoreItineraryEvent,
  type CoreItineraryEvent,
} from '../../common/events/core-itinerary-events';

// Only called on validated JSON. Array order matters; object property order does not.
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

@Injectable()
export class CommerceInboxService {
  constructor(private readonly db: DataSource) {}

  consumeItinerary(
    consumer: string,
    input: unknown,
    apply: (manager: EntityManager, event: CoreItineraryEvent) => Promise<void>,
  ): Promise<'processed' | 'duplicate'> {
    const event = parseCoreItineraryEvent(input);
    return this.consume(consumer, 'core-commerce', event, (manager, snapshot) =>
      apply(manager, parseCoreItineraryEvent(snapshot)),
    );
  }

  async consume(
    consumer: string,
    expectedProducer: string,
    input: unknown,
    apply: (manager: EntityManager, event: CanonicalEvent) => Promise<void>,
  ): Promise<'processed' | 'duplicate'> {
    if (
      !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(consumer) ||
      !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(expectedProducer) ||
      !isCanonicalEvent(input)
    )
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'ساختار رویداد یا تنظیمات دریافت معتبر نیست.',
      });
    if (input.producer !== expectedProducer)
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'ناشر رویداد مجاز نیست.',
      });
    // Snapshot before waiting for a DB lock; caller mutation cannot change the receipt.
    const event = JSON.parse(JSON.stringify(input)) as CanonicalEvent;
    const fingerprint = createHash('sha256')
      .update(stableJson(event))
      .digest('hex');
    const eventId = event.eventId.toLowerCase();
    return this.db.transaction('READ COMMITTED', async (manager) => {
      await manager.query("SET LOCAL lock_timeout = '5s'");
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [JSON.stringify(['commerce-inbox', consumer, eventId])],
      );
      const repo = manager.getRepository(CommerceInboxReceipt);
      const previous = await repo.findOneBy({ consumer, eventId });
      if (previous) {
        if (previous.fingerprint !== fingerprint)
          throw new ConflictException({
            code: ErrorCode.IDEMPOTENCY_PAYLOAD_MISMATCH,
            message: 'شناسه رویداد با محتوای متفاوت دریافت شده است.',
          });
        return 'duplicate';
      }
      await repo.insert({ consumer, eventId, fingerprint });
      await apply(manager, event);
      return 'processed';
    });
  }
}
