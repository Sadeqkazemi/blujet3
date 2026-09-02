import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AircraftSeatMap } from '../src/database/entities/aircraft-seat-map.entity';
import { Route } from '../src/database/entities/route.entity';
import { Flight } from '../src/database/entities/flight.entity';
import { FlightInstance } from '../src/database/entities/flight-instance.entity';
import { AgencyProfile } from '../src/database/entities/agency-profile.entity';
import { LedgerEntry } from '../src/database/entities/ledger-entry.entity';
import { loginAs, loginAsCustomer } from './helpers/login.helper';
import { createTestApp } from './helpers/app.helper';

describe('Reporting (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let ceoToken: string;
  let ownFlightNo: string;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    const { accessToken } = await loginAs(app, 'ceo');
    ceoToken = accessToken!;

    // These endpoints aggregate over the ENTIRE shared e2e test database —
    // `blujet_test` is never reset between spec files, so how much SALE
    // ledger data (if any) exists in the current q6 window depends entirely
    // on suite run order, not on anything this file controls (the same
    // class of flakiness already fixed once for finance-reports.e2e-spec.ts
    // — commit 159c6d7). Rather than assume ambient revenue exists, this
    // file creates and pays its own dedicated booking so both the org-wide
    // q6 totals and the by-flightNo query always have a real, deterministic
    // SALE entry to find, regardless of what else has run.
    const AIRCRAFT_TYPE = 'RP-TestJet';
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
          economyRowEnd: 3,
          economyColsLeft: ['A'],
          economyColsRight: ['C'],
          updatedAt: new Date(),
        }),
      );
    }
    const routeRepo = dataSource.getRepository(Route);
    let route = await routeRepo.findOneBy({
      originCode: 'THR',
      destCode: 'IFN',
    });
    if (!route) {
      route = await routeRepo.save(
        routeRepo.create({
          originCode: 'THR',
          destCode: 'IFN',
          durationMin: 70,
        }),
      );
    }
    ownFlightNo = `RP-${Date.now().toString(36).toUpperCase().slice(-6)}`;
    const flightRepo = dataSource.getRepository(Flight);
    const flight = await flightRepo.save(
      flightRepo.create({
        flightNo: ownFlightNo,
        routeId: route.id,
        aircraftType: AIRCRAFT_TYPE,
      }),
    );
    // Backdated (not a future flight) so materializeDepartedInstances flips
    // it to DEPARTED by the time /reporting/flight-sales reads it — booking
    // creation only checks instance.status === 'SCHEDULED', not the date.
    const departureAt = new Date(Date.now() - 60_000);
    const instanceRepo = dataSource.getRepository(FlightInstance);
    const instance = await instanceRepo.save(
      instanceRepo.create({
        flightId: flight.id,
        departureAt,
        arrivalAt: new Date(departureAt.getTime() + 70 * 60 * 1000),
        capacity: 4,
        status: 'SCHEDULED',
      }),
    );

    const { accessToken: customerToken } = await loginAsCustomer(
      app,
      '09150009000',
    );
    const createRes = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        flightInstanceId: instance.id,
        cabin: 'ECONOMY',
        passengers: [
          { fullName: 'گزارش تست', nationalId: '0012345679', seatCode: '1A' },
        ],
      });
    await request(app.getHttpServer())
      .post(`/bookings/${createRes.body.data.id}/pay`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({});
  });

  afterAll(async () => {
    await app.close();
  });

  it('IT Manager (not a reporting role) gets 403 on every reporting endpoint', async () => {
    const { accessToken } = await loginAs(app, 'itadmin');
    for (const path of [
      '/reporting/sales-chart?granularity=q6',
      '/reporting/kpis?granularity=q6',
      '/reporting/completed-flights-summary?granularity=q6',
      '/reporting/low-sales-alerts',
    ]) {
      const res = await request(app.getHttpServer())
        .get(path)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(403);
    }
  });

  it('sales-chart q6 returns 6 periods whose per-channel sum reconciles with kpis revenue for the full range', async () => {
    const chart = await request(app.getHttpServer())
      .get('/reporting/sales-chart?granularity=q6')
      .set('Authorization', `Bearer ${ceoToken}`);
    expect(chart.status).toBe(200);
    expect(chart.body.data).toHaveLength(6);

    // Money fields are decimal STRINGs on the wire (BigInt.prototype.toJSON)
    // — sum via BigInt so precision is exact, never a float, at any scale.
    const chartTotal: bigint = chart.body.data.reduce(
      (
        sum: bigint,
        p: { systemIrr: string; charterIrr: string; agencyIrr: string },
      ) =>
        sum +
        BigInt(String(p.systemIrr)) +
        BigInt(String(p.charterIrr)) +
        BigInt(String(p.agencyIrr)),
      0n,
    );

    const kpis = await request(app.getHttpServer())
      .get('/reporting/kpis?granularity=q6')
      .set('Authorization', `Bearer ${ceoToken}`);
    expect(kpis.status).toBe(200);
    expect(BigInt(String(kpis.body.data.revenueIrr))).toBe(chartTotal);
  });

  it('a bookingless SALE ledger row (AgenciesService.resetTestDebt-style agency debt calibration) never pollutes revenue reporting', async () => {
    // Reproduces the real bug this file caught: resetTestDebt() reuses
    // LedgerEntry{type:'SALE'} for agency debt-line calibration
    // (agencyId set, bookingId null, amount can be negative) — a
    // completely different concern from ticket revenue. Before the fix,
    // kpis().revenueIrr (Math.abs-summed, no bookingId filter) diverged
    // from sales-chart's total (which happened to skip these rows only
    // because they have no booking.channel) whenever such a row existed.
    const agency = await dataSource
      .getRepository(AgencyProfile)
      .findOne({ where: {}, select: { userId: true } });
    expect(agency).not.toBeNull();

    const before = await request(app.getHttpServer())
      .get('/reporting/kpis?granularity=q6')
      .set('Authorization', `Bearer ${ceoToken}`);

    const ledgerRepo = dataSource.getRepository(LedgerEntry);
    await ledgerRepo.save(
      ledgerRepo.create({
        agencyId: agency!.userId,
        type: 'SALE',
        signedAmountIrr: -390_000_000n,
      }),
    );

    const chart = await request(app.getHttpServer())
      .get('/reporting/sales-chart?granularity=q6')
      .set('Authorization', `Bearer ${ceoToken}`);
    const chartTotal: bigint = chart.body.data.reduce(
      (
        sum: bigint,
        p: { systemIrr: string; charterIrr: string; agencyIrr: string },
      ) =>
        sum +
        BigInt(String(p.systemIrr)) +
        BigInt(String(p.charterIrr)) +
        BigInt(String(p.agencyIrr)),
      0n,
    );
    const after = await request(app.getHttpServer())
      .get('/reporting/kpis?granularity=q6')
      .set('Authorization', `Bearer ${ceoToken}`);

    expect(after.body.data.revenueIrr).toBe(before.body.data.revenueIrr);
    expect(BigInt(String(after.body.data.revenueIrr))).toBe(chartTotal);

    const mix = await request(app.getHttpServer())
      .get('/reporting/revenue-mix?granularity=q6')
      .set('Authorization', `Bearer ${ceoToken}`);
    expect(BigInt(String(mix.body.data.totalIrr))).toBe(chartTotal);
  });

  it('kpis re-scope to a single periodKey — sum of all periodKeys equals the full-range total', async () => {
    const chart = await request(app.getHttpServer())
      .get('/reporting/sales-chart?granularity=q6')
      .set('Authorization', `Bearer ${ceoToken}`);
    const periodKeys: string[] = chart.body.data.map(
      (p: { periodKey: string }) => p.periodKey,
    );

    let summedRevenue = 0n;
    for (const periodKey of periodKeys) {
      const res = await request(app.getHttpServer())
        .get(`/reporting/kpis?granularity=q6&periodKey=${periodKey}`)
        .set('Authorization', `Bearer ${ceoToken}`);
      expect(res.status).toBe(200);
      summedRevenue += BigInt(String(res.body.data.revenueIrr));
    }

    const full = await request(app.getHttpServer())
      .get('/reporting/kpis?granularity=q6')
      .set('Authorization', `Bearer ${ceoToken}`);
    expect(summedRevenue).toBe(BigInt(String(full.body.data.revenueIrr)));
  });

  it('marginPct is derived, never hardcoded — matches round(profit/revenue*100)', async () => {
    const res = await request(app.getHttpServer())
      .get('/reporting/kpis?granularity=q6')
      .set('Authorization', `Bearer ${ceoToken}`);
    // Money fields are decimal STRINGs on the wire — parsed here for a
    // display-only sanity check against the server's bigint-exact
    // divRoundBigInt derivation; these q6 aggregates are far below 2^53.
    const { revenueIrr, profitIrr, marginPct } = res.body.data as {
      revenueIrr: string;
      profitIrr: string;
      marginPct: number;
    };
    expect(marginPct).toBe(
      Math.round((Number(profitIrr) / Number(revenueIrr)) * 100),
    );
  });

  it('an invalid periodKey is rejected with 400', async () => {
    const res = await request(app.getHttpServer())
      .get('/reporting/kpis?granularity=q6&periodKey=not-a-real-bucket')
      .set('Authorization', `Bearer ${ceoToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('flight granularity requires flightNo', async () => {
    const res = await request(app.getHttpServer())
      .get('/reporting/sales-chart?granularity=flight')
      .set('Authorization', `Bearer ${ceoToken}`);
    expect(res.status).toBe(400);
  });

  it('sales-chart by flightNo returns only that flight’s sales', async () => {
    const res = await request(app.getHttpServer())
      .get(`/reporting/sales-chart?granularity=flight&flightNo=${ownFlightNo}`)
      .set('Authorization', `Bearer ${ceoToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    const total =
      BigInt(String(res.body.data[0].systemIrr)) +
      BigInt(String(res.body.data[0].charterIrr)) +
      BigInt(String(res.body.data[0].agencyIrr));
    expect(total).toBeGreaterThan(0n);
  });

  it('flight-sales lists departed instances with channel totals for the picker', async () => {
    const res = await request(app.getHttpServer())
      .get('/reporting/flight-sales')
      .set('Authorization', `Bearer ${ceoToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.rows)).toBe(true);
    expect(res.body.data.rows.length).toBeGreaterThan(0);
    const row = res.body.data.rows.find(
      (r: { flightNo: string }) => r.flightNo === ownFlightNo,
    );
    expect(row).toBeDefined();
    expect(row).toEqual(
      expect.objectContaining({
        flightInstanceId: expect.any(String),
        flightNo: ownFlightNo,
        originCityFa: expect.any(String),
        destCityFa: expect.any(String),
        departureAt: expect.any(String),
        systemIrr: expect.anything(),
        charterIrr: expect.anything(),
        agencyIrr: expect.anything(),
        totalIrr: expect.anything(),
        capacity: expect.any(Number),
        soldSeats: expect.any(Number),
      }),
    );
  });

  it('completed-flights-summary reconciles: sold + unsold === total seats', async () => {
    const res = await request(app.getHttpServer())
      .get('/reporting/completed-flights-summary?granularity=q6')
      .set('Authorization', `Bearer ${ceoToken}`);
    expect(res.status).toBe(200);
    const { totalSeats, soldSeats, unsoldSeats } = res.body.data;
    expect(soldSeats + unsoldSeats).toBe(totalSeats);
  });

  it('low-sales-alerts only returns flights within 72h below the occupancy threshold', async () => {
    const res = await request(app.getHttpServer())
      .get('/reporting/low-sales-alerts')
      .set('Authorization', `Bearer ${ceoToken}`);
    expect(res.status).toBe(200);
    for (const alert of res.body.data) {
      expect(alert.occupancyPct).toBeLessThan(0.6);
    }
  });

  // Design intentionally changed here (CLAUDE.md Financial Rules / the
  // Int→BigInt migration): a JS `number` can't safely hold IRR amounts
  // above 2^53, so every money field is now a decimal STRING on the wire
  // (BigInt.prototype.toJSON — see src/common/bigint-json.ts), not a
  // number. This still isn't a "pre-formatted display string" — no
  // thousands separators, no Persian digits, no decimal point, just the
  // raw integer as text — so the test now asserts exactly that shape.
  it('money fields are exact-integer decimal strings, never pre-formatted display strings', async () => {
    const res = await request(app.getHttpServer())
      .get('/reporting/kpis?granularity=q6')
      .set('Authorization', `Bearer ${ceoToken}`);
    expect(typeof res.body.data.revenueIrr).toBe('string');
    expect(/^-?\d+$/.test(String(res.body.data.revenueIrr))).toBe(true);
  });
});
