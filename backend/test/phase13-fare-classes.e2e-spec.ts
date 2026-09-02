import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import request from 'supertest';
import { DataSource, In } from 'typeorm';
import { AircraftSeatMap } from '../src/database/entities/aircraft-seat-map.entity';
import { AncillaryService } from '../src/database/entities/ancillary-service.entity';
import { Booking } from '../src/database/entities/booking.entity';
import { ClubPointsEntry } from '../src/database/entities/club-points-entry.entity';
import { FareRule } from '../src/database/entities/fare-rule.entity';
import { Flight } from '../src/database/entities/flight.entity';
import { FlightInstance } from '../src/database/entities/flight-instance.entity';
import { LedgerEntry } from '../src/database/entities/ledger-entry.entity';
import { Passenger } from '../src/database/entities/passenger.entity';
import { PaymentReconciliation } from '../src/database/entities/payment-reconciliation.entity';
import { Route } from '../src/database/entities/route.entity';
import { WalletEntry } from '../src/database/entities/wallet-entry.entity';
import { FlightInstanceStatus } from '../src/database/enums';
import { createTestApp } from './helpers/app.helper';
import { loginAs, loginAsCustomer } from './helpers/login.helper';

/** Phase 13 Part B — manageable fare classes: capacity-sum validation,
 * validity window, channel eligibility, tax breakout, and delete-blocked
 * when an active booking already uses the class. */
