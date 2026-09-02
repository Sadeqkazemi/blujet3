import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as crypto from 'node:crypto';
import { DataSource } from 'typeorm';
import { User } from '../src/database/entities/user.entity';
import { createTestApp } from './helpers/app.helper';

function uniqueEmail(tag: string): string {
  return `${tag}-${crypto.randomUUID().slice(0, 8)}@example.com`;
}

/** Phase 51: فراموشی رمز — email path. An alternative to phone+SMS OTP for
 * customers whose account has a VERIFIED email (Phase 17), reusing the same
 * TwoFactorChallenge machinery under a dedicated PASSWORD_RESET_EMAIL
 * purpose, then handing off into the existing POST /auth/set-password (no
 * current-password check). See docs/API.md's Phase 51 section. */
describe('Phase 51 — password reset via verified email (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  beforeEach(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
  });

  afterEach(async () => {
    await app.close();
  });

  async function makeVerifiedCustomer(email: string) {
    const repo = dataSource.getRepository(User);
    return repo.save(
      repo.create({
        role: 'USER',
        email,
        fullName: 'مشتری تست ایمیل',
        emailVerifiedAt: new Date(),
        updatedAt: new Date(),
      }),
    );
  }

  describe('POST /auth/password-reset/email/request', () => {
    it('issues a challenge for an account with a verified email', async () => {
      const email = uniqueEmail('reset-ok');
      await makeVerifiedCustomer(email);

      const res = await request(app.getHttpServer())
        .post('/auth/password-reset/email/request')
        .send({ email });
      expect(res.status).toBe(200);
      expect(res.body.data.challengeId).toBeTruthy();
    });

    it('401s when no account has that verified email', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/password-reset/email/request')
        .send({ email: uniqueEmail('never-registered') });
      expect(res.status).toBe(401);
    });

    it('401s when the email exists but was never verified', async () => {
      const email = uniqueEmail('unverified');
      const repo = dataSource.getRepository(User);
      await repo.save(
        repo.create({
          role: 'USER',
          email,
          fullName: 'ایمیل تأییدنشده',
          updatedAt: new Date(),
        }),
      );

      const res = await request(app.getHttpServer())
        .post('/auth/password-reset/email/request')
        .send({ email });
      expect(res.status).toBe(401);
    });

    it('403s a suspended account even with a verified email', async () => {
      const email = uniqueEmail('suspended-reset');
      const user = await makeVerifiedCustomer(email);
      await dataSource
        .getRepository(User)
        .update({ id: user.id }, { isActive: false });

      const res = await request(app.getHttpServer())
        .post('/auth/password-reset/email/request')
        .send({ email });
      expect(res.status).toBe(403);
    });

    it('400s a malformed email', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/password-reset/email/request')
        .send({ email: 'not-an-email' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /auth/password-reset/email/verify', () => {
    it('verifies the emailed code, issues tokens, and is usable to set a new password', async () => {
      const email = uniqueEmail('reset-full-flow');
      await makeVerifiedCustomer(email);

      const requestRes = await request(app.getHttpServer())
        .post('/auth/password-reset/email/request')
        .send({ email });
      expect(requestRes.status).toBe(200);

      const codeRes = await request(app.getHttpServer()).get(
        `/auth/_test/last-password-reset-email-code/${email}`,
      );
      expect(codeRes.status).toBe(200);

      const verifyRes = await request(app.getHttpServer())
        .post('/auth/password-reset/email/verify')
        .send({
          challengeId: requestRes.body.data.challengeId,
          code: codeRes.body.data.code,
        });
      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.data.accessToken).toBeTruthy();
      expect(verifyRes.body.data.user.role).toBe('USER');

      const setRes = await request(app.getHttpServer())
        .post('/auth/set-password')
        .set('Authorization', `Bearer ${verifyRes.body.data.accessToken}`)
        .send({ newPassword: 'FreshEmailPw1!' });
      expect(setRes.status).toBe(200);
    });

    it('401s a wrong code', async () => {
      const email = uniqueEmail('reset-wrong-code');
      await makeVerifiedCustomer(email);
      const requestRes = await request(app.getHttpServer())
        .post('/auth/password-reset/email/request')
        .send({ email });

      const res = await request(app.getHttpServer())
        .post('/auth/password-reset/email/verify')
        .send({
          challengeId: requestRes.body.data.challengeId,
          code: '000000',
        });
      expect(res.status).toBe(401);
    });

    it('401s an unknown challenge id', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/password-reset/email/verify')
        .send({
          challengeId: '00000000-0000-0000-0000-000000000000',
          code: '123456',
        });
      expect(res.status).toBe(401);
    });

    it("401s reusing a customer OTP challenge id — purposes don't cross over", async () => {
      const phone = '09140000001';
      const otpReq = await request(app.getHttpServer())
        .post('/auth/otp/request')
        .send({ phone });

      const res = await request(app.getHttpServer())
        .post('/auth/password-reset/email/verify')
        .send({ challengeId: otpReq.body.data.challengeId, code: '123456' });
      expect(res.status).toBe(401);
    });
  });

  describe('GET /auth/_test/last-password-reset-email-code/:email', () => {
    it('404s when no challenge/code has been issued', async () => {
      const res = await request(app.getHttpServer()).get(
        '/auth/_test/last-password-reset-email-code/nothing-sent@example.com',
      );
      expect(res.status).toBe(404);
    });
  });
});
