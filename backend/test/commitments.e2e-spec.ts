import { INestApplication } from '@nestjs/common';
import * as crypto from 'node:crypto';
import * as argon2 from 'argon2';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { dataSourceOptions } from '../src/database/data-source.options';
import { AgencyProfile } from '../src/database/entities/agency-profile.entity';
import { AircraftSeatMap } from '../src/database/entities/aircraft-seat-map.entity';
import { AuditLog } from '../src/database/entities/audit-log.entity';
import { Flight } from '../src/database/entities/flight.entity';
import { FlightInstance } from '../src/database/entities/flight-instance.entity';
import { LedgerEntry } from '../src/database/entities/ledger-entry.entity';
import { Route } from '../src/database/entities/route.entity';
import { User } from '../src/database/entities/user.entity';
import { RedisService } from '../src/redis/redis.service';
import { loginAs, loginAsCustomer } from './helpers/login.helper';
import { createTestApp } from './helpers/app.helper';

const AIRCRAFT_TYPE = 'CMT-TestJet';

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
  const existing = await repo.findOneBy({ originCode: 'THR', destCode: 'KER' });
  if (existing) return existing;
  return repo.save(
    repo.create({ originCode: 'THR', destCode: 'KER', durationMin: 90 }),
  );
}

async function upsertFlight(ds: DataSource, routeId: string) {
  const repo = ds.getRepository(Flight);
  const existing = await repo.findOneBy({ flightNo: 'CE-100' });
  if (existing) return existing;
  return repo.save(
    repo.create({ flightNo: 'CE-100', routeId, aircraftType: AIRCRAFT_TYPE }),
  );
}

