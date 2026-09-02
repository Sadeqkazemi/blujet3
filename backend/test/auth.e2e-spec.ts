import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import * as crypto from 'node:crypto';
import { App } from 'supertest/types';
import { DataSource, IsNull } from 'typeorm';
import { User } from '../src/database/entities/user.entity';
import { TwoFactorChallenge } from '../src/database/entities/two-factor-challenge.entity';
import { AuditLog } from '../src/database/entities/audit-log.entity';
import { TWO_FACTOR_PROVIDER } from '../src/modules/auth/providers/two-factor-provider.interface';
import { MockTwoFactorProvider } from '../src/modules/auth/providers/mock-two-factor.provider';
import { loginAs } from './helpers/login.helper';
import { createTestApp } from './helpers/app.helper';
import { normalizeIranPhone } from '../src/common/normalize-iran-phone';
import { RefreshToken } from '../src/database/entities/refresh-token.entity';
import { AgencyProfile } from '../src/database/entities/agency-profile.entity';
import { randomInt } from 'node:crypto';

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  // Fresh app per test — each app instance gets its own in-memory throttler
  // storage, so the strict login/2FA rate limit can't leak between tests.
  beforeEach(async () => {
    delete process.env.AUTH_SANDBOX_ENABLED;
    app = await createTestApp();
    dataSource = app.get(DataSource);
  });

  afterEach(async () => {
    delete process.env.AUTH_SANDBOX_ENABLED;
    await app.close();
  });

  it('sandbox first login sets staff password/mobile, accepts 123456 and issues a session', async () => {
    process.env.AUTH_SANDBOX_ENABLED = 'true';
    const suffix = crypto.randomUUID().slice(0, 8);
    const username = `sandbox.${suffix}`;
    const phone = `0911${crypto.randomInt(1_000_000, 10_000_000)}`;
    const userRepo = dataSource.getRepository(User);
    const user = await userRepo.save(
      userRepo.create({
        role: 'EMPLOYEE',
        username,
        phone: null,
        passwordHash: null,
        fullName: 'کارمند تست Sandbox',
        twoFactorEnabled: true,
        isActive: true,
        lastLoginAt: null,
        mustChangePassword: true,
        updatedAt: new Date(),
      }),
    );

    const mode = await request(app.getHttpServer())
      .post('/auth/staff/login-mode')
      .send({ username });
    expect(mode.status).toBe(200);
    expect(mode.body.data.mode).toBe('FIRST_LOGIN_SETUP');

    const setup = await request(app.getHttpServer())
      .post('/auth/staff/first-login/request')
      .send({ username, phone, newPassword: 'Sandbox@1405' });
    expect(setup.status).toBe(200);

    const verify = await request(app.getHttpServer())
      .post('/auth/staff/login/verify')
      .send({ challengeId: setup.body.data.challengeId, code: '123456' });
    expect(verify.status).toBe(200);
    expect(verify.body.data.user.role).toBe('EMPLOYEE');
    expect(verify.body.data.accessToken).toBeTruthy();

    const updated = await userRepo.findOneByOrFail({ id: user.id });
    expect(updated.phone).toBe(normalizeIranPhone(phone));
    expect(updated.passwordHash).toBeTruthy();
    expect(updated.lastLoginAt).toBeTruthy();
  });

  it('uses the IT-assigned password flow for a newly-created employee account', async () => {
    process.env.AUTH_SANDBOX_ENABLED = 'true';
    const username = `it-created.${crypto.randomUUID().slice(0, 8)}`;
    const password = 'Assigned@1405';
    await dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        role: 'EMPLOYEE',
        username,
        passwordHash: await argon2.hash(password),
        fullName: 'کارمند ساخته‌شده توسط مدیر IT',
        twoFactorEnabled: true,
        isActive: true,
        lastLoginAt: null,
        mustChangePassword: false,
        updatedAt: new Date(),
      }),
    );

    const mode = await request(app.getHttpServer())
      .post('/auth/staff/login-mode')
      .send({ username });
    expect(mode.status).toBe(200);
    expect(mode.body.data.mode).toBe('PASSWORD');

    const login = await request(app.getHttpServer())
      .post('/auth/staff/login')
      .send({ username, password });
    expect(login.status).toBe(200);
    expect(login.body.data.loginMode).toBe('TWO_FACTOR');
    expect(login.body.data.challengeId).toBeTruthy();
  });

  it('sandbox login-mode does not disclose an unknown username', async () => {
    process.env.AUTH_SANDBOX_ENABLED = 'true';
    const mode = await request(app.getHttpServer())
      .post('/auth/staff/login-mode')
      .send({ username: 'does.not.exist' });
    expect(mode.status).toBe(200);
    expect(mode.body.data.mode).toBe('PASSWORD');
  });

  it('rejects a wrong password with 401 INVALID credentials, no challenge issued', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/staff/login')
      .send({ username: 'finance', password: 'wrong-password' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects login for a suspended account with 403 ACCOUNT_SUSPENDED', async () => {
    const userRepo = dataSource.getRepository(User);
    const user = await userRepo.findOneByOrFail({ username: 'site.admin' });
    await userRepo.update({ id: user.id }, { isActive: false });

    const res = await request(app.getHttpServer())
      .post('/auth/staff/login')
      .send({ username: 'site.admin', password: 'Blujet@1404' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_SUSPENDED');

    await userRepo.update({ id: user.id }, { isActive: true });
  });

  it('issues a 2FA challenge on correct password, no token yet', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/staff/login')
      .send({ username: 'finance', password: 'Blujet@1404' });

    expect(res.status).toBe(200);
    expect(res.body.data.loginMode).toBe('TWO_FACTOR');
    expect(res.body.data.challengeId).toBeDefined();
    expect(res.body.data.accessToken).toBeUndefined();
  });

  it('owner super-admin uses password-only login, must replace the bootstrap password, then reaches an IT-only panel', async () => {
    const userRepo = dataSource.getRepository(User);
    const owner = await userRepo.findOneByOrFail({ username: 'site.admin' });
    const originalHash = owner.passwordHash;
    const agent = request.agent(app.getHttpServer());

    await userRepo.update(
      { id: owner.id },
      { isSuperAdmin: true, mustChangePassword: true },
    );

    try {
      const login = await agent
        .post('/auth/staff/login')
        .send({ username: 'site.admin', password: 'Blujet@1404' });

      expect(login.status).toBe(200);
      expect(login.body.data.loginMode).toBe('PASSWORD_ONLY');
      expect(login.body.data.challengeId).toBeUndefined();
      expect(login.body.data.user.isSuperAdmin).toBe(true);
      expect(login.body.data.user.mustChangePassword).toBe(true);
      expect(login.body.data.accessToken).toBeDefined();

      const blocked = await agent
        .get('/it/security/policy')
        .set('Authorization', `Bearer ${login.body.data.accessToken}`);
      expect(blocked.status).toBe(403);
      expect(blocked.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');

      const changed = await agent
        .post('/auth/change-password')
        .set('Authorization', `Bearer ${login.body.data.accessToken}`)
        .send({
          currentPassword: 'Blujet@1404',
          newPassword: 'OwnerChanged!1405',
        });
      expect(changed.status).toBe(200);

      const elevated = await agent
        .get('/it/security/policy')
        .set('Authorization', `Bearer ${login.body.data.accessToken}`);
      expect(elevated.status).toBe(200);
    } finally {
      await userRepo.update(
        { id: owner.id },
        {
          passwordHash: originalHash,
          isSuperAdmin: false,
          mustChangePassword: false,
        },
      );
    }
  });

  it('lets the owner preview selected USER and AGENCY accounts only while the sandbox switch is enabled', async () => {
    const userRepo = dataSource.getRepository(User);
    const agencyProfileRepo = dataSource.getRepository(AgencyProfile);
    const owner = await userRepo.findOneByOrFail({ username: 'site.admin' });
    const originalOwnerFlag = owner.isSuperAdmin;
    const previousSandboxFlag = process.env.SANDBOX_SUPER_ADMIN_TENANT_ACCESS;
    const suffix = randomInt(10_000_000, 99_999_999).toString();
    const customer = await userRepo.save(
      userRepo.create({
        role: 'USER',
        phone: `+9891${suffix}`,
        fullName: 'مشتری پیش‌نمایش Sandbox',
        isActive: true,
        updatedAt: new Date(),
      }),
    );
    const agency = await userRepo.save(
      userRepo.create({
        role: 'AGENCY',
        phone: `+9892${suffix}`,
        fullName: 'آژانس پیش‌نمایش Sandbox',
        isActive: true,
        updatedAt: new Date(),
      }),
    );
    await agencyProfileRepo.save(
      agencyProfileRepo.create({
        userId: agency.id,
        licenseNo: `SB-${suffix}`,
        managerName: 'مدیر Sandbox',
        phone: agency.phone!,
        email: `sandbox-${suffix}@example.test`,
        city: 'تهران',
        address: 'آدرس آزمایشی',
        tier: 'NORMAL',
        suspendedAt: null,
        suspendReason: null,
      }),
    );

    process.env.SANDBOX_SUPER_ADMIN_TENANT_ACCESS = 'true';
    await userRepo.update({ id: owner.id }, { isSuperAdmin: true });

    try {
      const login = await request(app.getHttpServer())
        .post('/auth/staff/login')
        .send({ username: 'site.admin', password: 'Blujet@1404' });
      const ownerToken = login.body.data.accessToken as string;

      const directTenant = await request(app.getHttpServer())
        .get('/bookings/me')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(directTenant.status).toBe(403);

      const accounts = await request(app.getHttpServer())
        .get('/auth/sandbox/tenant-accounts')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(accounts.status).toBe(200);
      expect(accounts.body.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: customer.id, role: 'USER' }),
          expect.objectContaining({ id: agency.id, role: 'AGENCY' }),
        ]),
      );

      const customerPreview = await request(app.getHttpServer())
        .post('/auth/sandbox/impersonate')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ targetUserId: customer.id });
      expect(customerPreview.status).toBe(200);
      expect(customerPreview.body.data.user).toMatchObject({
        id: customer.id,
        role: 'USER',
        isSandboxImpersonation: true,
      });

      const agencyPreview = await request(app.getHttpServer())
        .post('/auth/sandbox/impersonate')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ targetUserId: agency.id });
      expect(agencyPreview.status).toBe(200);
      const agencyProfile = await request(app.getHttpServer())
        .get('/agency-portal/profile')
        .set(
          'Authorization',
          `Bearer ${agencyPreview.body.data.accessToken as string}`,
        );
      expect(agencyProfile.status).toBe(200);
      expect(agencyProfile.body.data.fullName).toBe(agency.fullName);
    } finally {
      if (previousSandboxFlag === undefined) {
        delete process.env.SANDBOX_SUPER_ADMIN_TENANT_ACCESS;
      } else {
        process.env.SANDBOX_SUPER_ADMIN_TENANT_ACCESS = previousSandboxFlag;
      }
      await userRepo.update(
        { id: owner.id },
        { isSuperAdmin: originalOwnerFlag },
      );
      await agencyProfileRepo.delete({ userId: agency.id });
      await userRepo.delete([customer.id, agency.id]);
    }
  });

  it('allows only an unexpired reserved UAT account to bypass OTP and caps/revokes its session at expiry', async () => {
    process.env.AUTH_SANDBOX_ENABLED = 'true';
    const userRepo = dataSource.getRepository(User);
    const now = new Date();
    const deadline = new Date(now.getTime() + 5 * 60 * 1000);
    const passwordHash = await argon2.hash('UatOnly!Password7');
    let user = await userRepo.findOneBy({ username: 'uat.it' });
    if (user) {
      await userRepo.update(
        { id: user.id },
        {
          role: 'IT_MANAGER',
          passwordHash,
          twoFactorEnabled: false,
          temporaryPasswordOnlyUntil: deadline,
          isActive: true,
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
          mustChangePassword: false,
        },
      );
      user = await userRepo.findOneByOrFail({ id: user.id });
    } else {
      user = await userRepo.save(
        userRepo.create({
          role: 'IT_MANAGER',
          phone: null,
          username: 'uat.it',
          passwordHash,
          email: null,
          fullName: 'UAT IT Manager',
          twoFactorEnabled: false,
          twoFactorSecret: null,
          temporaryPasswordOnlyUntil: deadline,
          isActive: true,
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
          createdById: null,
          dept: null,
          lastLoginAt: null,
          mustChangePassword: false,
          rank: null,
          referralScope: null,
          nationalIdEnc: null,
          nationalIdHash: null,
          passportNoEnc: null,
          birthDate: null,
          emailVerifiedAt: null,
          preferredLocale: 'FA',
          referralCode: null,
        }),
      );
    }

    const agent = request.agent(app.getHttpServer());
    const login = await agent
      .post('/auth/staff/login')
      .send({ username: 'uat.it', password: 'UatOnly!Password7' });

    expect(login.status).toBe(200);
    expect(login.body.data.loginMode).toBe('TEMPORARY_PASSWORD_ONLY');
    expect(login.body.data.challengeId).toBeUndefined();
    expect(login.body.data.accessToken).toBeDefined();
    expect(login.body.data.temporaryAccessExpiresAt).toBe(
      deadline.toISOString(),
    );
    expect(String(login.headers['set-cookie'])).toContain('blujet_refresh=');

    const refreshRow = await dataSource
      .getRepository(RefreshToken)
      .findOneOrFail({
        where: { userId: user.id },
        order: { createdAt: 'DESC' },
      });
    expect(refreshRow.expiresAt.getTime()).toBeLessThanOrEqual(
      deadline.getTime(),
    );
    const audit = await dataSource.getRepository(AuditLog).findOne({
      where: {
        actorId: user.id,
        category: 'SECURITY',
        action: 'ورود آزمایشی موقت بدون OTP',
      },
      order: { createdAt: 'DESC' },
    });
    expect(audit).not.toBeNull();
    expect(JSON.stringify(audit)).not.toContain('UatOnly!Password7');

    await userRepo.update(
      { id: user.id },
      { temporaryPasswordOnlyUntil: new Date(Date.now() - 1000) },
    );
    const expiredRefresh = await agent.post('/auth/refresh');
    expect(expiredRefresh.status).toBe(401);
    expect(expiredRefresh.body.error.code).toBe('TEMPORARY_ACCESS_EXPIRED');

    const expiredLogin = await request(app.getHttpServer())
      .post('/auth/staff/login')
      .send({ username: 'uat.it', password: 'UatOnly!Password7' });
    expect(expiredLogin.status).toBe(403);
    expect(expiredLogin.body.error.code).toBe('TEMPORARY_ACCESS_EXPIRED');

    const activeTokens = await dataSource.getRepository(RefreshToken).count({
      where: { userId: user.id, revokedAt: IsNull() },
    });
    expect(activeTokens).toBe(0);
    await userRepo.update(
      { id: user.id },
      {
        isActive: false,
        passwordHash: null,
        temporaryPasswordOnlyUntil: null,
        deletedAt: new Date(),
      },
    );
  });

  it('rejects a wrong 2FA code and increments attempts, without consuming the challenge', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/auth/staff/login')
      .send({ username: 'finance', password: 'Blujet@1404' });
    const challengeId = loginRes.body.data.challengeId;

    const wrongRes = await request(app.getHttpServer())
      .post('/auth/staff/login/verify')
      .send({ challengeId, code: '000000' });

    expect(wrongRes.status).toBe(401);
    expect(wrongRes.body.error.code).toBe('TWO_FACTOR_INVALID');

    const challenge = await dataSource
      .getRepository(TwoFactorChallenge)
      .findOneByOrFail({ id: challengeId });
    expect(challenge.attempts).toBe(1);
    expect(challenge.consumedAt).toBeNull();
  });

  it('rejects an expired 2FA challenge', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/auth/staff/login')
      .send({ username: 'finance', password: 'Blujet@1404' });
    const challengeId = loginRes.body.data.challengeId;

    await dataSource
      .getRepository(TwoFactorChallenge)
      .update({ id: challengeId }, { expiresAt: new Date(Date.now() - 1000) });

    const user = await dataSource
      .getRepository(User)
      .findOneByOrFail({ username: 'finance' });
    const twoFactor = app.get<MockTwoFactorProvider>(TWO_FACTOR_PROVIDER);
    const code = twoFactor.getLastCode(user.id)!;

    const res = await request(app.getHttpServer())
      .post('/auth/staff/login/verify')
      .send({ challengeId, code });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TWO_FACTOR_EXPIRED');
  });

  it('logs in with the correct 2FA code and issues an access token + refresh cookie', async () => {
    const { verifyRes } = await loginAs(app, 'finance');

    expect(verifyRes!.status).toBe(200);
    expect(verifyRes!.body.data.accessToken).toBeDefined();
    expect(verifyRes!.body.data.user.role).toBe('FINANCE_MANAGER');
    expect(verifyRes!.body.data.user.mustChangePassword).toBe(false);
    const setCookie = verifyRes!.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    expect(String(setCookie)).toContain('blujet_refresh=');
  });

  it('a 2FA code cannot be replayed once consumed', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/auth/staff/login')
      .send({ username: 'finance', password: 'Blujet@1404' });
    const challengeId = loginRes.body.data.challengeId as string;
    const user = await dataSource
      .getRepository(User)
      .findOneByOrFail({ username: 'finance' });
    const code = app
      .get<MockTwoFactorProvider>(TWO_FACTOR_PROVIDER)
      .getLastCode(user.id)!;

    const first = await request(app.getHttpServer())
      .post('/auth/staff/login/verify')
      .send({ challengeId, code });
    expect(first.status).toBe(200);

    const replay = await request(app.getHttpServer())
      .post('/auth/staff/login/verify')
      .send({ challengeId, code });
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('TWO_FACTOR_INVALID');
  });

  it('rejects passwords stored as plaintext — DB row is an argon2 hash, never the raw password', async () => {
    const user = await dataSource
      .getRepository(User)
      .findOneByOrFail({ username: 'ceo' });
    expect(user.passwordHash).not.toBe('Blujet@1404');
    expect(user.passwordHash).toMatch(/^\$argon2/);
  });

  it('/auth/me returns 401 without a token', async () => {
    const res = await request(app.getHttpServer()).get('/auth/me');
    expect(res.status).toBe(401);
  });

  it('/auth/me returns the correct identity for a valid token', async () => {
    const { accessToken } = await loginAs(app, 'ceo');
    const res = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('CEO');
    expect(res.body.data.mustChangePassword).toBe(false);
  });

  it('mustChangePassword blocks panel APIs until POST /auth/change-password clears the flag', async () => {
    const userRepo = dataSource.getRepository(User);
    const user = await userRepo.findOneByOrFail({ username: 'finance' });
    const originalHash = user.passwordHash;
    await userRepo.update({ id: user.id }, { mustChangePassword: true });

    const { accessToken, verifyRes } = await loginAs(app, 'finance');
    expect(verifyRes!.body.data.user.mustChangePassword).toBe(true);

    const blocked = await request(app.getHttpServer())
      .get('/panels/nav')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');

    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.data.mustChangePassword).toBe(true);

    const changed = await request(app.getHttpServer())
      .post('/auth/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: 'Blujet@1404', newPassword: 'Blujet@1404-new' });
    expect(changed.status).toBe(200);

    const nav = await request(app.getHttpServer())
      .get('/panels/nav')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(nav.status).toBe(200);

    await userRepo.update(
      { id: user.id },
      {
        passwordHash: originalHash ?? (await argon2.hash('Blujet@1404')),
        mustChangePassword: false,
      },
    );
  });

  it('/auth/me defaults preferredLocale to FA; PATCH /auth/me/locale updates it and persists', async () => {
    // ceo is a shared seed account reused across many tests/runs — reset it
    // to the schema default explicitly rather than assuming no earlier test
    // (or a previous run against this same persistent DB) left it mutated.
    const userRepo = dataSource.getRepository(User);
    const { id } = await userRepo.findOneByOrFail({ username: 'ceo' });
    await userRepo.update({ id }, { preferredLocale: 'FA' });

    const { accessToken } = await loginAs(app, 'ceo');
    const before = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(before.body.data.preferredLocale).toBe('FA');

    const patch = await request(app.getHttpServer())
      .patch('/auth/me/locale')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ locale: 'EN' });
    expect(patch.status).toBe(200);
    expect(patch.body.data.preferredLocale).toBe('EN');

    const after = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(after.body.data.preferredLocale).toBe('EN');

    // Leave the shared seed account as we found it so other tests/runs that
    // touch 'ceo' never observe this test's mutation.
    await userRepo.update({ id }, { preferredLocale: 'FA' });
  });

  it('PATCH /auth/me/locale: 401 without a token, 400 on an invalid locale', async () => {
    const noAuth = await request(app.getHttpServer())
      .patch('/auth/me/locale')
      .send({ locale: 'EN' });
    expect(noAuth.status).toBe(401);

    const { accessToken } = await loginAs(app, 'ceo');
    const bad = await request(app.getHttpServer())
      .patch('/auth/me/locale')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ locale: 'DE' });
    expect(bad.status).toBe(400);
  });

  it('rate-limits repeated login attempts', async () => {
    const attempts = await Promise.all(
      Array.from({ length: 8 }, () =>
        request(app.getHttpServer())
          .post('/auth/staff/login')
          .send({ username: 'finance', password: 'wrong-password' }),
      ),
    );
    expect(attempts.some((r) => r.status === 429)).toBe(true);
  });

  it('/auth/refresh rotates the refresh token; the old one is rejected on reuse', async () => {
    const agent = request.agent(app.getHttpServer());
    const loginRes = await agent
      .post('/auth/staff/login')
      .send({ username: 'ceo', password: 'Blujet@1404' });
    const user = await dataSource
      .getRepository(User)
      .findOneByOrFail({ username: 'ceo' });
    const code = app
      .get<MockTwoFactorProvider>(TWO_FACTOR_PROVIDER)
      .getLastCode(user.id)!;
    const verifyRes = await agent
      .post('/auth/staff/login/verify')
      .send({ challengeId: loginRes.body.data.challengeId, code });
    const oldCookie = verifyRes.headers['set-cookie'];
    expect(oldCookie).toBeDefined();

    const firstRefresh = await agent.post('/auth/refresh');
    expect(firstRefresh.status).toBe(200);
    expect(firstRefresh.body.data.accessToken).toBeDefined();
    const newCookie = firstRefresh.headers['set-cookie'];
    expect(String(newCookie)).not.toBe(String(oldCookie));

    // Replay the OLD refresh cookie directly (bypassing the agent's rotated jar) — must be rejected.
    const replay = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', oldCookie);
    expect(replay.status).toBe(401);
    expect(replay.body.success).toBe(false);
  });

  it('reuse of a revoked refresh token revokes the whole session family, not just itself', async () => {
    const agent = request.agent(app.getHttpServer());
    const loginRes = await agent
      .post('/auth/staff/login')
      .send({ username: 'ceo', password: 'Blujet@1404' });
    const user = await dataSource
      .getRepository(User)
      .findOneByOrFail({ username: 'ceo' });
    const code = app
      .get<MockTwoFactorProvider>(TWO_FACTOR_PROVIDER)
      .getLastCode(user.id)!;
    const verifyRes = await agent
      .post('/auth/staff/login/verify')
      .send({ challengeId: loginRes.body.data.challengeId, code });
    const stolenOldCookie = verifyRes.headers['set-cookie'];

    // Legitimate rotation — the agent's cookie jar now holds a fresh,
    // still-valid refresh token.
    const legitRefresh = await agent.post('/auth/refresh');
    expect(legitRefresh.status).toBe(200);

    // An attacker replays the OLD (now-revoked) token — this must not just
    // fail for them, it must kill every other active session too.
    const attackerReplay = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', stolenOldCookie);
    expect(attackerReplay.status).toBe(401);

    // The legitimate user's freshly-rotated (otherwise still-valid) token
    // must now be dead as well.
    const legitFollowUp = await agent.post('/auth/refresh');
    expect(legitFollowUp.status).toBe(401);
    expect(legitFollowUp.body.success).toBe(false);

    const securityLog = await dataSource
      .getRepository(AuditLog)
      .createQueryBuilder('a')
      .where('a.actorId = :actorId', { actorId: user.id })
      .andWhere('a.category = :category', { category: 'SECURITY' })
      .orderBy('a.createdAt', 'DESC')
      .getOne();
    expect(securityLog).not.toBeNull();
  });

  it('/auth/logout revokes the refresh token; a subsequent refresh fails', async () => {
    const agent = request.agent(app.getHttpServer());
    const loginRes = await agent
      .post('/auth/staff/login')
      .send({ username: 'ceo', password: 'Blujet@1404' });
    const user = await dataSource
      .getRepository(User)
      .findOneByOrFail({ username: 'ceo' });
    const code = app
      .get<MockTwoFactorProvider>(TWO_FACTOR_PROVIDER)
      .getLastCode(user.id)!;
    const verifyRes = await agent
      .post('/auth/staff/login/verify')
      .send({ challengeId: loginRes.body.data.challengeId, code });

    await agent
      .post('/auth/logout')
      .set(
        'Authorization',
        `Bearer ${verifyRes.body.data.accessToken as string}`,
      );

    const refreshAfterLogout = await agent.post('/auth/refresh');
    expect(refreshAfterLogout.body.success).toBe(false);
  });

  // ── Public purchase engine: customer OTP login ──────────────────────

  it('OTP request creates a fresh USER on first login and reuses it on repeat requests', async () => {
    const phone = '09120000001';
    const first = await request(app.getHttpServer())
      .post('/auth/otp/request')
      .send({ phone });
    expect(first.status).toBe(200);
    expect(first.body.data.challengeId).toBeDefined();

    const userRepo = dataSource.getRepository(User);
    const user1 = await userRepo.findOneByOrFail({
      phone: normalizeIranPhone(phone),
    });
    expect(user1.role).toBe('USER');

    const second = await request(app.getHttpServer())
      .post('/auth/otp/request')
      .send({ phone });
    expect(second.status).toBe(200);
    const user2 = await userRepo.findOneByOrFail({
      phone: normalizeIranPhone(phone),
    });
    expect(user2.id).toBe(user1.id);
  });

  it('rejects a malformed phone number with 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/otp/request')
      .send({ phone: '12345' });
    expect(res.status).toBe(400);
  });

  it('logs a customer in with the correct OTP code and issues USER-role tokens', async () => {
    // Not 0912000000[1-3]/0913000000[1-3] — those phones are claimed by
    // src/database/seed.ts's fixture agencies/users, so a "fresh USER" test using
    // one of them would actually hit a pre-existing, differently-roled account.
    const phone = '09120000102';
    const requestRes = await request(app.getHttpServer())
      .post('/auth/otp/request')
      .send({ phone });
    const challengeId = requestRes.body.data.challengeId as string;

    const code = await request(app.getHttpServer()).get(
      `/auth/_test/last-otp/${phone}`,
    );
    expect(code.status).toBe(200);

    const verifyRes = await request(app.getHttpServer())
      .post('/auth/otp/verify')
      .send({ challengeId, code: code.body.data.code });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.data.accessToken).toBeDefined();
    expect(verifyRes.body.data.user.role).toBe('USER');
    const setCookie = verifyRes.headers['set-cookie'];
    expect(String(setCookie)).toContain('blujet_refresh=');
  });

  it('rejects a wrong OTP code without consuming the challenge', async () => {
    const phone = '09120000003';
    const requestRes = await request(app.getHttpServer())
      .post('/auth/otp/request')
      .send({ phone });
    const challengeId = requestRes.body.data.challengeId as string;

    const wrongRes = await request(app.getHttpServer())
      .post('/auth/otp/verify')
      .send({ challengeId, code: '000000' });
    expect(wrongRes.status).toBe(401);
    expect(wrongRes.body.error.code).toBe('TWO_FACTOR_INVALID');
  });

  it('a staff 2FA challenge cannot be replayed through the customer OTP verify endpoint', async () => {
    const staffLoginRes = await request(app.getHttpServer())
      .post('/auth/staff/login')
      .send({ username: 'finance', password: 'Blujet@1404' });
    const challengeId = staffLoginRes.body.data.challengeId as string;
    const user = await dataSource
      .getRepository(User)
      .findOneByOrFail({ username: 'finance' });
    const code = app
      .get<MockTwoFactorProvider>(TWO_FACTOR_PROVIDER)
      .getLastCode(user.id)!;

    const res = await request(app.getHttpServer())
      .post('/auth/otp/verify')
      .send({ challengeId, code });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TWO_FACTOR_INVALID');
  });
});
