import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import request from 'supertest';
import { DataSource, In } from 'typeorm';
import { AircraftSeatMap } from '../src/database/entities/aircraft-seat-map.entity';
import { AuditLog } from '../src/database/entities/audit-log.entity';
import { Booking } from '../src/database/entities/booking.entity';
import { ClubPointsEntry } from '../src/database/entities/club-points-entry.entity';
import { Flight } from '../src/database/entities/flight.entity';
import { FlightInstance } from '../src/database/entities/flight-instance.entity';
import { LedgerEntry } from '../src/database/entities/ledger-entry.entity';
import { Passenger } from '../src/database/entities/passenger.entity';
import { PaymentReconciliation } from '../src/database/entities/payment-reconciliation.entity';
import { PayIdempotencyRecord } from '../src/database/entities/pay-idempotency-record.entity';
import { Route } from '../src/database/entities/route.entity';
import { WalletEntry } from '../src/database/entities/wallet-entry.entity';
import { FlightInstanceStatus } from '../src/database/enums';
import { createTestApp } from './helpers/app.helper';
import { loginAs, loginAsCustomer, stepUpFor } from './helpers/login.helper';

/** Phase 13 — reservation engine completion Part A: sale window, real
 * inventory pools (agency/charter/public), and aircraft-type change. */
