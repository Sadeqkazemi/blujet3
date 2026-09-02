import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, In } from 'typeorm';
import { AircraftSeatMap } from '../src/database/entities/aircraft-seat-map.entity';
import { AuditLog } from '../src/database/entities/audit-log.entity';
import { Booking } from '../src/database/entities/booking.entity';
import { Flight } from '../src/database/entities/flight.entity';
import { FlightInstance } from '../src/database/entities/flight-instance.entity';
import { LedgerEntry } from '../src/database/entities/ledger-entry.entity';
import { Passenger } from '../src/database/entities/passenger.entity';
import { PaymentReconciliation } from '../src/database/entities/payment-reconciliation.entity';
import { SeatLock } from '../src/database/entities/seat-lock.entity';
import { loginAs } from './helpers/login.helper';
import { createTestApp } from './helpers/app.helper';

describe('Reservation (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  // Phase 13D: a global per-requester active-lock cap now means leftover
  // SeatLock rows from repeated manual runs against a persistent dev DB
  // can spuriously trip the cap in later runs — clean up what each test
  // creates instead of leaving it to accumulate.
  let createdInstanceIds: string[] = [];

  beforeEach(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    createdInstanceIds = [];
  });

  afterEach(async () => {
    if (createdInstanceIds.length) {
      await dataSource
        .getRepository(SeatLock)
        .delete({ flightInstanceId: In(createdInstanceIds) });
      const passengers = await dataSource
        .getRepository(Passenger)
        .createQueryBuilder('p')
        .innerJoin('p.booking', 'b')
        .where('b.flightInstanceId IN (:...ids)', { ids: createdInstanceIds })
        .getMany();
      const bookingIds = passengers.map((p) => p.bookingId);
      if (bookingIds.length) {
        await dataSource
          .getRepository(PaymentReconciliation)
          .delete({ bookingId: In(bookingIds) });
        await dataSource
          .getRepository(LedgerEntry)
          .delete({ bookingId: In(bookingIds) });
        await dataSource
          .getRepository(Passenger)
          .delete({ bookingId: In(bookingIds) });
        await dataSource.getRepository(Booking).delete({ id: In(bookingIds) });
      }
      await dataSource
        .getRepository(FlightInstance)
        .delete({ id: In(createdInstanceIds) });
    }
    await app.close();
  });

  function auth(token: string | null | undefined) {
    return { Authorization: `Bearer ${token}` };
  }

  async function createScheduledInstance() {
    const flight = await dataSource
      .getRepository(Flight)
      .createQueryBuilder('f')
      .getOneOrFail();
    const departureAt = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
    const instanceRepo = dataSource.getRepository(FlightInstance);
    const instance = await instanceRepo.save(
      instanceRepo.create({
        flightId: flight.id,
        departureAt,
        arrivalAt: new Date(departureAt.getTime() + 3 * 60 * 60 * 1000),
        capacity: 180,
        charterSeats: 60,
        status: 'SCHEDULED',
      }),
    );
    createdInstanceIds.push(instance.id);
    return instance;
  }

  // ── Seat map & locking ──────────────────────────────────────────────

  it('GET /reservation/seatmap/:id computes rows from AircraftSeatMap with correct capacity', async () => {
    const instance = await createScheduledInstance();
    const { accessToken } = await loginAs(app, 'chair');
    const res = await request(app.getHttpServer())
      .get(`/reservation/seatmap/${instance.id}`)
      .set(auth(accessToken));
    expect(res.status).toBe(200);
    expect(res.body.data.capacity).toBe(146); // 16 business + 130 economy per seed config
    expect(res.body.data.soldCount).toBe(0);
    expect(res.body.data.rows.length).toBe(30); // rows 3-6 + 7-32
  });

  it('GET /reservation/seatmap/:id returns cabinLayout.aisleAfterIndex reflecting the real per-aircraft column split, not a fixed assumption', async () => {
    const seeded = await createScheduledInstance();
    const seededRes = await request(app.getHttpServer())
      .get(`/reservation/seatmap/${seeded.id}`)
      .set(auth((await loginAs(app, 'chair')).accessToken));
    expect(seededRes.body.data.cabinLayout).toEqual({
      BUSINESS: { aisleAfterIndex: 2 }, // seed: businessColsLeft ['A','B']
      ECONOMY: { aisleAfterIndex: 2 }, // seed: economyColsLeft ['A','B']
    });

    // A distinct aircraft type with a reversed 3-2 economy split (instead
    // of the seed's 2-3) proves the endpoint reads the real config per
    // aircraft rather than always returning the same fixed number.
    const customType = `WIDE-${Date.now()}`;
    const seatMapRepo = dataSource.getRepository(AircraftSeatMap);
    await seatMapRepo.save(
      seatMapRepo.create({
        aircraftType: customType,
        businessRowStart: 1,
        businessRowEnd: 1,
        businessColsLeft: ['A'],
        businessColsRight: ['B', 'C'],
        economyRowStart: 2,
        economyRowEnd: 2,
        economyColsLeft: ['A', 'B', 'C'],
        economyColsRight: ['D', 'E'],
        updatedAt: new Date(),
      }),
    );
    const flight = await dataSource
      .getRepository(Flight)
      .createQueryBuilder('f')
      .getOneOrFail();
    const departureAt = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000);
    const instanceRepo = dataSource.getRepository(FlightInstance);
    const customInstance = await instanceRepo.save(
      instanceRepo.create({
        flightId: flight.id,
        departureAt,
        arrivalAt: new Date(departureAt.getTime() + 3 * 60 * 60 * 1000),
        capacity: 6,
        charterSeats: 0,
        status: 'SCHEDULED',
        aircraftTypeOverride: customType,
      }),
    );
    createdInstanceIds.push(customInstance.id);

    const customRes = await request(app.getHttpServer())
      .get(`/reservation/seatmap/${customInstance.id}`)
      .set(auth((await loginAs(app, 'chair')).accessToken));
    expect(customRes.body.data.cabinLayout).toEqual({
      BUSINESS: { aisleAfterIndex: 1 },
      ECONOMY: { aisleAfterIndex: 3 },
    });

    await seatMapRepo.delete({ aircraftType: customType });
  });

  it('GET /reservation/seatmap/:id includes sold-seat passenger details for staff', async () => {
    const instance = await createScheduledInstance();
    const chair = await loginAs(app, 'chair');
    const issued = await request(app.getHttpServer())
      .post('/reservation/pnr')
      .set(auth(chair.accessToken))
      .send({
        flightInstanceId: instance.id,
        seatCode: '3A',
        passengerName: 'لیلا صادقی',
        passengerNationalId: '0499370899',
      });
    expect(issued.status).toBe(201);

    const res = await request(app.getHttpServer())
      .get(`/reservation/seatmap/${instance.id}`)
      .set(auth((await loginAs(app, 'itadmin')).accessToken));
    expect(res.status).toBe(200);
    expect(res.body.data.flightNo).toBeTruthy();
    const sold = res.body.data.rows
      .flatMap(
        (r: {
          seats: { seatCode: string; passenger?: { fullName: string } }[];
        }) => r.seats,
      )
      .find((s: { seatCode: string }) => s.seatCode === '3A');
    expect(sold.passenger.fullName).toBe('لیلا صادقی');
    expect(sold.passenger.nationalId).toBe('0499370899');
  });

  it('POST lock: canLock roles only, 409 on already-locked, encrypted PII never returned, audited', async () => {
    const instance = await createScheduledInstance();
    const chair = await loginAs(app, 'chair');
    const finance = await loginAs(app, 'finance');
    const it = await loginAs(app, 'itadmin');

    const forbidden = await request(app.getHttpServer())
      .post(`/reservation/seatmap/${instance.id}/lock`)
      .set(auth(finance.accessToken))
      .send({
        seatCode: '3A',
        reason: 'بازدید هیئت مدیره',
        classification: 'PAYABLE',
        passengerName: 'تست',
        passengerNationalId: '0499370899',
      });
    expect(forbidden.status).toBe(403);

    const itForbidden = await request(app.getHttpServer())
      .post(`/reservation/seatmap/${instance.id}/lock`)
      .set(auth(it.accessToken))
      .send({
        seatCode: '3B',
        reason: 'تست IT',
        classification: 'PAYABLE',
      });
    expect(itForbidden.status).toBe(403);

    const ok = await request(app.getHttpServer())
      .post(`/reservation/seatmap/${instance.id}/lock`)
      .set(auth(chair.accessToken))
      .send({
        seatCode: '3A',
        reason: 'بازدید هیئت مدیره',
        classification: 'PAYABLE',
        passengerName: 'تست',
        passengerNationalId: '0499370899',
      });
    expect(ok.status).toBe(201);
    expect(ok.body.data.passengerNationalIdEnc).toBeUndefined();
    expect(ok.body.data.passengerNationalIdHash).toBeUndefined();

    const dup = await request(app.getHttpServer())
      .post(`/reservation/seatmap/${instance.id}/lock`)
      .set(auth(chair.accessToken))
      .send({
        seatCode: '3A',
        reason: 'تست تکراری',
        classification: 'PAYABLE',
      });
    expect(dup.status).toBe(409);

    const audit = await dataSource
      .getRepository(AuditLog)
      .createQueryBuilder('a')
      .where('a.category = :category', { category: 'RESERVATION' })
      .andWhere('a.entityType = :entityType', { entityType: 'SeatLock' })
      .andWhere('a.entityId = :entityId', { entityId: ok.body.data.id })
      .getOne();
    expect(audit).not.toBeNull();
  });

  it('concurrent lock attempts on the same seat: exactly one succeeds (DB-enforced)', async () => {
    const instance = await createScheduledInstance();
    const chair = await loginAs(app, 'chair');

    const attempts = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app.getHttpServer())
          .post(`/reservation/seatmap/${instance.id}/lock`)
          .set(auth(chair.accessToken))
          .send({
            seatCode: '5B',
            reason: 'تست هم‌زمانی',
            classification: 'PAYABLE',
          }),
      ),
    );
    const succeeded = attempts.filter((r) => r.status === 201);
    const conflicted = attempts.filter((r) => r.status === 409);
    expect(succeeded.length).toBe(1);
    expect(conflicted.length).toBe(4);
  });

  it('PATCH release: canLock only, 409 on already-released, seat becomes lockable again', async () => {
    const instance = await createScheduledInstance();
    const chair = await loginAs(app, 'chair');
    const finance = await loginAs(app, 'finance');

    const locked = await request(app.getHttpServer())
      .post(`/reservation/seatmap/${instance.id}/lock`)
      .set(auth(chair.accessToken))
      .send({
        seatCode: '6D',
        reason: 'تست آزادسازی',
        classification: 'PAYABLE',
      });
    const lockId = locked.body.data.id;

    const forbidden = await request(app.getHttpServer())
      .patch(`/reservation/seatmap/locks/${lockId}/release`)
      .set(auth(finance.accessToken));
    expect(forbidden.status).toBe(403);

    const released = await request(app.getHttpServer())
      .patch(`/reservation/seatmap/locks/${lockId}/release`)
      .set(auth(chair.accessToken));
    expect(released.status).toBe(200);
    expect(released.body.data.releasedAt).not.toBeNull();

    const again = await request(app.getHttpServer())
      .patch(`/reservation/seatmap/locks/${lockId}/release`)
      .set(auth(chair.accessToken));
    expect(again.status).toBe(409);

    const relock = await request(app.getHttpServer())
      .post(`/reservation/seatmap/${instance.id}/lock`)
      .set(auth(chair.accessToken))
      .send({ seatCode: '6D', reason: 'رزرو مجدد', classification: 'PAYABLE' });
    expect(relock.status).toBe(201);
  });

  // ── PNR management ──────────────────────────────────────────────────

  async function issuePnr(
    accessToken: string | null | undefined,
    instanceId: string,
    seatCode: string,
    name = 'مسافر تست',
  ) {
    return request(app.getHttpServer())
      .post('/reservation/pnr')
      .set(auth(accessToken))
      .send({ flightInstanceId: instanceId, seatCode, passengerName: name });
  }

  it('POST /reservation/pnr issues a TICKETED booking directly (no payment step), 409 on unavailable seat, audited', async () => {
    const instance = await createScheduledInstance();
    const chair = await loginAs(app, 'chair');
    const finance = await loginAs(app, 'finance');

    const forbidden = await issuePnr(finance.accessToken, instance.id, '7A');
    expect(forbidden.status).toBe(403);

    const issued = await issuePnr(
      chair.accessToken,
      instance.id,
      '7A',
      'نگار رضایی',
    );
    expect(issued.status).toBe(201);
    expect(issued.body.data.status).toBe('TICKETED');
    expect(issued.body.data.passenger.seatCode).toBe('7A');

    const booking = await dataSource
      .getRepository(Booking)
      .createQueryBuilder('b')
      .where('b.pnr = :pnr', { pnr: issued.body.data.pnr })
      .getOneOrFail();
    expect(booking.status).toBe('TICKETED');
    const ledger = await dataSource
      .getRepository(LedgerEntry)
      .findOneBy({ bookingId: booking.id, type: 'SALE' });
    expect(ledger).not.toBeNull();

    const conflict = await issuePnr(chair.accessToken, instance.id, '7A');
    expect(conflict.status).toBe(409);

    const audit = await dataSource
      .getRepository(AuditLog)
      .createQueryBuilder('a')
      .where('a.category = :category', { category: 'RESERVATION' })
      .andWhere('a.action = :action', { action: 'صدور دستی PNR' })
      .andWhere('a.entityId = :entityId', { entityId: booking.id })
      .getOne();
    expect(audit).not.toBeNull();
  });

  it('concurrent POST /reservation/pnr for the same seat: exactly one TICKETED booking is created', async () => {
    const instance = await createScheduledInstance();
    const chair = await loginAs(app, 'chair');

    const attempts = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        issuePnr(chair.accessToken, instance.id, '16A', `مسافر ${i}`),
      ),
    );
    const succeeded = attempts.filter((r) => r.status === 201);
    const conflicted = attempts.filter((r) => r.status === 409);
    expect(succeeded.length).toBe(1);
    expect(conflicted.length).toBe(4);

    const ticketedForSeat = await dataSource
      .getRepository(Passenger)
      .createQueryBuilder('p')
      .innerJoin('p.booking', 'b')
      .where('p.seatCode = :seatCode', { seatCode: '16A' })
      .andWhere('b.flightInstanceId = :instanceId', { instanceId: instance.id })
      .andWhere('b.status != :status', { status: 'CANCELLED' })
      .getCount();
    expect(ticketedForSeat).toBe(1);
  });

  it('GET /reservation/pnr lists grouped by flight and q= filters by PNR/passenger', async () => {
    const instance = await createScheduledInstance();
    const it = await loginAs(app, 'itadmin');
    const issued = await issuePnr(
      it.accessToken,
      instance.id,
      '8C',
      'جستجوپذیر یکتا',
    );

    const list = await request(app.getHttpServer())
      .get(`/reservation/pnr?q=${encodeURIComponent('جستجوپذیر یکتا')}`)
      .set(auth(it.accessToken));
    expect(list.status).toBe(200);
    const group = list.body.data.find(
      (g: { flightInstanceId: string }) => g.flightInstanceId === instance.id,
    );
    expect(group).toBeDefined();
    expect(
      group.rows.some((r: { pnr: string }) => r.pnr === issued.body.data.pnr),
    ).toBe(true);
  });

  it('GET /reservation/pnr/:pnr returns detail; unknown PNR -> 404', async () => {
    const instance = await createScheduledInstance();
    const it = await loginAs(app, 'itadmin');
    const issued = await issuePnr(it.accessToken, instance.id, '9E');

    const detail = await request(app.getHttpServer())
      .get(`/reservation/pnr/${issued.body.data.pnr}`)
      .set(auth(it.accessToken));
    expect(detail.status).toBe(200);
    expect(detail.body.data.passenger.seatCode).toBe('9E');

    const missing = await request(app.getHttpServer())
      .get('/reservation/pnr/BJNOTFOUND')
      .set(auth(it.accessToken));
    expect(missing.status).toBe(404);
  });

  it('PATCH /reservation/pnr/:pnr/seat changes seat; 409 on a taken seat and on a CANCELLED booking', async () => {
    const instance = await createScheduledInstance();
    const chair = await loginAs(app, 'chair');
    const finance = await loginAs(app, 'finance');
    const a = await issuePnr(chair.accessToken, instance.id, '10A', 'مسافر آ');
    const b = await issuePnr(chair.accessToken, instance.id, '10B', 'مسافر ب');

    const forbidden = await request(app.getHttpServer())
      .patch(`/reservation/pnr/${a.body.data.pnr}/seat`)
      .set(auth(finance.accessToken))
      .send({ seatCode: '11A' });
    expect(forbidden.status).toBe(403);

    const takenConflict = await request(app.getHttpServer())
      .patch(`/reservation/pnr/${a.body.data.pnr}/seat`)
      .set(auth(chair.accessToken))
      .send({ seatCode: '10B' });
    expect(takenConflict.status).toBe(409);

    const ok = await request(app.getHttpServer())
      .patch(`/reservation/pnr/${a.body.data.pnr}/seat`)
      .set(auth(chair.accessToken))
      .send({ seatCode: '11A' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.passenger.seatCode).toBe('11A');

    await request(app.getHttpServer())
      .patch(`/reservation/pnr/${b.body.data.pnr}/cancel`)
      .set(auth(chair.accessToken));
    const onCancelled = await request(app.getHttpServer())
      .patch(`/reservation/pnr/${b.body.data.pnr}/seat`)
      .set(auth(chair.accessToken))
      .send({ seatCode: '12A' });
    expect(onCancelled.status).toBe(409);
  });

  it('concurrent PATCH .../seat from two different PNRs targeting the same free seat: exactly one succeeds', async () => {
    const instance = await createScheduledInstance();
    const chair = await loginAs(app, 'chair');
    const a = await issuePnr(chair.accessToken, instance.id, '17A', 'مسافر آ');
    const b = await issuePnr(chair.accessToken, instance.id, '17B', 'مسافر ب');

    const [resA, resB] = await Promise.all([
      request(app.getHttpServer())
        .patch(`/reservation/pnr/${a.body.data.pnr}/seat`)
        .set(auth(chair.accessToken))
        .send({ seatCode: '18A' }),
      request(app.getHttpServer())
        .patch(`/reservation/pnr/${b.body.data.pnr}/seat`)
        .set(auth(chair.accessToken))
        .send({ seatCode: '18A' }),
    ]);
    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([200, 409]);

    const holdersOfSeat = await dataSource
      .getRepository(Passenger)
      .createQueryBuilder('p')
      .innerJoin('p.booking', 'b')
      .where('p.seatCode = :seatCode', { seatCode: '18A' })
      .andWhere('b.flightInstanceId = :instanceId', { instanceId: instance.id })
      .andWhere('b.status != :status', { status: 'CANCELLED' })
      .getCount();
    expect(holdersOfSeat).toBe(1);
  });

  it('PATCH /reservation/pnr/:pnr/cancel frees the seat for resale; 409 if already cancelled', async () => {
    const instance = await createScheduledInstance();
    const it = await loginAs(app, 'itadmin');
    const issued = await issuePnr(it.accessToken, instance.id, '13C');

    const cancelled = await request(app.getHttpServer())
      .patch(`/reservation/pnr/${issued.body.data.pnr}/cancel`)
      .set(auth(it.accessToken));
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.status).toBe('CANCELLED');

    const again = await request(app.getHttpServer())
      .patch(`/reservation/pnr/${issued.body.data.pnr}/cancel`)
      .set(auth(it.accessToken));
    expect(again.status).toBe(409);

    // Seat 13C is free again — re-issuable.
    const reissued = await issuePnr(it.accessToken, instance.id, '13C');
    expect(reissued.status).toBe(201);
  });

  // ── Search & dashboard ──────────────────────────────────────────────

  it('GET /reservation/search finds SCHEDULED instances on origin/dest/date with computed price + free seats', async () => {
    const instance = await createScheduledInstance();
    const { accessToken } = await loginAs(app, 'chair');
    const flight = await dataSource
      .getRepository(Flight)
      .createQueryBuilder('f')
      .innerJoinAndSelect('f.route', 'route')
      .where('f.id = :id', { id: instance.flightId })
      .getOneOrFail();

    const res = await request(app.getHttpServer())
      .get(
        `/reservation/search?origin=${flight.route.originCode}&dest=${flight.route.destCode}&date=${instance.departureAt.toISOString()}`,
      )
      .set(auth(accessToken));
    expect(res.status).toBe(200);
    expect(
      res.body.data.some(
        (r: { flightInstanceId: string }) => r.flightInstanceId === instance.id,
      ),
    ).toBe(true);
  });

  it('GET /reservation/dashboard-stats returns real counts, no fabricated fields', async () => {
    const { accessToken } = await loginAs(app, 'chair');
    const res = await request(app.getHttpServer())
      .get('/reservation/dashboard-stats')
      .set(auth(accessToken));
    expect(res.status).toBe(200);
    expect(typeof res.body.data.todayBookings).toBe('number');
    expect(typeof res.body.data.activePnrs).toBe('number');
    expect(typeof res.body.data.seatsSold).toBe('number');
    // Money fields are decimal STRINGs on the wire (BigInt.prototype.toJSON)
    // — a JS number can't safely hold IRR amounts above 2^53.
    expect(typeof res.body.data.revenueIrr).toBe('string');
    expect(/^-?\d+$/.test(String(res.body.data.revenueIrr))).toBe(true);
    expect(Array.isArray(res.body.data.channels)).toBe(true);
    expect(Array.isArray(res.body.data.services)).toBe(true);
    expect(typeof res.body.data.servicesStable).toBe('boolean');
  });

  it('GET /reservation/agency-api-access lists agencies that hold API keys', async () => {
    const { accessToken } = await loginAs(app, 'itadmin');
    const res = await request(app.getHttpServer())
      .get('/reservation/agency-api-access')
      .set(auth(accessToken));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('GET /reservation/flights returns SCHEDULED instances with occupancy', async () => {
    const { accessToken } = await loginAs(app, 'itadmin');
    const res = await request(app.getHttpServer())
      .get('/reservation/flights')
      .set(auth(accessToken));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    if (res.body.data.length > 0) {
      const row = res.body.data[0];
      expect(row).toHaveProperty('flightNo');
      expect(row).toHaveProperty('sold');
      expect(row).toHaveProperty('capacity');
      expect(row).toHaveProperty('basePriceIrr');
      expect(['SELLING', 'NEAR_FULL', 'FULL']).toContain(row.statusKey);
    }
  });

  // ── Role isolation ──────────────────────────────────────────────────

  it('FINANCE_MANAGER cannot view or lock seats while COMMERCIAL_MANAGER can', async () => {
    const instance = await createScheduledInstance();
    const finance = await loginAs(app, 'finance');
    const commercial = await loginAs(app, 'comm');

    const financeRead = await request(app.getHttpServer())
      .get(`/reservation/seatmap/${instance.id}`)
      .set(auth(finance.accessToken));
    expect(financeRead.status).toBe(403);

    const financeLock = await request(app.getHttpServer())
      .post(`/reservation/seatmap/${instance.id}/lock`)
      .set(auth(finance.accessToken))
      .send({
        seatCode: '16B',
        reason: 'نباید برای مدیر مالی مجاز باشد',
        classification: 'PAYABLE',
      });
    expect(financeLock.status).toBe(403);

    const commercialRead = await request(app.getHttpServer())
      .get(`/reservation/seatmap/${instance.id}`)
      .set(auth(commercial.accessToken));
    expect(commercialRead.status).toBe(200);

    const commercialLock = await request(app.getHttpServer())
      .post(`/reservation/seatmap/${instance.id}/lock`)
      .set(auth(commercial.accessToken))
      .send({
        seatCode: '16A',
        reason: 'کنترل موجودی بازرگانی',
        classification: 'PAYABLE',
      });
    expect(commercialLock.status).toBe(201);
  });

  it('SENIOR_MANAGER can lock seats and manage PNRs (same canLock as CEO)', async () => {
    const instance = await createScheduledInstance();
    const it = await loginAs(app, 'itadmin');
    const issued = await issuePnr(it.accessToken, instance.id, '14D');
    const senior = await loginAs(app, 'senior');

    const readSeatmap = await request(app.getHttpServer())
      .get(`/reservation/seatmap/${instance.id}`)
      .set(auth(senior.accessToken));
    expect(readSeatmap.status).toBe(200);

    const readPnr = await request(app.getHttpServer())
      .get('/reservation/pnr')
      .set(auth(senior.accessToken));
    expect(readPnr.status).toBe(200);

    const lock = await request(app.getHttpServer())
      .post(`/reservation/seatmap/${instance.id}/lock`)
      .set(auth(senior.accessToken))
      .send({
        seatCode: '16B',
        reason: 'قفل مدیریتی مدیر ارشد',
        classification: 'PAYABLE',
      });
    expect(lock.status).toBe(201);

    const writeCancel = await request(app.getHttpServer())
      .patch(`/reservation/pnr/${issued.body.data.pnr}/cancel`)
      .set(auth(senior.accessToken));
    expect(writeCancel.status).toBe(200);

    const writeIssue = await issuePnr(senior.accessToken, instance.id, '15A');
    expect(writeIssue.status).toBe(201);
  });
});
