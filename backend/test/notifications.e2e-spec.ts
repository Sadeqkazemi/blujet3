import { INestApplication } from '@nestjs/common';
import * as crypto from 'node:crypto';
import * as argon2 from 'argon2';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { dataSourceOptions } from '../src/database/data-source.options';
import { AgencyProfile } from '../src/database/entities/agency-profile.entity';
import { AircraftSeatMap } from '../src/database/entities/aircraft-seat-map.entity';
import { Flight } from '../src/database/entities/flight.entity';
import { FlightInstance } from '../src/database/entities/flight-instance.entity';
import { Notification } from '../src/database/entities/notification.entity';
import { Route } from '../src/database/entities/route.entity';
import { User } from '../src/database/entities/user.entity';
import { loginAs } from './helpers/login.helper';
import { createTestApp } from './helpers/app.helper';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { TWO_FACTOR_PROVIDER } from '../src/modules/auth/providers/two-factor-provider.interface';
import { MockTwoFactorProvider } from '../src/modules/auth/providers/mock-two-factor.provider';

const AIRCRAFT_TYPE = 'NTF-TestJet';

async function upsertSeatMap(ds: DataSource) {
  const repo = ds.getRepository(AircraftSeatMap);
  const existing = await repo.findOneBy({ aircraftType: AIRCRAFT_TYPE });
  if (existing) return existing;
  return repo.save(
    repo.create({
      aircraftType: AIRCRAFT_TYPE,
      businessRowStart: 1,
      businessRowEnd: 1,
      businessColsLeft: ['A'],
      businessColsRight: ['C'],
      economyRowStart: 2,
      economyRowEnd: 4,
      economyColsLeft: ['A', 'B'],
      economyColsRight: ['C'],
      updatedAt: new Date(),
    }),
  );
}

async function upsertRoute(ds: DataSource) {
  const repo = ds.getRepository(Route);
  const existing = await repo.findOneBy({ originCode: 'THR', destCode: 'ISF' });
  if (existing) return existing;
  return repo.save(
    repo.create({ originCode: 'THR', destCode: 'ISF', durationMin: 60 }),
  );
}

async function upsertFlight(ds: DataSource, routeId: string) {
  const repo = ds.getRepository(Flight);
  const existing = await repo.findOneBy({ flightNo: 'NT-100' });
  if (existing) return existing;
  return repo.save(
    repo.create({ flightNo: 'NT-100', routeId, aircraftType: AIRCRAFT_TYPE }),
  );
}