describe('Phase 13 — reservation engine completion', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  const AIRCRAFT_SMALL = 'P13-SmallJet'; // 4 economy seats, no business
  const AIRCRAFT_LARGE = 'P13-LargeJet'; // 8 economy seats, no business
  let routeId: string;
  let flightId: string;
  // One shared customer login for the whole file — the OTP endpoint is
  // strictly rate-limited (5/60s) and a booking's channel/pool doesn't
  // depend on which customer places it, so there's no reason to burn a
  // fresh OTP login per test.
  let customerToken: string;
  let customerUserId: string;
  let staffToken: string;
  const createdWalletEntryIds: string[] = [];

  async function upsertSeatMap(
    aircraftType: string,
    fields: Partial<AircraftSeatMap>,
  ) {
    const repo = dataSource.getRepository(AircraftSeatMap);
    const existing = await repo.findOneBy({ aircraftType });
    if (!existing) {
      await repo.save(
        repo.create({ aircraftType, ...fields, updatedAt: new Date() }),
      );
    }
  }

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    const customer = await loginAsCustomer(app, '09901119901');
    customerToken = customer.accessToken!;
    customerUserId = customer.userId!;
    staffToken = (await loginAs(app, 'senior')).accessToken!;

    await upsertSeatMap(AIRCRAFT_SMALL, {
      businessRowStart: 1,
      businessRowEnd: 0,
      businessColsLeft: [],
      businessColsRight: [],
      economyRowStart: 1,
      economyRowEnd: 2,
      economyColsLeft: ['A'],
      economyColsRight: ['C'],
    });
    await upsertSeatMap(AIRCRAFT_LARGE, {
      businessRowStart: 1,
      businessRowEnd: 0,
      businessColsLeft: [],
      businessColsRight: [],
      economyRowStart: 1,
      economyRowEnd: 4,
      economyColsLeft: ['A'],
      economyColsRight: ['C'],
    });

    const routeRepo = dataSource.getRepository(Route);
    let route = await routeRepo.findOneBy({
      originCode: 'THR',
      destCode: 'ASR',
    });
    if (!route) {
      route = await routeRepo.save(
        routeRepo.create({
          originCode: 'THR',
          destCode: 'ASR',
          durationMin: 70,
        }),
      );
    }
    routeId = route.id;

    const flightRepo = dataSource.getRepository(Flight);
    let flight = await flightRepo.findOneBy({ flightNo: 'P13-1' });
    if (!flight) {
      flight = await flightRepo.save(
        flightRepo.create({
          flightNo: 'P13-1',
          routeId,
          aircraftType: AIRCRAFT_SMALL,
        }),
      );
    }
    flightId = flight.id;
  });

  afterAll(async () => {
    if (createdWalletEntryIds.length > 0) {
      await dataSource
        .getRepository(WalletEntry)
        .delete({ id: In(createdWalletEntryIds) });
    }
    const instances = await dataSource
      .getRepository(FlightInstance)
      .createQueryBuilder('fi')
      .where('fi.flightId = :flightId', { flightId })
      .getMany();
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
    // Paying a booking creates LedgerEntry/ClubPointsEntry/WalletEntry rows
    // — must be cleaned up too, or their revenue lingers in reporting's
    // aggregates (which sum LedgerEntry directly) even after the Booking
    // row itself is gone.
    if (bids.length > 0) {
      await dataSource
        .getRepository(PayIdempotencyRecord)
        .delete({ bookingId: In(bids) });
      await dataSource
        .getRepository(PaymentReconciliation)
        .delete({ bookingId: In(bids) });
      await dataSource
        .getRepository(LedgerEntry)
        .delete({ bookingId: In(bids) });
      await dataSource
        .getRepository(ClubPointsEntry)
        .delete({ bookingId: In(bids) });
      await dataSource
        .getRepository(WalletEntry)
        .delete({ bookingId: In(bids) });
      await dataSource.getRepository(Passenger).delete({ bookingId: In(bids) });
      await dataSource.getRepository(Booking).delete({ id: In(bids) });
    }
    if (iids.length > 0) {
      await dataSource.getRepository(FlightInstance).delete({ id: In(iids) });
    }
    await dataSource.getRepository(Flight).delete({ id: flightId });
    await dataSource.getRepository(Route).delete({ id: routeId });
    await dataSource
      .getRepository(AircraftSeatMap)
      .delete({ aircraftType: In([AIRCRAFT_SMALL, AIRCRAFT_LARGE]) });

    await app.close();
  });

  function freshInstance(overrides: {
    capacity?: number;
    charterSeats?: number;
    agencySeatsAllocated?: number;
    saleStartsAt?: Date | null;
    saleEndsAt?: Date | null;
    daysAhead?: number;
  }) {
    const departureAt = new Date(
      Date.now() + (overrides.daysAhead ?? 60) * 24 * 60 * 60 * 1000,
    );
    const flightInstanceRepo = dataSource.getRepository(FlightInstance);
    return flightInstanceRepo.save(
      flightInstanceRepo.create({
        flightId,
        departureAt,
        arrivalAt: new Date(departureAt.getTime() + 70 * 60 * 1000),
        capacity: overrides.capacity ?? 4,
        charterSeats: overrides.charterSeats ?? 0,
        agencySeatsAllocated: overrides.agencySeatsAllocated ?? 0,
        saleStartsAt: overrides.saleStartsAt ?? null,
        saleEndsAt: overrides.saleEndsAt ?? null,
        status: FlightInstanceStatus.SCHEDULED,
      }),
    );
  }

  it('excludes an instance whose sale window has ended from search, and rejects booking it', async () => {
    const instance = await freshInstance({
      saleEndsAt: new Date(Date.now() - 60 * 60 * 1000), // ended an hour ago
    });
    const date = instance.departureAt.toISOString().slice(0, 10);

    const search = await request(app.getHttpServer())
      .get('/search/flights')
      .query({ origin: 'THR', dest: 'ASR', date });
    expect(
      search.body.data.some(
        (r: { flightInstanceId: string }) => r.flightInstanceId === instance.id,
      ),
    ).toBe(false);

    const res = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        flightInstanceId: instance.id,
        cabin: 'ECONOMY',
        passengers: [{ fullName: 'مسافر تست پنجره فروش', seatCode: '1A' }],
      });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SALE_WINDOW_CLOSED');
  });

  it('allows booking an instance whose sale window has not started yet, once inside it', async () => {
    const instance = await freshInstance({
      saleStartsAt: new Date(Date.now() - 60 * 60 * 1000),
      saleEndsAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    const res = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        flightInstanceId: instance.id,
        cabin: 'ECONOMY',
        passengers: [{ fullName: 'مسافر داخل بازه', seatCode: '1A' }],
      });
    expect(res.status).toBe(201);
  });

  it('wallet payment atomically debits the wallet, tickets the booking, records the finance sale, and replays idempotently', async () => {
    const instance = await freshInstance({ capacity: 4, daysAhead: 61 });
    const walletRepo = dataSource.getRepository(WalletEntry);
    const credit = await walletRepo.save(
      walletRepo.create({
        userId: customerUserId,
        type: 'TOPUP',
        signedAmountIrr: 1_000_000_000n,
        bookingId: null,
      }),
    );
    createdWalletEntryIds.push(credit.id);

    const created = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        flightInstanceId: instance.id,
        cabin: 'ECONOMY',
        passengers: [{ fullName: 'مسافر کیف پول', seatCode: '2A' }],
      })
      .expect(201);
    const bookingId = created.body.data.id as string;
    const chargedIrr = BigInt(String(created.body.data.priceIrr));

    const paid = await request(app.getHttpServer())
      .post(`/bookings/${bookingId}/pay`)
      .set('Authorization', `Bearer ${customerToken}`)
      .set('idempotency-key', `wallet-${bookingId}`)
      .send({ paymentMethod: 'WALLET' })
      .expect(201);
    expect(paid.body.data.booking.status).toBe('TICKETED');
    expect(paid.body.data.walletBalanceIrr).toBe(
      String(1_000_000_000n - chargedIrr),
    );

    const wallet = await request(app.getHttpServer())
      .get('/my/wallet')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(wallet.body.data.balanceIrr).toBe(
      String(1_000_000_000n - chargedIrr),
    );
    expect(wallet.body.data.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'PURCHASE',
          bookingId,
          signedAmountIrr: String(-chargedIrr),
        }),
      ]),
    );

    const walletPurchases = await walletRepo.findBy({
      bookingId,
      type: 'PURCHASE',
    });
    expect(walletPurchases).toHaveLength(1);
    const sales = await dataSource.getRepository(LedgerEntry).findBy({
      bookingId,
      type: 'SALE',
    });
    expect(sales).toHaveLength(1);
    expect(sales[0].signedAmountIrr).toBe(chargedIrr);
    const paymentAudit = await dataSource.getRepository(AuditLog).findOneBy({
      entityType: 'Booking',
      entityId: bookingId,
      action: 'پرداخت و صدور بلیط',
    });
    expect(paymentAudit?.metadata).toEqual(
      expect.objectContaining({
        paymentMethod: 'WALLET',
        walletEntryId: walletPurchases[0].id,
        ledgerEntryId: sales[0].id,
      }),
    );

    const finance = await loginAs(app, 'finance');
    const financeRows = await request(app.getHttpServer())
      .get('/reporting/recent-transactions')
      .set('Authorization', `Bearer ${finance.accessToken}`)
      .expect(200);
    expect(financeRows.body.data.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: sales[0].id,
          type: 'SALE',
          signedAmountIrr: String(chargedIrr),
        }),
      ]),
    );

    const replay = await request(app.getHttpServer())
      .post(`/bookings/${bookingId}/pay`)
      .set('Authorization', `Bearer ${customerToken}`)
      .set('idempotency-key', `wallet-${bookingId}`)
      .send({ paymentMethod: 'WALLET' })
      .expect(201);
    expect(replay.body.data.booking.status).toBe('TICKETED');
    expect(await walletRepo.countBy({ bookingId, type: 'PURCHASE' })).toBe(1);
  }, 15000);

  it('serializes concurrent wallet purchases so the same balance cannot be spent twice', async () => {
    const instance = await freshInstance({ capacity: 4, daysAhead: 62 });
    const create = (seatCode: string) =>
      request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          flightInstanceId: instance.id,
          cabin: 'ECONOMY',
          passengers: [{ fullName: 'مسافر همزمان', seatCode }],
        });
    const [first, second] = await Promise.all([create('1A'), create('1C')]);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    const bookingIds = [first.body.data.id, second.body.data.id] as string[];
    const oneTicketPriceIrr = BigInt(String(first.body.data.priceIrr));
    expect(second.body.data.priceIrr).toBe(String(oneTicketPriceIrr));

    const walletRepo = dataSource.getRepository(WalletEntry);
    const balanceRow = await walletRepo
      .createQueryBuilder('w')
      .select('COALESCE(SUM(w.signedAmountIrr), 0)', 'balance')
      .where('w.userId = :userId', { userId: customerUserId })
      .getRawOne<{ balance: string }>();
    const currentBalance = BigInt(balanceRow?.balance ?? '0');
    if (currentBalance !== 0n) {
      const adjustment = await walletRepo.save(
        walletRepo.create({
          userId: customerUserId,
          type: 'ADJUST',
          signedAmountIrr: -currentBalance,
          bookingId: null,
        }),
      );
      createdWalletEntryIds.push(adjustment.id);
    }
    const credit = await walletRepo.save(
      walletRepo.create({
        userId: customerUserId,
        type: 'TOPUP',
        signedAmountIrr: oneTicketPriceIrr,
        bookingId: null,
      }),
    );
    createdWalletEntryIds.push(credit.id);

    const pay = (bookingId: string) =>
      request(app.getHttpServer())
        .post(`/bookings/${bookingId}/pay`)
        .set('Authorization', `Bearer ${customerToken}`)
        .set('idempotency-key', `concurrent-${bookingId}`)
        .send({ paymentMethod: 'WALLET' });
    const results = await Promise.all(bookingIds.map(pay));
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);

    expect(
      await walletRepo.count({
        where: { bookingId: In(bookingIds), type: 'PURCHASE' },
      }),
    ).toBe(1);
    expect(
      await dataSource.getRepository(LedgerEntry).count({
        where: { bookingId: In(bookingIds), type: 'SALE' },
      }),
    ).toBe(1);
    const refreshed = await dataSource
      .getRepository(Booking)
      .findBy({ id: In(bookingIds) });
    expect(
      refreshed.filter((booking) => booking.status === 'TICKETED'),
    ).toHaveLength(1);
    expect(
      refreshed.filter((booking) => booking.status === 'HELD'),
    ).toHaveLength(1);
  }, 15000);

  it('rejects a public booking once the public pool (capacity minus agency/charter quotas) is exhausted, even with physical seats free', async () => {
    // capacity 4, agency 2, charter 1 → public pool = 1
    const instance = await freshInstance({
      capacity: 4,
      charterSeats: 1,
      agencySeatsAllocated: 2,
    });

    const firstBooking = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        flightInstanceId: instance.id,
        cabin: 'ECONOMY',
        passengers: [{ fullName: 'مسافر اول', seatCode: '1A' }],
      });
    expect(firstBooking.status).toBe(201);

    // Second SYSTEM-channel booking must be rejected: public pool (1) is
    // now full, even though 3 physical seats remain unsold overall.
    const secondBooking = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        flightInstanceId: instance.id,
        cabin: 'ECONOMY',
        passengers: [{ fullName: 'مسافر دوم', seatCode: '1C' }],
      });
    expect(secondBooking.status).toBe(409);
    expect(secondBooking.body.error.code).toBe('POOL_EXHAUSTED');
  });

  it('rejects an aircraft-type change that would drop capacity below confirmed bookings, and accepts one that fits', async () => {
    const instance = await freshInstance({ capacity: 4 });
    // Two full booking+pay flows plus two step-up request/verify round
    // trips (each hashing a code with argon2) push this past Jest's
    // default 5s test timeout.

    const booking = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        flightInstanceId: instance.id,
        cabin: 'ECONOMY',
        passengers: [{ fullName: 'مسافر قطعی', seatCode: '1A' }],
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/bookings/${booking.body.data.id}/pay`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({})
      .expect(201);

    // A larger-capacity type always fits the 1 confirmed passenger.
    const stepUp1 = await stepUpFor(
      app,
      staffToken,
      'senior',
      'PRICE_CAPACITY_CHANGE',
    );
    const okChange = await request(app.getHttpServer())
      .patch(`/flights/${instance.id}/aircraft`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ aircraftType: AIRCRAFT_LARGE, ...stepUp1 });
    expect(okChange.status).toBe(200);
    expect(okChange.body.data.capacity).toBe(8);

    // GET /flights/:id detail must reflect the override — the whole point
    // of resolveAircraftType() is that every reader sees the change.
    const detailAfter = await request(app.getHttpServer())
      .get(`/flights/${instance.id}`)
      .set('Authorization', `Bearer ${staffToken}`);
    expect(detailAfter.body.data.aircraftType).toBe(AIRCRAFT_LARGE);

    // Now exercise the rejection branch directly: a fresh instance with
    // its own confirmed booking, then a change to a 0-seat aircraft type
    // (enumerateSeats returns [] → capacity 0 < the 1 confirmed passenger).
    const tinyInstance = await freshInstance({ capacity: 1 });
    const tinyBooking = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        flightInstanceId: tinyInstance.id,
        cabin: 'ECONOMY',
        passengers: [{ fullName: 'مسافر تنها', seatCode: '1A' }],
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/bookings/${tinyBooking.body.data.id}/pay`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({})
      .expect(201);

    await upsertSeatMap('P13-EmptyJet', {
      businessRowStart: 1,
      businessRowEnd: 0,
      businessColsLeft: [],
      businessColsRight: [],
      economyRowStart: 1,
      economyRowEnd: 0,
      economyColsLeft: [],
      economyColsRight: [],
    });
    const stepUp2 = await stepUpFor(
      app,
      staffToken,
      'senior',
      'PRICE_CAPACITY_CHANGE',
    );
    const rejectedChange = await request(app.getHttpServer())
      .patch(`/flights/${tinyInstance.id}/aircraft`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ aircraftType: 'P13-EmptyJet', ...stepUp2 });
    expect(rejectedChange.status).toBe(409);
    expect(rejectedChange.body.error.code).toBe('CAPACITY_BELOW_CONFIRMED');

    await dataSource
      .getRepository(AircraftSeatMap)
      .delete({ aircraftType: 'P13-EmptyJet' });
  }, 15000);

  it('GET /flights/aircraft-types lists every seat-map type with its real computed capacity', async () => {
    const res = await request(app.getHttpServer())
      .get('/flights/aircraft-types')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(200);
    const byType = Object.fromEntries(
      (res.body.data as { aircraftType: string; capacity: number }[]).map(
        (t) => [t.aircraftType, t.capacity],
      ),
    );
    expect(byType[AIRCRAFT_SMALL]).toBe(4);
    expect(byType[AIRCRAFT_LARGE]).toBe(8);
  });
});
