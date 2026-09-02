import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, IsNull } from 'typeorm';
import { dataSourceOptions } from '../src/database/data-source.options';
import { User } from '../src/database/entities/user.entity';
import { AircraftSeatMap } from '../src/database/entities/aircraft-seat-map.entity';
import { Route } from '../src/database/entities/route.entity';
import { Flight } from '../src/database/entities/flight.entity';
import { FlightInstance } from '../src/database/entities/flight-instance.entity';
import { Passenger } from '../src/database/entities/passenger.entity';
import { Booking } from '../src/database/entities/booking.entity';
import { RefreshToken } from '../src/database/entities/refresh-token.entity';
import { loginAsCustomer } from './helpers/login.helper';
import { createTestApp } from './helpers/app.helper';
import { normalizeIranPhone } from '../src/common/normalize-iran-phone';

const RUN = Date.now().toString().slice(-6);
function phoneFor(n: number): string {
  return `09${RUN}${String(n).padStart(3, '0')}`;
}

describe('Privacy / GDPR export & delete (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let flightId: string;
  const AIRCRAFT_TYPE = 'PR2E-TestJet';

  beforeAll(async () => {
    const setupDataSource = new DataSource(dataSourceOptions);
    await setupDataSource.initialize();

    const seatMapRepo = setupDataSource.getRepository(AircraftSeatMap);
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
          economyColsLeft: ['A', 'B'],
          economyColsRight: ['C'],
          updatedAt: new Date(),
        }),
      );
    }
    const routeRepo = setupDataSource.getRepository(Route);
    let route = await routeRepo.findOneBy({
      originCode: 'THR',
      destCode: 'TBZ',
    });
    if (!route) {
      route = await routeRepo.save(
        routeRepo.create({
          originCode: 'THR',
          destCode: 'TBZ',
          durationMin: 65,
        }),
      );
    }
    const flightRepo = setupDataSource.getRepository(Flight);
    let flight = await flightRepo.findOneBy({ flightNo: 'PR-400' });
    if (!flight) {
      flight = await flightRepo.save(
        flightRepo.create({
          flightNo: 'PR-400',
          routeId: route.id,
          aircraftType: AIRCRAFT_TYPE,
        }),
      );
    }
    flightId = flight.id;

    await setupDataSource.destroy();
  });

  beforeEach(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
  });

  afterEach(async () => {
    await app.close();
  });

  async function freshInstance(daysAhead = 40) {
    const departureAt = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
    const repo = dataSource.getRepository(FlightInstance);
    return repo.save(
      repo.create({
        flightId,
        departureAt,
        arrivalAt: new Date(departureAt.getTime() + 65 * 60 * 1000),
        capacity: 20,
        status: 'SCHEDULED',
      }),
    );
  }

  it('exports the customer’s own bookings, passengers, and account info', async () => {
    const { accessToken } = await loginAsCustomer(app, phoneFor(1));
    const instance = await freshInstance();
    const createRes = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        flightInstanceId: instance.id,
        cabin: 'ECONOMY',
        passengers: [
          {
            fullName: 'مسافر خروجی داده',
            nationalId: '0012345679',
            seatCode: '1A',
          },
        ],
      });
    expect(createRes.status).toBe(201);

    const exportRes = await request(app.getHttpServer())
      .get('/my/privacy/export')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(exportRes.status).toBe(200);
    expect(exportRes.body.data.bookings).toHaveLength(1);
    expect(exportRes.body.data.bookings[0].passengers[0].fullName).toBe(
      'مسافر خروجی داده',
    );
    expect(exportRes.body.data.bookings[0].passengers[0].nationalId).toBe(
      '0012345679',
    );
    // The API stores/returns phone numbers normalized to E.164 everywhere
    // (see normalizeIranPhone) — the export mirrors that, not the raw local
    // format the user typed.
    expect(exportRes.body.data.user.phone).toBe(
      normalizeIranPhone(phoneFor(1)),
    );
  });

  it('rejects export without login', async () => {
    const res = await request(app.getHttpServer()).get('/my/privacy/export');
    expect(res.status).toBe(401);
  });

  it('deletes the account: anonymizes passenger PII, revokes sessions, deactivates the user', async () => {
    const phone = phoneFor(2);
    const { accessToken, userId } = await loginAsCustomer(app, phone);
    const instance = await freshInstance();
    const createRes = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        flightInstanceId: instance.id,
        cabin: 'ECONOMY',
        passengers: [
          {
            fullName: 'مسافر حذف‌شونده',
            nationalId: '0012345679',
            mobile: '09121112233',
            seatCode: '2A',
          },
        ],
      });
    const bookingId = createRes.body.data.id as string;

    const deleteRes = await request(app.getHttpServer())
      .delete('/my/privacy/account')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.data.deleted).toBe(true);

    const user = await dataSource
      .getRepository(User)
      .findOneByOrFail({ id: userId! });
    expect(user.isActive).toBe(false);
    expect(user.deletedAt).not.toBeNull();
    expect(user.phone).toBeNull();
    expect(user.fullName).toBe('کاربر حذف‌شده');

    const passenger = await dataSource
      .getRepository(Passenger)
      .findOneByOrFail({ bookingId });
    expect(passenger.fullName).toBe('کاربر حذف‌شده');
    expect(passenger.nationalIdEnc).toBeNull();
    expect(passenger.mobileEnc).toBeNull();

    const booking = await dataSource
      .getRepository(Booking)
      .createQueryBuilder('b')
      .where('b.id = :id', { id: bookingId })
      .getOneOrFail();
    expect(booking.contactPhone).toBeNull();
    // The booking row itself (financial record) survives — never hard-deleted.
    expect(booking.priceIrr).toBeGreaterThan(0);

    const refreshTokens = await dataSource
      .getRepository(RefreshToken)
      .findBy({ userId: userId!, revokedAt: IsNull() });
    expect(refreshTokens).toHaveLength(0);

    // The deleted account can no longer log in (find-or-create on phone
    // would otherwise reuse this dead account; phone is now null, so a
    // fresh OTP request for the same phone creates a brand-new account).
    const reLoginRes = await request(app.getHttpServer())
      .post('/auth/otp/request')
      .send({ phone });
    expect(reLoginRes.status).toBe(200);
    const newUser = await dataSource
      .getRepository(User)
      .findOneByOrFail({ phone: normalizeIranPhone(phone) });
    expect(newUser.id).not.toBe(userId);
  });
});