describe('Phase 13 Part B — fare-class management', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  const AIRCRAFT_TYPE = 'P13B-Jet'; // 4 economy seats, no business
  let routeId: string;
  let flightId: string;
  let staffToken: string;
  let customerToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    staffToken = (await loginAs(app, 'senior')).accessToken!;
    customerToken = (await loginAsCustomer(app, '09901119920')).accessToken!;

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
          economyRowEnd: 2,
          economyColsLeft: ['A'],
          economyColsRight: ['C'],
          updatedAt: new Date(),
        }),
      );
    }

    const routeRepo = dataSource.getRepository(Route);
    let route = await routeRepo.findOneBy({
      originCode: 'THR',
      destCode: 'BND',
    });
    if (!route) {
      route = await routeRepo.save(
        routeRepo.create({
          originCode: 'THR',
          destCode: 'BND',
          durationMin: 80,
        }),
      );
    }
    routeId = route.id;

    const flightRepo = dataSource.getRepository(Flight);
    let flight = await flightRepo.findOneBy({ flightNo: 'P13B-1' });
    if (!flight) {
      flight = await flightRepo.save(
        flightRepo.create({
          flightNo: 'P13B-1',
          routeId,
          aircraftType: AIRCRAFT_TYPE,
        }),
      );
    }
    flightId = flight.id;
  });

  afterAll(async () => {
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
    if (bids.length > 0) {
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
      await dataSource
        .getRepository(FareRule)
        .delete({ flightInstanceId: In(iids) });
      await dataSource.getRepository(FlightInstance).delete({ id: In(iids) });
    }
    await dataSource.getRepository(Flight).delete({ id: flightId });
    await dataSource.getRepository(Route).delete({ id: routeId });
    await dataSource
      .getRepository(AircraftSeatMap)
      .delete({ aircraftType: AIRCRAFT_TYPE });

    await app.close();
  });

  function freshInstance(daysAhead = 90) {
    const departureAt = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
    const flightInstanceRepo = dataSource.getRepository(FlightInstance);
    return flightInstanceRepo.save(
      flightInstanceRepo.create({
        flightId,
        departureAt,
        arrivalAt: new Date(departureAt.getTime() + 80 * 60 * 1000),
        capacity: 4,
        status: FlightInstanceStatus.SCHEDULED,
      }),
    );
  }

  it('rejects a fare rule whose seatsAllocated would push the cabin total past its physical seat count', async () => {
    const instance = await freshInstance();
    await request(app.getHttpServer())
      .post(`/flights/${instance.id}/fare-rules`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        cabin: 'ECONOMY',
        classCode: 'Y',
        priceIrr: 30_000_000,
        seatsAllocated: 3,
      })
      .expect(201);

    // Economy cabin only has 4 physical seats; 3 already allocated to Y.
    const res = await request(app.getHttpServer())
      .post(`/flights/${instance.id}/fare-rules`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        cabin: 'ECONOMY',
        classCode: 'B',
        priceIrr: 40_000_000,
        seatsAllocated: 2,
      });
    expect(res.status).toBe(400);
  });

  it('rejects validUntil <= validFrom', async () => {
    const instance = await freshInstance();
    const res = await request(app.getHttpServer())
      .post(`/flights/${instance.id}/fare-rules`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        cabin: 'ECONOMY',
        classCode: 'Y',
        priceIrr: 30_000_000,
        seatsAllocated: 1,
        validFrom: '2026-08-01T00:00:00.000Z',
        validUntil: '2026-07-01T00:00:00.000Z',
      });
    expect(res.status).toBe(400);
  });

  it('a fare rule outside its validity window is invisible to pricing, and tax is included in the booking total', async () => {
    const instance = await freshInstance();
    await request(app.getHttpServer())
      .post(`/flights/${instance.id}/fare-rules`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        cabin: 'ECONOMY',
        classCode: 'EXPIRED',
        priceIrr: 10_000_000,
        seatsAllocated: 2,
        validUntil: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/flights/${instance.id}/fare-rules`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        cabin: 'ECONOMY',
        classCode: 'Y',
        priceIrr: 25_000_000,
        seatsAllocated: 2,
        taxIrr: 1_000_000,
      })
      .expect(201);

    const booking = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        flightInstanceId: instance.id,
        cabin: 'ECONOMY',
        passengers: [{ fullName: 'مسافر تست کلاس نرخی', seatCode: '1A' }],
      });
    expect(booking.status).toBe(201);
    // The EXPIRED (cheaper) class must be skipped — Y's price + tax used.
    // Row 1 is extra-legroom, so its configured seat fee is also included.
    // Money fields are decimal STRINGs on the wire (BigInt.prototype.toJSON).
    const seatPriceIrr = (
      await dataSource
        .getRepository(AncillaryService)
        .findOneByOrFail({ key: 'seat-legroom' })
    ).priceIrr;
    expect(booking.body.data.priceIrr).toBe(
      (25_000_000n + 1_000_000n + seatPriceIrr).toString(),
    );
    expect(booking.body.data.taxIrr).toBe('1000000');
  });

  it('a fare rule scoped to a different channel is invisible to a SYSTEM-channel booking', async () => {
    const instance = await freshInstance();
    await request(app.getHttpServer())
      .post(`/flights/${instance.id}/fare-rules`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        cabin: 'ECONOMY',
        classCode: 'AGY',
        priceIrr: 5_000_000,
        seatsAllocated: 4,
        allowedChannels: ['AGENCY'],
      })
      .expect(201);

    const search = await request(app.getHttpServer())
      .get('/search/flights')
      .query({
        origin: 'THR',
        dest: 'BND',
        date: instance.departureAt.toISOString().slice(0, 10),
      });
    const row = search.body.data.find(
      (r: { flightInstanceId: string }) => r.flightInstanceId === instance.id,
    );
    const eco = row.cabins.find(
      (c: { cabin: string }) => c.cabin === 'ECONOMY',
    );
    // AGY-only rule invisible to public search → falls back to flat pricing,
    // not the 5,000,000 AGENCY-only rate.
    expect(eco.priceIrr).not.toBe('5000000');
  });

  it('rejects deleting a fare rule that an active booking is already stamped with', async () => {
    const instance = await freshInstance();
    const rule = await request(app.getHttpServer())
      .post(`/flights/${instance.id}/fare-rules`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        cabin: 'ECONOMY',
        classCode: 'Y',
        priceIrr: 20_000_000,
        seatsAllocated: 4,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        flightInstanceId: instance.id,
        cabin: 'ECONOMY',
        passengers: [{ fullName: 'مسافر کلاس فعال', seatCode: '1A' }],
      })
      .expect(201);

    const del = await request(app.getHttpServer())
      .delete(`/flights/${instance.id}/fare-rules/${rule.body.data.id}`)
      .set('Authorization', `Bearer ${staffToken}`);
    expect(del.status).toBe(409);
  });
});
