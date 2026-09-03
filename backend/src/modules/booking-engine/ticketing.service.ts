import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { EntityManager, In } from 'typeorm';
import { Booking } from '../../database/entities/booking.entity';
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
