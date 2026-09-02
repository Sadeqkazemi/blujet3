import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Logger } from 'nestjs-pino';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { AircraftSeatMap } from '../src/database/entities/aircraft-seat-map.entity';
import { loginAs } from './helpers/login.helper';

describe('Aircraft definition catalog (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  beforeEach(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
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

  function uniqueCode() {
    return `TEST-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  }

  function payload(over: Record<string, unknown> = {}) {
    return {
      code: uniqueCode(),
      model: 'Test Aircraft 100',
      title: 'هواپیمای آزمایشی',
      totalCapacity: 24,
      businessRowStart: 3,
      businessRowEnd: 5,
      businessColsLeft: ['A', 'B'],
      businessColsRight: ['E', 'F'],
      economyRowStart: 6,
      economyRowEnd: 7,
      economyColsLeft: ['A', 'B'],
      economyColsRight: ['C', 'D', 'E', 'F'],
      ...over,
    };
  }

  it('creates an aircraft; derives AircraftCabin/AircraftSeat and a matching AircraftSeatMap row', async () => {
    const { accessToken } = await loginAs(app, 'comm');
    const code = uniqueCode();
    const res = await request(app.getHttpServer())
      .post('/flights/aircraft')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(payload({ code }));
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('ACTIVE');
    expect(res.body.data.version).toBe(1);
    expect(res.body.data.cabins).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cabinType: 'BUSINESS', capacity: 12 }),
        expect.objectContaining({ cabinType: 'ECONOMY', capacity: 12 }),
      ]),
    );
    expect(res.body.data.seats).toHaveLength(24);
    const labels = new Set(
      (res.body.data.seats as { label: string }[]).map((s) => s.label),
    );
    expect(labels.size).toBe(24); // every seat label unique

    const seatMap = await dataSource
      .getRepository(AircraftSeatMap)
      .createQueryBuilder('m')
      .where('m.aircraftType = :code', { code })
      .getOne();
    expect(seatMap).not.toBeNull();
    expect(seatMap!.businessRowStart).toBe(3);
    expect(seatMap!.economyColsRight).toEqual(['C', 'D', 'E', 'F']);
  });

  it('creates a FIRST-class cabin end to end', async () => {
    const { accessToken } = await loginAs(app, 'comm');
    const res = await request(app.getHttpServer())
      .post('/flights/aircraft')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(
        payload({
          totalCapacity: 28,
          firstRowStart: 1,
          firstRowEnd: 2,
          firstColsLeft: ['A'],
          firstColsRight: ['F'],
        }),
      );
    expect(res.status).toBe(201);
    const firstCabin = (
      res.body.data.cabins as { cabinType: string; capacity: number }[]
    ).find((c) => c.cabinType === 'FIRST');
    expect(firstCabin?.capacity).toBe(4);
    const firstSeats = (
      res.body.data.seats as { cabinType: string; label: string }[]
    ).filter((s) => s.cabinType === 'FIRST');
    expect(firstSeats.map((s) => s.label).sort()).toEqual([
      '1A',
      '1F',
      '2A',
      '2F',
    ]);
  });

  it('rejects a cabin-capacity sum that does not match totalCapacity', async () => {
    const { accessToken } = await loginAs(app, 'comm');
    const res = await request(app.getHttpServer())
      .post('/flights/aircraft')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(payload({ totalCapacity: 999 }));
    expect(res.status).toBe(400);
  });

  it('rejects a layout with zero seats in every cabin', async () => {
    const { accessToken } = await loginAs(app, 'comm');
    const res = await request(app.getHttpServer())
      .post('/flights/aircraft')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(
        payload({
          totalCapacity: 0,
          businessRowStart: 3,
          businessRowEnd: 1, // rowEnd < rowStart → band produces no seats
          economyRowStart: 6,
          economyRowEnd: 4,
        }),
      );
    expect(res.status).toBe(400);
  });

  it('rejects a duplicate aircraft code with 409', async () => {
    const { accessToken } = await loginAs(app, 'comm');
    const code = uniqueCode();
    const first = await request(app.getHttpServer())
      .post('/flights/aircraft')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(payload({ code }));
    expect(first.status).toBe(201);

    const dup = await request(app.getHttpServer())
      .post('/flights/aircraft')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(payload({ code }));
    expect(dup.status).toBe(409);
  });

  it('non-manager roles get 403 on every aircraft endpoint', async () => {
    const { accessToken } = await loginAs(app, 'finance');
    const create = await request(app.getHttpServer())
      .post('/flights/aircraft')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(payload());
    expect(create.status).toBe(403);

    const list = await request(app.getHttpServer())
      .get('/flights/aircraft')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(list.status).toBe(403);
  });

  it('GET /flights/aircraft lists the seeded A320/MD-80 plus any created aircraft; GET /flights/aircraft/:id returns full detail', async () => {
    const { accessToken } = await loginAs(app, 'comm');
    const list = await request(app.getHttpServer())
      .get('/flights/aircraft')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(list.status).toBe(200);
    const codes = (list.body.data as { code: string }[]).map((a) => a.code);
    expect(codes).toEqual(expect.arrayContaining(['Airbus A320', 'MD-80']));

    const created = await request(app.getHttpServer())
      .post('/flights/aircraft')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(payload());
    const detail = await request(app.getHttpServer())
      .get(`/flights/aircraft/${created.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.seats.length).toBeGreaterThan(0);
  });

  it('updating an aircraft bumps its version and keeps the seed-created A320/MD-80 rows untouched (MD-80 regression)', async () => {
    const { accessToken } = await loginAs(app, 'comm');
    const md80Before = await dataSource
      .getRepository(AircraftSeatMap)
      .createQueryBuilder('m')
      .where('m.aircraftType = :code', { code: 'MD-80' })
      .getOneOrFail();

    const created = await request(app.getHttpServer())
      .post('/flights/aircraft')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(payload());
    const updated = await request(app.getHttpServer())
      .put(`/flights/aircraft/${created.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(payload({ code: created.body.data.code, title: 'عنوان جدید' }));
    expect(updated.status).toBe(200);
    expect(updated.body.data.version).toBe(2);
    expect(updated.body.data.title).toBe('عنوان جدید');

    const md80After = await dataSource
      .getRepository(AircraftSeatMap)
      .createQueryBuilder('m')
      .where('m.aircraftType = :code', { code: 'MD-80' })
      .getOneOrFail();
    expect(md80After.businessRowStart).toBe(md80Before.businessRowStart);
    expect(md80After.businessRowEnd).toBe(md80Before.businessRowEnd);
    expect(md80After.businessColsLeft).toEqual(md80Before.businessColsLeft);
    expect(md80After.businessColsRight).toEqual(md80Before.businessColsRight);
    expect(md80After.economyRowStart).toBe(md80Before.economyRowStart);
    expect(md80After.economyRowEnd).toBe(md80Before.economyRowEnd);
    expect(md80After.economyColsLeft).toEqual(md80Before.economyColsLeft);
    expect(md80After.economyColsRight).toEqual(md80Before.economyColsRight);
    expect(md80After.excludedSeatCodes).toEqual(md80Before.excludedSeatCodes);
    expect(md80After.comfortRowStart).toBeNull();
    expect(md80After.firstRowStart).toBe(md80Before.firstRowStart);
    expect(md80After.firstRowEnd).toBe(md80Before.firstRowEnd);
    expect(md80After.firstColsLeft).toEqual(md80Before.firstColsLeft);
    expect(md80After.firstColsRight).toEqual(md80Before.firstColsRight);
  });

  describe('/flights/aircraft-definitions (canonical alias, PR #126)', () => {
    it('GET list, POST create, GET/PUT/PATCH by id, GET seat-map — same data as /flights/aircraft', async () => {
      const { accessToken } = await loginAs(app, 'comm');

      const list = await request(app.getHttpServer())
        .get('/flights/aircraft-definitions')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(list.status).toBe(200);
      expect((list.body.data as { code: string }[]).map((a) => a.code)).toEqual(
        expect.arrayContaining(['Airbus A320', 'MD-80']),
      );

      const created = await request(app.getHttpServer())
        .post('/flights/aircraft-definitions')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(payload());
      expect(created.status).toBe(201);
      const id = created.body.data.id as string;

      const detail = await request(app.getHttpServer())
        .get(`/flights/aircraft-definitions/${id}`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(detail.status).toBe(200);
      expect(detail.body.data.totalCapacity).toBe(24);
      expect(detail.body.data.cabins.length).toBeGreaterThan(0);
      expect(detail.body.data.seatMap.cabinLayout.ECONOMY.colsLeft).toEqual([
        'A',
        'B',
      ]);
      expect(detail.body.data.seatMap.seats.length).toBe(24);

      const seatMap = await request(app.getHttpServer())
        .get(`/flights/aircraft-definitions/${id}/seat-map`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(seatMap.status).toBe(200);
      expect(seatMap.body.data).toEqual(detail.body.data.seatMap);

      const put = await request(app.getHttpServer())
        .put(`/flights/aircraft-definitions/${id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(payload({ code: created.body.data.code, title: 'PUT شد' }));
      expect(put.status).toBe(200);
      expect(put.body.data.version).toBe(2);
      expect(put.body.data.title).toBe('PUT شد');

      const patch = await request(app.getHttpServer())
        .patch(`/flights/aircraft-definitions/${id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(payload({ code: created.body.data.code, title: 'PATCH شد' }));
      expect(patch.status).toBe(200);
      expect(patch.body.data.version).toBe(3);
      expect(patch.body.data.title).toBe('PATCH شد');

      // Same underlying row as the legacy /flights/aircraft/:id path.
      const legacyDetail = await request(app.getHttpServer())
        .get(`/flights/aircraft/${id}`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(legacyDetail.body.data.title).toBe('PATCH شد');
      expect(legacyDetail.body.data.version).toBe(3);
    });

    it('an aircraft created via the legacy /flights/aircraft path is reachable via /flights/aircraft-definitions/:id', async () => {
      const { accessToken } = await loginAs(app, 'comm');
      const created = await request(app.getHttpServer())
        .post('/flights/aircraft')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(payload());
      const viaAlias = await request(app.getHttpServer())
        .get(`/flights/aircraft-definitions/${created.body.data.id}`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(viaAlias.status).toBe(200);
      expect(viaAlias.body.data.code).toBe(created.body.data.code);
    });
  });
});
