import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { dataSourceOptions } from '../src/database/data-source.options';
import { AircraftSeatMap } from '../src/database/entities/aircraft-seat-map.entity';
import { Route } from '../src/database/entities/route.entity';
import { Flight } from '../src/database/entities/flight.entity';
import { FlightInstance } from '../src/database/entities/flight-instance.entity';
import { loginAsCustomer } from './helpers/login.helper';
import { createTestApp } from './helpers/app.helper';

describe('Customer refund submission (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let flightId: string;
  const AIRCRAFT_TYPE = 'RS2E-TestJet';

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
          economyRowEnd: 2,
          economyColsLeft: ['A'],
          economyColsRight: ['C'],
          updatedAt: new Date(),
        }),
      );
    }
    const routeRepo = setupDataSource.getRepository(Route);
    let route = await routeRepo.findOneBy({
      originCode: 'THR',
      destCode: 'SYZ',
    });
    if (!route) {
      route = await routeRepo.save(
        routeRepo.create({
          originCode: 'THR',
          destCode: 'SYZ',
          durationMin: 70,
        }),
      );
    }
    const flightRepo = setupDataSource.getRepository(Flight);
    let flight = await flightRepo.findOneBy({ flightNo: 'RS-200' });
    if (!flight) {
      flight = await flightRepo.save(
        flightRepo.create({
          flightNo: 'RS-200',
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

  async function bookAndPay(phone: string, daysAhead: number, seatCode = '1A') {
    const { accessToken } = await loginAsCustomer(app, phone);
    const departureAt = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
    const instanceRepo = dataSource.getRepository(FlightInstance);
    const instance = await instanceRepo.save(
      instanceRepo.create({
        flightId,
        departureAt,
        arrivalAt: new Date(departureAt.getTime() + 70 * 60 * 1000),
        capacity: 4,
        status: 'SCHEDULED',
      }),
    );
    const createRes = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        flightInstanceId: instance.id,
        cabin: 'ECONOMY',
        passengers: [
          { fullName: 'مسافر استرداد', nationalId: '0012345679', seatCode },
        ],
      });
    const bookingId = createRes.body.data.id as string;
    const payRes = await request(app.getHttpServer())
      .post(`/bookings/${bookingId}/pay`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({});
    return {
      accessToken,
      bookingId,
      // Money fields are decimal STRINGs on the wire
      // (BigInt.prototype.toJSON) — keep as string, compare via BigInt.
      priceIrr: payRes.body.data.booking.priceIrr as string,
    };
  }

  it('submits a refund on a TICKETED booking with a real penalty breakdown', async () => {
    const { accessToken, bookingId, priceIrr } = await bookAndPay(
      '09140000001',
      10, // 10 days out -> should land in the highest refundable tier
    );

    const res = await request(app.getHttpServer())
      .post('/my/refunds')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ bookingId, iban: 'IR820170000000332211009900' });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('SUBMITTED');
    expect(res.body.data.totalPaidIrr).toBe(priceIrr);
    expect(BigInt(String(res.body.data.refundableIrr))).toBeLessThanOrEqual(
      BigInt(priceIrr),
    );
    expect(
      BigInt(String(res.body.data.penaltyAmountIrr)) +
        BigInt(String(res.body.data.refundableIrr)),
    ).toBe(BigInt(priceIrr));
    // No PII on the submission response (design's cards show none).
    expect(res.body.data.ibanEnc).toBeUndefined();
  });

  it('rejects a second refund submission for the same booking', async () => {
    const { accessToken, bookingId } = await bookAndPay(
      '09140000002',
      10,
      '1C',
    );
    await request(app.getHttpServer())
      .post('/my/refunds')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ bookingId, iban: 'IR820170000000332211009900' });

    const second = await request(app.getHttpServer())
      .post('/my/refunds')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ bookingId, iban: 'IR820170000000332211009900' });
    expect(second.status).toBe(409);
  });

  it('rejects submitting a refund for a HELD (unpaid) booking', async () => {
    const { accessToken } = await loginAsCustomer(app, '09140000003');
    const departureAt = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
    const instanceRepo = dataSource.getRepository(FlightInstance);
    const instance = await instanceRepo.save(
      instanceRepo.create({
        flightId,
        departureAt,
        arrivalAt: new Date(departureAt.getTime() + 70 * 60 * 1000),
        capacity: 4,
        status: 'SCHEDULED',
      }),
    );
    const createRes = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        flightInstanceId: instance.id,
        cabin: 'ECONOMY',
        passengers: [{ fullName: 'مسافر معلق', seatCode: '2A' }],
      });

    const res = await request(app.getHttpServer())
      .post('/my/refunds')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        bookingId: createRes.body.data.id,
        iban: 'IR820170000000332211009900',
      });
    expect(res.status).toBe(409);
  });

  it('a stranger cannot submit a refund for someone else’s booking', async () => {
    const { bookingId } = await bookAndPay('09140000004', 10, '2C');
    const stranger = await loginAsCustomer(app, '09140000005');

    const res = await request(app.getHttpServer())
      .post('/my/refunds')
      .set('Authorization', `Bearer ${stranger.accessToken}`)
      .send({ bookingId, iban: 'IR820170000000332211009900' });
    expect(res.status).toBe(404);
  });

  it('listMine only returns the caller’s own refund requests', async () => {
    // Unique phones per run (not fixed literals) so this stays correct on
    // repeated runs against a non-truncated test DB, matching this suite's
    // existing convention.
    const suffix = Date.now().toString().slice(-8);
    const a = await bookAndPay(`091${suffix}`, 15, '1A');
    const submitRes = await request(app.getHttpServer())
      .post('/my/refunds')
      .set('Authorization', `Bearer ${a.accessToken}`)
      .send({ bookingId: a.bookingId, iban: 'IR820170000000332211009900' });

    const bPhone = `092${suffix}`;
    const b = await loginAsCustomer(app, bPhone);
    const listRes = await request(app.getHttpServer())
      .get('/my/refunds')
      .set('Authorization', `Bearer ${b.accessToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data).toEqual([]);

    const listA = await request(app.getHttpServer())
      .get('/my/refunds')
      .set('Authorization', `Bearer ${a.accessToken}`);
    expect(
      listA.body.data.some(
        (r: { id: string }) => r.id === submitRes.body.data.id,
      ),
    ).toBe(true);
  });
});
