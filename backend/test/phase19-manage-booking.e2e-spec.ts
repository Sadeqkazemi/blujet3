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

/** Phase 19: مدیریت رزرو — anonymous PNR + last-name self-service (no
 * login). See docs/API.md's Phase 19 section for the full design/scope
 * reasoning. */
describe('Phase 19 — anonymous manage-booking self-service (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let flightId: string;
  const AIRCRAFT_TYPE = 'MB2E-TestJet';

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
          economyRowEnd: 3,
          economyColsLeft: ['A'],
          economyColsRight: ['C'],
          updatedAt: new Date(),
        }),
      );
    }
    const routeRepo = setupDataSource.getRepository(Route);
    let route = await routeRepo.findOneBy({
      originCode: 'THR',
      destCode: 'MHD',
    });
    if (!route) {
      route = await routeRepo.save(
        routeRepo.create({
          originCode: 'THR',
          destCode: 'MHD',
          durationMin: 85,
        }),
      );
    }
    const flightRepo = setupDataSource.getRepository(Flight);
    let flight = await flightRepo.findOneBy({ flightNo: 'MB-300' });
    if (!flight) {
      flight = await flightRepo.save(
        flightRepo.create({
          flightNo: 'MB-300',
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

  async function bookAndPay(
    phone: string,
    fullName: string,
    seatCode: string,
    daysAhead = 10,
  ) {
    const { accessToken } = await loginAsCustomer(app, phone);
    const departureAt = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
    const instanceRepo = dataSource.getRepository(FlightInstance);
    const instance = await instanceRepo.save(
      instanceRepo.create({
        flightId,
        departureAt,
        arrivalAt: new Date(departureAt.getTime() + 85 * 60 * 1000),
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
        passengers: [{ fullName, nationalId: '0012345679', seatCode }],
      });
    const bookingId = createRes.body.data.id as string;
    const payRes = await request(app.getHttpServer())
      .post(`/bookings/${bookingId}/pay`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({});
    return {
      pnr: payRes.body.data.booking.pnr as string,
      // Money fields are decimal STRINGs on the wire
      // (BigInt.prototype.toJSON) — keep as string, compare via BigInt.
      priceIrr: payRes.body.data.booking.priceIrr as string,
    };
  }

  describe('POST /manage-booking/lookup', () => {
    it('finds a booking by PNR + matching last name, exposing only fullName/seatCode per passenger', async () => {
      const { pnr } = await bookAndPay('09150000001', 'نگار رضایی', '1A');

      const res = await request(app.getHttpServer())
        .post('/manage-booking/lookup')
        .send({ pnr, lastName: 'رضایی' });

      expect(res.status).toBe(201);
      expect(res.body.data.pnr).toBe(pnr);
      expect(res.body.data.passengers).toEqual([
        { fullName: 'نگار رضایی', seatCode: '1A' },
      ]);
    });

    it('matches case/whitespace-insensitively via a lowercase pnr and trimmed last name', async () => {
      const { pnr } = await bookAndPay('09150000002', 'آرش کریمی', '1C');

      const res = await request(app.getHttpServer())
        .post('/manage-booking/lookup')
        .send({ pnr: pnr.toLowerCase(), lastName: '  کریمی  ' });

      expect(res.status).toBe(201);
      expect(res.body.data.pnr).toBe(pnr);
    });

    it('404s on a wrong last name — same generic message as a nonexistent PNR', async () => {
      const { pnr } = await bookAndPay('09150000003', 'سارا محمدی', '2A');

      const wrongName = await request(app.getHttpServer())
        .post('/manage-booking/lookup')
        .send({ pnr, lastName: 'رضایی' });
      const wrongPnr = await request(app.getHttpServer())
        .post('/manage-booking/lookup')
        .send({ pnr: 'BJZZZZZZ', lastName: 'رضایی' });

      expect(wrongName.status).toBe(404);
      expect(wrongPnr.status).toBe(404);
      expect(wrongName.body.error.code).toBe(wrongPnr.body.error.code);
      expect(wrongName.body.error.message).toBe(wrongPnr.body.error.message);
    });

    it('redacts co-passenger names on multi-passenger bookings', async () => {
      const { accessToken } = await loginAsCustomer(app, '09150000009');
      const departureAt = new Date(Date.now() + 12 * 24 * 60 * 60 * 1000);
      const instanceRepo2 = dataSource.getRepository(FlightInstance);
      const instance = await instanceRepo2.save(
        instanceRepo2.create({
          flightId,
          departureAt,
          arrivalAt: new Date(departureAt.getTime() + 85 * 60 * 1000),
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
            {
              fullName: 'علی رضایی',
              nationalId: '0012345679',
              seatCode: '1A',
            },
            {
              fullName: 'مینا احمدی',
              seatCode: '1C',
            },
          ],
        });
      const bookingId = createRes.body.data.id as string;
      const payRes = await request(app.getHttpServer())
        .post(`/bookings/${bookingId}/pay`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({});
      const pnr = payRes.body.data.booking.pnr as string;

      const res = await request(app.getHttpServer())
        .post('/manage-booking/lookup')
        .send({ pnr, lastName: 'رضایی' });

      expect(res.status).toBe(201);
      expect(res.body.data.passengers).toEqual([
        { fullName: 'علی رضایی', seatCode: '1A' },
        { fullName: 'مسافر همراه', seatCode: '1C' },
      ]);
    });

    it('400s when last name is shorter than 3 characters', async () => {
      const res = await request(app.getHttpServer())
        .post('/manage-booking/lookup')
        .send({ pnr: 'BJ4X2K', lastName: 'رض' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /manage-booking/refund', () => {
    it('submits a real refund with a real penalty breakdown, no login required', async () => {
      const { pnr, priceIrr } = await bookAndPay(
        '09150000004',
        'مریم احمدی',
        '2C',
        10,
      );

      const res = await request(app.getHttpServer())
        .post('/manage-booking/refund')
        .send({
          pnr,
          lastName: 'احمدی',
          iban: 'IR820170000000332211009900',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('SUBMITTED');
      expect(res.body.data.totalPaidIrr).toBe(String(priceIrr));
      expect(
        BigInt(String(res.body.data.penaltyAmountIrr)) +
          BigInt(String(res.body.data.refundableIrr)),
      ).toBe(BigInt(priceIrr));
      expect(res.body.data.trackingCode).toMatch(/^RF-[A-F0-9]{8}$/);
      expect(res.body.data.ibanEnc).toBeUndefined();
    });

    it('rejects a second anonymous refund submission for the same booking', async () => {
      const { pnr } = await bookAndPay('09150000005', 'حسین رضوی', '3A');
      const dto = { pnr, lastName: 'رضوی', iban: 'IR820170000000332211009900' };

      await request(app.getHttpServer())
        .post('/manage-booking/refund')
        .send(dto);
      const second = await request(app.getHttpServer())
        .post('/manage-booking/refund')
        .send(dto);

      expect(second.status).toBe(409);
    });

    it('404s when the last name does not match the booking', async () => {
      const { pnr } = await bookAndPay('09150000006', 'فرزاد نوری', '3C');

      const res = await request(app.getHttpServer())
        .post('/manage-booking/refund')
        .send({
          pnr,
          lastName: 'رضایی',
          iban: 'IR820170000000332211009900',
        });

      expect(res.status).toBe(404);
    });

    it('computes an identical penalty to the authenticated /my/refunds path for the same booking shape', async () => {
      const authed = await bookAndPay('09150000007', 'وحید تقوی', '1A', 10);
      const anon = await bookAndPay('09150000008', 'وحید تقوی', '1C', 10);

      const authRes = await request(app.getHttpServer())
        .post('/manage-booking/refund')
        .send({
          pnr: authed.pnr,
          lastName: 'تقوی',
          iban: 'IR820170000000332211009900',
        });
      const anonRes = await request(app.getHttpServer())
        .post('/manage-booking/refund')
        .send({
          pnr: anon.pnr,
          lastName: 'تقوی',
          iban: 'IR820170000000332211009900',
        });

      expect(authRes.body.data.penaltyPct).toBe(anonRes.body.data.penaltyPct);
    });
  });
});
