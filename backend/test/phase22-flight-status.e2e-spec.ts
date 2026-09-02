import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { createTestApp } from './helpers/app.helper';
import { dataSourceOptions } from '../src/database/data-source.options';
import { Airport } from '../src/database/entities/airport.entity';
import { Route } from '../src/database/entities/route.entity';
import { Flight } from '../src/database/entities/flight.entity';
import { FlightInstance } from '../src/database/entities/flight-instance.entity';

/** Phase 22: وضعیت پرواز — public read-only lookup by flightNo or by
 * route+date, using only real FlightInstance/Route/Airport data (no
 * gate/belt/delay/terminal — see docs/API.md's Phase 22 section for why
 * those design fields are explicitly not modeled). */
describe('Phase 22 — flight status lookup (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let flightNo: string;
  let departureAt: Date;
  let originCode: string;
  let destCode: string;

  beforeAll(async () => {
    const setupDataSource = new DataSource(dataSourceOptions);
    await setupDataSource.initialize();

    // Unique origin/dest codes per run — a fixed route+date pairing would
    // collide with a stale FlightInstance left by an earlier run on the
    // same calendar day, since the route+date lookup has no flightNo
    // filter to disambiguate (findFirst ordered only by departureAt).
    const suffix = Date.now().toString(36).toUpperCase().slice(-4);
    originCode = `Q${suffix.slice(0, 2)}`;
    destCode = `Z${suffix.slice(2, 4)}`;

    const airportRepo = setupDataSource.getRepository(Airport);
    await airportRepo.save(
      airportRepo.create({
        code: originCode,
        cityFa: 'شهر آزمایش الف',
        tz: 'Asia/Tehran',
      }),
    );
    await airportRepo.save(
      airportRepo.create({
        code: destCode,
        cityFa: 'شهر آزمایش ب',
        tz: 'Asia/Tehran',
      }),
    );
    const routeRepo = setupDataSource.getRepository(Route);
    const route = await routeRepo.save(
      routeRepo.create({ originCode, destCode, durationMin: 80 }),
    );
    flightNo = `FS-${Date.now().toString(36).toUpperCase().slice(-6)}`;
    const flightRepo = setupDataSource.getRepository(Flight);
    const flight = await flightRepo.save(
      flightRepo.create({
        flightNo,
        routeId: route.id,
        aircraftType: 'Airbus A320',
      }),
    );
    departureAt = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
    departureAt.setUTCHours(6, 0, 0, 0);
    const instanceRepo = setupDataSource.getRepository(FlightInstance);
    await instanceRepo.save(
      instanceRepo.create({
        flightId: flight.id,
        departureAt,
        arrivalAt: new Date(departureAt.getTime() + 80 * 60 * 1000),
        capacity: 146,
        status: 'SCHEDULED',
      }),
    );

    await setupDataSource.destroy();
  });

  beforeEach(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
  });

  afterEach(async () => {
    await app.close();
  });

  function dateParam() {
    return departureAt.toISOString().slice(0, 10);
  }

  it('finds a flight by flightNo and returns real route/aircraft/status data', async () => {
    const res = await request(app.getHttpServer())
      .get('/flight-status')
      .query({ flightNo, date: dateParam() });

    expect(res.status).toBe(200);
    expect(res.body.data.flightNo).toBe(flightNo);
    expect(res.body.data.originCode).toBe(originCode);
    expect(res.body.data.destCode).toBe(destCode);
    expect(res.body.data.originCityFa).toBe('شهر آزمایش الف');
    expect(res.body.data.aircraftType).toBe('Airbus A320');
    expect(res.body.data.statusLabelFa).toBe('برنامه‌ریزی‌شده');
    expect(res.body.data.gate).toBeUndefined();
    expect(res.body.data.baggageBelt).toBeUndefined();
  });

  it('finds the same flight by route + date, case-insensitively', async () => {
    const res = await request(app.getHttpServer()).get('/flight-status').query({
      origin: originCode.toLowerCase(),
      dest: destCode.toLowerCase(),
      date: dateParam(),
    });

    expect(res.status).toBe(200);
    expect(res.body.data.flightNo).toBe(flightNo);
  });

  it('404s when nothing matches', async () => {
    const res = await request(app.getHttpServer())
      .get('/flight-status')
      .query({ flightNo: 'ZZ-9999', date: dateParam() });
    expect(res.status).toBe(404);
  });

  it('400s when neither flightNo nor origin+dest is given', async () => {
    const res = await request(app.getHttpServer())
      .get('/flight-status')
      .query({ date: dateParam() });
    expect(res.status).toBe(400);
  });

  it('labels a CANCELLED instance correctly', async () => {
    const cancelledFlightNo = `${flightNo}-C`;
    const route = await dataSource
      .getRepository(Route)
      .findOneByOrFail({ originCode, destCode });
    const flightRepo = dataSource.getRepository(Flight);
    const flight = await flightRepo.save(
      flightRepo.create({
        flightNo: cancelledFlightNo,
        routeId: route.id,
        aircraftType: 'Airbus A320',
      }),
    );
    const dep = new Date(departureAt.getTime() + 3 * 60 * 60 * 1000);
    const instanceRepo = dataSource.getRepository(FlightInstance);
    await instanceRepo.save(
      instanceRepo.create({
        flightId: flight.id,
        departureAt: dep,
        arrivalAt: new Date(dep.getTime() + 80 * 60 * 1000),
        capacity: 146,
        status: 'CANCELLED',
      }),
    );

    const res = await request(app.getHttpServer())
      .get('/flight-status')
      .query({ flightNo: cancelledFlightNo, date: dateParam() });
    expect(res.status).toBe(200);
    expect(res.body.data.statusLabelFa).toBe('لغو شد');
  });
});
