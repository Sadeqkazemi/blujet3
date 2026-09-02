import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, IsNull, MoreThan } from 'typeorm';
import { RefreshToken } from '../src/database/entities/refresh-token.entity';
import { loginAs, loginAsCustomer } from './helpers/login.helper';
import { createTestApp } from './helpers/app.helper';

function extractRefreshCookie(
  setCookie: string | string[] | undefined,
): string {
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (!raw) throw new Error('No set-cookie header');
  return raw.split(';')[0];
}

describe('My sessions (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  beforeEach(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET/DELETE /my/sessions — USER lists own devices; revoke other session', async () => {
    const first = await loginAsCustomer(app, '09180000001');
    const userId = first.userId!;

    // Simulate a second device login (issues another refresh token).
    const secondLogin = await request(app.getHttpServer())
      .post('/auth/otp/request')
      .send({ phone: '09180000001' });
    const codeRes = await request(app.getHttpServer()).get(
      '/auth/_test/last-otp/09180000001',
    );
    const secondVerify = await request(app.getHttpServer())
      .post('/auth/otp/verify')
      .set('User-Agent', 'blujet-android/1.0')
      .send({
        challengeId: secondLogin.body.data.challengeId,
        code: codeRes.body.data.code,
      });
    expect(secondVerify.status).toBe(200);
    const currentCookie = extractRefreshCookie(
      secondVerify.headers['set-cookie'],
    );

    const list = await request(app.getHttpServer())
      .get('/my/sessions')
      .set('Authorization', `Bearer ${secondVerify.body.data.accessToken}`)
      .set('Cookie', currentCookie);
    expect(list.status).toBe(200);
    expect(list.body.data.length).toBeGreaterThanOrEqual(2);
    const current = list.body.data.find(
      (s: { isCurrent: boolean }) => s.isCurrent,
    );
    const other = list.body.data.find(
      (s: { isCurrent: boolean }) => !s.isCurrent,
    );
    expect(current).toBeDefined();
    expect(other).toBeDefined();

    const forbidCurrent = await request(app.getHttpServer())
      .delete(`/my/sessions/${current.id}`)
      .set('Authorization', `Bearer ${secondVerify.body.data.accessToken}`)
      .set('Cookie', currentCookie);
    expect(forbidCurrent.status).toBe(403);

    const revoke = await request(app.getHttpServer())
      .delete(`/my/sessions/${other.id}`)
      .set('Authorization', `Bearer ${secondVerify.body.data.accessToken}`)
      .set('Cookie', currentCookie);
    expect(revoke.status).toBe(200);

    const revoked = await dataSource
      .getRepository(RefreshToken)
      .findOneByOrFail({ id: other.id });
    expect(revoked.revokedAt).not.toBeNull();

    const after = await dataSource.getRepository(RefreshToken).findBy({
      userId,
      revokedAt: IsNull(),
      expiresAt: MoreThan(new Date()),
    });
    expect(after.some((r) => r.id === other.id)).toBe(false);
    expect(after.some((r) => r.id === current.id)).toBe(true);
  });

  it('403 for staff; 404 when revoking another user session', async () => {
    const customer = await loginAsCustomer(app, '09180000002');
    const rows = await dataSource
      .getRepository(RefreshToken)
      .findBy({ userId: customer.userId!, revokedAt: IsNull() });
    expect(rows.length).toBeGreaterThan(0);

    const ceo = await loginAs(app, 'ceo');
    const forbidden = await request(app.getHttpServer())
      .get('/my/sessions')
      .set('Authorization', `Bearer ${ceo.accessToken}`);
    expect(forbidden.status).toBe(403);

    const other = await loginAsCustomer(app, '09180000004');
    const notFound = await request(app.getHttpServer())
      .delete(`/my/sessions/${rows[0].id}`)
      .set('Authorization', `Bearer ${other.accessToken}`);
    expect(notFound.status).toBe(404);
  });
});
