import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { ErrorCode } from '../../common/errors';
import { AgencyProfile } from '../../database/entities/agency-profile.entity';
import { CoreItineraryFlightCoupon } from '../../database/entities/core-itinerary-flight-coupon.entity';
import { CoreItineraryOrder } from '../../database/entities/core-itinerary-order.entity';
import { CoreItineraryPaymentConfirmation } from '../../database/entities/core-itinerary-payment-confirmation.entity';
import { CoreItinerarySegment } from '../../database/entities/core-itinerary-segment.entity';
import { CoreItineraryTicketDocument } from '../../database/entities/core-itinerary-ticket-document.entity';
import { CoreItineraryTraveller } from '../../database/entities/core-itinerary-traveller.entity';
import { CoreItineraryTravellerSegment } from '../../database/entities/core-itinerary-traveller-segment.entity';
import { FlightInstance } from '../../database/entities/flight-instance.entity';
import { LedgerEntry } from '../../database/entities/ledger-entry.entity';
import { TicketingService } from '../booking-engine/ticketing.service';
import { CoreItineraryQuoteService } from './core-itinerary-quote.service';
import type {
  ConfirmCoreItineraryPaymentDto,
  ConfirmedCoreItineraryPaymentDto,
} from './dto/confirm-core-itinerary-payment.dto';
import type { QuoteCoreItineraryDto } from './dto/quote-core-itinerary.dto';

class CoreItineraryFulfilmentFailure extends Error {
  constructor(readonly failureCode: string) {
    super(failureCode);
  }
}

@Injectable()
export class CoreItineraryPaymentService {
  constructor(
    @InjectRepository(CoreItineraryPaymentConfirmation)
    private readonly confirmationRepo: Repository<CoreItineraryPaymentConfirmation>,
    private readonly quotes: CoreItineraryQuoteService,
    private readonly ticketing: TicketingService,
  ) {}

