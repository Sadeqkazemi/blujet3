import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import * as crypto from 'node:crypto';
import { User } from '../src/database/entities/user.entity';
import { CustomerReferral } from '../src/database/entities/customer-referral.entity';
import { ClubMember } from '../src/database/entities/club-member.entity';
import { ClubPointsEntry } from '../src/database/entities/club-points-entry.entity';
import { FlightInstance } from '../src/database/entities/flight-instance.entity';
import { Booking } from '../src/database/entities/booking.entity';
import { LoyaltyProjectionAudit } from '../src/database/entities/loyalty-projection-audit.entity';
import { CommerceOutboxEvent } from '../src/database/entities/commerce-outbox-event.entity';
import { loginAs, loginAsCustomer } from './helpers/login.helper';
import { createTestApp } from './helpers/app.helper';
import { normalizeIranPhone } from '../src/common/normalize-iran-phone';
import { encryptPii, hashPii } from '../src/common/pii-crypto';
import {
  CustomerReferralsService,
  REFERRAL_REWARD_POINTS,
} from '../src/modules/customer-referrals/customer-referrals.service';

const RUN = Date.now().toString().slice(-6);
function phoneFor(sequence: number): string {
  return `09${RUN}${String(sequence).padStart(3, '0')}`;
}

describe('Customer referrals (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  beforeEach(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
  });

  afterEach(async () => {
    await app.close();
  });

  async function signupWithReferral(phone: string, referralCode: string) {
    const otpReq = await request(app.getHttpServer())
      .post('/auth/otp/request')
      .send({ phone, referralCode });
    expect(otpReq.status).toBe(200);
    const codeRes = await request(app.getHttpServer()).get(
      `/auth/_test/last-otp/${phone}`,
    );
    const verify = await request(app.getHttpServer())
      .post('/auth/otp/verify')
      .send({
        challengeId: otpReq.body.data.challengeId,
        code: codeRes.body.data.code,
      });
    expect(verify.status).toBe(200);
    return dataSource
      .getRepository(User)
      .findOneByOrFail({ phone: normalizeIranPhone(phone) });
  }

  it('GET /my/referral — USER gets code, stats, invite list', async () => {
    const { accessToken } = await loginAsCustomer(app, phoneFor(1));

    const res = await request(app.getHttpServer())
      .get('/my/referral')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.referralCode).toMatch(/^[A-Z0-9-]+$/);
    expect(res.body.data.sharePath).toContain('ref=');
    expect(res.body.data.stats).toMatchObject({
      invitedCount: expect.any(Number),
      pointsEarned: expect.any(Number),
      successfulBookings: expect.any(Number),
    });
  });

  it('POST /auth/otp/request with referralCode links a new signup', async () => {
    const referrer = await loginAsCustomer(app, phoneFor(2));
    const dash = await request(app.getHttpServer())
      .get('/my/referral')
      .set('Authorization', `Bearer ${referrer.accessToken}`);
    const code = dash.body.data.referralCode as string;

    const referred = await signupWithReferral(phoneFor(3), code);
    const row = await dataSource
      .getRepository(CustomerReferral)
      .findOneByOrFail({ referredUserId: referred.id });
    expect(row.status).toBe('SIGNED_UP');
    const audit = await dataSource
      .getRepository(LoyaltyProjectionAudit)
      .findOneByOrFail({
        aggregateType: 'LoyaltyReferral',
        aggregateId: row.id,
        recordVersion: row.version,
      });
    expect(audit.mutation).toBe('CREATED');
    await dataSource.getRepository(CommerceOutboxEvent).findOneByOrFail({
      producer: 'core-loyalty',
      idempotencyKey: `loyalty-projected:LoyaltyReferral:${row.id}:v${row.version}`,
    });
  });

  it('rolls back a reward atomically and awards one concurrent first booking once', async () => {
    const referrer = await loginAsCustomer(app, phoneFor(4));
    const dashboard = await request(app.getHttpServer())
      .get('/my/referral')
      .set('Authorization', `Bearer ${referrer.accessToken}`);
    const referred = await signupWithReferral(
      phoneFor(5),
      String(dashboard.body.data.referralCode),
    );
    const identity = crypto.randomUUID();
    const memberRepo = dataSource.getRepository(ClubMember);
    const member = await memberRepo.save(
      memberRepo.create({
        userId: referrer.userId,
        fullName: 'معرف تست تراکنش',
        email: `${crypto.randomUUID().slice(0, 8)}@referral.example`,
        nationalIdEnc: encryptPii(identity),
        nationalIdHash: hashPii(identity),
        points: 0,
        level: 'SILVER',
      }),
    );
    const instance = await dataSource
      .getRepository(FlightInstance)
      .createQueryBuilder('instance')
      .getOneOrFail();
    const bookingRepo = dataSource.getRepository(Booking);
    const booking = await bookingRepo.save(
      bookingRepo.create({
        pnr: `RF${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
        flightInstanceId: instance.id,
        channel: 'SYSTEM',
        status: 'TICKETED',
        priceIrr: 1n,
        userId: referred.id,
      }),
    );
    const referrals = app.get(CustomerReferralsService);
    const referralRepo = dataSource.getRepository(CustomerReferral);
    const initial = await referralRepo.findOneByOrFail({
      referredUserId: referred.id,
    });

    await expect(
      dataSource.transaction(async (manager) => {
        await referrals.processFirstTicketedBooking(
          manager,
          referred.id,
          booking.id,
        );
        throw new Error('forced referral rollback');
      }),
    ).rejects.toThrow('forced referral rollback');
    expect(
      await referralRepo.findOneByOrFail({ id: initial.id }),
    ).toMatchObject({ status: 'SIGNED_UP', version: initial.version });
    expect(await memberRepo.findOneByOrFail({ id: member.id })).toMatchObject({
      points: 0,
      version: member.version,
    });
    expect(
      await dataSource.getRepository(ClubPointsEntry).countBy({
        clubMemberId: member.id,
        bookingId: booking.id,
      }),
    ).toBe(0);

    await Promise.all([
      dataSource.transaction((manager) =>
        referrals.processFirstTicketedBooking(manager, referred.id, booking.id),
      ),
      dataSource.transaction((manager) =>
        referrals.processFirstTicketedBooking(manager, referred.id, booking.id),
      ),
    ]);

    const rewarded = await referralRepo.findOneByOrFail({ id: initial.id });
    expect(rewarded).toMatchObject({
      status: 'REWARDED',
      pointsAwarded: REFERRAL_REWARD_POINTS,
      firstBookingId: booking.id,
      version: initial.version + 1,
    });
    const pointsEntries = await dataSource
      .getRepository(ClubPointsEntry)
      .findBy({ clubMemberId: member.id, bookingId: booking.id });
    expect(pointsEntries).toHaveLength(1);
    expect(pointsEntries[0].signedPoints).toBe(REFERRAL_REWARD_POINTS);
    const updatedMember = await memberRepo.findOneByOrFail({ id: member.id });
    expect(updatedMember.points).toBe(REFERRAL_REWARD_POINTS);

    const audits = await dataSource.getRepository(LoyaltyProjectionAudit).find({
      where: [
        { aggregateType: 'LoyaltyReferral', aggregateId: initial.id },
        {
          aggregateType: 'LoyaltyPointsEntry',
          aggregateId: pointsEntries[0].id,
        },
        { aggregateType: 'LoyaltyMember', aggregateId: member.id },
      ],
    });
    expect(audits).toHaveLength(4);
    expect(audits.map((audit) => audit.mutation).sort()).toEqual(
      ['CREATED', 'CREATED', 'POINTS_CHANGED', 'REWARDED'].sort(),
    );
    for (const audit of audits) {
      await dataSource.getRepository(CommerceOutboxEvent).findOneByOrFail({
        producer: 'core-loyalty',
        idempotencyKey: `loyalty-projected:${audit.aggregateType}:${audit.aggregateId}:v${audit.recordVersion}`,
      });
    }
  });

  it('403 for staff on GET /my/referral', async () => {
    const ceo = await loginAs(app, 'ceo');
    const res = await request(app.getHttpServer())
      .get('/my/referral')
      .set('Authorization', `Bearer ${ceo.accessToken}`);
    expect(res.status).toBe(403);
  });
});
