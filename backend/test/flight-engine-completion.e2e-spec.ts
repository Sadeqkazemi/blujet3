import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import request from 'supertest';
import { DataSource, In } from 'typeorm';
import { AncillaryService } from '../src/database/entities/ancillary-service.entity';
import { AuditLog } from '../src/database/entities/audit-log.entity';
import { Booking } from '../src/database/entities/booking.entity';
import { ClubPointsEntry } from '../src/database/entities/club-points-entry.entity';
import { FareRule } from '../src/database/entities/fare-rule.entity';
import { Flight } from '../src/database/entities/flight.entity';
import { FlightInstance } from '../src/database/entities/flight-instance.entity';
import { LedgerEntry } from '../src/database/entities/ledger-entry.entity';
import { Passenger } from '../src/database/entities/passenger.entity';
import { PaymentReconciliation } from '../src/database/entities/payment-reconciliation.entity';
import { Route } from '../src/database/entities/route.entity';
import { Schedule } from '../src/database/entities/schedule.entity';
import { WalletEntry } from '../src/database/entities/wallet-entry.entity';
import { CabinClass, FlightInstanceStatus } from '../src/database/enums';
import { createTestApp } from './helpers/app.helper';
import { loginAs, loginAsCustomer } from './helpers/login.helper';
import { RedisService } from '../src/redis/redis.service';

/** Covers the flight-engine completion work: recurring schedules (RRULE),
 * 1-stop connection search, Y/B/M fare classes, the PAID step in the
 * booking state machine, and soft delete via the GDPR flow. */
