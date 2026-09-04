import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { EntityManager, In } from 'typeorm';
import { Booking } from '../../database/entities/booking.entity';
import { CoreItineraryFlightCoupon } from '../../database/entities/core-itinerary-flight-coupon.entity';
import { CoreItineraryOrder } from '../../database/entities/core-itinerary-order.entity';
import { CoreItinerarySegment } from '../../database/entities/core-itinerary-segment.entity';
import { CoreItineraryTicketDocument } from '../../database/entities/core-itinerary-ticket-document.entity';
import { CoreItineraryTraveller } from '../../database/entities/core-itinerary-traveller.entity';
import { CoreItineraryTravellerSegment } from '../../database/entities/core-itinerary-traveller-segment.entity';
import { Passenger } from '../../database/entities/passenger.entity';
import {
  TicketDocument,
  type TicketIssueSource,
} from '../../database/entities/ticket-document.entity';
import { TicketDocumentStock } from '../../database/entities/ticket-document-stock.entity';
import { toJsonValue } from '../../database/json-types';
import { ErrorCode } from '../../common/errors';

const TICKET_SERIAL_WIDTH = 10;

@Injectable()
export class TicketingService {
  private stockUnavailable(): ServiceUnavailableException {
    return new ServiceUnavailableException({
      code: ErrorCode.TICKET_STOCK_UNAVAILABLE,
      message: 'موجودی معتبر شماره بلیت برای صدور کافی نیست.',
    });
  }

  async assertStockAvailable(
    manager: EntityManager,
    requiredDocuments: number,
  ): Promise<void> {
    if (requiredDocuments <= 0) return;
    const row = await manager
      .createQueryBuilder(TicketDocumentStock, 'stock')
      .select(
        'COALESCE(SUM(stock."endSerial" - stock."nextSerial" + 1), 0)',
        'available',
      )
      .where('stock.documentType = :documentType', {
        documentType: 'ETICKET',
      })
      .andWhere('stock.status = :status', { status: 'ACTIVE' })
      .andWhere('stock.nextSerial <= stock.endSerial')
      .getRawOne<{ available: string }>();
    if (BigInt(row?.available ?? '0') < BigInt(requiredDocuments)) {
      throw this.stockUnavailable();
    }
  }

  async issueBookingTickets(
    manager: EntityManager,
    bookingId: string,
    issueSource: Exclude<TicketIssueSource, 'LEGACY_PASSENGER'>,
    paymentReference: string | null = null,
  ): Promise<TicketDocument[]> {
    const booking = await manager.findOneOrFail(Booking, {
      where: { id: bookingId },
      lock: { mode: 'pessimistic_write' },
    });
    const passengers = await manager.find(Passenger, {
      where: { bookingId },
      order: { id: 'ASC' },
    });
    const passengerIds = passengers.map((passenger) => passenger.id);
    const existing = passengerIds.length
      ? await manager.find(TicketDocument, {
          where: { passengerId: In(passengerIds) },
        })
      : [];
    const byPassenger = new Map(
      existing.map((document) => [document.passengerId, document]),
    );
    const issuedAt = new Date();

    for (const passenger of passengers) {
      let document = byPassenger.get(passenger.id);
      if (!document && passenger.ticketNo) {
        document = await manager.save(
          manager.create(TicketDocument, {
            bookingId,
            passengerId: passenger.id,
            stockId: null,
            documentNumber: passenger.ticketNo,
            status: 'ISSUED',
            accountabilityStatus: 'QUARANTINED',
            issueSource: 'LEGACY_PASSENGER',
            paymentReference: null,
            issueSnapshot: this.snapshot(booking, passenger),
            issuedAt: passenger.ticketIssuedAt ?? issuedAt,
          }),
        );
        existing.push(document);
        byPassenger.set(passenger.id, document);
      }
      if (!document) {
        const { stock, documentNumber } =
          await this.allocateNextDocumentNumber(manager);
        document = await manager.save(
          manager.create(TicketDocument, {
            bookingId,
            passengerId: passenger.id,
            stockId: stock.id,
            documentNumber,
            status: 'ISSUED',
            accountabilityStatus: 'ACCOUNTABLE',
            issueSource,
            paymentReference,
            issueSnapshot: this.snapshot(booking, passenger),
            issuedAt,
          }),
        );
        existing.push(document);
        byPassenger.set(passenger.id, document);
      }
      if (
        passenger.ticketNo !== document.documentNumber ||
        !passenger.ticketIssuedAt
      ) {
        passenger.ticketNo = document.documentNumber;
        passenger.ticketIssuedAt = document.issuedAt;
        await manager.save(passenger);
      }
    }

    return passengers.map((passenger) => byPassenger.get(passenger.id)!);
  }

