import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { User } from '../src/database/entities/user.entity';
import { TWO_FACTOR_PROVIDER } from '../src/modules/auth/providers/two-factor-provider.interface';
import { MockTwoFactorProvider } from '../src/modules/auth/providers/mock-two-factor.provider';
import { loginAsCustomer } from './helpers/login.helper';
import { createTestApp } from './helpers/app.helper';

/** Phase 17 — «پروفایل من»: identity fields + completion % + email
 * verification. See docs/DB_SCHEMA.md Phase 17. */
describe('Phase 17 — user profile (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let twoFactor: MockTwoFactorProvider;

  beforeEach(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    twoFactor = app.get<MockTwoFactorProvider>(TWO_FACTOR_PROVIDER);
  });

  afterEach(async () => {
    await app.close();
  });

  function auth(token: string | null | undefined) {
    return `Bearer ${token}`;
  }

  it('GET /my/profile reflects a low completion for a fresh customer', async () => {
    const { accessToken } = await loginAsCustomer(app, '09901119911');
    const res = await request(app.getHttpServer())
      .get('/my/profile')
      .set('Authorization', auth(accessToken));
    expect(res.status).toBe(200);
    expect(res.body.data.nationalId).toBeNull();
    expect(res.body.data.completionPct).toBeLessThan(100);
  });

  it('PATCH validates identity, saves email, and encrypts profile PII at rest', async () => {
    const { accessToken, userId } = await loginAsCustomer(app, '09901119922');

    const invalid = await request(app.getHttpServer())
      .patch('/my/profile')
      .set('Authorization', auth(accessToken))
      .send({ nationalId: '1234567890' });
    expect(invalid.status).toBe(400);

    const valid = await request(app.getHttpServer())
      .patch('/my/profile')
      .set('Authorization', auth(accessToken))
      .send({
        nationalId: '0012345679',
        passportNo: 'A12345678',
        birthDate: '1990-01-01',
        address: 'تهران، خیابان ولیعصر، پلاک ۱۲',
        email: 'Customer.Profile@Test.Example',
      });
    expect(valid.status).toBe(200);
    expect(valid.body.data.nationalId).toBe('0012345679');
    expect(valid.body.data.passportNo).toBe('A12345678');
    expect(valid.body.data.birthDate).toBeTruthy();
    expect(valid.body.data.address).toBe('تهران، خیابان ولیعصر، پلاک ۱۲');
    expect(valid.body.data.email).toBe('customer.profile@test.example');
    expect(valid.body.data.completionPct).toEqual(expect.any(Number));
    expect(Number.isInteger(valid.body.data.completionPct)).toBe(true);

    const row = await dataSource
      .getRepository(User)
      .findOneByOrFail({ id: userId! });
    expect(row.nationalIdEnc).not.toContain('0012345679');
    expect(row.nationalIdHash).toBeTruthy();
    expect(row.addressEnc).toBeTruthy();
    expect(row.addressEnc).not.toContain('خیابان ولیعصر');
    expect(row.email).toBe('customer.profile@test.example');
    expect(row.emailVerifiedAt).toBeNull();
  });

  it('email verification: request → wrong code rejected → correct code stamps emailVerifiedAt', async () => {
    const { accessToken, userId } = await loginAsCustomer(app, '09901119933');
    await dataSource
      .getRepository(User)
      .update({ id: userId! }, { email: 'customer@test.example' });

    const requestRes = await request(app.getHttpServer())
      .post('/my/profile/email/verify-request')
      .set('Authorization', auth(accessToken));
    expect(requestRes.status).toBe(200);
    const challengeId = requestRes.body.data.challengeId as string;
    const code = twoFactor.getLastCode(userId!)!;
    expect(code).toBeTruthy();

    const wrong = await request(app.getHttpServer())
      .post('/my/profile/email/verify')
      .set('Authorization', auth(accessToken))
      .send({ challengeId, code: '000000' });
    expect(wrong.status).toBe(401);

    const ok = await request(app.getHttpServer())
      .post('/my/profile/email/verify')
      .set('Authorization', auth(accessToken))
      .send({ challengeId, code });
    expect(ok.status).toBe(200);
    expect(ok.body.data.verified).toBe(true);

    const row = await dataSource
      .getRepository(User)
      .findOneByOrFail({ id: userId! });
    expect(row.emailVerifiedAt).not.toBeNull();
  });

  it('PATCH rejects invalid and already-used profile emails', async () => {
    const first = await loginAsCustomer(app, '09901119955');
    const second = await loginAsCustomer(app, '09901119966');
    await dataSource
      .getRepository(User)
      .update({ id: first.userId! }, { email: 'already-used@test.example' });

    const invalid = await request(app.getHttpServer())
      .patch('/my/profile')
      .set('Authorization', auth(second.accessToken))
      .send({ email: 'not-an-email' });
    expect(invalid.status).toBe(400);

    const duplicate = await request(app.getHttpServer())
      .patch('/my/profile')
      .set('Authorization', auth(second.accessToken))
      .send({ email: 'Already-Used@Test.Example' });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('CONFLICT');
  });

  it('email verify-request 400s when no email is on file yet', async () => {
    const { accessToken } = await loginAsCustomer(app, '09901119944');
    const res = await request(app.getHttpServer())
      .post('/my/profile/email/verify-request')
      .set('Authorization', auth(accessToken));
    expect(res.status).toBe(400);
  });
});
