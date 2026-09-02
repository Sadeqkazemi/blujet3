import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Logger } from 'nestjs-pino';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import * as crypto from 'node:crypto';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { Flight } from '../src/database/entities/flight.entity';
import { FlightInstance } from '../src/database/entities/flight-instance.entity';
import { Booking } from '../src/database/entities/booking.entity';
import { Airport } from '../src/database/entities/airport.entity';
import { Route } from '../src/database/entities/route.entity';
import { AuditLog } from '../src/database/entities/audit-log.entity';
import { FarePricingProposal } from '../src/database/entities/fare-pricing-proposal.entity';
import { FareRule } from '../src/database/entities/fare-rule.entity';
import { Passenger } from '../src/database/entities/passenger.entity';
import { CabinClass } from '../src/database/enums';
import {
  PRICE_SUGGESTION_PROVIDER,
  type PriceSuggestionProvider,
  type PriceSuggestionResult,
} from '../src/modules/ai/price-suggestion.provider';
import { loginAs } from './helpers/login.helper';

class FakePriceSuggestionProvider implements PriceSuggestionProvider {
  nextResult: PriceSuggestionResult | null = null;
  lastItems: Array<{ proposal_id: string }> = [];

  suggest(
    items: Array<{ proposal_id: string }>,
  ): Promise<PriceSuggestionResult | null> {
    this.lastItems = items;
    return Promise.resolve(this.nextResult);
  }
}

