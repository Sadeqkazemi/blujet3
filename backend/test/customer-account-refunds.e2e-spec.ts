import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as crypto from 'node:crypto';
import { DataSource } from 'typeorm';
import { dataSourceOptions } from '../src/database/data-source.options';
import { Route } from '../src/database/entities/route.entity';
import { Flight } from '../src/database/entities/flight.entity';
import { FlightInstance } from '../src/database/entities/flight-instance.entity';
import { Booking } from '../src/database/entities/booking.entity';
import { Passenger } from '../src/database/entities/passenger.entity';
import { RefundPenaltyRule } from '../src/database/entities/refund-penalty-rule.entity';
import { RefundRequest } from '../src/database/entities/refund-request.entity';
import { User } from '../src/database/entities/user.entity';
import { loginAs, loginAsCustomer } from './helpers/login.helper';
import { createTestApp } from './helpers/app.helper';

describe('Customer account refunds (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let flightId: string;
  const phoneSeed = Number(Date.now().toString().slice(-8));
  const phone = (offset: number) =>
    `09${String((phoneSeed + offset) % 1_000_000_000).padStart(9, '0')}`;

  beforeAll(async () => {
    const setupDataSource = new DataSource(dataSourceOptions);
    await setupDataSource.initialize();

    const routeRepo = setupDataSource.getRepository(Route);
    let route = await routeRepo.findOneBy({
      originCode: 'THR',
      destCode: 'KIH',
    });
    if (!route) {
      route = await routeRepo.save(
        routeRepo.create({
          originCode: 'THR',
          destCode: 'KIH',
          durationMin: 100,
        }),
      );
    }
    const flightRepo = setupDataSource.getRepository(Flight);
    let flight = await flightRepo.findOneBy({ flightNo: 'RF-901' });
    if (!flight) {
      flight = await flightRepo.save(
        flightRepo.create({
          flightNo: 'RF-901',
          routeId: route.id,
          aircraftType: 'Refund-Test',
        }),
      );
    }
    flightId = flight.id;
    const rules = [
      [72, 30, 'بیش از ۷۲ ساعت مانده'],
      [24, 50, 'بین ۲۴ تا ۷۲ ساعت مانده'],
      [3, 70, 'بین ۳ تا ۲۴ ساعت مانده'],
      [0, 100, 'کمتر از ۳ ساعت / پس از پرواز'],
    ] as const;
    const ruleRepo = setupDataSource.getRepository(RefundPenaltyRule);
    for (const [minHoursBeforeDeparture, penaltyPct, labelFa] of rules) {
      const existing = await ruleRepo.findOneBy({ minHoursBeforeDeparture });
      if (existing) {
        await ruleRepo.update({ id: existing.id }, { penaltyPct, labelFa });
      } else {
        await ruleRepo.save(
          ruleRepo.create({ minHoursBeforeDeparture, penaltyPct, labelFa }),
        );
      }
    }
    await setupDataSource.destroy();
  });

  beforeEach(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
  });

  afterEach(async () => {
    await app.close();
  });

  async function createBooking(
    phone: string,
    hoursAhead = 240,
    status: 'TICKETED' | 'PAID' | 'HELD' = 'TICKETED',
  ) {
    const { accessToken, userId } = await loginAsCustomer(app, phone);
    const departureAt = new Date(Date.now() + hoursAhead * 3_600_000);
    const instanceRepo = dataSource.getRepository(FlightInstance);
    const instance = await instanceRepo.save(
      instanceRepo.create({
        flightId,
        departureAt,
        arrivalAt: new Date(departureAt.getTime() + 100 * 60_000),
        capacity: 20,
        status: 'SCHEDULED',
      }),
    );
    const bookingRepo = dataSource.getRepository(Booking);
    const booking = await bookingRepo.save(
      bookingRepo.create({
        pnr: `CR${crypto.randomUUID().replaceAll('-', '').slice(0, 6).toUpperCase()}`,
        flightInstanceId: instance.id,
        userId,
        channel: 'SYSTEM',
        status,
        priceIrr: 20_000_000n,
      }),
    );
    const passengerRepo = dataSource.getRepository(Passenger);
    await passengerRepo.save(
      passengerRepo.create({
        bookingId: booking.id,
        fullName: 'مسافر استرداد حساب',
      }),
    );
    return { accessToken: accessToken!, userId: userId!, booking, departureAt };
  }

  it('lists only refundable owned bookings and returns live rules + preview', async () => {
    const eligible = await createBooking(phone(1), 240);
    await createBooking(phone(1), 2);
    await createBooking(phone(1), 240, 'HELD');

    const list = await request(app.getHttpServer())
      .get('/my/refunds/eligible-bookings')
      .set('Authorization', `Bearer ${eligible.accessToken}`);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0]).toEqual(
      expect.objectContaining({
        bookingId: eligible.booking.id,
        pnr: eligible.booking.pnr,
        flightNo: 'RF-901',
        originCode: 'THR',
        destCode: 'KIH',
        penaltyPct: 30,
        penaltyAmountIrr: '6000000',
        refundableIrr: '14000000',
      }),
    );

    const rules = await request(app.getHttpServer())
      .get('/my/refunds/rules')
      .set('Authorization', `Bearer ${eligible.accessToken}`);
    expect(rules.status).toBe(200);
    expect(
      rules.body.data.map((r: { penaltyPct: number }) => r.penaltyPct),
    ).toEqual([30, 50, 70, 100]);
    expect(rules.body.data[3].isRefundable).toBe(false);

    const preview = await request(app.getHttpServer())
      .post('/my/refunds/preview')
      .set('Authorization', `Bearer ${eligible.accessToken}`)
      .send({ bookingId: eligible.booking.id });
    expect(preview.status).toBe(201);
    expect(preview.body.data.refundable).toBe(true);
    expect(preview.body.data.totalPaidIrr).toBe('20000000');
  });

  it('enforces validation, auth, ownership and non-refundable windows', async () => {
    const owner = await createBooking(phone(2), 240);
    const tooLate = await createBooking(phone(2), 2);
    const stranger = await loginAsCustomer(app, phone(3));

    expect(
      (await request(app.getHttpServer()).get('/my/refunds/eligible-bookings'))
        .status,
    ).toBe(401);

    const staff = await loginAs(app, 'ceo');
    expect(
      (
        await request(app.getHttpServer())
          .get('/my/refunds/rules')
          .set('Authorization', `Bearer ${staff.accessToken}`)
      ).status,
    ).toBe(403);

    const malformed = await request(app.getHttpServer())
      .post('/my/refunds/preview')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ bookingId: 'not-a-uuid' });
    expect(malformed.status).toBe(400);

    const notOwned = await request(app.getHttpServer())
      .post('/my/refunds/preview')
      .set('Authorization', `Bearer ${stranger.accessToken}`)
      .send({ bookingId: owner.booking.id });
    expect(notOwned.status).toBe(404);

    const ineligible = await request(app.getHttpServer())
      .post('/my/refunds/preview')
      .set('Authorization', `Bearer ${tooLate.accessToken}`)
      .send({ bookingId: tooLate.booking.id });
    expect(ineligible.status).toBe(409);
  });

  it('submits and returns enriched tracking data without IBAN or passenger PII', async () => {
    const owner = await createBooking(phone(4), 240);
    const submit = await request(app.getHttpServer())
      .post('/my/refunds')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        bookingId: owner.booking.id,
        iban: 'IR820170000000332211009900',
      });
    expect(submit.status).toBe(201);
    expect(submit.body.data.trackingCode).toMatch(/^RF-[A-F0-9]{8}$/);
    expect(submit.body.data).toEqual(
      expect.objectContaining({
        pnr: owner.booking.pnr,
        flightNo: 'RF-901',
        originCode: 'THR',
        destCode: 'KIH',
        status: 'SUBMITTED',
      }),
    );
    expect(submit.body.data.history).toHaveLength(1);
    expect(submit.body.data.ibanEnc).toBeUndefined();
    expect(submit.body.data.nidEnc).toBeUndefined();
    expect(submit.body.data.mobileEnc).toBeUndefined();

    const list = await request(app.getHttpServer())
      .get('/my/refunds')
      .set('Authorization', `Bearer ${owner.accessToken}`);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].trackingCode).toBe(submit.body.data.trackingCode);

    const detail = await request(app.getHttpServer())
      .get(`/my/refunds/${submit.body.data.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.pnr).toBe(owner.booking.pnr);
  });

  it('allows exactly one of two concurrent submissions for one booking', async () => {
    const owner = await createBooking(phone(5), 240);
    const submit = () =>
      request(app.getHttpServer())
        .post('/my/refunds')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({
          bookingId: owner.booking.id,
          iban: 'IR820170000000332211009900',
        });

    const [a, b] = await Promise.all([submit(), submit()]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(
      await dataSource
        .getRepository(RefundRequest)
        .createQueryBuilder('r')
        .where('r.bookingId = :bookingId', { bookingId: owner.booking.id })
        .getCount(),
    ).toBe(1);
  });

  it('SITE_ADMIN referral advances a submitted request to the finance payout queue', async () => {
    const owner = await createBooking(phone(6), 240);
    const submit = await request(app.getHttpServer())
      .post('/my/refunds')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        bookingId: owner.booking.id,
        iban: 'IR820170000000332211009900',
      });
    const admin = await loginAs(app, 'site.admin');
    const finance = await dataSource
      .getRepository(User)
      .findOneByOrFail({ username: 'finance' });

    const refer = await request(app.getHttpServer())
      .patch(`/refunds/${submit.body.data.id}/refer`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ assigneeId: finance.id });
    expect(refer.status).toBe(200);
    expect(refer.body.data.status).toBe('FINANCE');

    const mine = await request(app.getHttpServer())
      .get(`/my/refunds/${submit.body.data.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`);
    expect(mine.body.data.status).toBe('FINANCE');
    expect(mine.body.data.history.map((h: { step: string }) => h.step)).toEqual(
      ['submitted', 'review', 'finance'],
    );
  });
});
