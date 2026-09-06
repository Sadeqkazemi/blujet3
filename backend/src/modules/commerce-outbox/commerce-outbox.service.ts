import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ErrorCode } from '../../common/errors';
import { fingerprintJson } from '../../common/events/event-fingerprint';
import { encryptPii } from '../../common/pii-crypto';
import {
  isCanonicalEvent,
  type CanonicalEvent,
} from '../../common/events/canonical-events';
import { CommerceOutboxEvent } from '../../database/entities/commerce-outbox-event.entity';
import { parseCoreItineraryEvent } from '../../common/events/core-itinerary-events';

@Injectable()
export class CommerceOutboxService {
  enqueueItinerary(
    manager: EntityManager,
    input: unknown,
  ): Promise<{ eventId: string }> {
    return this.enqueue(manager, parseCoreItineraryEvent(input));
  }

  async enqueue(
    manager: EntityManager,
    event: CanonicalEvent,
  ): Promise<{ eventId: string }> {
    if (!manager.queryRunner?.isTransactionActive) {
      throw new Error('Commerce outbox requires an active Core transaction');
    }
    if (!isCanonicalEvent(event)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'ساختار رویداد معتبر نیست.',
      });
    }
    const fingerprint = fingerprintJson({
      eventType: event.eventType,
      eventVersion: event.eventVersion,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      producer: event.producer,
      payload: event.payload,
    });
    const repo = manager.getRepository(CommerceOutboxEvent);
    // Serialize a logical command without aborting the caller on duplicate INSERT.
    await manager.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [JSON.stringify([event.producer, event.idempotencyKey])],
    );
    const existing = await repo.findOneBy({
      producer: event.producer,
      idempotencyKey: event.idempotencyKey,
    });
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw new ConflictException({
          code: ErrorCode.IDEMPOTENCY_PAYLOAD_MISMATCH,
          message: 'کلید تکرار با محتوای متفاوت استفاده شده است.',
        });
      }
      return { eventId: existing.id };
    }
    await repo.insert({
      id: event.eventId,
      producer: event.producer,
      idempotencyKey: event.idempotencyKey,
      fingerprint,
      envelopeEncrypted: encryptPii(JSON.stringify(event)),
    });
    return { eventId: event.eventId };
  }
}
