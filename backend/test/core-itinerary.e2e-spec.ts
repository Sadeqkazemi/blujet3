import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import request from 'supertest';
import { DataSource, In } from 'typeorm';
import { AircraftSeatMap } from '../src/database/entities/aircraft-seat-map.entity';
import { Airport } from '../src/database/entities/airport.entity';
import { Booking } from '../src/database/entities/booking.entity';
import { FareRule } from '../src/database/entities/fare-rule.entity';
import { Flight } from '../src/database/entities/flight.entity';
import { FlightInstance } from '../src/database/entities/flight-instance.entity';
import { Route } from '../src/database/entities/route.entity';
import { createTestApp } from './helpers/app.helper';

describe('Core itinerary internal API', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  const token = process.env.PSS_INTERNAL_TOKEN!;
  const suffix = randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase();
  const aircraftType = `ITIN-${suffix}`;
  const routeIds = [randomUUID(), randomUUID()];
  const flightIds = [randomUUID(), randomUUID()];
  const instanceIds = [randomUUID(), randomUUID()];
  const fareRuleIds = [randomUUID(), randomUUID()];
  const airportId = randomUUID();

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);

    const seatMapRepo = dataSource.getRepository(AircraftSeatMap);
    await seatMapRepo.save(
      seatMapRepo.create({
        aircraftType,
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

    const codes = [`X${suffix}`, `Y${suffix}`, `Z${suffix}`];
    const airportRepo = dataSource.getRepository(Airport);
    await airportRepo.save(
      airportRepo.create({
        id: airportId,
        code: codes[1],
        cityFa: 'فرودگاه تست اتصال',
        tz: 'UTC',
        minConnectMin: 120,
      }),
    );
    const routeRepo = dataSource.getRepository(Route);
    await routeRepo.save([
      routeRepo.create({
        id: routeIds[0],
        originCode: codes[0],
        destCode: codes[1],
        durationMin: 120,
      }),
      routeRepo.create({
        id: routeIds[1],
        originCode: codes[1],
        destCode: codes[2],
        durationMin: 180,
      }),
    ]);

    const flightRepo = dataSource.getRepository(Flight);
    await flightRepo.save([
      flightRepo.create({
        id: flightIds[0],
        flightNo: `IT-${suffix}-1`,
        routeId: routeIds[0],
        aircraftType,
      }),
      flightRepo.create({
        id: flightIds[1],
        flightNo: `IT-${suffix}-2`,
        routeId: routeIds[1],
        aircraftType,
      }),
    ]);

    const firstDeparture = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    const firstArrival = new Date(
      firstDeparture.getTime() + 2 * 60 * 60 * 1000,
    );
    const secondDeparture = new Date(
      firstArrival.getTime() + 2 * 60 * 60 * 1000,
    );
    const secondArrival = new Date(
      secondDeparture.getTime() + 3 * 60 * 60 * 1000,
    );
    const instanceRepo = dataSource.getRepository(FlightInstance);
    await instanceRepo.save([
      instanceRepo.create({
        id: instanceIds[0],
        flightId: flightIds[0],
        departureAt: firstDeparture,
        arrivalAt: firstArrival,
        capacity: 4,
        publicSaleEnabled: true,
        agencySaleEnabled: true,
        cabinCapacities: [{ cabin: 'ECONOMY', seats: 4 }],
      }),
      instanceRepo.create({
        id: instanceIds[1],
        flightId: flightIds[1],
        departureAt: secondDeparture,
        arrivalAt: secondArrival,
        capacity: 4,
        publicSaleEnabled: true,
        agencySaleEnabled: true,
        cabinCapacities: [{ cabin: 'ECONOMY', seats: 4 }],
      }),
    ]);

    const fareRuleRepo = dataSource.getRepository(FareRule);
    await fareRuleRepo.save(
      instanceIds.map((flightInstanceId, index) =>
        fareRuleRepo.create({
          id: fareRuleIds[index],
          flightInstanceId,
          cabin: 'ECONOMY',
          classCode: 'Y',
          priceIrr: 10_000_000n,
          sitePriceIrr: 10_000_000n,
          seatsAllocated: 4,
          siteSeatsReleased: 3,
          agencySeatsReleased: 1,
          agencyReleasePriceIrr: 9_000_000n,
          allowedChannels: [],
          taxIrr: 0n,
        }),
      ),
    );
  });

  afterAll(async () => {
    await dataSource.getRepository(FareRule).delete({ id: In(fareRuleIds) });
    await dataSource
      .getRepository(FlightInstance)
      .delete({ id: In(instanceIds) });
    await dataSource.getRepository(Flight).delete({ id: In(flightIds) });
    await dataSource.getRepository(Route).delete({ id: In(routeIds) });
    await dataSource.getRepository(Airport).delete({ id: airportId });
    await dataSource.getRepository(AircraftSeatMap).delete({ aircraftType });
    await app.close();
  });

  function validRequest() {
    return {
      channel: 'SYSTEM',
      segments: instanceIds.map((flightInstanceId, index) => ({
        flightInstanceId,
        sequence: index + 1,
        cabin: 'ECONOMY',
        fareClassCode: 'Y',
      })),
    };
  }

  it('requires the internal service token', async () => {
    const response = await request(app.getHttpServer())
      .post('/internal/v1/core/itineraries/resolve')
      .send(validRequest());

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects malformed segment input', async () => {
    const response = await request(app.getHttpServer())
      .post('/internal/v1/core/itineraries/resolve')
      .set('X-Internal-Token', token)
      .send({
        channel: 'SYSTEM',
        segments: [{ sequence: 1, cabin: 'INVALID' }],
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('returns not found without exposing missing inventory details', async () => {
    const response = await request(app.getHttpServer())
      .post('/internal/v1/core/itineraries/resolve')
      .set('X-Internal-Token', token)
      .send({
        channel: 'SYSTEM',
        segments: [
          { flightInstanceId: randomUUID(), sequence: 1, cabin: 'ECONOMY' },
        ],
      });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('resolves at exactly the airport MCT without creating a booking or hold', async () => {
    const bookingRepo = dataSource.getRepository(Booking);
    const before = await bookingRepo.count({
      where: { flightInstanceId: In(instanceIds) },
    });
    const response = await request(app.getHttpServer())
      .post('/internal/v1/core/itineraries/resolve')
      .set('X-Internal-Token', token)
      .send(validRequest());
    const after = await bookingRepo.count({
      where: { flightInstanceId: In(instanceIds) },
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        channel: 'SYSTEM',
        segments: [
          {
            flightInstanceId: instanceIds[0],
            sequence: 1,
            fareClassCode: 'Y',
            availableSeats: 3,
          },
          {
            flightInstanceId: instanceIds[1],
            sequence: 2,
            fareClassCode: 'Y',
            availableSeats: 3,
          },
        ],
      },
    });
    expect(after).toBe(before);
  });

  it('applies the agency-specific fare release', async () => {
    const response = await request(app.getHttpServer())
      .post('/internal/v1/core/itineraries/resolve')
      .set('X-Internal-Token', token)
      .send({ ...validRequest(), channel: 'AGENCY' });

    expect(response.status).toBe(200);
    expect(response.body.data.segments[0].availableSeats).toBe(1);
  });

  it('rejects a connection below MCT and uses an updated airport rule immediately', async () => {
    const airportRepo = dataSource.getRepository(Airport);
    try {
      await airportRepo.update(airportId, { minConnectMin: 121 });
      const response = await request(app.getHttpServer())
        .post('/internal/v1/core/itineraries/resolve')
        .set('X-Internal-Token', token)
        .send(validRequest());
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_FAILED');
      expect(response.body.error.message).toContain('حداقل زمان اتصال');
    } finally {
      await airportRepo.update(airportId, { minConnectMin: 120 });
    }
    const response = await request(app.getHttpServer())
      .post('/internal/v1/core/itineraries/resolve')
      .set('X-Internal-Token', token)
      .send(validRequest());
    expect(response.status).toBe(200);
  });

  it('rejects an unknown transfer airport but still resolves direct itineraries', async () => {
    const airportRepo = dataSource.getRepository(Airport);
    const airport = await airportRepo.findOneByOrFail({ id: airportId });
    try {
      await airportRepo.delete(airportId);
      const response = await request(app.getHttpServer())
        .post('/internal/v1/core/itineraries/resolve')
        .set('X-Internal-Token', token)
        .send(validRequest());
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_FAILED');
      const direct = validRequest();
      direct.segments = direct.segments.slice(0, 1);
      const directResponse = await request(app.getHttpServer())
        .post('/internal/v1/core/itineraries/resolve')
        .set('X-Internal-Token', token)
        .send(direct);
      expect(directResponse.status).toBe(200);
    } finally {
      await airportRepo.save(airport);
    }
  });

  it('returns pool exhausted when the selected channel has no released seats', async () => {
    await dataSource
      .getRepository(FareRule)
      .update({ id: In(fareRuleIds) }, { siteSeatsReleased: 0 });

    const response = await request(app.getHttpServer())
      .post('/internal/v1/core/itineraries/resolve')
      .set('X-Internal-Token', token)
      .send(validRequest());

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('POOL_EXHAUSTED');
  });
});
