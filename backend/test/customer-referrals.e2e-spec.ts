import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { User } from '../src/database/entities/user.entity';
import { CustomerReferral } from '../src/database/entities/customer-referral.entity';
import { loginAs, loginAsCustomer } from './helpers/login.helper';
import { createTestApp } from './helpers/app.helper';
import { normalizeIranPhone } from '../src/common/normalize-iran-phone';

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

  it('GET /my/referral — USER gets code, stats, invite list', async () => {
    const { accessToken } = await loginAsCustomer(app, '09180000001');

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
    const referrer = await loginAsCustomer(app, '09180000002');
    const dash = await request(app.getHttpServer())
      .get('/my/referral')
      .set('Authorization', `Bearer ${referrer.accessToken}`);
    const code = dash.body.data.referralCode as string;

    const newPhone = '09180000999';
    const otpReq = await request(app.getHttpServer())
      .post('/auth/otp/request')
      .send({ phone: newPhone, referralCode: code });
    expect(otpReq.status).toBe(200);

    const codeRes = await request(app.getHttpServer()).get(
      `/auth/_test/last-otp/${newPhone}`,
    );
    const verify = await request(app.getHttpServer())
      .post('/auth/otp/verify')
      .send({
        challengeId: otpReq.body.data.challengeId,
        code: codeRes.body.data.code,
      });
    expect(verify.status).toBe(200);

    const referred = await dataSource
      .getRepository(User)
      .findOneByOrFail({ phone: normalizeIranPhone(newPhone) });
    const row = await dataSource
      .getRepository(CustomerReferral)
      .findOneBy({ referredUserId: referred.id });
    expect(row?.status).toBe('SIGNED_UP');
  });

  it('403 for staff on GET /my/referral', async () => {
    const ceo = await loginAs(app, 'ceo');
    const res = await request(app.getHttpServer())
      .get('/my/referral')
      .set('Authorization', `Bearer ${ceo.accessToken}`);
    expect(res.status).toBe(403);
  });
});
