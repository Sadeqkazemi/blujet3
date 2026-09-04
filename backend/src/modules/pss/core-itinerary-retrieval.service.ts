import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ErrorCode } from '../../common/errors';
import { CoreItineraryCouponEvent } from '../../database/entities/core-itinerary-coupon-event.entity';
import { CoreItineraryFlightCoupon } from '../../database/entities/core-itinerary-flight-coupon.entity';
import { CoreItineraryOrder } from '../../database/entities/core-itinerary-order.entity';
import { CoreItineraryRefund } from '../../database/entities/core-itinerary-refund.entity';
import { CoreItinerarySegment } from '../../database/entities/core-itinerary-segment.entity';
import { CoreItineraryTicketDocument } from '../../database/entities/core-itinerary-ticket-document.entity';
import { CoreItineraryTraveller } from '../../database/entities/core-itinerary-traveller.entity';
import type {
  CoreOrderCouponEventDto,
  CoreOrderDocumentDto,
  CoreOrderRefundHistoryDto,
  CoreOrderRetrievalDto,
  CoreOrderSegmentDto,
  CoreOrderTravellerDto,
} from './dto/core-order-retrieval.dto';

@Injectable()
export class CoreItineraryRetrievalService {
  constructor(
    @InjectRepository(CoreItineraryOrder)
    private readonly orderRepo: Repository<CoreItineraryOrder>,
    @InjectRepository(CoreItineraryTraveller)
    private readonly travellerRepo: Repository<CoreItineraryTraveller>,
    @InjectRepository(CoreItinerarySegment)
    private readonly segmentRepo: Repository<CoreItinerarySegment>,
    @InjectRepository(CoreItineraryTicketDocument)
    private readonly documentRepo: Repository<CoreItineraryTicketDocument>,
    @InjectRepository(CoreItineraryFlightCoupon)
    private readonly couponRepo: Repository<CoreItineraryFlightCoupon>,
    @InjectRepository(CoreItineraryRefund)
    private readonly refundRepo: Repository<CoreItineraryRefund>,
    @InjectRepository(CoreItineraryCouponEvent)
    private readonly couponEventRepo: Repository<CoreItineraryCouponEvent>,
  ) {}

  async retrieve(
    reference: string,
    ownerId: string,
  ): Promise<CoreOrderRetrievalDto> {
    const order = await this.orderRepo
      .createQueryBuilder('order')
      .where('(order.id = :reference OR order.pnr = :reference)', { reference })
      .andWhere('order.ownerId = :ownerId', { ownerId })
      .getOne();
    if (!order) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'سفارش در محدوده مالک یافت نشد.',
      });
    }

    const [travellers, segments, documents, refunds] = await Promise.all([
      this.travellerRepo.find({
        where: { orderId: order.id },
        order: { sequence: 'ASC' },
      }),
      this.segmentRepo.find({
        where: { orderId: order.id },
        order: { sequence: 'ASC' },
      }),
      this.documentRepo.find({
        where: { orderId: order.id },
        order: { id: 'ASC' },
      }),
      this.refundRepo.find({
        where: { orderId: order.id },
        order: { createdAt: 'ASC', id: 'ASC' },
      }),
    ]);
    const documentIds = documents.map((document) => document.id);
    const refundIds = refunds.map((refund) => refund.id);
    const [coupons, couponEvents] = await Promise.all([
      documentIds.length
        ? this.couponRepo.find({
            where: { ticketDocumentId: In(documentIds) },
            order: { couponNumber: 'ASC', id: 'ASC' },
          })
        : Promise.resolve([]),
      refundIds.length
        ? this.couponEventRepo.find({
            where: { refundId: In(refundIds) },
            order: { occurredAt: 'ASC', id: 'ASC' },
          })
        : Promise.resolve([]),
    ]);
    const couponsByDocument = new Map<string, CoreItineraryFlightCoupon[]>();
    for (const coupon of coupons) {
      couponsByDocument.set(coupon.ticketDocumentId, [
        ...(couponsByDocument.get(coupon.ticketDocumentId) ?? []),
        coupon,
      ]);
    }

    return {
      id: order.id,
      pnr: order.pnr,
      channel: order.channel,
      status: order.status,
      currency: order.currency,
      totalIrr: order.totalIrr.toString(),
      travellers: travellers.map((traveller): CoreOrderTravellerDto => ({
        id: traveller.id,
        sequence: traveller.sequence,
        fullName: traveller.fullName,
        passengerType: traveller.passengerType,
      })),
      segments: segments.map((segment): CoreOrderSegmentDto => ({
        id: segment.id,
        sequence: segment.sequence,
        flightNo: segment.flightNo,
        originCode: segment.originCode,
        destinationCode: segment.destinationCode,
        departureAt: segment.departureAt.toISOString(),
        arrivalAt: segment.arrivalAt.toISOString(),
        cabin: segment.cabin,
        fareIrr: segment.fareIrr.toString(),
        taxIrr: segment.taxIrr.toString(),
        extrasIrr: segment.extrasIrr.toString(),
        totalIrr: segment.totalIrr.toString(),
      })),
      documents: documents.map((document): CoreOrderDocumentDto => ({
        id: document.id,
        documentNumber: document.documentNumber,
        status: document.servicingStatus ?? document.status,
        travellerId: document.travellerId,
        servicingId: document.servicingId,
        coupons: (couponsByDocument.get(document.id) ?? []).map((coupon) => ({
          id: coupon.id,
          couponNumber: coupon.couponNumber,
          segmentId: coupon.segmentId,
          status: coupon.servicingStatus ?? coupon.status,
          servicingId: coupon.servicingId,
        })),
      })),
      refundHistory: refunds.map((refund): CoreOrderRefundHistoryDto => ({
        id: refund.id,
        refundReference: refund.refundReference,
        status: refund.status,
        refundableIrr: refund.refundableIrr.toString(),
        createdAt: refund.createdAt.toISOString(),
      })),
      couponEvents: couponEvents.map((event): CoreOrderCouponEventDto => ({
        id: event.id,
        couponId: event.couponId,
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        occurredAt: event.occurredAt.toISOString(),
      })),
    };
  }
}
