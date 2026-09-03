import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import type { App } from 'supertest/types';
import { createTestApp } from './helpers/app.helper';
import { Booking } from '../src/database/entities/booking.entity';
import { FlightInstance } from '../src/database/entities/flight-instance.entity';
import { Passenger } from '../src/database/entities/passenger.entity';
import { TicketDocument } from '../src/database/entities/ticket-document.entity';
import { TicketDocumentStock } from '../src/database/entities/ticket-document-stock.entity';
import { TicketingService } from '../src/modules/booking-engine/ticketing.service';

describe('Commerce B3.2 accountable ticketing (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let ticketing: TicketingService;
  let flightInstanceId: string;
  const bookingIds: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    ticketing = app.get(TicketingService);
    flightInstanceId = (
      await dataSource.getRepository(FlightInstance).findOneByOrFail({})
    ).id;
  });

  afterEach(async () => {
    if (bookingIds.length === 0) return;
    await dataSource.getRepository(TicketDocument).delete({
      bookingId: In(bookingIds),
    });
    await dataSource.getRepository(Passenger).delete({
      bookingId: In(bookingIds),
    });
    await dataSource.getRepository(Booking).delete({ id: In(bookingIds) });
    bookingIds.length = 0;
  });

  afterAll(async () => {
    await app.close();
  });

  async function createBooking(passengerCount = 1) {
    const booking = await dataSource.getRepository(Booking).save(
      dataSource.getRepository(Booking).create({
        pnr: `BT${randomUUID().replaceAll('-', '').slice(0, 6).toUpperCase()}`,
        flightInstanceId,
        channel: 'SYSTEM',
        status: 'TICKETED',
        priceIrr: 1_000_000n,
        cabin: 'ECONOMY',
      }),
    );
    bookingIds.push(booking.id);
    const passengers = await dataSource.getRepository(Passenger).save(
      Array.from({ length: passengerCount }, (_, index) =>
        dataSource.getRepository(Passenger).create({
          bookingId: booking.id,
          fullName: `Ticket Test ${index + 1}`,
          passengerType: 'ADULT',
          birthDate: '1990-01-01',
          occupiesSeat: true,
          fareIrr: 1_000_000n,
          taxIrr: 0n,
          extraSeatFareIrr: 0n,
          seatCode: null,
          extraSeatCode: null,
          ticketNo: null,
          ticketIssuedAt: null,
        }),
      ),
    );
    return { booking, passengers };
  }

  it('replays the same passenger document without consuming another serial', async () => {
    const { booking } = await createBooking();
    const stockRepo = dataSource.getRepository(TicketDocumentStock);
    const before = await stockRepo.findOneByOrFail({
      id: 'sandbox-eticket-stock-780',
    });

    const first = await dataSource.transaction((tx) =>
      ticketing.issueBookingTickets(tx, booking.id, 'STAFF_MANUAL'),
    );
    const second = await dataSource.transaction((tx) =>
      ticketing.issueBookingTickets(tx, booking.id, 'STAFF_MANUAL'),
    );

    expect(second[0]?.documentNumber).toBe(first[0]?.documentNumber);
    expect(second[0]?.accountabilityStatus).toBe('ACCOUNTABLE');
    expect(
      (await stockRepo.findOneByOrFail({ id: before.id })).nextSerial,
    ).toBe(before.nextSerial + 1n);
  });

  it('serializes concurrent retries for the same booking as one issuance', async () => {
    const { booking } = await createBooking();
    const stockRepo = dataSource.getRepository(TicketDocumentStock);
    const before = await stockRepo.findOneByOrFail({
      id: 'sandbox-eticket-stock-780',
    });

    const [first, second] = await Promise.all([
      dataSource.transaction((tx) =>
        ticketing.issueBookingTickets(tx, booking.id, 'STAFF_MANUAL'),
      ),
      dataSource.transaction((tx) =>
        ticketing.issueBookingTickets(tx, booking.id, 'STAFF_MANUAL'),
      ),
    ]);

    expect(second[0]?.documentNumber).toBe(first[0]?.documentNumber);
    expect(
      await dataSource.getRepository(TicketDocument).countBy({
        bookingId: booking.id,
      }),
    ).toBe(1);
    expect(
      (await stockRepo.findOneByOrFail({ id: before.id })).nextSerial,
    ).toBe(before.nextSerial + 1n);
  });

  it('serializes concurrent allocations and never duplicates a document number', async () => {
    const first = await createBooking();
    const second = await createBooking();

    const [firstDocuments, secondDocuments] = await Promise.all([
      dataSource.transaction((tx) =>
        ticketing.issueBookingTickets(
          tx,
          first.booking.id,
          'PUBLIC_PAYMENT',
          'pay-first',
        ),
      ),
      dataSource.transaction((tx) =>
        ticketing.issueBookingTickets(
          tx,
          second.booking.id,
          'PUBLIC_PAYMENT',
          'pay-second',
        ),
      ),
    ]);

    expect(firstDocuments[0]?.documentNumber).not.toBe(
      secondDocuments[0]?.documentNumber,
    );
    expect(
      await dataSource.getRepository(TicketDocument).countBy({
        bookingId: In([first.booking.id, second.booking.id]),
      }),
    ).toBe(2);
  });

  it('rolls back a multi-passenger issuance when accountable stock is insufficient', async () => {
    const { booking, passengers } = await createBooking(2);
    const stockRepo = dataSource.getRepository(TicketDocumentStock);
    const sandboxBefore = await stockRepo.findOneByOrFail({
      id: 'sandbox-eticket-stock-780',
    });

    await expect(
      dataSource.transaction(async (tx) => {
        await tx
          .createQueryBuilder()
          .update(TicketDocumentStock)
          .set({ status: 'QUARANTINED' })
          .execute();
        await tx.save(
          tx.create(TicketDocumentStock, {
            id: `test-stock-${randomUUID()}`,
            documentType: 'ETICKET',
            airlineNumericCode: '779',
            startSerial: 1n,
            endSerial: 1n,
            nextSerial: 1n,
            status: 'ACTIVE',
            sourceAuthority: 'E2E_ROLLBACK_TEST',
          }),
        );
        await ticketing.issueBookingTickets(tx, booking.id, 'STAFF_MANUAL');
      }),
    ).rejects.toMatchObject({
      response: { code: 'TICKET_STOCK_UNAVAILABLE' },
      status: 503,
    });

    expect(
      await dataSource.getRepository(TicketDocument).countBy({
        bookingId: booking.id,
      }),
    ).toBe(0);
    const unchanged = await dataSource.getRepository(Passenger).findBy({
      id: In(passengers.map((passenger) => passenger.id)),
    });
    expect(unchanged.every((passenger) => passenger.ticketNo === null)).toBe(
      true,
    );
    expect(
      await stockRepo.findOneByOrFail({ id: sandboxBefore.id }),
    ).toMatchObject({
      nextSerial: sandboxBefore.nextSerial,
      status: sandboxBefore.status,
    });
  });

  it('preserves a legacy passenger number as quarantined without consuming stock', async () => {
    const { booking, passengers } = await createBooking();
    const legacyNumber = `778${String(Date.now() % 10_000_000_000).padStart(10, '0')}`;
    await dataSource
      .getRepository(Passenger)
      .update(
        { id: passengers[0].id },
        { ticketNo: legacyNumber, ticketIssuedAt: new Date() },
      );
    const stockRepo = dataSource.getRepository(TicketDocumentStock);
    const before = await stockRepo.findOneByOrFail({
      id: 'sandbox-eticket-stock-780',
    });

    const documents = await dataSource.transaction((tx) =>
      ticketing.issueBookingTickets(tx, booking.id, 'STAFF_MANUAL'),
    );

    expect(documents[0]).toMatchObject({
      documentNumber: legacyNumber,
      accountabilityStatus: 'QUARANTINED',
      stockId: null,
      issueSource: 'LEGACY_PASSENGER',
    });
    expect(
      (await stockRepo.findOneByOrFail({ id: before.id })).nextSerial,
    ).toBe(before.nextSerial);
  });
});