  async issueCoreItineraryTickets(
    manager: EntityManager,
    orderId: string,
    paymentReference: string,
  ): Promise<{
    documents: CoreItineraryTicketDocument[];
    coupons: CoreItineraryFlightCoupon[];
  }> {
    const order = await manager.findOneOrFail(CoreItineraryOrder, {
      where: { id: orderId },
      lock: { mode: 'pessimistic_write' },
    });
    const travellers = await manager.find(CoreItineraryTraveller, {
      where: { orderId },
      order: { sequence: 'ASC' },
    });
    const segments = await manager.find(CoreItinerarySegment, {
      where: { orderId },
      order: { sequence: 'ASC' },
    });
    const travellerSegments = await manager.find(
      CoreItineraryTravellerSegment,
      {
        where: {
          travellerId: In(travellers.map((traveller) => traveller.id)),
        },
      },
    );
    if (travellerSegments.length !== travellers.length * segments.length) {
      throw new Error('Incomplete itinerary traveller-segment pricing');
    }
    const existing = travellers.length
      ? await manager.find(CoreItineraryTicketDocument, {
          where: {
            travellerId: In(travellers.map((traveller) => traveller.id)),
          },
        })
      : [];
    await this.assertStockAvailable(
      manager,
      travellers.length - existing.length,
    );

    const byTraveller = new Map(
      existing.map((document) => [document.travellerId, document]),
    );
    for (const document of existing) {
      if (
        document.orderId !== orderId ||
        document.paymentReference !== paymentReference
      ) {
        throw new Error('Existing itinerary ticket does not match payment');
      }
    }
    const priceByPair = new Map(
      travellerSegments.map((row) => [
        `${row.travellerId}:${row.segmentId}`,
        row,
      ]),
    );
    const issuedAt = new Date();

    for (const traveller of travellers) {
      if (byTraveller.has(traveller.id)) continue;
      const travellerPrices = travellerSegments.filter(
        (row) => row.travellerId === traveller.id,
      );
      const travellerFareIrr = travellerPrices.reduce(
        (total, row) => total + row.fareIrr,
        0n,
      );
      const travellerTaxIrr = travellerPrices.reduce(
        (total, row) => total + row.taxIrr,
        0n,
      );
      const { stock, documentNumber } =
        await this.allocateNextDocumentNumber(manager);
      const document = await manager.save(
        manager.create(CoreItineraryTicketDocument, {
          orderId,
          travellerId: traveller.id,
          stockId: stock.id,
          documentNumber,
          status: 'ISSUED',
          accountabilityStatus: 'ACCOUNTABLE',
          issueSource: 'CORE_ITINERARY_PAYMENT',
          paymentReference,
          issueSnapshot: toJsonValue({
            orderId,
            pnr: order.pnr,
            channel: order.channel,
            currency: order.currency,
            travellerId: traveller.id,
            passengerType: traveller.passengerType,
            travellerFareIrr,
            travellerTaxIrr,
            orderFareIrr: order.fareIrr,
            orderTaxIrr: order.taxIrr,
            orderExtrasIrr: order.extrasIrr,
            orderTotalIrr: order.totalIrr,
          }),
          issuedAt,
        }),
      );
      existing.push(document);
      byTraveller.set(traveller.id, document);
    }

    const documentIds = existing.map((document) => document.id);
    const existingCoupons = documentIds.length
      ? await manager.find(CoreItineraryFlightCoupon, {
          where: { ticketDocumentId: In(documentIds) },
        })
      : [];
    const couponKeys = new Set(
      existingCoupons.map(
        (coupon) => `${coupon.ticketDocumentId}:${coupon.segmentId}`,
      ),
    );
    const newCoupons: CoreItineraryFlightCoupon[] = [];
    for (const traveller of travellers) {
      const document = byTraveller.get(traveller.id)!;
      for (const segment of segments) {
        const key = `${document.id}:${segment.id}`;
        if (couponKeys.has(key)) continue;
        const price = priceByPair.get(`${traveller.id}:${segment.id}`);
        if (!price) {
          throw new Error('Missing itinerary traveller-segment price row');
        }
        newCoupons.push(
          manager.create(CoreItineraryFlightCoupon, {
            ticketDocumentId: document.id,
            segmentId: segment.id,
            couponNumber: segment.sequence,
            status: 'OPEN',
            fareIrr: price.fareIrr,
            taxIrr: price.taxIrr,
            baggageAllowanceKg: segment.baggageAllowanceKg,
            segmentSnapshot: toJsonValue({
              orderId,
              segmentId: segment.id,
              flightInstanceId: segment.flightInstanceId,
              sequence: segment.sequence,
              flightNo: segment.flightNo,
              originCode: segment.originCode,
              destinationCode: segment.destinationCode,
              departureAt: segment.departureAt.toISOString(),
              arrivalAt: segment.arrivalAt.toISOString(),
              cabin: segment.cabin,
              fareClassCode: segment.fareClassCode,
              currency: order.currency,
              fareIrr: price.fareIrr,
              taxIrr: price.taxIrr,
              baggageAllowanceKg: segment.baggageAllowanceKg,
            }),
          }),
        );
      }
    }
    const savedCoupons = newCoupons.length
      ? await manager.save(newCoupons)
      : [];
    return {
      documents: travellers.map((traveller) => byTraveller.get(traveller.id)!),
      coupons: [...existingCoupons, ...savedCoupons].sort(
        (left, right) => left.couponNumber - right.couponNumber,
      ),
    };
  }