describe('Flight engine completion', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    // Clean up everything this spec created — other suites (reservation,
    // finance-reports) pick instances by ordering and break on leftovers.
    const flights = await dataSource.getRepository(Flight).findBy({
      flightNo: In([
        'BJ-77',
        'BJ-78',
        'BJ-81',
        'BJ-82',
        'BJ-83',
        'BJ-84',
        'BJ-85',
        'BJ-86',
      ]),
    });
    const fids = flights.map((f) => f.id);
    const instances =
      fids.length > 0
        ? await dataSource
            .getRepository(FlightInstance)
            .createQueryBuilder('fi')
            .where('fi.flightId IN (:...fids)', { fids })
            .getMany()
        : [];
    const iids = instances.map((i) => i.id);
    const bookings =
      iids.length > 0
        ? await dataSource
            .getRepository(Booking)
            .createQueryBuilder('b')
            .where('b.flightInstanceId IN (:...iids)', { iids })
            .getMany()
        : [];
    const bids = bookings.map((b) => b.id);
    await dataSource
      .getRepository(PaymentReconciliation)
      .delete({ bookingId: In(bids) });
    await dataSource.getRepository(LedgerEntry).delete({ bookingId: In(bids) });
    await dataSource
      .getRepository(ClubPointsEntry)
      .delete({ bookingId: In(bids) });
    await dataSource.getRepository(WalletEntry).delete({ bookingId: In(bids) });
    await dataSource.getRepository(Passenger).delete({ bookingId: In(bids) });
    await dataSource.getRepository(Booking).delete({ id: In(bids) });
    await dataSource
      .getRepository(FareRule)
      .delete({ flightInstanceId: In(iids) });
    await dataSource.getRepository(FlightInstance).delete({ id: In(iids) });
    await dataSource.getRepository(Schedule).delete({ flightId: In(fids) });
    await dataSource.getRepository(Flight).delete({ id: In(fids) });

    await app.close();
  });

  async function makeInstance(opts: {
    originCode: string;
    destCode: string;
    flightNo: string;
    departureAt: Date;
    durationMin?: number;
  }) {
    const routeRepo = dataSource.getRepository(Route);
    let route = await routeRepo.findOneBy({
      originCode: opts.originCode,
      destCode: opts.destCode,
    });
    if (!route) {
      route = await routeRepo.save(
        routeRepo.create({
          originCode: opts.originCode,
          destCode: opts.destCode,
          durationMin: opts.durationMin ?? 90,
        }),
      );
    }
    const flightRepo = dataSource.getRepository(Flight);
    let flight = await flightRepo.findOneBy({ flightNo: opts.flightNo });
    if (!flight) {
      flight = await flightRepo.save(
        flightRepo.create({
          flightNo: opts.flightNo,
          routeId: route.id,
          aircraftType: 'Airbus A320',
        }),
      );
    }
    const flightInstanceRepo = dataSource.getRepository(FlightInstance);
    return flightInstanceRepo.save(
      flightInstanceRepo.create({
        flightId: flight.id,
        departureAt: opts.departureAt,
        arrivalAt: new Date(
          opts.departureAt.getTime() + (opts.durationMin ?? 90) * 60_000,
        ),
        capacity: 146,
        status: FlightInstanceStatus.SCHEDULED,
      }),
    );
  }

  it('creates a recurring schedule from an RRULE and materializes future instances idempotently', async () => {
    const { accessToken } = await loginAs(app, 'senior');
    const res = await request(app.getHttpServer())
      .post('/flights/schedules')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        originCode: 'THR',
        destCode: 'TBZ',
        flightNo: 'BJ-77',
        rrule: 'FREQ=DAILY',
        depTime: '06:00',
        capacity: 146,
        daysAhead: 7,
      })
      .expect(201);
    expect(res.body.data.materialized).toBeGreaterThanOrEqual(6);
    const scheduleId = res.body.data.scheduleId;

    const count1 = await dataSource
      .getRepository(FlightInstance)
      .count({ where: { scheduleId } });
    expect(count1).toBe(res.body.data.materialized);

    // re-materializing must not duplicate (unique scheduleId+departureAt)
    const list = await request(app.getHttpServer())
      .get('/flights/schedules')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const mine = list.body.data.find(
      (s: { id: string }) => s.id === scheduleId,
    );
    expect(mine.flightNo).toBe('BJ-77');
    expect(mine.instanceCount).toBe(count1);
  });

  it('rejects an invalid RRULE with 400', async () => {
    const { accessToken } = await loginAs(app, 'senior');
    await request(app.getHttpServer())
      .post('/flights/schedules')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        originCode: 'THR',
        destCode: 'TBZ',
        flightNo: 'BJ-78',
        rrule: 'not-a-rule;;;',
        depTime: '06:00',
        capacity: 100,
      })
      .expect(400);
  });

  it('finds a 1-stop connection when no direct flight exists, respecting min connection time', async () => {
    const day = new Date(Date.now() + 40 * 24 * 60 * 60 * 1000);
    day.setUTCHours(0, 0, 0, 0);
    const dep1 = new Date(day.getTime() + 6 * 3_600_000);
    // leg2 departs 2h after leg1 arrives (>60min default min-connect)
    const leg1 = await makeInstance({
      originCode: 'RAS',
      destCode: 'SRY',
      flightNo: 'BJ-81',
      departureAt: dep1,
    });
    const dep2 = new Date(leg1.arrivalAt.getTime() + 2 * 3_600_000);
    await makeInstance({
      originCode: 'SRY',
      destCode: 'ADU',
      flightNo: 'BJ-82',
      departureAt: dep2,
    });
    // an infeasible second leg 10 minutes after arrival must NOT be used
    await makeInstance({
      originCode: 'SRY',
      destCode: 'ADU',
      flightNo: 'BJ-83',
      departureAt: new Date(leg1.arrivalAt.getTime() + 10 * 60_000),
    });

    // See the fare-class test below for why this bust is needed: the
    // search cache key is route+date only, so a re-run within the TTL
    // window for the same "N days from now" date would otherwise serve a
    // stale list from a previous run's (now-deleted) instances.
    await app
      .get(RedisService)
      .del(`search:flights:RAS:ADU:${day.toISOString().slice(0, 10)}`);

    const res = await request(app.getHttpServer())
      .get(
        `/search/flights?origin=RAS&dest=ADU&date=${day.toISOString().slice(0, 10)}`,
      )
      .expect(200);
    const conn = res.body.data.find(
      (r: { connection?: unknown }) => r.connection,
    );
    expect(conn).toBeDefined();
    expect(conn.connection.via).toBe('SRY');
    expect(conn.connection.legs).toHaveLength(2);
    expect(conn.connection.legs[1].flightNo).toBe('BJ-82');
    expect(conn.flightNo).toBe('BJ-81+BJ-82');
  });

  it('Y/B/M fare classes: price climbs to the next class when a bucket sells out, and the booking is stamped', async () => {
    const dep = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000);
    const instance = await makeInstance({
      originCode: 'KER',
      destCode: 'AZD',
      flightNo: 'BJ-84',
      departureAt: dep,
    });
    const fareRuleRepo = dataSource.getRepository(FareRule);
    for (const r of [
      {
        flightInstanceId: instance.id,
        cabin: CabinClass.ECONOMY,
        classCode: 'Y',
        priceIrr: 30_000_000n,
        seatsAllocated: 1,
        siteSeatsReleased: 1,
        taxIrr: 0n,
      },
      {
        flightInstanceId: instance.id,
        cabin: CabinClass.ECONOMY,
        classCode: 'B',
        priceIrr: 40_000_000n,
        seatsAllocated: 2,
        siteSeatsReleased: 2,
        taxIrr: 0n,
      },
    ]) {
      await fareRuleRepo.save(fareRuleRepo.create(r));
    }

    // Search results are cached by route+date (SEARCH_TTL_SECONDS = 5min),
    // not by instance id — re-running this suite within that window for the
    // same "N days from now" date would otherwise serve a stale cached list
    // pointing at a previous run's (now-deleted) instance. Bust it so this
    // test always sees the instance it just created.
    await app
      .get(RedisService)
      .del(`search:flights:KER:AZD:${dep.toISOString().slice(0, 10)}`);

    const search1 = await request(app.getHttpServer())
      .get(
        `/search/flights?origin=KER&dest=AZD&date=${dep.toISOString().slice(0, 10)}`,
      )
      .expect(200);
    const mine1 = search1.body.data.find(
      (r: { flightInstanceId: string }) => r.flightInstanceId === instance.id,
    );
    const eco1 = mine1.cabins.find(
      (c: { cabin: string }) => c.cabin === 'ECONOMY',
    );
    // Money fields are decimal STRINGs on the wire (BigInt.prototype.toJSON).
    expect(eco1.priceIrr).toBe('30000000'); // Y still open

    const customer = await loginAsCustomer(app, '09901112233');
    const booking = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        flightInstanceId: instance.id,
        cabin: 'ECONOMY',
        passengers: [{ fullName: 'مسافر کلاس نرخی', seatCode: '11A' }],
      })
      .expect(201);
    const seatPriceIrr = (
      await dataSource
        .getRepository(AncillaryService)
        .findOneByOrFail({ key: 'seat-window-aisle' })
    ).priceIrr;
    expect(booking.body.data.priceIrr).toBe(
      (30_000_000n + seatPriceIrr).toString(),
    );

    const row = await dataSource
      .getRepository(Booking)
      .createQueryBuilder('b')
      .where('b.id = :id', { id: booking.body.data.id })
      .getOneOrFail();
    expect(row.fareClassCode).toBe('Y');

    // Y bucket (1 seat) is now consumed → price moves to B
    const search2 = await request(app.getHttpServer())
      .get(
        `/search/flights?origin=KER&dest=AZD&date=${dep.toISOString().slice(0, 10)}`,
      )
      .expect(200);
    const mine2 = search2.body.data.find(
      (r: { flightInstanceId: string }) => r.flightInstanceId === instance.id,
    );
    const eco2 = mine2.cabins.find(
      (c: { cabin: string }) => c.cabin === 'ECONOMY',
    );
    expect(eco2.priceIrr).toBe('40000000');
  });

  it('pay walks HELD→PAID→TICKETED and lands TICKETED with a gateway ref in the audit trail', async () => {
    const dep = new Date(Date.now() + 50 * 24 * 60 * 60 * 1000);
    const instance = await makeInstance({
      originCode: 'BUZ',
      destCode: 'PGU',
      flightNo: 'BJ-85',
      departureAt: dep,
    });

    const customer = await loginAsCustomer(app, '09901112244');
    const booking = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        flightInstanceId: instance.id,
        cabin: 'ECONOMY',
        passengers: [{ fullName: 'مسافر درگاه', seatCode: '11A' }],
      })
      .expect(201);

    const paid = await request(app.getHttpServer())
      .post(`/bookings/${booking.body.data.id}/pay`)
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({})
      .expect(201);
    expect(paid.body.data.priceChanged).toBe(false);
    expect(paid.body.data.booking.status).toBe('TICKETED');

    const audit = await dataSource
      .getRepository(AuditLog)
      .createQueryBuilder('a')
      .where('a.entityId = :entityId', { entityId: booking.body.data.id })
      .andWhere('a.action = :action', { action: 'پرداخت و صدور بلیط' })
      .orderBy('a.createdAt', 'DESC')
      .getOne();
    const metadata = audit?.metadata as { gatewayRefId?: string };
    expect(metadata.gatewayRefId).toMatch(/^SBXREF-/);
  });

  it('GDPR deletion soft-deletes passengers (deletedAt stamped, booking rows survive)', async () => {
    const dep = new Date(Date.now() + 55 * 24 * 60 * 60 * 1000);
    const instance = await makeInstance({
      originCode: 'GBT',
      destCode: 'OMH',
      flightNo: 'BJ-86',
      departureAt: dep,
    });

    const customer = await loginAsCustomer(app, '09901112255');
    const booking = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        flightInstanceId: instance.id,
        cabin: 'ECONOMY',
        passengers: [
          {
            fullName: 'مسافر حذف‌شونده',
            nationalId: '0499370899',
            seatCode: '12A',
          },
        ],
      })
      .expect(201);

    await request(app.getHttpServer())
      .delete('/my/privacy/account')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .expect(200);

    const passengers = await dataSource
      .getRepository(Passenger)
      .findBy({ bookingId: booking.body.data.id });
    expect(passengers).toHaveLength(1);
    expect(passengers[0].deletedAt).not.toBeNull();
    expect(passengers[0].fullName).toBe('کاربر حذف‌شده');
    expect(passengers[0].nationalIdEnc).toBeNull();

    // financial record survives (soft delete, never hard delete)
    const bookingRow = await dataSource
      .getRepository(Booking)
      .createQueryBuilder('b')
      .where('b.id = :id', { id: booking.body.data.id })
      .getOne();
    expect(bookingRow).not.toBeNull();
  });
});