  async confirm(
    orderId: string,
    dto: ConfirmCoreItineraryPaymentDto,
    idempotencyKey: string | undefined,
  ): Promise<ConfirmedCoreItineraryPaymentDto> {
    const key = idempotencyKey?.trim();
    const paymentReference = dto.paymentReference.trim();
    if (!key || key.length > 200 || !paymentReference) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'هدر Idempotency-Key و مرجع پرداخت معتبر الزامی است.',
      });
    }
    const requestHash = this.requestHash(
      orderId,
      dto.ownerId,
      paymentReference,
      dto.amountIrr,
    );
    const confirmation = await this.registerEvidence(
      orderId,
      dto,
      key,
      paymentReference,
      requestHash,
    );

    try {
      return await this.confirmationRepo.manager.transaction((tx) =>
        this.fulfil(tx, confirmation.id),
      );
    } catch (error) {
      if (!(error instanceof CoreItineraryFulfilmentFailure)) throw error;
      await this.markReviewRequired(confirmation.id, error.failureCode);
      throw this.reconciliationRequired(confirmation.id, error.failureCode);
    }
  }

  private async registerEvidence(
    orderId: string,
    dto: ConfirmCoreItineraryPaymentDto,
    key: string,
    paymentReference: string,
    requestHash: string,
  ): Promise<CoreItineraryPaymentConfirmation> {
    return this.confirmationRepo.manager.transaction(async (tx) => {
      const locks = [
        `core-itinerary-payment-key:${key}`,
        `core-itinerary-payment-order:${orderId}`,
        `core-itinerary-payment-reference:${paymentReference}`,
      ].sort();
      for (const lock of locks) {
        await tx.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
          [lock],
        );
      }
      const order = await tx.findOne(CoreItineraryOrder, {
        where: { id: orderId, ownerId: dto.ownerId },
        select: { id: true },
      });
      if (!order) {
        throw new NotFoundException({
          code: ErrorCode.NOT_FOUND,
          message: 'سفارش در محدوده مالک یافت نشد.',
        });
      }

      const existing = await tx
        .getRepository(CoreItineraryPaymentConfirmation)
        .createQueryBuilder('confirmation')
        .addSelect('confirmation.requestHash')
        .where('confirmation.idempotencyKey = :key', { key })
        .orWhere('confirmation.orderId = :orderId', { orderId })
        .orWhere('confirmation.paymentReference = :paymentReference', {
          paymentReference,
        })
        .getOne();
      if (existing) {
        this.assertReplay(
          existing,
          orderId,
          dto.ownerId,
          key,
          paymentReference,
          dto.amountIrr,
          requestHash,
        );
        if (existing.status === 'REVIEW_REQUIRED') {
          throw this.reconciliationRequired(
            existing.id,
            existing.failureCode ?? 'FULFILMENT_FAILED',
          );
        }
        return existing;
      }

      return tx.save(
        tx.create(CoreItineraryPaymentConfirmation, {
          orderId,
          ownerId: dto.ownerId,
          idempotencyKey: key,
          requestHash,
          paymentReference,
          amountIrr: dto.amountIrr,
          currency: 'IRR',
          status: 'RECEIVED',
          failureCode: null,
        }),
      );
    });
  }

  private async fulfil(
    tx: EntityManager,
    confirmationId: string,
  ): Promise<ConfirmedCoreItineraryPaymentDto> {
    const confirmation = await tx
      .getRepository(CoreItineraryPaymentConfirmation)
      .createQueryBuilder('confirmation')
      .setLock('pessimistic_write')
      .where('confirmation.id = :confirmationId', { confirmationId })
      .getOneOrFail();
    if (confirmation.status === 'COMPLETED') {
      return this.loadResponse(tx, confirmation);
    }
    if (confirmation.status === 'REVIEW_REQUIRED') {
      throw this.reconciliationRequired(
        confirmation.id,
        confirmation.failureCode ?? 'FULFILMENT_FAILED',
      );
    }

    const order = await tx.findOneOrFail(CoreItineraryOrder, {
      where: { id: confirmation.orderId },
      lock: { mode: 'pessimistic_write' },
    });
    if (order.status !== 'HELD') {
      throw new CoreItineraryFulfilmentFailure('ORDER_NOT_PAYABLE');
    }
    if (order.holdExpiresAt <= new Date()) {
      throw new CoreItineraryFulfilmentFailure('HOLD_EXPIRED');
    }

    const segments = await tx.find(CoreItinerarySegment, {
      where: { orderId: order.id },
      order: { sequence: 'ASC' },
    });
    const travellers = await tx.find(CoreItineraryTraveller, {
      where: { orderId: order.id },
      order: { sequence: 'ASC' },
    });
    if (segments.length === 0 || travellers.length === 0) {
      throw new Error('Core itinerary is missing fulfilment rows');
    }
    const flightIds = [
      ...new Set(segments.map((segment) => segment.flightInstanceId)),
    ].sort();
    const lockedFlights = await tx
      .createQueryBuilder(FlightInstance, 'flight')
      .setLock('pessimistic_write')
      .where('flight.id IN (:...flightIds)', { flightIds })
      .orderBy('flight.id', 'ASC')
      .getMany();
    if (lockedFlights.length !== flightIds.length) {
      throw new CoreItineraryFulfilmentFailure('REPRICE_FAILED');
    }

    let quote: Awaited<ReturnType<CoreItineraryQuoteService['quote']>>;
    try {
      quote = await this.quotes.quote(
        this.quoteRequest(order, segments, travellers),
        tx,
        order.id,
      );
    } catch (error) {
      if (error instanceof HttpException) {
        throw new CoreItineraryFulfilmentFailure('REPRICE_FAILED');
      }
      throw error;
    }
    if (BigInt(quote.totalIrr) !== confirmation.amountIrr) {
      throw new CoreItineraryFulfilmentFailure('PRICE_CHANGED');
    }

    await this.applyCurrentPrice(tx, order, segments, travellers, quote);
    order.status = 'PAID';
    await tx.save(order);

    let issued: Awaited<
      ReturnType<TicketingService['issueCoreItineraryTickets']>
    >;
    try {
      issued = await this.ticketing.issueCoreItineraryTickets(
        tx,
        order.id,
        confirmation.paymentReference,
      );
    } catch (error) {
      if (this.errorCode(error) === ErrorCode.TICKET_STOCK_UNAVAILABLE) {
        throw new CoreItineraryFulfilmentFailure(
          ErrorCode.TICKET_STOCK_UNAVAILABLE,
        );
      }
      throw error;
    }

    const agency =
      order.channel === 'AGENCY'
        ? await tx.findOne(AgencyProfile, {
            where: { userId: order.ownerId },
            select: { userId: true },
          })
        : null;
    await tx.save(
      tx.create(LedgerEntry, {
        bookingId: null,
        itineraryOrderId: order.id,
        type: 'SALE',
        signedAmountIrr: confirmation.amountIrr,
        createdById: order.ownerId,
        agencyId: agency?.userId ?? null,
      }),
    );
    order.status = 'TICKETED';
    await tx.save(order);
    confirmation.status = 'COMPLETED';
    confirmation.failureCode = null;
    await tx.save(confirmation);

    return this.toResponse(
      order,
      confirmation,
      issued.documents,
      issued.coupons,
    );
  }

  private quoteRequest(
    order: CoreItineraryOrder,
    segments: CoreItinerarySegment[],
    travellers: CoreItineraryTraveller[],
  ): QuoteCoreItineraryDto {
    if (order.channel !== 'SYSTEM' && order.channel !== 'AGENCY') {
      throw new Error('Core itinerary has an unsupported sales channel');
    }
    return {
      channel: order.channel,
      segments: segments.map((segment) => ({
        flightInstanceId: segment.flightInstanceId,
        sequence: segment.sequence,
        cabin: segment.cabin,
        fareClassCode: segment.fareClassCode ?? undefined,
        extras: segment.extrasSnapshot.map((extra) => ({
          id: extra.id,
          quantity: extra.quantity,
        })),
      })),
      travellers: travellers.map((traveller) => ({
        passengerType: traveller.passengerType,
        birthDate: traveller.birthDate,
      })),
    };
  }

  private async applyCurrentPrice(
    tx: EntityManager,
    order: CoreItineraryOrder,
    segments: CoreItinerarySegment[],
    travellers: CoreItineraryTraveller[],
    quote: Awaited<ReturnType<CoreItineraryQuoteService['quote']>>,
  ): Promise<void> {
    const travellerSegments = await tx.find(CoreItineraryTravellerSegment, {
      where: { travellerId: In(travellers.map((traveller) => traveller.id)) },
    });
    const segmentById = new Map(
      segments.map((segment) => [segment.id, segment]),
    );
    const travellerById = new Map(
      travellers.map((traveller) => [traveller.id, traveller]),
    );
    const quoteBySequence = new Map(
      quote.segments.map((segment) => [segment.sequence, segment]),
    );
    for (const segment of segments) {
      const current = quoteBySequence.get(segment.sequence);
      if (!current) throw new Error('Reprice omitted an itinerary segment');
      segment.fareClassCode = current.fareClassCode;
      segment.baggageAllowanceKg = current.baggageAllowanceKg;
      segment.fareIrr = BigInt(current.fareIrr);
      segment.taxIrr = BigInt(current.taxIrr);
      segment.extrasIrr = BigInt(current.extrasIrr);
      segment.totalIrr = BigInt(current.totalIrr);
      segment.extrasSnapshot = current.extras;
    }
    for (const row of travellerSegments) {
      const segment = segmentById.get(row.segmentId);
      const traveller = travellerById.get(row.travellerId);
      if (!segment || !traveller) {
        throw new Error('Invalid itinerary traveller-segment relation');
      }
      const current = quoteBySequence.get(segment.sequence)?.travellers[
        traveller.sequence - 1
      ];
      if (!current) throw new Error('Reprice omitted a traveller fare');
      row.fareIrr = BigInt(current.fareIrr);
      row.taxIrr = BigInt(current.taxIrr);
    }
    await tx.save(segments);
    await tx.save(travellerSegments);
    order.fareIrr = BigInt(quote.fareIrr);
    order.taxIrr = BigInt(quote.taxIrr);
    order.extrasIrr = BigInt(quote.extrasIrr);
    order.totalIrr = BigInt(quote.totalIrr);
  }

  private async loadResponse(
    tx: EntityManager,
    confirmation: CoreItineraryPaymentConfirmation,
  ): Promise<ConfirmedCoreItineraryPaymentDto> {
    const order = await tx.findOneOrFail(CoreItineraryOrder, {
      where: { id: confirmation.orderId },
    });
    if (order.status !== 'TICKETED') {
      throw new Error('Completed payment has a non-ticketed itinerary');
    }
    const travellers = await tx.find(CoreItineraryTraveller, {
      where: { orderId: order.id },
      order: { sequence: 'ASC' },
    });
    const documents = travellers.length
      ? await tx.find(CoreItineraryTicketDocument, {
          where: {
            travellerId: In(travellers.map((traveller) => traveller.id)),
          },
        })
      : [];
    const byTraveller = new Map(
      documents.map((document) => [document.travellerId, document]),
    );
    const orderedDocuments = travellers.map((traveller) =>
      byTraveller.get(traveller.id),
    );
    if (orderedDocuments.some((document) => document == null)) {
      throw new Error('Ticketed itinerary has an incomplete document set');
    }
    const coupons = documents.length
      ? await tx.find(CoreItineraryFlightCoupon, {
          where: {
            ticketDocumentId: In(documents.map((document) => document.id)),
          },
          order: { couponNumber: 'ASC' },
        })
      : [];
    const segmentCount = await tx.count(CoreItinerarySegment, {
      where: { orderId: order.id },
    });
    if (coupons.length !== travellers.length * segmentCount) {
      throw new Error('Ticketed itinerary has an incomplete coupon set');
    }
    return this.toResponse(
      order,
      confirmation,
      orderedDocuments as CoreItineraryTicketDocument[],
      coupons,
    );
  }

  private toResponse(
    order: CoreItineraryOrder,
    confirmation: CoreItineraryPaymentConfirmation,
    documents: CoreItineraryTicketDocument[],
    coupons: CoreItineraryFlightCoupon[],
  ): ConfirmedCoreItineraryPaymentDto {
    const couponsByDocument = new Map<string, CoreItineraryFlightCoupon[]>();
    for (const coupon of coupons) {
      const rows = couponsByDocument.get(coupon.ticketDocumentId) ?? [];
      rows.push(coupon);
      couponsByDocument.set(coupon.ticketDocumentId, rows);
    }
    return {
      id: order.id,
      pnr: order.pnr,
      status: 'TICKETED',
      currency: 'IRR',
      amountIrr: String(confirmation.amountIrr),
      paymentReference: confirmation.paymentReference,
      paymentConfirmationId: confirmation.id,
      documents: documents.map((document) => ({
        travellerId: document.travellerId,
        documentNumber: document.documentNumber,
        coupons: (couponsByDocument.get(document.id) ?? [])
          .sort((left, right) => left.couponNumber - right.couponNumber)
          .map((coupon) => ({
            couponNumber: coupon.couponNumber,
            segmentId: coupon.segmentId,
            status: coupon.status,
          })),
      })),
    };
  }

  private async markReviewRequired(
    confirmationId: string,
    failureCode: string,
  ): Promise<void> {
    await this.confirmationRepo.manager.transaction(async (tx) => {
      const confirmation = await tx.findOneOrFail(
        CoreItineraryPaymentConfirmation,
        {
          where: { id: confirmationId },
          lock: { mode: 'pessimistic_write' },
        },
      );
      if (confirmation.status === 'COMPLETED') return;
      confirmation.status = 'REVIEW_REQUIRED';
      confirmation.failureCode = failureCode;
      await tx.save(confirmation);
    });
  }

  private requestHash(
    orderId: string,
    ownerId: string,
    paymentReference: string,
    amountIrr: bigint,
  ): string {
    const digest = createHash('sha256')
      .update(
        JSON.stringify({
          operation: 'core-itinerary-payment-confirmation:v1',
          orderId,
          ownerId,
          paymentReference,
          amountIrr: amountIrr.toString(),
        }),
      )
      .digest('hex');
    return `v1:${digest}`;
  }

  private assertReplay(
    confirmation: CoreItineraryPaymentConfirmation,
    orderId: string,
    ownerId: string,
    key: string,
    paymentReference: string,
    amountIrr: bigint,
    requestHash: string,
  ): void {
    if (
      confirmation.orderId !== orderId ||
      confirmation.ownerId !== ownerId ||
      confirmation.idempotencyKey !== key ||
      confirmation.paymentReference !== paymentReference ||
      confirmation.amountIrr !== amountIrr ||
      confirmation.requestHash !== requestHash
    ) {
      throw new ConflictException({
        code: ErrorCode.IDEMPOTENCY_PAYLOAD_MISMATCH,
        message: 'اطلاعات تأیید پرداخت با درخواست ثبت‌شده تطابق ندارد.',
      });
    }
  }

  private errorCode(error: unknown): string | undefined {
    if (!(error instanceof HttpException)) return undefined;
    const response = error.getResponse();
    if (typeof response !== 'object' || response === null) return undefined;
    const code = (response as Record<string, unknown>).code;
    return typeof code === 'string' ? code : undefined;
  }

  private reconciliationRequired(
    confirmationId: string,
    failureCode: string,
  ): ConflictException {
    return new ConflictException({
      code: ErrorCode.PAYMENT_RECONCILIATION_REQUIRED,
      message:
        'پرداخت ثبت شده اما صدور کامل نشد؛ پیش از هر اقدام مالی دوباره، تطبیق دستی الزامی است.',
      confirmationId,
      failureCode,
    });
  }
}
