import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import request from 'supertest';
import { DataSource, In } from 'typeorm';
import { AircraftSeatMap } from '../src/database/entities/aircraft-seat-map.entity';
import { Booking } from '../src/database/entities/booking.entity';
import { Flight } from '../src/database/entities/flight.entity';
import { FlightInstance } from '../src/database/entities/flight-instance.entity';
import { LedgerEntry } from '../src/database/entities/ledger-entry.entity';
import { Passenger } from '../src/database/entities/passenger.entity';
import { PaymentReconciliation } from '../src/database/entities/payment-reconciliation.entity';
import { Route } from '../src/database/entities/route.entity';
import { FlightInstanceStatus } from '../src/database/enums';
import { createTestApp } from './helpers/app.helper';
import { loginAs, loginAsCustomer } from './helpers/login.helper';

/** Phase 13 Part E — real DEPARTED materialization, FLOWN/NO_SHOW booking
 * lifecycle, and the payment-reconciliation queue for a GATEWAY payment
 * that succeeds but whose ticketing transaction then fails. See
 * docs/DB_SCHEMA.md Phase 13 Part E. */
describe('Phase 13 Part E — PNR lifecycle + payment reconciliation', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  const AIRCRAFT_TYPE = 'P13E-Jet';
  let flightId: string;
  const createdInstanceIds: string[] = [];
  const createdBookingIds: string[] = [];

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);

    const seatMapRepo = dataSource.getRepository(AircraftSeatMap);
    const existingSeatMap = await seatMapRepo.findOneBy({
      aircraftType: AIRCRAFT_TYPE,
    });
    if (!existingSeatMap) {
      await seatMapRepo.save(
        seatMapRepo.create({
          aircraftType: AIRCRAFT_TYPE,
          businessRowStart: 1,
          businessRowEnd: 0,
          businessColsLeft: [],
          businessColsRight: [],
          economyRowStart: 1,
          economyRowEnd: 5,
          economyColsLeft: ['A'],
          economyColsRight: ['C'],
          updatedAt: new Date(),
        }),
      );
    }
    const routeRepo = dataSource.getRepository(Route);
    let route = await routeRepo.findOneBy({
      originCode: 'THR',
      destCode: 'BND',
    });
    if (!route) {
      route = await routeRepo.save(
        routeRepo.create({
          originCode: 'THR',
          destCode: 'BND',
          durationMin: 80,
        }),
      );
    }
    const flightRepo = dataSource.getRepository(Flight);
    let flight = await flightRepo.findOneBy({ flightNo: 'P13E-1' });
    if (!flight) {
      flight = await flightRepo.save(
        flightRepo.create({
          flightNo: 'P13E-1',
          routeId: route.id,
          aircraftType: AIRCRAFT_TYPE,
        }),
      );
    }
    flightId = flight.id;
  });

  afterAll(async () => {
    if (createdBookingIds.length > 0) {
      await dataSource
        .getRepository(PaymentReconciliation)
        .delete({ bookingId: In(createdBookingIds) });
      await dataSource
        .getRepository(Passenger)
        .delete({ bookingId: In(createdBookingIds) });
      await dataSource
        .getRepository(LedgerEntry)
        .delete({ bookingId: In(createdBookingIds) });
      await dataSource
        .getRepository(Booking)
        .delete({ id: In(createdBookingIds) });
    }
    if (createdInstanceIds.length > 0) {
      await dataSource
        .getRepository(FlightInstance)
        .delete({ id: In(createdInstanceIds) });
    }
    await dataSource.getRepository(Flight).delete({ id: flightId });
    await dataSource
      .getRepository(AircraftSeatMap)
      .delete({ aircraftType: AIRCRAFT_TYPE });

    await app.close();
  });

  async function makeInstance(daysOffset: number) {
    const departureAt = new Date(Date.now() + daysOffset * 24 * 60 * 60 * 1000);
    const flightInstanceRepo = dataSource.getRepository(FlightInstance);
    const instance = await flightInstanceRepo.save(
      flightInstanceRepo.create({
        flightId,
        departureAt,
        arrivalAt: new Date(departureAt.getTime() + 80 * 60 * 1000),
        capacity: 10,
        status: FlightInstanceStatus.SCHEDULED,
      }),
    );
    createdInstanceIds.push(instance.id);
    return instance;
  }

  it('GET /flights/overview materializes a past-departure SCHEDULED instance to DEPARTED', async () => {
    const instance = await makeInstance(-2);
    const { accessToken } = await loginAs(app, 'senior');

    const res = await request(app.getHttpServer())
      .get('/flights/overview')
      .set(auth(accessToken!));
    expect(res.status).toBe(200);

    const refreshed = await dataSource
      .getRepository(FlightInstance)
      .createQueryBuilder('fi')
      .where('fi.id = :id', { id: instance.id })
      .getOneOrFail();
    expect(refreshed.status).toBe('DEPARTED');
  });

  it('a TICKETED booking on a departed flight defaults to FLOWN; staff can override to NO_SHOW; illegal transitions rejected', async () => {
    const instance = await makeInstance(-1);
    const ceo = await loginAs(app, 'ceo');

    const issued = await request(app.getHttpServer())
      .post('/reservation/pnr')
      .set(auth(ceo.accessToken!))
      .send({
        flightInstanceId: instance.id,
        seatCode: '1A',
        passengerName: 'مسافر آزمون عدم حضور',
      });
    expect(issued.status).toBe(201);
    createdBookingIds.push(
      (
        await dataSource
          .getRepository(Booking)
          .createQueryBuilder('b')
          .where('b.pnr = :pnr', { pnr: issued.body.data.pnr })
          .getOneOrFail()
      ).id,
    );
    const pnr = issued.body.data.pnr as string;

    // Reading detail lazily flips TICKETED -> FLOWN once the flight has departed.
    const detail = await request(app.getHttpServer())
      .get(`/reservation/pnr/${pnr}`)
      .set(auth(ceo.accessToken!));
    expect(detail.body.data.status).toBe('FLOWN');

    const noShow = await request(app.getHttpServer())
      .patch(`/reservation/pnr/${pnr}/no-show`)
      .set(auth(ceo.accessToken!));
    expect(noShow.status).toBe(200);
    expect(noShow.body.data.status).toBe('NO_SHOW');

    const again = await request(app.getHttpServer())
      .patch(`/reservation/pnr/${pnr}/no-show`)
      .set(auth(ceo.accessToken!));
    expect(again.status).toBe(409);
  });

  it('marking no-show on a not-yet-departed flight is rejected (FLIGHT_NOT_DEPARTED)', async () => {
    const instance = await makeInstance(30);
    const ceo = await loginAs(app, 'ceo');

    const issued = await request(app.getHttpServer())
      .post('/reservation/pnr')
      .set(auth(ceo.accessToken!))
      .send({
        flightInstanceId: instance.id,
        seatCode: '2A',
        passengerName: 'مسافر آینده',
      });
    expect(issued.status).toBe(201);
    createdBookingIds.push(
      (
        await dataSource
          .getRepository(Booking)
          .createQueryBuilder('b')
          .where('b.pnr = :pnr', { pnr: issued.body.data.pnr })
          .getOneOrFail()
      ).id,
    );

    const noShow = await request(app.getHttpServer())
      .patch(`/reservation/pnr/${issued.body.data.pnr}/no-show`)
      .set(auth(ceo.accessToken!));
    expect(noShow.status).toBe(409);
    expect(noShow.body.error.code).toBe('FLIGHT_NOT_DEPARTED');
  });

  it('a successful GATEWAY payment resolves its PaymentReconciliation row', async () => {
    const instance = await makeInstance(45);
    const phone = `0913${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;
    const { accessToken } = await loginAsCustomer(app, phone);

    const created = await request(app.getHttpServer())
      .post('/bookings')
      .set(auth(accessToken!))
      .send({
        flightInstanceId: instance.id,
        cabin: 'ECONOMY',
        passengers: [{ fullName: 'مسافر تطبیق موفق', seatCode: '3A' }],
      });
    expect(created.status).toBe(201);
    const bookingId = created.body.data.id as string;
    createdBookingIds.push(bookingId);

    const paid = await request(app.getHttpServer())
      .post(`/bookings/${bookingId}/pay`)
      .set(auth(accessToken!))
      .send({});
    expect(paid.status).toBe(201);
    expect(paid.body.data.booking.status).toBe('TICKETED');

    const reconciliation = await dataSource
      .getRepository(PaymentReconciliation)
      .findOneBy({ bookingId });
    expect(reconciliation).not.toBeNull();
    expect(reconciliation!.status).toBe('RESOLVED');
    // reconciliation is a direct Prisma read (native bigint); the JSON
    // response field is a decimal string (BigInt.prototype.toJSON).
    expect(reconciliation!.amountIrr).toBe(
      BigInt(String(paid.body.data.booking.priceIrr)),
    );
  });

  it('a GATEWAY payment whose ticketing transaction fails (bad promo) leaves a PENDING reconciliation row — the real mismatch queue', async () => {
    const instance = await makeInstance(46);
    const phone = `0914${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;
    const { accessToken } = await loginAsCustomer(app, phone);

    const created = await request(app.getHttpServer())
      .post('/bookings')
      .set(auth(accessToken!))
      .send({
        flightInstanceId: instance.id,
        cabin: 'ECONOMY',
        passengers: [{ fullName: 'مسافر مغایرت', seatCode: '4A' }],
      });
    expect(created.status).toBe(201);
    const bookingId = created.body.data.id as string;
    createdBookingIds.push(bookingId);

    // The gateway is asked for and confirms payment before this promo code
    // is validated inside the ticketing transaction — a real ordering bug
    // this phase fixes the tracking for, not something contrived for the test.
    const paid = await request(app.getHttpServer())
      .post(`/bookings/${bookingId}/pay`)
      .set(auth(accessToken!))
      .send({ promoCode: 'THIS-CODE-DOES-NOT-EXIST' });
    expect(paid.status).toBe(400);

    const stillHeld = await dataSource
      .getRepository(Booking)
      .createQueryBuilder('b')
      .where('b.id = :id', { id: bookingId })
      .getOneOrFail();
    expect(stillHeld.status).toBe('HELD');

    const reconciliation = await dataSource
      .getRepository(PaymentReconciliation)
      .findOneBy({ bookingId });
    expect(reconciliation).not.toBeNull();
    expect(reconciliation!.status).toBe('PENDING');

    const finance = await loginAs(app, 'finance');
    const queue = await request(app.getHttpServer())
      .get('/reconciliation')
      .set(auth(finance.accessToken!));
    expect(queue.status).toBe(200);
    const entry = queue.body.data.find(
      (r: { id: string }) => r.id === reconciliation!.id,
    );
    expect(entry).toBeDefined();
    expect(entry.bookingStatus).toBe('HELD');

    const senior = await loginAs(app, 'senior');
    const forbidden = await request(app.getHttpServer())
      .get('/reconciliation')
      .set(auth(senior.accessToken!));
    expect(forbidden.status).toBe(403);

    const resolved = await request(app.getHttpServer())
      .patch(`/reconciliation/${reconciliation!.id}/resolve`)
      .set(auth(finance.accessToken!))
      .send({ resolutionNote: 'بلیط به‌صورت دستی صادر و بررسی شد.' });
    expect(resolved.status).toBe(200);
    expect(resolved.body.data.status).toBe('RESOLVED');

    const resolvedAgain = await request(app.getHttpServer())
      .patch(`/reconciliation/${reconciliation!.id}/resolve`)
      .set(auth(finance.accessToken!))
      .send({ resolutionNote: 'دوباره' });
    expect(resolvedAgain.status).toBe(409);

    const queueAfter = await request(app.getHttpServer())
      .get('/reconciliation')
      .set(auth(finance.accessToken!));
    expect(
      queueAfter.body.data.some(
        (r: { id: string }) => r.id === reconciliation!.id,
      ),
    ).toBe(false);
  });
});