describe('Flights (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let fakeMl: FakePriceSuggestionProvider;

  beforeEach(async () => {
    fakeMl = new FakePriceSuggestionProvider();
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PRICE_SUGGESTION_PROVIDER)
      .useValue(fakeMl)
      .compile();
    app = moduleFixture.createNestApplication<INestApplication<App>>({
      bufferLogs: true,
    });
    const logger = app.get(Logger);
    app.useLogger(logger);
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter(logger));
    await app.init();
    dataSource = app.get(DataSource);
  });

  afterEach(async () => {
    await app.close();
  });

  function uniqueFlightNo() {
    return `TS${(Date.now() % 9000) + 1000}`;
  }

  function definitionBase(over: Record<string, unknown> = {}) {
    // Airbus A320 physical map: 16 business + 20 comfort + 110 economy.
    const capacity = 146;
    return {
      originCode: 'THR',
      destCode: 'MHD',
      flightNo: uniqueFlightNo(),
      departureAt: new Date(Date.now() + 5 * 24 * 3_600_000).toISOString(),
      durationMinutes: 90,
      capacity,
      cabinCapacities: [
        { cabin: 'ECONOMY', seats: 110 },
        { cabin: 'COMFORT', seats: 20 },
        { cabin: 'BUSINESS', seats: 16 },
      ],
      basePriceIrr: 25_000_000,
      ...over,
    };
  }

  async function createInstance(
    over: Partial<{
      departureAt: Date;
      status: 'SCHEDULED' | 'DEPARTED' | 'CANCELLED';
      capacity: number;
      charterSeats: number;
      basePriceIrr: number;
    }> = {},
  ) {
    const flight = await dataSource
      .getRepository(Flight)
      .createQueryBuilder('f')
      .getOneOrFail();
    const departureAt =
      over.departureAt ?? new Date(Date.now() + 14 * 24 * 3_600_000);
    const instanceRepo = dataSource.getRepository(FlightInstance);
    return instanceRepo.save(
      instanceRepo.create({
        flightId: flight.id,
        departureAt,
        arrivalAt: new Date(departureAt.getTime() + 3 * 3_600_000),
        capacity: over.capacity ?? 180,
        charterSeats: over.charterSeats ?? 60,
        status: over.status ?? 'SCHEDULED',
        basePriceIrr: BigInt(over.basePriceIrr ?? 30_000_000),
      }),
    );
  }

  async function addBooking(
    flightInstanceId: string,
    channel: 'SYSTEM' | 'CHARTER' | 'AGENCY',
    priceIrr: number,
  ) {
    const bookingRepo = dataSource.getRepository(Booking);
    return bookingRepo.save(
      bookingRepo.create({
        pnr: `FL${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
        flightInstanceId,
        channel,
        status: 'TICKETED',
        priceIrr: BigInt(priceIrr),
      }),
    );
  }

  it('commercial fare-class controls enforce auth, validation, not-found and successful mutations', async () => {
    const instance = await createInstance();
    const fareRuleRepo = dataSource.getRepository(FareRule);
    const rule = await fareRuleRepo.save(
      fareRuleRepo.create({
        flightInstanceId: instance.id,
        cabin: CabinClass.ECONOMY,
        classCode: `Y${Date.now()}`,
        priceIrr: 30_000_000n,
        taxIrr: 0n,
        seatsAllocated: 20,
      }),
    );
    for (const channel of ['SYSTEM', 'AGENCY'] as const) {
      const booking = await addBooking(instance.id, channel, 30_000_000);
      booking.cabin = CabinClass.ECONOMY;
      booking.fareClassCode = rule.classCode;
      await dataSource.getRepository(Booking).save(booking);
      await dataSource.getRepository(Passenger).save(
        dataSource.getRepository(Passenger).create({
          bookingId: booking.id,
          fullName: `مسافر ${channel}`,
          occupiesSeat: true,
          fareIrr: channel === 'SYSTEM' ? 30_000_000n : 27_000_000n,
        }),
      );
    }

    const unauthenticated = await request(app.getHttpServer()).get(
      `/flights/${instance.id}/commercial-control`,
    );
    expect(unauthenticated.status).toBe(401);

    const finance = await loginAs(app, 'finance');
    const forbidden = await request(app.getHttpServer())
      .get(`/flights/${instance.id}/commercial-control`)
      .set('Authorization', `Bearer ${finance.accessToken}`);
    expect(forbidden.status).toBe(403);

    const { accessToken } = await loginAs(app, 'comm');
    const invalidUuid = await request(app.getHttpServer())
      .get('/flights/not-a-uuid/commercial-control')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(invalidUuid.status).toBe(400);

    const missing = await request(app.getHttpServer())
      .get(`/flights/${crypto.randomUUID()}/commercial-control`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(missing.status).toBe(404);

    const detail = await request(app.getHttpServer())
      .get(`/flights/${instance.id}/commercial-control`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.fareClasses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: rule.id,
          classCode: rule.classCode,
          soldSeats: 2,
          siteSoldSeats: 1,
          agencySoldSeats: 1,
          remainingSeats: 18,
          salesByRate: expect.arrayContaining([
            expect.objectContaining({
              channel: 'SYSTEM',
              priceIrr: '30000000',
              seats: 1,
            }),
            expect.objectContaining({
              channel: 'AGENCY',
              priceIrr: '27000000',
              seats: 1,
            }),
          ]),
        }),
      ]),
    );
    expect(detail.body.data.agencySaleEnabled).toBe(true);

    const programCode = `B${Date.now()}`;
    const createdProgram = await request(app.getHttpServer())
      .post(`/flights/${instance.id}/fare-rules`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        cabin: 'ECONOMY',
        classCode: programCode,
        priceIrr: '39000000',
        seatsAllocated: 20,
        siteSeats: 0,
        sitePriceIrr: '39000000',
        agencySeats: 8,
        agencyPriceIrr: '39000000',
        agencySpecialOffer: true,
        allowedChannels: ['SYSTEM', 'AGENCY'],
      });
    expect(createdProgram.status).toBe(201);
    expect(createdProgram.body.data).toEqual(
      expect.objectContaining({
        classCode: programCode,
        siteSeatsReleased: 0,
        sitePriceIrr: '39000000',
        agencySeatsReleased: 8,
        agencyReleasePriceIrr: '39000000',
        agencySpecialOffer: true,
      }),
    );

    const stagedSiteRelease = await request(app.getHttpServer())
      .patch(
        `/flights/${instance.id}/fare-rules/${createdProgram.body.data.id}/site-price`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        priceIrr: '42000000',
        seats: 12,
        reason: 'مرحله دوم فروش عمومی',
      });
    expect(stagedSiteRelease.status).toBe(200);
    expect(stagedSiteRelease.body.data).toEqual(
      expect.objectContaining({
        siteSeatsReleased: 12,
        sitePriceIrr: '42000000',
      }),
    );

    const visibility = await request(app.getHttpServer())
      .patch(`/flights/${instance.id}/sales-visibility`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ enabled: false });
    expect(visibility.status).toBe(200);
    expect(visibility.body.data.publicSaleEnabled).toBe(false);

    const agencyVisibility = await request(app.getHttpServer())
      .patch(`/flights/${instance.id}/agency-sales-visibility`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ enabled: false });
    expect(agencyVisibility.status).toBe(200);
    expect(agencyVisibility.body.data.agencySaleEnabled).toBe(false);

    const invalidPrice = await request(app.getHttpServer())
      .patch(`/flights/${instance.id}/fare-rules/${rule.id}/site-price`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ priceIrr: '38000000', reason: '' });
    expect(invalidPrice.status).toBe(400);

    const updatedPrice = await request(app.getHttpServer())
      .patch(`/flights/${instance.id}/fare-rules/${rule.id}/site-price`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ priceIrr: '38000000', reason: 'افزایش تقاضا' });
    expect(updatedPrice.status).toBe(200);
    expect(updatedPrice.body.data.sitePriceIrr).toBe('38000000');

    const independentSiteRelease = await request(app.getHttpServer())
      .patch(`/flights/${instance.id}/fare-rules/${rule.id}/site-price`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ priceIrr: '38000000', seats: 1, reason: '' });
    expect(independentSiteRelease.status).toBe(200);
    expect(independentSiteRelease.body.data.siteSeatsReleased).toBe(1);

    const excessiveRelease = await request(app.getHttpServer())
      .put(`/flights/${instance.id}/fare-rules/${rule.id}/agency-release`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ seats: 21, priceIrr: '32000000', specialOffer: true });
    expect(excessiveRelease.status).toBe(400);

    const agencyRelease = await request(app.getHttpServer())
      .put(`/flights/${instance.id}/fare-rules/${rule.id}/agency-release`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ seats: 5, priceIrr: '32000000', specialOffer: true });
    expect(agencyRelease.status).toBe(200);
    expect(agencyRelease.body.data).toEqual(
      expect.objectContaining({
        agencySeatsReleased: 5,
        agencyReleasePriceIrr: '32000000',
        agencySpecialOffer: true,
      }),
    );

    const controlWithRateHistory = await request(app.getHttpServer())
      .get(`/flights/${instance.id}/commercial-control`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(controlWithRateHistory.status).toBe(200);
    const controlledRule = controlWithRateHistory.body.data.fareClasses.find(
      (item: { ruleId: string }) => item.ruleId === rule.id,
    );
    expect(controlledRule).toEqual(
      expect.objectContaining({
        seatsAllocated: 20,
        basePriceIrr: '30000000',
        priceHistory: expect.arrayContaining([
          expect.objectContaining({
            channel: 'SYSTEM',
            previousPriceIrr: '30000000',
            newPriceIrr: '38000000',
          }),
          expect.objectContaining({
            channel: 'AGENCY',
            previousPriceIrr: '30000000',
            newPriceIrr: '32000000',
          }),
        ]),
      }),
    );

    const atomicRelease = await request(app.getHttpServer())
      .put(`/flights/${instance.id}/fare-rules/${rule.id}/channel-release`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        siteSeats: 12,
        sitePriceIrr: '40000000',
        agencySeats: 8,
        agencyPriceIrr: '33000000',
        specialOffer: true,
        reason: 'تنظیم یکپارچه کانال‌های فروش',
      });
    expect(atomicRelease.status).toBe(200);
    expect(atomicRelease.body.data).toEqual(
      expect.objectContaining({
        siteSeatsReleased: 12,
        sitePriceIrr: '40000000',
        agencySeatsReleased: 8,
        agencyReleasePriceIrr: '33000000',
        agencySpecialOffer: true,
      }),
    );

    const belowSold = await request(app.getHttpServer())
      .put(`/flights/${instance.id}/fare-rules/${rule.id}/channel-release`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        siteSeats: 0,
        sitePriceIrr: '40000000',
        agencySeats: 8,
        agencyPriceIrr: '33000000',
      });
    expect(belowSold.status).toBe(400);
  });

  it('materialises approved cabin definitions for legacy flights without asking the commercial user to create classes', async () => {
    const instance = await createInstance({
      capacity: 100,
      basePriceIrr: 38_000_000,
    });
    instance.cabinCapacities = [
      { cabin: CabinClass.BUSINESS, seats: 20, capacity: 20 },
      { cabin: CabinClass.ECONOMY, seats: 80, capacity: 80 },
    ];
    instance.publicSaleEnabled = false;
    await dataSource.getRepository(FlightInstance).save(instance);

    expect(
      await dataSource.getRepository(FareRule).countBy({
        flightInstanceId: instance.id,
      }),
    ).toBe(0);

    const { accessToken } = await loginAs(app, 'comm');
    const control = await request(app.getHttpServer())
      .get(`/flights/${instance.id}/commercial-control`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(control.status).toBe(200);
    expect(control.body.data.fareClasses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          cabin: CabinClass.BUSINESS,
          classCode: 'C',
          seatsAllocated: 20,
          basePriceIrr: '38000000',
          siteSeatsReleased: 0,
        }),
        expect.objectContaining({
          cabin: CabinClass.ECONOMY,
          classCode: 'Y',
          seatsAllocated: 80,
          basePriceIrr: '38000000',
          siteSeatsReleased: 0,
        }),
      ]),
    );
    expect(
      await dataSource.getRepository(FareRule).countBy({
        flightInstanceId: instance.id,
      }),
    ).toBe(2);
  });

  it('returns per-class advisory pricing without mutating or publishing the fare', async () => {
    const instance = await createInstance({
      departureAt: new Date(Date.now() + 48 * 3_600_000),
      capacity: 30,
      basePriceIrr: 36_000_000,
    });
    instance.competitorPriceIrr = 40_000_000n;
    await dataSource.getRepository(FlightInstance).save(instance);
    const fareRuleRepo = dataSource.getRepository(FareRule);
    const rule = await fareRuleRepo.save(
      fareRuleRepo.create({
        flightInstanceId: instance.id,
        cabin: CabinClass.ECONOMY,
        classCode: `AI${Date.now()}`,
        priceIrr: 36_000_000n,
        sitePriceIrr: 38_000_000n,
        taxIrr: 0n,
        seatsAllocated: 30,
        siteSeatsReleased: 10,
        agencySeatsReleased: 5,
        agencyReleasePriceIrr: 32_000_000n,
      }),
    );
    const path = `/flights/${instance.id}/fare-rules/${rule.id}/price-suggestion`;

    expect(
      (
        await request(app.getHttpServer())
          .post(path)
          .send({ channel: 'SYSTEM' })
      ).status,
    ).toBe(401);
    const finance = await loginAs(app, 'finance');
    expect(
      (
        await request(app.getHttpServer())
          .post(path)
          .set('Authorization', `Bearer ${finance.accessToken}`)
          .send({ channel: 'SYSTEM' })
      ).status,
    ).toBe(403);

    const { accessToken } = await loginAs(app, 'comm');
    const fallback = await request(app.getHttpServer())
      .post(path)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ channel: 'SYSTEM', competitorPriceIrr: '41000000' });
    expect(fallback.status).toBe(201);
    expect(fallback.body.data).toEqual(
      expect.objectContaining({
        ruleId: rule.id,
        channel: 'SYSTEM',
        capacity: 30,
        releasedSeats: 10,
        soldSeats: 0,
        competitorPriceIrr: '41000000',
        source: 'HEURISTIC',
        advisoryOnly: true,
      }),
    );
    expect(BigInt(fallback.body.data.suggestedPriceIrr)).toBeGreaterThan(0n);

    const afterFallback = await fareRuleRepo.findOneByOrFail({ id: rule.id });
    expect(afterFallback.sitePriceIrr).toBe(38_000_000n);
    expect(afterFallback.siteSeatsReleased).toBe(10);
    expect(afterFallback.agencyReleasePriceIrr).toBe(32_000_000n);

    fakeMl.nextResult = {
      model_version: 'pricing-test-v1',
      suggestions: [
        {
          proposal_id: rule.id,
          price_irr: 39_500_000,
          reason_fa: 'پیشنهاد مدل تست',
          factors_fa: ['ظرفیت', 'زمان', 'رقبا'],
          season_fa: 'عادی',
          occasion_fa: 'بدون مناسبت',
          confidence: 0.81,
        },
      ],
    };
    const ml = await request(app.getHttpServer())
      .post(path)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ channel: 'AGENCY', competitorPriceIrr: '40000000' });
    expect(ml.status).toBe(201);
    expect(ml.body.data).toEqual(
      expect.objectContaining({
        channel: 'AGENCY',
        suggestedPriceIrr: '39500000',
        source: 'ML',
        modelVersion: 'pricing-test-v1',
        advisoryOnly: true,
      }),
    );
    const afterMl = await fareRuleRepo.findOneByOrFail({ id: rule.id });
    expect(afterMl.agencyReleasePriceIrr).toBe(32_000_000n);
  });

  it('overview: KPI figures reconcile while every published future flight remains active', async () => {
    const near = await createInstance({
      departureAt: new Date(Date.now() + 2 * 24 * 3_600_000),
    });
    await addBooking(near.id, 'SYSTEM', 30_000_000);
    const cancelled = await createInstance({
      departureAt: new Date(Date.now() + 2 * 24 * 3_600_000),
      status: 'CANCELLED',
    });
    const future = await createInstance({
      departureAt: new Date(Date.now() + 20 * 24 * 3_600_000),
    });

    const { accessToken } = await loginAs(app, 'senior');
    const res = await request(app.getHttpServer())
      .get('/flights/overview')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);

    const { kpis, active, future: futureRows } = res.body.data;
    const activeById = new Map(
      (active as { id: string; derivedStatus: string; sold: number }[]).map(
        (r) => [r.id, r],
      ),
    );
    expect(activeById.get(near.id)?.derivedStatus).toBe('SELLING');
    expect(activeById.get(cancelled.id)?.derivedStatus).toBe('CANCELLED');
    expect(activeById.has(future.id)).toBe(true);
    expect(
      (futureRows as { id: string }[]).some((r) => r.id === future.id),
    ).toBe(true);

    const nonCancelled = (
      active as { derivedStatus: string; sold: number; capacity: number }[]
    ).filter((r) => r.derivedStatus !== 'CANCELLED');
    expect(kpis.activeCount).toBe(nonCancelled.length);
    expect(kpis.soldSeats).toBe(nonCancelled.reduce((a, r) => a + r.sold, 0));
  });

  it('completed report aggregates REAL per-channel revenue; سود/ضرر vs the base rate; KPIs reconcile', async () => {
    const departed = await createInstance({
      // Keep this fixture among the 30 most recent completed flights even as
      // the rolling seed data advances with the calendar.
      departureAt: new Date(Date.now() - 60_000),
      status: 'DEPARTED',
      basePriceIrr: 30_000_000,
    });
    // 2 SYSTEM at 40M + 1 AGENCY at 20M → revenue 100M, avg ≈ 33.33M > base.
    await addBooking(departed.id, 'SYSTEM', 40_000_000);
    await addBooking(departed.id, 'SYSTEM', 40_000_000);
    await addBooking(departed.id, 'AGENCY', 20_000_000);

    const { accessToken } = await loginAs(app, 'comm');
    const res = await request(app.getHttpServer())
      .get('/flights/overview')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);

    // Money fields are decimal STRINGs on the wire (BigInt.prototype.toJSON)
    // — see src/common/bigint-json.ts.
    const row = (
      res.body.data.completed.rows as {
        id: string;
        tickets: number;
        revenueIrr: string;
        avgPriceIrr: string;
        channelRevenueIrr: Record<string, string>;
        profitIrr: string;
        lossIrr: string;
      }[]
    ).find((r) => r.id === departed.id)!;
    expect(row.tickets).toBe(3);
    expect(row.revenueIrr).toBe('100000000');
    expect(row.channelRevenueIrr.SYSTEM).toBe('80000000');
    expect(row.channelRevenueIrr.AGENCY).toBe('20000000');
    expect(row.channelRevenueIrr.CHARTER).toBe('0');
    expect(row.avgPriceIrr).toBe(String(Math.round(100_000_000 / 3)));
    // avg > base → profit, no loss (real math, no fabricated 18٪ margin).
    expect(row.profitIrr).toBe(
      String((Number(row.avgPriceIrr) - 30_000_000) * 3),
    );
    expect(row.lossIrr).toBe('0');

    const { kpis, rows } = res.body.data.completed as {
      kpis: { totalSalesIrr: string; totalTickets: number };
      rows: { revenueIrr: string; tickets: number }[];
    };
    expect(Number(kpis.totalSalesIrr)).toBe(
      rows.reduce((a, r) => a + Number(r.revenueIrr), 0),
    );
    expect(kpis.totalTickets).toBe(rows.reduce((a, r) => a + r.tickets, 0));
  });

  it('airports catalog is seeded (Iranian cities + DXB/IST/NJF); roles without the tab get 403', async () => {
    const { accessToken } = await loginAs(app, 'senior');
    const res = await request(app.getHttpServer())
      .get('/flights/airports')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    const codes = (res.body.data as { code: string }[]).map((a) => a.code);
    expect(codes).toEqual(expect.arrayContaining(['THR', 'DXB', 'IST', 'NJF']));
    expect(codes.length).toBeGreaterThanOrEqual(23);

    const finance = await loginAs(app, 'finance');
    const denied = await request(app.getHttpServer())
      .get('/flights/overview')
      .set('Authorization', `Bearer ${finance.accessToken}`);
    expect(denied.status).toBe(403);
  });

  it('airport catalog creates real labels, soft-deletes used cities, and rejects active duplicate codes', async () => {
    const { accessToken } = await loginAs(app, 'comm');
    // A timestamp-derived 2-letter suffix has too little entropy (only ~1300
    // combinations) not to occasionally collide with a real seeded IATA code
    // (e.g. it once landed on "ZAH" — Zahedan) — pick against the DB instead.
    const existing = new Set(
      (
        await dataSource.getRepository(Airport).find({ select: { code: true } })
      ).map((a) => a.code),
    );
    let code: string;
    do {
      code = Array.from({ length: 3 }, () =>
        String.fromCharCode(65 + crypto.randomInt(0, 26)),
      ).join('');
    } while (existing.has(code));
    const cityFa = `شهر تست ${code}`;
    const airportNameFa = `فرودگاه تست ${code}`;
    const created = await request(app.getHttpServer())
      .post('/flights/airports')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ cityFa, code, airportNameFa });
    expect(created.status).toBe(201);
    expect(created.body.data.code).toBe(code);
    expect(created.body.data.airportNameFa).toBe(airportNameFa);

    const dup = await request(app.getHttpServer())
      .post('/flights/airports')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ cityFa: `${cityFa} ۲`, code });
    expect(dup.status).toBe(409);

    // Historical route usage must no longer make the UI deletion appear to
    // do nothing. The airport is hidden from new searches but the route row
    // remains intact for old tickets/reports.
    const routeRepo = dataSource.getRepository(Route);
    const route = await routeRepo.save(
      routeRepo.create({ originCode: code, destCode: 'THR', durationMin: 75 }),
    );
    const removed = await request(app.getHttpServer())
      .delete(`/flights/airports/${created.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(removed.status).toBe(200);
    expect(removed.body.data).toEqual({ id: created.body.data.id });

    const stored = await dataSource.getRepository(Airport).findOneByOrFail({
      id: created.body.data.id,
    });
    expect(stored.active).toBe(false);
    expect(await routeRepo.findOneBy({ id: route.id })).not.toBeNull();

    const staffCatalog = await request(app.getHttpServer())
      .get('/flights/airports')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(staffCatalog.body.data).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ code })]),
    );
    const publicCatalog = await request(app.getHttpServer()).get(
      '/search/airports',
    );
    expect(publicCatalog.body.data).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ code })]),
    );
  });

  it('POST /flights: validations (same origin/dest, past date, duplicate flightNo on another route) then a clean create', async () => {
    const { accessToken } = await loginAs(app, 'senior');
    const base = definitionBase();

    const sameCity = await request(app.getHttpServer())
      .post('/flights')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ ...base, destCode: 'THR' });
    expect(sameCity.status).toBe(400);

    const pastDate = await request(app.getHttpServer())
      .post('/flights')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        ...base,
        departureAt: new Date(Date.now() - 3_600_000).toISOString(),
      });
    expect(pastDate.status).toBe(400);

    // Legacy hyphenated numbers are rejected by the new ^[A-Z]{2}\d{4}$ rule.
    const legacyNo = await request(app.getHttpServer())
      .post('/flights')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ ...base, flightNo: 'EP-821' });
    expect(legacyNo.status).toBe(400);

    const ok = await request(app.getHttpServer())
      .post('/flights')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(base);
    expect(ok.status).toBe(201);
    expect(ok.body.data.derivedStatus).toBe('ACTIVE');
    expect(ok.body.data.sold).toBe(0);

    // Same flightNo on a different route → 409.
    const dupNo = await request(app.getHttpServer())
      .post('/flights')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        ...definitionBase({
          flightNo: base.flightNo,
          destCode: 'DXB',
          cabinCapacities: [
            { cabin: 'ECONOMY', seats: 110 },
            { cabin: 'COMFORT', seats: 20 },
            { cabin: 'BUSINESS', seats: 16 },
          ],
        }),
      });
    expect(dupNo.status).toBe(409);

    const withExtras = await request(app.getHttpServer())
      .post('/flights')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(
        definitionBase({
          flightNo: uniqueFlightNo(),
          capacity: 146,
          cabinCapacities: [
            { cabin: 'ECONOMY', seats: 110 },
            { cabin: 'COMFORT', seats: 20 },
            { cabin: 'BUSINESS', seats: 16 },
          ],
          charterSeats: 40,
          aircraftType: 'Airbus A320',
        }),
      );
    expect(withExtras.status).toBe(201);
    const extrasInstance = await dataSource
      .getRepository(FlightInstance)
      .createQueryBuilder('fi')
      .innerJoinAndSelect('fi.flight', 'flight')
      .where('fi.id = :id', { id: withExtras.body.data.id })
      .getOneOrFail();
    expect(extrasInstance.charterSeats).toBe(40);
    expect(extrasInstance.flight.aircraftType).toBe('Airbus A320');

    const badCharter = await request(app.getHttpServer())
      .post('/flights')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(
        definitionBase({
          flightNo: uniqueFlightNo(),
          capacity: 146,
          cabinCapacities: [
            { cabin: 'ECONOMY', seats: 110 },
            { cabin: 'COMFORT', seats: 20 },
            { cabin: 'BUSINESS', seats: 16 },
          ],
          charterSeats: 146, // must be strictly less than capacity
        }),
      );
    expect(badCharter.status).toBe(400);

    const instance = await dataSource
      .getRepository(FlightInstance)
      .createQueryBuilder('fi')
      .innerJoinAndSelect('fi.flight', 'flight')
      .innerJoinAndSelect('flight.route', 'route')
      .where('fi.id = :id', { id: ok.body.data.id })
      .getOneOrFail();
    expect(instance.flight.route.originCode).toBe('THR');
    expect(instance.flight.route.destCode).toBe('MHD');
    // arrivalAt is derived from durationMinutes (documented contract).
    expect(instance.arrivalAt.getTime() - instance.departureAt.getTime()).toBe(
      90 * 60_000,
    );
    expect(instance.durationMinutes).toBe(90);

    const audit = await dataSource
      .getRepository(AuditLog)
      .createQueryBuilder('a')
      .where('a.entityType = :entityType', { entityType: 'FlightInstance' })
      .andWhere('a.entityId = :entityId', { entityId: instance.id })
      .getOne();
    expect(audit).not.toBeNull();
  });

  it('GET /flights/:id detail: channel breakdown + total revenue consistent with bookings', async () => {
    const instance = await createInstance({
      departureAt: new Date(Date.now() + 2 * 24 * 3_600_000),
    });
    await addBooking(instance.id, 'SYSTEM', 30_000_000);
    await addBooking(instance.id, 'CHARTER', 28_000_000);

    const { accessToken } = await loginAs(app, 'senior');
    const res = await request(app.getHttpServer())
      .get(`/flights/${instance.id}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    const { channels, totalRevenueIrr, sold } = res.body.data as {
      channels: { channel: string; seats: number; revenueIrr: string }[];
      totalRevenueIrr: string;
      sold: number;
    };
    expect(sold).toBe(2);
    expect(totalRevenueIrr).toBe('58000000');
    expect(channels.find((c) => c.channel === 'SYSTEM')?.seats).toBe(1);
    expect(channels.find((c) => c.channel === 'AGENCY')?.revenueIrr).toBe('0');
  });

  it('plan: agency-seat cap enforced; commercial save upserts a PENDING Phase 6 proposal; REGISTERED price → 409', async () => {
    const instance = await createInstance({
      departureAt: new Date(Date.now() + 20 * 24 * 3_600_000),
      capacity: 146,
      charterSeats: 60,
    });
    const commercial = await loginAs(app, 'comm');

    const overCap = await request(app.getHttpServer())
      .patch(`/flights/${instance.id}/plan`)
      .set('Authorization', `Bearer ${commercial.accessToken}`)
      .send({ priceIrr: 39_000_000, agencySeats: 87 }); // max = 146 − 60
    expect(overCap.status).toBe(400);

    const ok = await request(app.getHttpServer())
      .patch(`/flights/${instance.id}/plan`)
      .set('Authorization', `Bearer ${commercial.accessToken}`)
      .send({ priceIrr: 39_000_000, agencySeats: 60 });
    expect(ok.status).toBe(200);
    expect(ok.body.data.basePriceIrr).toBe('39000000');
    expect(ok.body.data.agencySeatsAllocated).toBe(60);
    // direct = capacity − charter − agency = 146 − 60 − 60
    expect(ok.body.data.directSeats).toBe(26);
    expect(ok.body.data.proposalPending).toBe(true);

    // ⚑ The plan never registers a bookable price — the proposal stays PENDING.
    // (query-builder read — FarePricingProposal has a jsonb aiSuggestion
    // column, so a plain findOneBy/findOne would hit TS2589.)
    const proposalRepo = dataSource.getRepository(FarePricingProposal);
    const proposal = await proposalRepo
      .createQueryBuilder('p')
      .where('p.flightInstanceId = :id', { id: instance.id })
      .getOneOrFail();
    expect(proposal.status).toBe('PENDING');
    expect(proposal.proposedPriceIrr).toBe(39_000_000n);

    // Once the CEO registers it, re-planning is locked.
    await proposalRepo.update(
      { flightInstanceId: instance.id },
      { status: 'REGISTERED', registeredPriceIrr: 39_000_000n },
    );
    const locked = await request(app.getHttpServer())
      .patch(`/flights/${instance.id}/plan`)
      .set('Authorization', `Bearer ${commercial.accessToken}`)
      .send({ priceIrr: 40_000_000, agencySeats: 60 });
    expect(locked.status).toBe(409);
  });

  it('plan by SENIOR stores figures WITHOUT creating a Phase 6 proposal', async () => {
    const instance = await createInstance({
      departureAt: new Date(Date.now() + 20 * 24 * 3_600_000),
    });
    const senior = await loginAs(app, 'senior');
    const res = await request(app.getHttpServer())
      .patch(`/flights/${instance.id}/plan`)
      .set('Authorization', `Bearer ${senior.accessToken}`)
      .send({ priceIrr: 33_000_000, agencySeats: 40 });
    expect(res.status).toBe(200);
    expect(res.body.data.proposalPending).toBe(false);

    const proposal = await dataSource
      .getRepository(FarePricingProposal)
      .createQueryBuilder('p')
      .where('p.flightInstanceId = :id', { id: instance.id })
      .getOne();
    expect(proposal).toBeNull();
  });

  it('ai-analysis persists suggestions with modelVersion on future instances; down service degrades gracefully', async () => {
    const future = await createInstance({
      departureAt: new Date(Date.now() + 20 * 24 * 3_600_000),
    });
    const { accessToken } = await loginAs(app, 'senior');

    fakeMl.nextResult = null; // ml-service down
    const down = await request(app.getHttpServer())
      .post('/flights/ai-analysis')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(down.status).toBe(201);
    expect(down.body.data).toEqual({ analyzed: 0, available: false });

    fakeMl.nextResult = {
      model_version: 'heuristic-v1.0.0',
      suggestions: [
        {
          proposal_id: future.id,
          price_irr: 41_000_000,
          reason_fa: 'دلیل آزمایشی',
          factors_fa: ['عامل ۱'],
          season_fa: 'تابستان',
          occasion_fa: 'بدون مناسبت',
          confidence: 0.8,
        },
      ],
    };
    const ok = await request(app.getHttpServer())
      .post('/flights/ai-analysis')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(ok.status).toBe(201);
    expect(ok.body.data.available).toBe(true);
    expect(ok.body.data.analyzed).toBeGreaterThanOrEqual(1);

    const row = await dataSource
      .getRepository(FlightInstance)
      .createQueryBuilder('fi')
      .where('fi.id = :id', { id: future.id })
      .getOneOrFail();
    const suggestion = row.aiSuggestion as {
      priceIrr: number;
      modelVersion: string;
    };
    expect(suggestion.priceIrr).toBe(41_000_000);
    expect(suggestion.modelVersion).toBe('heuristic-v1.0.0');
  });
});