describe('Notifications (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let flightId: string;

  beforeAll(async () => {
    const setupDataSource = new DataSource(dataSourceOptions);
    await setupDataSource.initialize();
    await upsertSeatMap(setupDataSource);
    const route = await upsertRoute(setupDataSource);
    const flight = await upsertFlight(setupDataSource, route.id);
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

  async function freshInstance(daysAhead = 60) {
    const departureAt = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
    const repo = dataSource.getRepository(FlightInstance);
    return repo.save(
      repo.create({
        flightId,
        departureAt,
        arrivalAt: new Date(departureAt.getTime() + 60 * 60 * 1000),
        capacity: 8,
        status: 'SCHEDULED',
        cabinCapacities: [
          { cabin: 'BUSINESS', seats: 2 },
          { cabin: 'ECONOMY', seats: 6 },
        ],
      }),
    );
  }

  const AGENCY_PASSWORD = 'AgencyNotifyTest@123';
  async function createFreshAgency() {
    const suffix = crypto.randomUUID().slice(0, 8);
    const phone = `+9891${crypto.randomInt(10_000_000, 100_000_000)}`;
    const passwordHash = await argon2.hash(AGENCY_PASSWORD);
    const userRepo = dataSource.getRepository(User);
    const user = await userRepo.save(
      userRepo.create({
        role: 'AGENCY',
        phone,
        fullName: `آژانس تست ${suffix}`,
        passwordHash,
        isActive: true,
        updatedAt: new Date(),
      }),
    );
    await dataSource.getRepository(AgencyProfile).save(
      dataSource.getRepository(AgencyProfile).create({
        userId: user.id,
        licenseNo: `AG-NTF-${suffix}`,
        managerName: 'مدیر آژانس تست',
        phone,
        email: `${suffix}@ntf.test.example`,
        city: 'تهران',
        address: 'آدرس تست',
        tier: 'NORMAL',
      }),
    );
    return { user, phone };
  }

  /** Local/test runs with AUTH_SANDBOX_ENABLED=true (see .env), so agency
   * login always issues a 2FA challenge first — complete it the same way
   * helpers/login.helper.ts's loginAs() does for staff. `userId` is the
   * caller's own already-known id (from createFreshAgency()), so this
   * never needs to re-derive it from the phone string. */
  async function loginAsAgencyUser(
    userId: string,
    phone: string,
    password = AGENCY_PASSWORD,
  ) {
    const loginRes = await request(app.getHttpServer())
      .post('/auth/agency/login')
      .send({ phone, password });
    const challengeId = loginRes.body?.data?.challengeId as string | undefined;
    if (!challengeId) {
      // Non-sandbox environments issue tokens directly.
      return {
        loginRes,
        accessToken: loginRes.body?.data?.accessToken as string | undefined,
      };
    }
    const twoFactor = app.get<MockTwoFactorProvider>(TWO_FACTOR_PROVIDER);
    const code = twoFactor.getLastCode(userId);
    if (!code) throw new Error(`No 2FA code recorded for agency ${phone}`);
    const verifyRes = await request(app.getHttpServer())
      .post('/auth/agency/login/verify')
      .send({ challengeId, code });
    return {
      loginRes,
      verifyRes,
      accessToken: verifyRes.body?.data?.accessToken as string | undefined,
    };
  }

  it('service-level: notify() with the same dedupeKey never creates a duplicate row (retry-safe)', async () => {
    const notifications = app.get(NotificationsService);
    const recipientId = crypto.randomUUID();
    const dedupeKey = `test:${crypto.randomUUID()}`;

    const first = await notifications.notify({
      recipientId,
      category: 'SYSTEM',
      action: 'CREATED',
      title: 'تست',
      dedupeKey,
    });
    const second = await notifications.notify({
      recipientId,
      category: 'SYSTEM',
      action: 'CREATED',
      title: 'تست (تلاش دوم — همان رویداد)',
      dedupeKey,
    });
    expect(second.id).toBe(first.id);
    expect(second.title).toBe('تست'); // original row, not overwritten

    const count = await dataSource
      .getRepository(Notification)
      .createQueryBuilder('n')
      .where('n.dedupeKey = :key', { key: dedupeKey })
      .getCount();
    expect(count).toBe(1);
  });

  it('creating an agency commitment notifies the agency (APPROVAL) — unread-count reflects it, mark-read clears it, re-marking is idempotent', async () => {
    const { accessToken: comm } = await loginAs(app, 'comm');
    const instance = await freshInstance();
    const { user: agencyUser, phone } = await createFreshAgency();

    const create = await request(app.getHttpServer())
      .post(`/flights/${instance.id}/commitments`)
      .set('Authorization', `Bearer ${comm}`)
      .send({
        agencyId: agencyUser.id,
        cabin: 'BUSINESS',
        seats: 1,
        contractPriceIrr: '400000000',
      });
    expect(create.status).toBe(201);

    const { accessToken: agencyToken } = await loginAsAgencyUser(
      agencyUser.id,
      phone,
    );

    const unread1 = await request(app.getHttpServer())
      .get('/notifications/unread-count')
      .set('Authorization', `Bearer ${agencyToken}`);
    expect(unread1.status).toBe(200);
    expect(unread1.body.data.APPROVAL).toBe(1);
    expect(unread1.body.data.total).toBe(1);

    const list = await request(app.getHttpServer())
      .get('/notifications')
      .set('Authorization', `Bearer ${agencyToken}`);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].category).toBe('APPROVAL');
    expect(list.body.data[0].action).toBe('CREATED');
    expect(list.body.data[0].readAt).toBeNull();
    const notificationId = list.body.data[0].id as string;

    const markRead = await request(app.getHttpServer())
      .patch(`/notifications/${notificationId}/read`)
      .set('Authorization', `Bearer ${agencyToken}`);
    expect(markRead.status).toBe(200);
    expect(markRead.body.data.readAt).not.toBeNull();

    const markReadAgain = await request(app.getHttpServer())
      .patch(`/notifications/${notificationId}/read`)
      .set('Authorization', `Bearer ${agencyToken}`);
    expect(markReadAgain.status).toBe(200); // idempotent, no error

    const unread2 = await request(app.getHttpServer())
      .get('/notifications/unread-count')
      .set('Authorization', `Bearer ${agencyToken}`);
    expect(unread2.body.data.APPROVAL).toBe(0);
    expect(unread2.body.data.total).toBe(0);
  });

  it('cancelling an agency commitment notifies the agency again (SYSTEM/DELETED) — mark-all-read clears both', async () => {
    const { accessToken: comm } = await loginAs(app, 'comm');
    const instance = await freshInstance();
    const { user: agencyUser, phone } = await createFreshAgency();

    const create = await request(app.getHttpServer())
      .post(`/flights/${instance.id}/commitments`)
      .set('Authorization', `Bearer ${comm}`)
      .send({
        agencyId: agencyUser.id,
        cabin: 'BUSINESS',
        seats: 1,
        contractPriceIrr: '400000000',
      });
    await request(app.getHttpServer())
      .delete(`/flights/${instance.id}/commitments/${create.body.data.id}`)
      .set('Authorization', `Bearer ${comm}`);

    const { accessToken: agencyToken } = await loginAsAgencyUser(
      agencyUser.id,
      phone,
    );
    const unread = await request(app.getHttpServer())
      .get('/notifications/unread-count')
      .set('Authorization', `Bearer ${agencyToken}`);
    expect(unread.body.data.total).toBe(2); // CREATED + CANCELLED
    expect(unread.body.data.APPROVAL).toBe(1);
    expect(unread.body.data.SYSTEM).toBe(1);

    const markAll = await request(app.getHttpServer())
      .patch('/notifications/read-all')
      .set('Authorization', `Bearer ${agencyToken}`);
    expect(markAll.status).toBe(200);
    expect(markAll.body.data.updated).toBe(2);

    const unreadAfter = await request(app.getHttpServer())
      .get('/notifications/unread-count')
      .set('Authorization', `Bearer ${agencyToken}`);
    expect(unreadAfter.body.data.total).toBe(0);
  });

  it('a user only ever sees their own notifications (marking someone else’s id returns 404)', async () => {
    const { accessToken: comm } = await loginAs(app, 'comm');
    const instance = await freshInstance();
    const { user: agencyUser } = await createFreshAgency();
    const { user: strangerAgencyUser, phone: strangerPhone } =
      await createFreshAgency();

    const create = await request(app.getHttpServer())
      .post(`/flights/${instance.id}/commitments`)
      .set('Authorization', `Bearer ${comm}`)
      .send({
        agencyId: agencyUser.id,
        cabin: 'BUSINESS',
        seats: 1,
        contractPriceIrr: '400000000',
      });
    expect(create.status).toBe(201);

    const stranger = await loginAsAgencyUser(
      strangerAgencyUser.id,
      strangerPhone,
    );
    const strangerList = await request(app.getHttpServer())
      .get('/notifications')
      .set('Authorization', `Bearer ${stranger.accessToken}`);
    expect(strangerList.body.data).toHaveLength(0);

    const notification = await dataSource
      .getRepository(Notification)
      .createQueryBuilder('n')
      .where('n.recipientId = :id', { id: agencyUser.id })
      .getOneOrFail();
    const wrongMarkRead = await request(app.getHttpServer())
      .patch(`/notifications/${notification.id}/read`)
      .set('Authorization', `Bearer ${stranger.accessToken}`);
    expect(wrongMarkRead.status).toBe(404);
  });

  it('never delivers flight-creation lifecycle noise to an agency bell', async () => {
    const { user: agencyUser, phone } = await createFreshAgency();
    const notifications = app.get(NotificationsService);
    const managementOnly = await notifications.notify({
      recipientId: agencyUser.id,
      category: 'SYSTEM',
      action: 'FLIGHT_PUBLISHED',
      title: 'پرواز جدید ایجاد شد',
      entityType: 'FlightInstance',
      entityId: crypto.randomUUID(),
      dedupeKey: `test-flight-noise:${crypto.randomUUID()}`,
    });
    const { accessToken } = await loginAsAgencyUser(agencyUser.id, phone);

    const list = await request(app.getHttpServer())
      .get('/notifications')
      .set('Authorization', `Bearer ${accessToken}`);
    const unread = await request(app.getHttpServer())
      .get('/notifications/unread-count')
      .set('Authorization', `Bearer ${accessToken}`);
    const markRead = await request(app.getHttpServer())
      .patch(`/notifications/${managementOnly.id}/read`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(0);
    expect(unread.body.data.total).toBe(0);
    expect(markRead.status).toBe(404);
  });
});