  private async allocateNextDocumentNumber(
    manager: EntityManager,
  ): Promise<{ stock: TicketDocumentStock; documentNumber: string }> {
    for (;;) {
      const stock = await manager
        .createQueryBuilder(TicketDocumentStock, 'stock')
        .setLock('pessimistic_write')
        .where('stock.documentType = :documentType', {
          documentType: 'ETICKET',
        })
        .andWhere('stock.status = :status', { status: 'ACTIVE' })
        .andWhere('stock.nextSerial <= stock.endSerial')
        .orderBy('stock.startSerial', 'ASC')
        .addOrderBy('stock.id', 'ASC')
        .getOne();
      if (!stock) throw this.stockUnavailable();

      while (stock.nextSerial <= stock.endSerial) {
        const serial = stock.nextSerial;
        const documentNumber = `${stock.airlineNumericCode}${serial
          .toString()
          .padStart(TICKET_SERIAL_WIDTH, '0')}`;
        stock.nextSerial = serial + 1n;
        if (stock.nextSerial > stock.endSerial) stock.status = 'EXHAUSTED';
        await manager.save(stock);

        const occupied =
          (await manager.exists(TicketDocument, {
            where: { documentNumber },
          })) ||
          (await manager.exists(CoreItineraryTicketDocument, {
            where: { documentNumber },
          })) ||
          (await manager.exists(Passenger, {
            where: { ticketNo: documentNumber },
          }));
        if (!occupied) return { stock, documentNumber };
      }
    }
  }

  private snapshot(booking: Booking, passenger: Passenger) {
    return toJsonValue({
      bookingId: booking.id,
      pnr: booking.pnr,
      flightInstanceId: booking.flightInstanceId,
      channel: booking.channel,
      cabin: booking.cabin,
      fareClassCode: booking.fareClassCode,
      currency: 'IRR',
      passengerId: passenger.id,
      passengerType: passenger.passengerType,
      seatCode: passenger.seatCode,
      extraSeatCode: passenger.extraSeatCode,
      fareIrr: passenger.fareIrr,
      taxIrr: passenger.taxIrr,
      extraSeatFareIrr: passenger.extraSeatFareIrr,
    });
  }
}
