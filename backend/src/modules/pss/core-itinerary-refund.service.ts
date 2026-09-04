import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { ErrorCode } from '../../common/errors';
import { addIrr, negateIrr } from '../../common/money';
import { toJsonValue, type JsonValue } from '../../database/json-types';
import { AgencyProfile } from '../../database/entities/agency-profile.entity';
import { CoreItineraryCouponEvent } from '../../database/entities/core-itinerary-coupon-event.entity';
import { CoreItineraryFlightCoupon } from '../../database/entities/core-itinerary-flight-coupon.entity';
import { CoreItineraryOrder } from '../../database/entities/core-itinerary-order.entity';
import { CoreItineraryRefund } from '../../database/entities/core-itinerary-refund.entity';
import { CoreItinerarySegment } from '../../database/entities/core-itinerary-segment.entity';
import { CoreItineraryTicketDocument } from '../../database/entities/core-itinerary-ticket-document.entity';
import { LedgerEntry } from '../../database/entities/ledger-entry.entity';
import { RefundPenaltyRule } from '../../database/entities/refund-penalty-rule.entity';
import { computePenalty } from '../refunds/penalty';
import type {
  AppliedCoreItineraryRefundDto,
  ApplyCoreItineraryRefundDto,
  CoreItineraryRefundQuoteDto,
  QuoteCoreItineraryRefundDto,
} from './dto/core-itinerary-refund.dto';

type RefundSegmentCalculation =
  CoreItineraryRefundQuoteDto['segments'][number] & {
    ruleId: string;
    ruleLabelFa: string;
  };

class CoreItineraryRefundFulfilmentFailure extends Error {
  constructor(readonly failureCode: string) {
    super(failureCode);
  }
}

/** Pure calculation seam used by the service and boundary unit tests. */
export function calculateCoreItineraryRefundSegment(
  segment: CoreItinerarySegment,
  coupons: CoreItineraryFlightCoupon[],
  rules: RefundPenaltyRule[],
  now: Date,
): RefundSegmentCalculation {
  const gross = addIrr(
    ...coupons.flatMap((coupon) => [coupon.fareIrr, coupon.taxIrr]),
    segment.extrasIrr,
  );
  const hours = (segment.departureAt.getTime() - now.getTime()) / 3_600_000;
  const penalty = computePenalty(rules, hours, gross);
  const selectedRule =
    [...rules]
      .sort(
        (left, right) =>
          right.minHoursBeforeDeparture - left.minHoursBeforeDeparture,
      )
      .find((rule) => hours >= rule.minHoursBeforeDeparture) ??
    [...rules].sort(
      (left, right) =>
        right.minHoursBeforeDeparture - left.minHoursBeforeDeparture,
    )[0];
  if (!selectedRule) throw new Error('Refund penalty rules are not configured');
  return {
    sequence: segment.sequence,
    segmentId: segment.id,
    departureAt: segment.departureAt.toISOString(),
    hoursLeft: Math.max(0, Math.floor(hours)),
    penaltyPct: penalty.penaltyPct,
    grossAmountIrr: gross.toString(),
    penaltyAmountIrr: penalty.penaltyAmountIrr.toString(),
    refundableIrr: penalty.refundableIrr.toString(),
    ruleId: selectedRule.id,
    ruleLabelFa: selectedRule.labelFa,
  };
}

@Injectable()
export class CoreItineraryRefundService {
  constructor(
    @InjectRepository(CoreItineraryRefund)
    private readonly refundRepo: Repository<CoreItineraryRefund>,
  ) {}

  async quote(
    orderId: string,
    dto: QuoteCoreItineraryRefundDto,
  ): Promise<CoreItineraryRefundQuoteDto> {
    return this.refundRepo.manager.transaction((tx) =>
      this.buildQuote(tx, orderId, dto.ownerId, new Date(), false),
    );
  }

