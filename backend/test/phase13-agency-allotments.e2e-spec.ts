import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import request from 'supertest';
import { DataSource, In } from 'typeorm';
import { AgencyAllotment } from '../src/database/entities/agency-allotment.entity';
import { AgencyProfile } from '../src/database/entities/agency-profile.entity';
import { AircraftSeatMap } from '../src/database/entities/aircraft-seat-map.entity';
import { Flight } from '../src/database/entities/flight.entity';
import { FlightInstance } from '../src/database/entities/flight-instance.entity';
import { Route } from '../src/database/entities/route.entity';
import { User } from '../src/database/entities/user.entity';
import { FlightInstanceStatus, Role } from '../src/database/enums';
import { createTestApp } from './helpers/app.helper';
import { loginAs } from './helpers/login.helper';

/** Phase 13 Part C — per-agency allotments: capacity-sum validation
 * against the instance's coarse agencySeatsAllocated cap, SOFT release
 * lazily excluding a rule from that sum, and delete-blocked-by-active-
 * booking (a no-op guard today since nothing creates AGENCY bookings yet
 * — see docs/DB_SCHEMA.md). */
describe('Phase 13 Part C — agency allotments', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  const AIRCRAFT_TYPE = 'P13C-Jet';
  let routeId: string;
  let flightId: string;
  let staffToken: string;
  let agencyUserId: string;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    staffToken = (await loginAs(app, 'senior')).accessToken!;

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
          economyRowEnd: 5,
          economyColsLeft: ['A'],
          economyColsRight: ['C'],
          updatedAt: new Date(),
        }),
      );
    }

    const routeRepo = dataSource.getRepository(Route);
    let route = await routeRepo.findOneBy({
      originCode: 'THR',
      destCode: 'AWZ',
    });
    if (!route) {
      route = await routeRepo.save(
        routeRepo.create({
          originCode: 'THR',
          destCode: 'AWZ',
          durationMin: 75,
        }),
      );
    }
    routeId = route.id;

    const flightRepo = dataSource.getRepository(Flight);
    let flight = await flightRepo.findOneBy({ flightNo: 'P13C-1' });
    if (!flight) {
      flight = await flightRepo.save(
        flightRepo.create({
          flightNo: 'P13C-1',
          routeId,
          aircraftType: AIRCRAFT_TYPE,
        }),
      );
    }
    flightId = flight.id;

    const userRepo = dataSource.getRepository(User);
    let agencyUser = await userRepo.findOneBy({ phone: '+989121190001' });
    if (!agencyUser) {
      agencyUser = await userRepo.save(
        userRepo.create({
          role: Role.AGENCY,
          phone: '+989121190001',
          fullName: 'آژانس تست فاز سیزده',
          isActive: true,
          updatedAt: new Date(),
        }),
      );
    }
    agencyUserId = agencyUser.id;

    const agencyProfileRepo = dataSource.getRepository(AgencyProfile);
    const existingProfile = await agencyProfileRepo.findOneBy({
      userId: agencyUser.id,
    });
    if (!existingProfile) {
      await agencyProfileRepo.save(
        agencyProfileRepo.create({
          userId: agencyUser.id,
          licenseNo: 'P13C-LIC-1',
          managerName: 'مدیر تست',
          phone: '+989121190001',
          email: 'p13c-agency@example.com',
          city: 'تهران',
          address: 'تست',
        }),
      );
    }
  });

  afterAll(async () => {
    const instances = await dataSource
      .getRepository(FlightInstance)
      .createQueryBuilder('fi')
      .where('fi.flightId = :flightId', { flightId })
      .getMany();
    const iids = instances.map((i) => i.id);
    if (iids.length > 0) {
      await dataSource
        .getRepository(AgencyAllotment)
        .delete({ flightInstanceId: In(iids) });
      await dataSource.getRepository(FlightInstance).delete({ id: In(iids) });
    }
    await dataSource.getRepository(Flight).delete({ id: flightId });
    await dataSource.getRepository(Route).delete({ id: routeId });
    await dataSource
      .getRepository(AgencyProfile)
      .delete({ userId: agencyUserId });
    await dataSource.getRepository(User).delete({ id: agencyUserId });
    await dataSource
      .getRepository(AircraftSeatMap)
      .delete({ aircraftType: AIRCRAFT_TYPE });

    await app.close();
  });

  async function freshInstance(
    agencySeatsAllocated: number | null,
    daysAhead = 90,
  ) {
    const departureAt = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
    const flightInstanceRepo = dataSource.getRepository(FlightInstance);
    return flightInstanceRepo.save(
      flightInstanceRepo.create({
        flightId,
        departureAt,
        arrivalAt: new Date(departureAt.getTime() + 75 * 60 * 1000),
        capacity: 10,
        agencySeatsAllocated: agencySeatsAllocated ?? undefined,
        status: FlightInstanceStatus.SCHEDULED,
      }),
    );
  }

  it('allows a manual allotment when the legacy agency quota is not set', async () => {
    const instance = await freshInstance(null);
    await request(app.getHttpServer())
      .post(`/flights/${instance.id}/allotments`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ agencyId: agencyUserId, seatsAllocated: 5 })
      .expect(201);
  });

  it('rejects an allotment that would push the total past physical capacity', async () => {
    const instance = await freshInstance(5);
    await request(app.getHttpServer())
      .post(`/flights/${instance.id}/allotments`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ agencyId: agencyUserId, seatsAllocated: 9 })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post(`/flights/${instance.id}/allotments`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ agencyId: agencyUserId, seatsAllocated: 2 });
    expect(res.status).toBe(400);
  });

  it('a SOFT allotment past its releaseAt is excluded from the active sum, freeing room for a new one', async () => {
    const instance = await freshInstance(5);
    await request(app.getHttpServer())
      .post(`/flights/${instance.id}/allotments`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        agencyId: agencyUserId,
        seatsAllocated: 10,
        type: 'SOFT',
        releaseAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      })
      .expect(201);

    // Without the lazy SOFT-release exclusion this would exceed capacity (10 + 3 > 10).
    const res = await request(app.getHttpServer())
      .post(`/flights/${instance.id}/allotments`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ agencyId: agencyUserId, seatsAllocated: 3 });
    expect(res.status).toBe(201);

    const list = await request(app.getHttpServer())
      .get(`/flights/${instance.id}/allotments`)
      .set('Authorization', `Bearer ${staffToken}`);
    const expired = list.body.data.find(
      (r: { seatsAllocated: number }) => r.seatsAllocated === 10,
    );
    expect(expired.active).toBe(false);
  });

  it('deletes an allotment with no active booking', async () => {
    const instance = await freshInstance(5);
    const created = await request(app.getHttpServer())
      .post(`/flights/${instance.id}/allotments`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ agencyId: agencyUserId, seatsAllocated: 3 })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/flights/${instance.id}/allotments/${created.body.data.id}`)
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);
  });
});
