import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { CoreItineraryEvent } from '../../common/events/core-itinerary-events';
import { fingerprintJson } from '../../common/events/event-fingerprint';
import { ErrorCode } from '../../common/errors';
import { ReportingItineraryEventProjection } from '../../database/entities/reporting-itinerary-event-projection.entity';
import { ReportingItineraryEventReceipt } from '../../database/entities/reporting-itinerary-event-receipt.entity';
import type { JsonValue } from '../../database/json-types';
import type {
  ReportingProjectionResult,
  ReportingReadModelSink,
} from './reporting-event-consumer';

@Injectable()
export class ReportingItineraryProjectionStore implements ReportingReadModelSink {
  constructor(
    @InjectRepository(ReportingItineraryEventProjection)
    private readonly projections: Repository<ReportingItineraryEventProjection>,
    @InjectRepository(ReportingItineraryEventReceipt)
    private readonly receipts: Repository<ReportingItineraryEventReceipt>,
  ) {}

  project(event: CoreItineraryEvent): Promise<ReportingProjectionResult> {
    return this.projections.manager.transaction(
      'READ COMMITTED',
      async (tx) => {
        const slot = `${event.aggregateId}:${event.eventType}`;
        for (const lock of [`event:${event.eventId}`, `slot:${slot}`].sort()) {
          await tx.query(
            'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
            [`reporting-itinerary:${lock}`],
          );
        }
        const repository = tx.getRepository(ReportingItineraryEventProjection);
        const receiptRepository = tx.getRepository(
          ReportingItineraryEventReceipt,
        );
        const eventFingerprint = fingerprintJson(event);
        const semanticFingerprint = this.semanticFingerprint(event);
        const existingReceipt = await receiptRepository.findOneBy({
          eventId: event.eventId,
        });
        if (existingReceipt) {
          if (existingReceipt.fingerprint === eventFingerprint)
            return 'duplicate';
          throw new ConflictException({
            code: ErrorCode.IDEMPOTENCY_PAYLOAD_MISMATCH,
            message: 'شناسه رویداد گزارش با محتوای متفاوت تکرار شده است.',
          });
        }
        const current = await repository
          .createQueryBuilder('projection')
          .where('projection.orderId = :orderId', {
            orderId: event.aggregateId,
          })
          .andWhere('projection.eventType = :eventType', {
            eventType: event.eventType,
          })
          .getOne();
        if (current) {
          if (event.payload.orderVersion < current.orderVersion) {
            await this.saveReceipt(receiptRepository, event, eventFingerprint);
            return 'stale';
          }
          if (event.payload.orderVersion === current.orderVersion) {
            if (current.fingerprint === semanticFingerprint) {
              await this.saveReceipt(
                receiptRepository,
                event,
                eventFingerprint,
              );
              return 'duplicate';
            }
            throw new ConflictException({
              code: ErrorCode.CONFLICT,
              message: 'نسخه رویداد گزارش با محتوای متفاوت دریافت شده است.',
            });
          }
        }
        await this.saveReceipt(receiptRepository, event, eventFingerprint);
        await repository.save(
          repository.create({
            orderId: event.aggregateId,
            eventType: event.eventType,
            eventId: event.eventId,
            fingerprint: semanticFingerprint,
            orderVersion: event.payload.orderVersion,
            currency: event.payload.currency,
            payload: JSON.parse(JSON.stringify(event.payload)) as JsonValue,
            occurredAt: new Date(event.occurredAt),
          }),
        );
        return 'applied';
      },
    );
  }

  private saveReceipt(
    repository: Repository<ReportingItineraryEventReceipt>,
    event: CoreItineraryEvent,
    fingerprint: string,
  ): Promise<ReportingItineraryEventReceipt> {
    return repository.save(
      repository.create({
        eventId: event.eventId,
        fingerprint,
        orderId: event.aggregateId,
        eventType: event.eventType,
        orderVersion: event.payload.orderVersion,
      }),
    );
  }

  private semanticFingerprint(event: CoreItineraryEvent): string {
    return fingerprintJson({
      producer: event.producer,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      eventType: event.eventType,
      eventVersion: event.eventVersion,
      payload: event.payload,
    });
  }
}