  async apply(
    orderId: string,
    dto: ApplyCoreItineraryRefundDto,
    idempotencyKey: string | undefined,
  ): Promise<AppliedCoreItineraryRefundDto> {
    const key = idempotencyKey?.trim();
    const refundReference = dto.refundReference.trim();
    if (!key || key.length > 200 || !refundReference) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'هدر Idempotency-Key و مرجع استرداد معتبر الزامی است.',
      });
    }
    const requestHash = this.requestHash(
      orderId,
      dto.ownerId,
      dto.quoteReference,
      refundReference,
    );
    const refund = await this.registerEvidence(
      orderId,
      dto,
      key,
      refundReference,
      requestHash,
    );
    try {
      return await this.refundRepo.manager.transaction((tx) =>
        this.fulfil(tx, refund.id),
      );
    } catch (error) {
      if (!(error instanceof CoreItineraryRefundFulfilmentFailure)) throw error;
      await this.markReviewRequired(refund.id, error.failureCode);
      throw new ConflictException({
        code: ErrorCode.REFUND_RECONCILIATION_REQUIRED,
        message:
          'شاهد استرداد ثبت شد اما وضعیت پرواز تغییر کرده است؛ تطبیق دستی الزامی است.',
        refundId: refund.id,
        failureCode: error.failureCode,
      });
    }
  }

  private async registerEvidence(
    orderId: string,
    dto: ApplyCoreItineraryRefundDto,
    key: string,
    refundReference: string,
    requestHash: string,
  ): Promise<CoreItineraryRefund> {
    return this.refundRepo.manager.transaction(async (tx) => {
      const locks = [
        `core-itinerary-refund-key:${key}`,
        `core-itinerary-refund-order:${orderId}`,
        `core-itinerary-refund-reference:${refundReference}`,
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
        .getRepository(CoreItineraryRefund)
        .createQueryBuilder('refund')
        .addSelect('refund.requestHash')
        .where('refund.idempotencyKey = :key', { key })
        .orWhere('refund.orderId = :orderId', { orderId })
        .orWhere('refund.refundReference = :refundReference', {
          refundReference,
        })
        .getOne();
      if (existing) {
        this.assertReplay(
          existing,
          orderId,
          dto.ownerId,
          key,
          refundReference,
          requestHash,
        );
        if (existing.status === 'REVIEW_REQUIRED') {
          throw new ConflictException({
            code: ErrorCode.REFUND_RECONCILIATION_REQUIRED,
            message: 'این استرداد برای تطبیق دستی علامت‌گذاری شده است.',
            refundId: existing.id,
            failureCode: existing.failureCode,
          });
        }
        return existing;
      }
      const quote = await this.buildQuote(
        tx,
        orderId,
        dto.ownerId,
        new Date(),
        false,
      );
      if (quote.quoteReference !== dto.quoteReference) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message:
            'قیمت یا قواعد جریمه تغییر کرده است؛ quote جدید دریافت کنید.',
        });
      }
      return tx.save(
        tx.create(CoreItineraryRefund, {
          orderId,
          ownerId: dto.ownerId,
          idempotencyKey: key,
          requestHash,
          quoteReference: quote.quoteReference,
          refundReference,
          grossAmountIrr: BigInt(quote.grossAmountIrr),
          penaltyAmountIrr: BigInt(quote.penaltyAmountIrr),
          refundableIrr: BigInt(quote.refundableIrr),
          quoteSnapshot: toJsonValue(quote),
          currency: 'IRR',
          status: 'RECEIVED',
          failureCode: null,
          ledgerEntryId: null,
        }),
      );
    });
  }

  private async fulfil(
    tx: EntityManager,
    refundId: string,
  ): Promise<AppliedCoreItineraryRefundDto> {
    const refund = await tx
      .getRepository(CoreItineraryRefund)
      .createQueryBuilder('refund')
      .addSelect('refund.requestHash')
      .setLock('pessimistic_write')
      .where('refund.id = :refundId', { refundId })
      .getOneOrFail();
    if (refund.status === 'COMPLETED') return this.completedResponse(refund);
    if (refund.status === 'REVIEW_REQUIRED') {
      throw new ConflictException({
        code: ErrorCode.REFUND_RECONCILIATION_REQUIRED,
        message: 'این استرداد برای تطبیق دستی علامت‌گذاری شده است.',
        refundId: refund.id,
        failureCode: refund.failureCode,
      });
    }
    const order = await tx.findOne(CoreItineraryOrder, {
      where: { id: refund.orderId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!order || order.ownerId !== refund.ownerId)
      throw new CoreItineraryRefundFulfilmentFailure('ORDER_NOT_FOUND');
    if (order.status !== 'TICKETED')
      throw new CoreItineraryRefundFulfilmentFailure('ORDER_NOT_REFUNDABLE');
    const quote = await this.buildQuote(
      tx,
      order.id,
      refund.ownerId,
      new Date(),
      true,
    );
    if (
      quote.quoteReference !== refund.quoteReference ||
      BigInt(quote.grossAmountIrr) !== refund.grossAmountIrr ||
      BigInt(quote.penaltyAmountIrr) !== refund.penaltyAmountIrr ||
      BigInt(quote.refundableIrr) !== refund.refundableIrr
    ) {
      throw new CoreItineraryRefundFulfilmentFailure('QUOTE_CHANGED');
    }
    const documents = await tx
      .createQueryBuilder(CoreItineraryTicketDocument, 'document')
      .setLock('pessimistic_write')
      .where('document.orderId = :orderId', { orderId: order.id })
      .orderBy('document.id', 'ASC')
      .getMany();
    const coupons = documents.length
      ? await tx
          .createQueryBuilder(CoreItineraryFlightCoupon, 'coupon')
          .setLock('pessimistic_write')
          .where('coupon.ticketDocumentId IN (:...documentIds)', {
            documentIds: documents.map((d) => d.id),
          })
          .orderBy('coupon.id', 'ASC')
          .getMany()
      : [];
    const servicedAt = new Date();
    for (const document of documents) {
      document.servicingStatus = 'REFUNDED';
      document.servicedAt = servicedAt;
      document.servicingId = refund.id;
    }
    for (const coupon of coupons) {
      coupon.servicingStatus = 'REFUNDED';
      coupon.servicedAt = servicedAt;
      coupon.servicingId = refund.id;
    }
    await tx.save(documents);
    await tx.save(coupons);
    const segmentById = new Map(
      quote.segments.map((segment) => [segment.segmentId, segment]),
    );
    await tx.save(
      coupons.map((coupon) => {
        const segment = segmentById.get(coupon.segmentId);
        if (!segment) throw new Error('Refund quote omitted a coupon segment');
        return tx.create(CoreItineraryCouponEvent, {
          refundId: refund.id,
          documentId: coupon.ticketDocumentId,
          couponId: coupon.id,
          operation: 'REFUND',
          fromStatus: 'OPEN',
          toStatus: 'REFUNDED',
          ruleSnapshot: toJsonValue({
            segmentId: segment.segmentId,
            sequence: segment.sequence,
            penaltyPct: segment.penaltyPct,
            grossAmountIrr: segment.grossAmountIrr,
            penaltyAmountIrr: segment.penaltyAmountIrr,
            refundableIrr: segment.refundableIrr,
          }),
          occurredAt: servicedAt,
        });
      }),
    );
    const agency =
      order.channel === 'AGENCY'
        ? await tx.findOne(AgencyProfile, {
            where: { userId: order.ownerId },
            select: { userId: true },
          })
        : null;
    const ledger = await tx.save(
      tx.create(LedgerEntry, {
        bookingId: null,
        itineraryOrderId: order.id,
        type: 'REFUND',
        signedAmountIrr: negateIrr(refund.refundableIrr),
        createdById: refund.ownerId,
        agencyId: agency?.userId ?? null,
      }),
    );
    order.status = 'REFUNDED';
    await tx.save(order);
    refund.status = 'COMPLETED';
    refund.failureCode = null;
    refund.ledgerEntryId = ledger.id;
    await tx.save(refund);
    return this.completedResponse(refund);
  }

  private async buildQuote(
    tx: EntityManager,
    orderId: string,
    ownerId: string,
    now: Date,
    lock: boolean,
  ): Promise<CoreItineraryRefundQuoteDto> {
    const orderQuery = tx
      .getRepository(CoreItineraryOrder)
      .createQueryBuilder('order')
      .where('order.id = :orderId AND order.ownerId = :ownerId', {
        orderId,
        ownerId,
      });
    if (lock) orderQuery.setLock('pessimistic_write');
    const order = await orderQuery.getOne();
    if (!order)
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'سفارش در محدوده مالک یافت نشد.',
      });
    if (order.status !== 'TICKETED')
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'فقط سفارش صادرشده قابل استرداد کامل است.',
      });
    const saleRows = await tx.find(LedgerEntry, {
      where: { itineraryOrderId: order.id, type: 'SALE' },
    });
    if (saleRows.length !== 1 || saleRows[0].signedAmountIrr !== order.totalIrr)
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'شاهد مالی فروش سفارش کامل یا با مبلغ سفارش منطبق نیست.',
      });
    const segmentsQuery = tx
      .getRepository(CoreItinerarySegment)
      .createQueryBuilder('segment')
      .where('segment.orderId = :orderId', { orderId })
      .orderBy('segment.sequence', 'ASC');
    if (lock) segmentsQuery.setLock('pessimistic_write');
    const segments = await segmentsQuery.getMany();
    const documentsQuery = tx
      .getRepository(CoreItineraryTicketDocument)
      .createQueryBuilder('document')
      .where('document.orderId = :orderId', { orderId })
      .orderBy('document.id', 'ASC');
    if (lock) documentsQuery.setLock('pessimistic_write');
    const documents = await documentsQuery.getMany();
    if (segments.length === 0 || documents.length === 0)
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'اطلاعات صدور سفارش کامل نیست.',
      });
    if (
      documents.some(
        (document) =>
          document.status !== 'ISSUED' || document.servicingStatus !== null,
      ) ||
      documents.some((document) => document.servicingId !== null)
    ) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'یکی از مدارک قبلاً سرویس شده است.',
      });
    }
    const couponsQuery = tx
      .getRepository(CoreItineraryFlightCoupon)
      .createQueryBuilder('coupon')
      .where('coupon.ticketDocumentId IN (:...documentIds)', {
        documentIds: documents.map((document) => document.id),
      })
      .orderBy('coupon.id', 'ASC');
    if (lock) couponsQuery.setLock('pessimistic_write');
    const coupons = await couponsQuery.getMany();
    if (
      coupons.length !== documents.length * segments.length ||
      coupons.some(
        (coupon) =>
          coupon.status !== 'OPEN' ||
          coupon.servicingStatus !== null ||
          coupon.servicingId !== null,
      )
    ) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'کوپن‌های بلیت کامل یا قابل استرداد نیستند.',
      });
    }
    const rules = await tx.find(RefundPenaltyRule, {
      order: { minHoursBeforeDeparture: 'ASC' },
    });
    if (rules.length === 0)
      throw new Error('Refund penalty rules are not configured');
    const bySegment = new Map<string, CoreItineraryFlightCoupon[]>();
    for (const coupon of coupons)
      bySegment.set(coupon.segmentId, [
        ...(bySegment.get(coupon.segmentId) ?? []),
        coupon,
      ]);
    const calculations = segments.map((segment) =>
      calculateCoreItineraryRefundSegment(
        segment,
        bySegment.get(segment.id) ?? [],
        rules,
        now,
      ),
    );
    const grossAmountIrr = addIrr(
      ...calculations.map((item) => BigInt(item.grossAmountIrr)),
    );
    const penaltyAmountIrr = addIrr(
      ...calculations.map((item) => BigInt(item.penaltyAmountIrr)),
    );
    const refundableIrr = addIrr(
      ...calculations.map((item) => BigInt(item.refundableIrr)),
    );
    if (grossAmountIrr !== order.totalIrr || refundableIrr <= 0n)
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'مبلغ قابل استرداد معتبر نیست.',
      });
    const quoteReference = this.quoteReference(
      order,
      segments,
      coupons,
      calculations,
    );
    return {
      id: order.id,
      pnr: order.pnr,
      currency: 'IRR',
      quoteReference,
      grossAmountIrr: grossAmountIrr.toString(),
      penaltyAmountIrr: penaltyAmountIrr.toString(),
      refundableIrr: refundableIrr.toString(),
      segments: calculations.map((segment) => ({
        sequence: segment.sequence,
        segmentId: segment.segmentId,
        departureAt: segment.departureAt,
        hoursLeft: segment.hoursLeft,
        penaltyPct: segment.penaltyPct,
        grossAmountIrr: segment.grossAmountIrr,
        penaltyAmountIrr: segment.penaltyAmountIrr,
        refundableIrr: segment.refundableIrr,
      })),
    };
  }

  private quoteReference(
    order: CoreItineraryOrder,
    segments: CoreItinerarySegment[],
    coupons: CoreItineraryFlightCoupon[],
    calculations: RefundSegmentCalculation[],
  ): string {
    const payload = {
      operation: 'core-itinerary-full-refund:v1',
      orderId: order.id,
      ownerId: order.ownerId,
      totalIrr: order.totalIrr.toString(),
      segments: segments.map((segment) => ({
        id: segment.id,
        sequence: segment.sequence,
        departureAt: segment.departureAt.toISOString(),
        extrasIrr: segment.extrasIrr.toString(),
      })),
      coupons: coupons.map((coupon) => ({
        id: coupon.id,
        documentId: coupon.ticketDocumentId,
        segmentId: coupon.segmentId,
        fareIrr: coupon.fareIrr.toString(),
        taxIrr: coupon.taxIrr.toString(),
        status: coupon.status,
        servicingStatus: coupon.servicingStatus,
      })),
      rules: calculations.map((calculation) => ({
        segmentId: calculation.segmentId,
        ruleId: calculation.ruleId,
        penaltyPct: calculation.penaltyPct,
        grossAmountIrr: calculation.grossAmountIrr,
        penaltyAmountIrr: calculation.penaltyAmountIrr,
        refundableIrr: calculation.refundableIrr,
      })),
    };
    return `v1:${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`;
  }

  private completedResponse(
    refund: CoreItineraryRefund,
  ): AppliedCoreItineraryRefundDto {
    const snapshot = this.readSnapshot(refund.quoteSnapshot);
    return {
      ...snapshot,
      refundId: refund.id,
      refundReference: refund.refundReference,
      status: 'REFUNDED',
      ledgerEntryId: refund.ledgerEntryId ?? '',
    };
  }

  private readSnapshot(value: JsonValue): CoreItineraryRefundQuoteDto {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
      throw new Error('Invalid refund quote snapshot');
    const record = value as Record<string, JsonValue>;
    const requiredStrings = [
      'id',
      'pnr',
      'currency',
      'quoteReference',
      'grossAmountIrr',
      'penaltyAmountIrr',
      'refundableIrr',
    ];
    if (
      requiredStrings.some((key) => typeof record[key] !== 'string') ||
      !Array.isArray(record.segments)
    )
      throw new Error('Invalid refund quote snapshot');
    return record as unknown as CoreItineraryRefundQuoteDto;
  }

  private async markReviewRequired(
    refundId: string,
    failureCode: string,
  ): Promise<void> {
    await this.refundRepo.manager.transaction(async (tx) => {
      const refund = await tx.findOne(CoreItineraryRefund, {
        where: { id: refundId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!refund || refund.status === 'COMPLETED') return;
      refund.status = 'REVIEW_REQUIRED';
      refund.failureCode = failureCode;
      await tx.save(refund);
    });
  }

  private requestHash(
    orderId: string,
    ownerId: string,
    quoteReference: string,
    refundReference: string,
  ): string {
    return `v1:${createHash('sha256')
      .update(
        JSON.stringify({
          operation: 'core-itinerary-refund:v1',
          orderId,
          ownerId,
          quoteReference,
          refundReference,
        }),
      )
      .digest('hex')}`;
  }

  private assertReplay(
    refund: CoreItineraryRefund,
    orderId: string,
    ownerId: string,
    key: string,
    refundReference: string,
    requestHash: string,
  ): void {
    if (
      refund.orderId !== orderId ||
      refund.ownerId !== ownerId ||
      refund.idempotencyKey !== key ||
      refund.refundReference !== refundReference ||
      refund.requestHash !== requestHash
    ) {
      throw new ConflictException({
        code: ErrorCode.IDEMPOTENCY_PAYLOAD_MISMATCH,
        message: 'اطلاعات استرداد با درخواست ثبت‌شده تطابق ندارد.',
      });
    }
  }
}