describe('Charter / agency seat commitments (e2e)', () => {
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

  /** 2 BUSINESS + 6 ECONOMY seats, matching the seat map above; capacity
   * math in commitments.service.ts / search.service.ts / booking.service.ts
   * reads cabinCapacities, not the physical seat map, as the primary cap. */
  async function freshInstance(daysAhead = 50) {
    const departureAt = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
    const repo = dataSource.getRepository(FlightInstance);
    return repo.save(
      repo.create({
        flightId,
        departureAt,
        arrivalAt: new Date(departureAt.getTime() + 90 * 60 * 1000),
        capacity: 8,
        status: 'SCHEDULED',
        cabinCapacities: [
          { cabin: 'BUSINESS', seats: 2 },
          { cabin: 'ECONOMY', seats: 6 },
        ],
      }),
    );
  }

  const AGENCY_PASSWORD = 'AgencyCommitTest@123';
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
        licenseNo: `AG-CMT-${suffix}`,
        managerName: 'مدیر آژانس تست',
        phone,
        email: `${suffix}@cmt.test.example`,
        city: 'تهران',
        address: 'آدرس تست',
        tier: 'NORMAL',
      }),
    );
    return user;
  }

  it('creates a charter commitment (no agencyId): 201, ACTIVE, real LedgerEntry(COMMITMENT) and AuditLog rows', async () => {
    const { accessToken } = await loginAs(app, 'comm');
    const instance = await freshInstance();

    const res = await request(app.getHttpServer())
      .post(`/flights/${instance.id}/commitments`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ cabin: 'BUSINESS', seats: 1, contractPriceIrr: '500000000' });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('ACTIVE');
    expect(res.body.data.seats).toBe(1);
    expect(res.body.data.type).toBe('CHARTER');

    const ledger = await dataSource
      .getRepository(LedgerEntry)
      .createQueryBuilder('l')
      .where('l.type = :type', { type: 'COMMITMENT' })
      .andWhere('l.signedAmountIrr = :amt', { amt: '500000000' })
      .getOne();
    expect(ledger).not.toBeNull();

    const audit = await dataSource
      .getRepository(AuditLog)
      .createQueryBuilder('a')
      .where('a.entityType = :t', { t: 'CharterCommitment' })
      .andWhere('a.entityId = :id', { id: res.body.data.id })
      .getOne();
    expect(audit).not.toBeNull();
  });

  it('creates an agency commitment (agencyId present) — response includes agencyId/cabin/seats/startDate/releaseAt/contractPriceIrr/status; enriched with agency name/license in the list endpoint', async () => {
    const { accessToken } = await loginAs(app, 'comm');
    const instance = await freshInstance();
    const agency = await createFreshAgency();
    const startDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const releaseAt = new Date(
      instance.departureAt.getTime() - 24 * 60 * 60 * 1000,
    ).toISOString();

    const res = await request(app.getHttpServer())
      .post(`/flights/${instance.id}/commitments`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        agencyId: agency.id,
        cabin: 'BUSINESS',
        seats: 1,
        contractPriceIrr: '300000000',
        startDate,
        releaseAt,
      });
    expect(res.status).toBe(201);
    expect(res.body.data.type).toBe('AGENCY');
    expect(res.body.data).toMatchObject({
      agencyId: agency.id,
      cabin: 'BUSINESS',
      seats: 1,
      contractPriceIrr: '300000000',
      status: 'ACTIVE',
    });
    expect(new Date(res.body.data.startDate).toISOString()).toBe(startDate);
    expect(new Date(res.body.data.releaseAt).toISOString()).toBe(releaseAt);

    const list = await request(app.getHttpServer())
      .get(`/flights/${instance.id}/commitments`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(list.status).toBe(200);
    expect(list.body.data.agency).toHaveLength(1);
    expect(list.body.data.agency[0].agencyName).toBe('مدیر آژانس تست');
    expect(list.body.data.agency[0].type).toBe('AGENCY');
  });

  it('accepts the endDate alias for releaseAt when releaseAt is omitted', async () => {
    const { accessToken } = await loginAs(app, 'comm');
    const instance = await freshInstance();
    const endDate = new Date(
      instance.departureAt.getTime() - 24 * 60 * 60 * 1000,
    ).toISOString();

    const res = await request(app.getHttpServer())
      .post(`/flights/${instance.id}/commitments`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        cabin: 'BUSINESS',
        seats: 1,
        contractPriceIrr: '500000000',
        endDate,
      });
    expect(res.status).toBe(201);
    expect(new Date(res.body.data.releaseAt).toISOString()).toBe(endDate);
  });

  it('capacity summary reflects charter + agency commitments and availableOnline', async () => {
    const { accessToken } = await loginAs(app, 'comm');
    const instance = await freshInstance();
    const agency = await createFreshAgency();

    await request(app.getHttpServer())
      .post(`/flights/${instance.id}/commitments`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ cabin: 'BUSINESS', seats: 1, contractPriceIrr: '500000000' });
    await request(app.getHttpServer())
      .post(`/flights/${instance.id}/commitments`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        agencyId: agency.id,
        cabin: 'BUSINESS',
        seats: 1,
        contractPriceIrr: '300000000',
      });

    const summary = await request(app.getHttpServer())
      .get(`/flights/${instance.id}/commitments/summary`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(summary.status).toBe(200);
    const business = summary.body.data.cabins.find(
      (c: { cabin: string }) => c.cabin === 'BUSINESS',
    );
    expect(business).toMatchObject({
      totalCapacity: 2,
      charterCommitted: 1,
      agencyCommitted: 1,
      sold: 0,
      availableOnline: 0,
    });
  });

  it('rejects a commitment exceeding remaining cabin capacity with 409', async () => {
    const { accessToken } = await loginAs(app, 'comm');
    const instance = await freshInstance();

    const first = await request(app.getHttpServer())
      .post(`/flights/${instance.id}/commitments`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ cabin: 'BUSINESS', seats: 2, contractPriceIrr: '500000000' });
    expect(first.status).toBe(201);

    const second = await request(app.getHttpServer())
      .post(`/flights/${instance.id}/commitments`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ cabin: 'BUSINESS', seats: 1, contractPriceIrr: '500000000' });
    expect(second.status).toBe(409);
  });

  it('rejects a commitment period ending after the flight departs with 400', async () => {
    const { accessToken } = await loginAs(app, 'comm');
    const instance = await freshInstance();

    const res = await request(app.getHttpServer())
      .post(`/flights/${instance.id}/commitments`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        cabin: 'BUSINESS',
        seats: 1,
        contractPriceIrr: '500000000',
        releaseAt: new Date(
          instance.departureAt.getTime() + 24 * 60 * 60 * 1000,
        ).toISOString(),
      });
    expect(res.status).toBe(400);
  });

  it('idempotencyKey replay returns the same row instead of creating a duplicate', async () => {
    const { accessToken } = await loginAs(app, 'comm');
    const instance = await freshInstance();
    const idempotencyKey = crypto.randomUUID();

    const first = await request(app.getHttpServer())
      .post(`/flights/${instance.id}/commitments`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        cabin: 'BUSINESS',
        seats: 1,
        contractPriceIrr: '500000000',
        idempotencyKey,
      });
    const second = await request(app.getHttpServer())
      .post(`/flights/${instance.id}/commitments`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        cabin: 'BUSINESS',
        seats: 1,
        contractPriceIrr: '500000000',
        idempotencyKey,
      });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.data.id).toBe(first.body.data.id);

    const summary = await request(app.getHttpServer())
      .get(`/flights/${instance.id}/commitments/summary`)
      .set('Authorization', `Bearer ${accessToken}`);
    const business = summary.body.data.cabins.find(
      (c: { cabin: string }) => c.cabin === 'BUSINESS',
    );
    expect(business.charterCommitted).toBe(1);
  });

  it('cancels a commitment via DELETE /commitments/:id (idempotent, works for both charter and agency) and frees its capacity back up', async () => {
    const { accessToken } = await loginAs(app, 'comm');
    const instance = await freshInstance();
    const agency = await createFreshAgency();

    const charterCreated = await request(app.getHttpServer())
      .post(`/flights/${instance.id}/commitments`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ cabin: 'BUSINESS', seats: 1, contractPriceIrr: '500000000' });
    expect(charterCreated.status).toBe(201);
    const agencyCreated = await request(app.getHttpServer())
      .post(`/flights/${instance.id}/commitments`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        agencyId: agency.id,
        cabin: 'BUSINESS',
        seats: 1,
        contractPriceIrr: '300000000',
      });
    expect(agencyCreated.status).toBe(201);

    const cancelCharter = await request(app.getHttpServer())
      .delete(
        `/flights/${instance.id}/commitments/${charterCreated.body.data.id}`,
      )
      .set('Authorization', `Bearer ${accessToken}`);
    expect(cancelCharter.status).toBe(200);
    expect(cancelCharter.body.data.status).toBe('CANCELLED');

    const cancelAgain = await request(app.getHttpServer())
      .delete(
        `/flights/${instance.id}/commitments/${charterCreated.body.data.id}`,
      )
      .set('Authorization', `Bearer ${accessToken}`);
    expect(cancelAgain.status).toBe(200);
    expect(cancelAgain.body.data.status).toBe('CANCELLED');

    const cancelAgency = await request(app.getHttpServer())
      .delete(
        `/flights/${instance.id}/commitments/${agencyCreated.body.data.id}`,
      )
      .set('Authorization', `Bearer ${accessToken}`);
    expect(cancelAgency.status).toBe(200);
    expect(cancelAgency.body.data.status).toBe('CANCELLED');

    const summary = await request(app.getHttpServer())
      .get(`/flights/${instance.id}/commitments/summary`)
      .set('Authorization', `Bearer ${accessToken}`);
    const business = summary.body.data.cabins.find(
      (c: { cabin: string }) => c.cabin === 'BUSINESS',
    );
    expect(business.charterCommitted).toBe(0);
    expect(business.agencyCommitted).toBe(0);
    expect(business.availableOnline).toBe(2);
  });

  it('DELETE on an unknown commitment id returns 404', async () => {
    const { accessToken } = await loginAs(app, 'comm');
    const instance = await freshInstance();
    const res = await request(app.getHttpServer())
      .delete(`/flights/${instance.id}/commitments/${crypto.randomUUID()}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(404);
  });

  it('non-manager roles get 403 on commitment endpoints', async () => {
    const { accessToken } = await loginAs(app, 'finance');
    const instance = await freshInstance();
    const res = await request(app.getHttpServer())
      .post(`/flights/${instance.id}/commitments`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ cabin: 'BUSINESS', seats: 1, contractPriceIrr: '500000000' });
    expect(res.status).toBe(403);
  });

  it('exactly one of two concurrent commitments for the last seat succeeds (row-locked capacity check)', async () => {
    const { accessToken } = await loginAs(app, 'comm');
    const instance = await freshInstance();
    const agency = await createFreshAgency();

    const [a, b] = await Promise.all([
      request(app.getHttpServer())
        .post(`/flights/${instance.id}/commitments`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ cabin: 'BUSINESS', seats: 2, contractPriceIrr: '500000000' }),
      request(app.getHttpServer())
        .post(`/flights/${instance.id}/commitments`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          agencyId: agency.id,
          cabin: 'BUSINESS',
          seats: 2,
          contractPriceIrr: '500000000',
        }),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);
  });

  it('reduces online search seatsLeft by the active committed amount', async () => {
    const { accessToken } = await loginAs(app, 'comm');
    const instance = await freshInstance();
    await request(app.getHttpServer())
      .post(`/flights/${instance.id}/commitments`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ cabin: 'BUSINESS', seats: 1, contractPriceIrr: '500000000' });

    const date = instance.departureAt.toISOString().slice(0, 10);
    // Search results are cached 5-10min by route/date (CLAUDE.md); other
    // test runs against the same THR-KER route/date within the TTL would
    // otherwise serve a stale list missing this test's fresh instance.
    await app
      .get(RedisService)
      .del(`search:flights:THR:KER:${date}:BUSINESS`);
    const res = await request(app.getHttpServer())
      .get('/search/flights')
      .query({ origin: 'THR', dest: 'KER', date, cabin: 'BUSINESS' });
    expect(res.status).toBe(200);
    const row = res.body.data.find(
      (r: { flightInstanceId: string }) => r.flightInstanceId === instance.id,
    );
    expect(row).toBeDefined();
    const business = row.cabins.find(
      (c: { cabin: string }) => c.cabin === 'BUSINESS',
    );
    expect(business.seatsLeft).toBe(1); // 2 physical - 1 committed
  });

  it('concurrent commitment creation and real seat booking never over-allocate the same cabin', async () => {
    const { accessToken: comm } = await loginAs(app, 'comm');
    const instance = await freshInstance();
    // 1 seat already sold in BUSINESS (physical seat "1C"), leaving 1
    // physical seat ("1A") and full cabinCapacities headroom of 2.
    const { accessToken: buyerToken } = await loginAsCustomer(
      app,
      '09130000601',
    );
    const sold = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({
        flightInstanceId: instance.id,
        cabin: 'BUSINESS',
        passengers: [{ fullName: 'مسافر واقعی', seatCode: '1C' }],
      });
    expect(sold.status).toBe(201);

    // A commitment for the remaining 2 seats of cabinCapacities (still
    // configured at 2, independent of physical sales) is over capacity by
    // configuration alone (2 committed > 2 total is fine, but exceeding
    // the physical-seat ceiling of 1 remaining seat is not) — only 1
    // physical BUSINESS seat is left, so a 2-seat commitment must 409.
    const commit = await request(app.getHttpServer())
      .post(`/flights/${instance.id}/commitments`)
      .set('Authorization', `Bearer ${comm}`)
      .send({ cabin: 'BUSINESS', seats: 2, contractPriceIrr: '500000000' });
    expect(commit.status).toBe(409);

    const commitOk = await request(app.getHttpServer())
      .post(`/flights/${instance.id}/commitments`)
      .set('Authorization', `Bearer ${comm}`)
      .send({ cabin: 'BUSINESS', seats: 1, contractPriceIrr: '500000000' });
    expect(commitOk.status).toBe(201);
  });

  it('blocks a SYSTEM (public) booking from consuming fully-committed cabin capacity: 409 POOL_EXHAUSTED', async () => {
    const { accessToken: comm } = await loginAs(app, 'comm');
    const instance = await freshInstance();
    const commit = await request(app.getHttpServer())
      .post(`/flights/${instance.id}/commitments`)
      .set('Authorization', `Bearer ${comm}`)
      .send({ cabin: 'BUSINESS', seats: 2, contractPriceIrr: '500000000' });
    expect(commit.status).toBe(201);

    const { accessToken } = await loginAsCustomer(app, '09130000501');
    const res = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        flightInstanceId: instance.id,
        cabin: 'BUSINESS',
        passengers: [{ fullName: 'مسافر تعهد', seatCode: '1A' }],
      });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('POOL_EXHAUSTED');
  });
});
