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
import { Passenger } from '../src/database/entities/passenger.entity';
import { encryptPii } from '../src/common/pii-crypto';
import {
  NIRA_PROVIDER,
  type NiraManifestPassenger,
  type NiraProvider,
} from '../src/common/nira/nira-provider.interface';
import { loginAs } from './helpers/login.helper';

class SpyNiraProvider implements NiraProvider {
  success = true;
  calls: {
    flightNo: string;
    departureAt: Date;
    passengers: NiraManifestPassenger[];
  }[] = [];

  submitManifest(
    flightNo: string,
    departureAt: Date,
    passengers: NiraManifestPassenger[],
  ) {
    this.calls.push({ flightNo, departureAt, passengers });
    return Promise.resolve({ success: this.success });
  }
}

describe('Flightops (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let spyNira: SpyNiraProvider;

  beforeEach(async () => {
    spyNira = new SpyNiraProvider();
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(NIRA_PROVIDER)
      .useValue(spyNira)
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

  function auth(token: string | null | undefined) {
    return `Bearer ${token}`;
  }

  function uniqueFlightNo() {
    return `FO-${Date.now().toString(36).toUpperCase().slice(-5)}`;
  }

  async function createInstance(hoursToDeparture: number) {
    const flightRepo = dataSource.getRepository(Flight);
    const flight = await flightRepo.createQueryBuilder('f').getOneOrFail();
    const flightNo = uniqueFlightNo();
    const departureAt = new Date(Date.now() + hoursToDeparture * 3_600_000);
    const createdFlight = await flightRepo.save(
      flightRepo.create({
        flightNo,
        routeId: flight.routeId,
        aircraftType: flight.aircraftType,
      }),
    );
    const instanceRepo = dataSource.getRepository(FlightInstance);
    return instanceRepo.save(
      instanceRepo.create({
        flightId: createdFlight.id,
        departureAt,
        arrivalAt: new Date(departureAt.getTime() + 3 * 3_600_000),
        capacity: 100,
        status: 'SCHEDULED',
      }),
    );
  }

  async function addSoldPassenger(
    flightInstanceId: string,
    overrides?: { fullName?: string; nationalId?: string; seatCode?: string },
  ) {
    const bookingRepo = dataSource.getRepository(Booking);
    const booking = await bookingRepo.save(
      bookingRepo.create({
        pnr: `FT${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
        flightInstanceId,
        channel: 'SYSTEM',
        status: 'TICKETED',
        priceIrr: 30_000_000n,
      }),
    );
    const passengerRepo = dataSource.getRepository(Passenger);
    return passengerRepo.save(
      passengerRepo.create({
        bookingId: booking.id,
        fullName: overrides?.fullName ?? 'علی رضایی',
        nationalIdEnc: encryptPii(overrides?.nationalId ?? '0012345678'),
        seatCode: overrides?.seatCode ?? '12A',
      }),
    );
  }

  // ── Role gate ───────────────────────────────────────────────────────

  it('403s for a role outside the flightops set (SENIOR_MANAGER, EMPLOYEE)', async () => {
    const senior = await loginAs(app, 'senior');
    const seniorRes = await request(app.getHttpServer())
      .get('/flightops')
      .set('Authorization', auth(senior.accessToken));
    expect(seniorRes.status).toBe(403);

    const employee = await loginAs(app, 'com.ahmadi');
    const employeeRes = await request(app.getHttpServer())
      .get('/flightops')
      .set('Authorization', auth(employee.accessToken));
    expect(employeeRes.status).toBe(403);
  });

  it('200s for SITE_ADMIN / FINANCE / COMMERCIAL; CEO is outside the set', async () => {
    for (const username of ['site.admin', 'finance', 'comm']) {
      const { accessToken } = await loginAs(app, username);
      const res = await request(app.getHttpServer())
        .get('/flightops')
        .set('Authorization', auth(accessToken));
      expect(res.status).toBe(200);
    }
    const ceo = await loginAs(app, 'ceo');
    const ceoRes = await request(app.getHttpServer())
      .get('/flightops')
      .set('Authorization', auth(ceo.accessToken));
    expect(ceoRes.status).toBe(403);
  });

  // ── List: KPIs + auto-close + نیرا materialization ────────────────────

  it('closes and submits to نیرا automatically once within 4h of departure', async () => {
    const instance = await createInstance(3); // within the 4h window
    await addSoldPassenger(instance.id, {
      fullName: 'سارا احمدی',
      nationalId: '0019876543',
      seatCode: '4C',
    });

    const { accessToken } = await loginAs(app, 'site.admin');
    const res = await request(app.getHttpServer())
      .get('/flightops')
      .set('Authorization', auth(accessToken));
    expect(res.status).toBe(200);

    const row = res.body.data.rows.find(
      (r: { id: string }) => r.id === instance.id,
    );
    expect(row).toBeDefined();
    expect(row.closed).toBe(true);
    expect(row.niraSubmittedAt).not.toBeNull();
    expect(row.sold).toBe(1);

    expect(spyNira.calls).toHaveLength(1);
    expect(spyNira.calls[0].passengers).toEqual([
      { fullName: 'سارا احمدی', nationalId: '0019876543', seatCode: '4C' },
    ]);

    const updated = await dataSource
      .getRepository(FlightInstance)
      .createQueryBuilder('fi')
      .where('fi.id = :id', { id: instance.id })
      .getOneOrFail();
    expect(updated.niraSubmittedAt).not.toBeNull();
  });

  it('leaves an instance well outside the window open, with no نیرا submission', async () => {
    const instance = await createInstance(48);
    const { accessToken } = await loginAs(app, 'site.admin');
    const res = await request(app.getHttpServer())
      .get('/flightops')
      .set('Authorization', auth(accessToken));

    const row = res.body.data.rows.find(
      (r: { id: string }) => r.id === instance.id,
    );
    expect(row.closed).toBe(false);
    expect(row.niraSubmittedAt).toBeNull();
    expect(spyNira.calls).toHaveLength(0);
  });

  it('submitting twice is a no-op — provider called once, timestamp unchanged', async () => {
    const instance = await createInstance(2);
    const { accessToken } = await loginAs(app, 'site.admin');

    const first = await request(app.getHttpServer())
      .get(`/flightops/${instance.id}`)
      .set('Authorization', auth(accessToken));
    const firstTimestamp = first.body.data.niraSubmittedAt;
    expect(firstTimestamp).not.toBeNull();
    expect(spyNira.calls).toHaveLength(1);

    const second = await request(app.getHttpServer())
      .get(`/flightops/${instance.id}`)
      .set('Authorization', auth(accessToken));
    expect(second.body.data.niraSubmittedAt).toBe(firstTimestamp);
    expect(spyNira.calls).toHaveLength(1);
  });

  it('keeps failed automatic submission retryable and exposes a SITE_ADMIN manual retry', async () => {
    const instance = await createInstance(2);
    spyNira.success = false;
    const { accessToken } = await loginAs(app, 'site.admin');

    const automatic = await request(app.getHttpServer())
      .get(`/flightops/${instance.id}`)
      .set('Authorization', auth(accessToken));
    expect(automatic.status).toBe(200);
    expect(automatic.body.data.niraSubmittedAt).toBeNull();
    expect(spyNira.calls).toHaveLength(1);

    const failedRetry = await request(app.getHttpServer())
      .post(`/flightops/${instance.id}/nira-submit`)
      .set('Authorization', auth(accessToken));
    expect(failedRetry.status).toBe(502);

    spyNira.success = true;
    const successfulRetry = await request(app.getHttpServer())
      .post(`/flightops/${instance.id}/nira-submit`)
      .set('Authorization', auth(accessToken));
    expect(successfulRetry.status).toBe(201);
    expect(successfulRetry.body.data.niraSubmittedAt).toBeTruthy();
  });

  it('GET /flightops: real KPIs reconciling with rows, SCHEDULED-only, soonest-first', async () => {
    const closedInstance = await createInstance(1);
    const openInstance = await createInstance(72);
    await addSoldPassenger(closedInstance.id);
    await addSoldPassenger(openInstance.id);
    await addSoldPassenger(openInstance.id);

    const { accessToken } = await loginAs(app, 'site.admin');
    const res = await request(app.getHttpServer())
      .get('/flightops')
      .set('Authorization', auth(accessToken));

    const rows = res.body.data.rows as {
      id: string;
      sold: number;
      closed: boolean;
    }[];
    const closedRow = rows.find((r) => r.id === closedInstance.id)!;
    const openRow = rows.find((r) => r.id === openInstance.id)!;
    expect(closedRow.sold).toBe(1);
    expect(openRow.sold).toBe(2);

    const kpis = res.body.data.kpis;
    expect(kpis.total).toBe(rows.length);
    expect(kpis.open).toBe(rows.filter((r) => !r.closed).length);
    expect(kpis.closed).toBe(rows.filter((r) => r.closed).length);
    expect(kpis.soldTotal).toBe(rows.reduce((a, r) => a + r.sold, 0));

    const idxClosed = rows.findIndex((r) => r.id === closedInstance.id);
    const idxOpen = rows.findIndex((r) => r.id === openInstance.id);
    expect(idxClosed).toBeLessThan(idxOpen);
  });

  // ── Detail: manifest ────────────────────────────────────────────────

  it('GET /flightops/:id: real manifest with decrypted national IDs, only sold passengers', async () => {
    const instance = await createInstance(1);
    const sold = await addSoldPassenger(instance.id, {
      fullName: 'محمد کاظمی',
      nationalId: '0011122233',
      seatCode: '7B',
    });
    // A HELD (non-sold) booking must NOT appear in the manifest.
    const bookingRepo = dataSource.getRepository(Booking);
    const heldBooking = await bookingRepo.save(
      bookingRepo.create({
        pnr: `FT${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
        flightInstanceId: instance.id,
        channel: 'SYSTEM',
        status: 'HELD',
        priceIrr: 30_000_000n,
        holdExpiresAt: new Date(Date.now() + 600_000),
      }),
    );
    const passengerRepo = dataSource.getRepository(Passenger);
    await passengerRepo.save(
      passengerRepo.create({
        bookingId: heldBooking.id,
        fullName: 'رزرو نشده',
        nationalIdEnc: encryptPii('0099988877'),
        seatCode: '9C',
      }),
    );

    const { accessToken } = await loginAs(app, 'site.admin');
    const res = await request(app.getHttpServer())
      .get(`/flightops/${instance.id}`)
      .set('Authorization', auth(accessToken));
    expect(res.status).toBe(200);
    expect(res.body.data.manifest).toHaveLength(1);
    expect(res.body.data.manifest[0]).toEqual({
      fullName: 'محمد کاظمی',
      nationalId: '0011122233',
      seatCode: '7B',
      pnr: expect.any(String),
    });

    const dbRow = await dataSource
      .getRepository(Passenger)
      .findOneByOrFail({ id: sold.id });
    expect(dbRow.nationalIdEnc).not.toBe('0011122233');
    expect(dbRow.nationalIdEnc).toContain('.');
  });

  it('404 for a missing or CANCELLED instance', async () => {
    const { accessToken } = await loginAs(app, 'site.admin');
    const missingRes = await request(app.getHttpServer())
      .get(`/flightops/${crypto.randomUUID()}`)
      .set('Authorization', auth(accessToken));
    expect(missingRes.status).toBe(404);

    const cancelled = await createInstance(72);
    await dataSource
      .createQueryBuilder()
      .update(FlightInstance)
      .set({ status: 'CANCELLED' })
      .where('id = :id', { id: cancelled.id })
      .execute();
    const cancelledRes = await request(app.getHttpServer())
      .get(`/flightops/${cancelled.id}`)
      .set('Authorization', auth(accessToken));
    expect(cancelledRes.status).toBe(404);
  });
});
