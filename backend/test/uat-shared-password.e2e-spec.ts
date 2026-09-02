import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { INestApplication } from '@nestjs/common';
import * as argon2 from 'argon2';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, In, IsNull } from 'typeorm';
import { AgencyCreditLine } from '../src/database/entities/agency-credit-line.entity';
import { AgencyProfile } from '../src/database/entities/agency-profile.entity';
import { AgencyDocument } from '../src/database/entities/agency-document.entity';
import { AgencySeatRequest } from '../src/database/entities/agency-seat-request.entity';
import { AuditLog } from '../src/database/entities/audit-log.entity';
import { Booking } from '../src/database/entities/booking.entity';
import { CartableTask } from '../src/database/entities/cartable-task.entity';
import { LedgerEntry } from '../src/database/entities/ledger-entry.entity';
import { RefreshToken } from '../src/database/entities/refresh-token.entity';
import { StoredFile } from '../src/database/entities/stored-file.entity';
import { User } from '../src/database/entities/user.entity';
import {
  AgencySeatRequestPayMethod,
  AgencySeatRequestStatus,
  CabinClass,
  Role,
} from '../src/database/enums';
import { getSandboxOtpCode } from '../src/common/sandbox-auth';
import { normalizeIranPhone } from '../src/common/normalize-iran-phone';
import {
  TEMPORARY_PANEL_ACCOUNTS,
  TEMPORARY_PHONE_LOGIN_ACCOUNTS,
} from '../src/database/temporary-panel-accounts';
import { createTestApp } from './helpers/app.helper';

const backendRoot = path.join(__dirname, '..');
const ALL_USERNAMES = [
  ...TEMPORARY_PANEL_ACCOUNTS.map(({ username }) => username),
  ...TEMPORARY_PHONE_LOGIN_ACCOUNTS.map(({ username }) => username),
];
const ALL_USERNAME_SET = new Set<string>(ALL_USERNAMES);

const STRONG_PASSWORD = 'Blujet@UAT-Shared1404!';
const OTHER_STRONG_PASSWORD = 'Blujet@UAT-Shared1404-Rotated!';
const TSX_CLI = path.join(
  backendRoot,
  'node_modules',
  'tsx',
  'dist',
  'cli.mjs',
);

function runScript(
  script: string,
  extraEnv: Record<string, string | undefined>,
  extraArgs: string[] = [],
): { status: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(
      process.execPath,
      [TSX_CLI, script, '--execute', ...extraArgs],
      {
        cwd: backendRoot,
        env: { ...process.env, ...extraEnv },
        encoding: 'utf8',
      },
    );
    return { status: 0, stdout, stderr: '' };
  } catch (error) {
    const err = error as { status?: number; stdout?: string; stderr?: string };
    return {
      status: err.status ?? 1,
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? '',
    };
  }
}

function bootstrap(extraEnv: Record<string, string | undefined> = {}) {
  return runScript('src/database/bootstrap-temporary-panel-accounts.ts', {
    NODE_ENV: 'production',
    AUTH_SANDBOX_ENABLED: 'true',
    TEMP_PANEL_BOOTSTRAP_CONFIRM: 'CREATE_7_DAY_PANEL_TEST_ACCOUNTS',
    UAT_PANEL_SHARED_PASSWORD: STRONG_PASSWORD,
    ...extraEnv,
  });
}

function rotate(extraEnv: Record<string, string | undefined> = {}) {
  return runScript('src/database/rotate-temporary-panel-passwords.ts', {
    NODE_ENV: 'production',
    AUTH_SANDBOX_ENABLED: 'true',
    TEMP_PANEL_ROTATE_CONFIRM: 'ROTATE_TEMPORARY_PANEL_PASSWORDS_SHARED_V1',
    UAT_PANEL_SHARED_PASSWORD: OTHER_STRONG_PASSWORD,
    ...extraEnv,
  });
}

function extendV3(extraEnv: Record<string, string | undefined> = {}) {
  return runScript('src/database/extend-temporary-panel-access-v3.ts', {
    NODE_ENV: 'production',
    AUTH_SANDBOX_ENABLED: 'true',
    TEMP_PANEL_EXTENSION_CONFIRM: 'EXTEND_TEMPORARY_PANEL_ACCESS_7_DAYS_V3',
    ...extraEnv,
  });
}

function reconcilePhoneLogins(
  extraEnv: Record<string, string | undefined> = {},
  preserveConflicts = false,
) {
  return runScript(
    'src/database/reconcile-temporary-phone-login-accounts.ts',
    {
      NODE_ENV: 'production',
      AUTH_SANDBOX_ENABLED: 'true',
      TEMP_PHONE_LOGIN_RECONCILE_CONFIRM: 'RECONCILE_TEMPORARY_PHONE_LOGINS_V1',
      ...extraEnv,
    },
    preserveConflicts ? ['--preserve-conflicts'] : [],
  );
}

describe('UAT shared panel password — bootstrap & rotation (e2e, Phase: shared-uat-panel-password)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let displacedReservedPhoneOwners: Array<{ id: string; phone: string }> = [];

  async function cleanupTemporaryAccounts() {
    const userRepo = dataSource.getRepository(User);
    const existing = await userRepo.find({
      where: { username: In(ALL_USERNAMES) },
      select: { id: true },
    });
    if (existing.length > 0) {
      const ids = existing.map((u) => u.id);
      // AuditLog.actorId is ON DELETE RESTRICT (every bootstrap/rotate run
      // writes one) — must be cleared before the users delete.
      await dataSource.getRepository(AuditLog).delete({ actorId: In(ids) });
      await dataSource.getRepository(RefreshToken).delete({ userId: In(ids) });
      await dataSource
        .getRepository(CartableTask)
        .delete({ assigneeId: In(ids) });
      await userRepo.delete({ username: In(ALL_USERNAMES) });
    }
    for (const displaced of displacedReservedPhoneOwners) {
      await userRepo.update(
        { id: displaced.id, phone: IsNull() },
        { phone: displaced.phone },
      );
    }
    displacedReservedPhoneOwners = [];
  }

  async function prepareTemporaryAccounts() {
    await cleanupTemporaryAccounts();
    const userRepo = dataSource.getRepository(User);
    const normalizedReservedPhones = TEMPORARY_PHONE_LOGIN_ACCOUNTS.map(
      ({ phone }) => normalizeIranPhone(phone),
    );
    const existingOwners = await userRepo.find({
      where: { phone: In(normalizedReservedPhones) },
    });
    displacedReservedPhoneOwners = existingOwners
      .filter(({ username }) => !username || !ALL_USERNAME_SET.has(username))
      .map(({ id, phone }) => ({ id, phone: phone! }));
    for (const displaced of displacedReservedPhoneOwners) {
      await userRepo.update({ id: displaced.id }, { phone: null });
    }
  }

  beforeEach(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    // Start every test from a clean slate for the accounts under test.
    await prepareTemporaryAccounts();
  });

  afterEach(async () => {
    await cleanupTemporaryAccounts();
    await app.close();
  });

  it('bootstrap creates every configured account hashed with the same shared password, output has no password field', () => {
    const result = bootstrap();
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout) as {
      accounts: Array<{ username: string; status: string }>;
    };
    expect(parsed.accounts).toHaveLength(ALL_USERNAMES.length);
    expect(parsed.accounts.every((a) => a.status === 'created')).toBe(true);
    // No key anywhere in the output resembles a password/credential field.
    expect(JSON.stringify(parsed).toLowerCase()).not.toContain('password');
    expect(result.stdout).not.toContain(STRONG_PASSWORD);
  });

  it('every bootstrapped account authenticates with the exact same shared password', async () => {
    bootstrap();
    const users = await dataSource
      .getRepository(User)
      .find({ where: { username: In(ALL_USERNAMES) } });
    expect(users).toHaveLength(ALL_USERNAMES.length);
    for (const user of users) {
      expect(await argon2.verify(user.passwordHash!, STRONG_PASSWORD)).toBe(
        true,
      );
    }
  });

  it('hashes each account separately — passwordHash values differ even though the password is shared', async () => {
    bootstrap();
    const users = await dataSource
      .getRepository(User)
      .find({ where: { username: In(ALL_USERNAMES) } });
    const hashes = users.map((u) => u.passwordHash);
    expect(new Set(hashes).size).toBe(hashes.length);
  });

  it('does not create any AgencyProfile, AgencyCreditLine, or operational business data for the temp agency account', async () => {
    bootstrap();
    const agencyUser = await dataSource
      .getRepository(User)
      .findOneByOrFail({ username: 'uat.agency' });
    const profile = await dataSource
      .getRepository(AgencyProfile)
      .findOneBy({ userId: agencyUser.id });
    expect(profile).toBeNull();
    const creditLine = await dataSource
      .getRepository(AgencyCreditLine)
      .findOneBy({ agencyId: agencyUser.id });
    expect(creditLine).toBeNull();
    const bookings = await dataSource
      .getRepository(Booking)
      .count({ where: { agencyId: agencyUser.id } });
    expect(bookings).toBe(0);
  });

  it('bootstrap is idempotent — a second run skips already-created accounts without changing their password', async () => {
    bootstrap();
    const before = await dataSource
      .getRepository(User)
      .findOneByOrFail({ username: 'uat.siteadmin' });

    const second = bootstrap({
      UAT_PANEL_SHARED_PASSWORD: OTHER_STRONG_PASSWORD,
    });
    expect(second.status).toBe(0);
    const parsed = JSON.parse(second.stdout) as {
      accounts: Array<{ username: string; status: string }>;
    };
    expect(parsed.accounts.every((a) => a.status === 'already_exists')).toBe(
      true,
    );

    const after = await dataSource
      .getRepository(User)
      .findOneByOrFail({ username: 'uat.siteadmin' });
    expect(after.passwordHash).toBe(before.passwordHash);
  });

  it('refuses to bootstrap when AUTH_SANDBOX_ENABLED is not true', () => {
    const result = bootstrap({ AUTH_SANDBOX_ENABLED: 'false' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/AUTH_SANDBOX_ENABLED/);
    expect(result.stderr).not.toContain(STRONG_PASSWORD);
  });

  it('refuses to bootstrap with an empty UAT_PANEL_SHARED_PASSWORD', () => {
    const result = bootstrap({ UAT_PANEL_SHARED_PASSWORD: '' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/not set or empty/);
  });

  it('refuses to bootstrap with a weak UAT_PANEL_SHARED_PASSWORD', () => {
    const result = bootstrap({ UAT_PANEL_SHARED_PASSWORD: 'weak' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/does not meet the required strength/);
    expect(result.stderr).not.toContain('weak');
  });

  it('does not touch a real staff account', async () => {
    const userRepo = dataSource.getRepository(User);
    const before = await userRepo.findOneByOrFail({ username: 'finance' });
    bootstrap();
    rotate();
    const after = await userRepo.findOneByOrFail({ username: 'finance' });
    expect(after.passwordHash).toBe(before.passwordHash);
    expect(after.temporaryPasswordOnlyUntil).toBeNull();
  });

  describe('canonical phone-login identity recovery', () => {
    beforeEach(() => {
      const result = bootstrap();
      expect(result.status).toBe(0);
      process.env.AUTH_SANDBOX_ENABLED = 'true';
    });

    afterEach(() => {
      delete process.env.AUTH_SANDBOX_ENABLED;
    });

    it('extension v3 preserves the canonical +98 phone representation used by login', async () => {
      const result = extendV3();
      expect(result.status).toBe(0);

      const users = await dataSource.getRepository(User).find({
        where: {
          username: In(['uat.agency', 'uat.customer']),
        },
      });
      expect(
        new Map(users.map(({ username, phone }) => [username, phone])),
      ).toEqual(
        new Map([
          ['uat.agency', '+989000000001'],
          ['uat.customer', '+989000000002'],
        ]),
      );
    });

    it('repairs raw 09 identities atomically without changing password hashes or deadlines, revokes sessions, and restores both login endpoints', async () => {
      const userRepository = dataSource.getRepository(User);
      const refreshRepository = dataSource.getRepository(RefreshToken);
      const before = await userRepository.find({
        where: { username: In(['uat.agency', 'uat.customer']) },
      });
      const protectedState = new Map(
        before.map((user) => [
          user.username!,
          {
            passwordHash: user.passwordHash,
            deadline: user.temporaryPasswordOnlyUntil!.toISOString(),
          },
        ]),
      );
      for (const user of before) {
        await refreshRepository.save(
          refreshRepository.create({
            userId: user.id,
            tokenHash: `phone-reconcile-${user.id}`,
            expiresAt: new Date(Date.now() + 60_000),
          }),
        );
      }
      await userRepository.update(
        { username: 'uat.agency' },
        { phone: '09000000001' },
      );
      await userRepository.update(
        { username: 'uat.customer' },
        { phone: '09000000002' },
      );

      const result = reconcilePhoneLogins();
      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout).accounts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            username: 'uat.agency',
            normalizedPhone: '+989000000001',
            status: 'reconciled',
          }),
          expect.objectContaining({
            username: 'uat.customer',
            normalizedPhone: '+989000000002',
            status: 'reconciled',
          }),
        ]),
      );

      const after = await userRepository.find({
        where: { username: In(['uat.agency', 'uat.customer']) },
      });
      for (const user of after) {
        const expected = protectedState.get(user.username!)!;
        expect(user.passwordHash).toBe(expected.passwordHash);
        expect(user.temporaryPasswordOnlyUntil!.toISOString()).toBe(
          expected.deadline,
        );
      }
      expect(
        new Map(after.map(({ username, phone }) => [username, phone])),
      ).toEqual(
        new Map([
          ['uat.agency', '+989000000001'],
          ['uat.customer', '+989000000002'],
        ]),
      );
      expect(
        await refreshRepository.count({
          where: {
            userId: In(after.map(({ id }) => id)),
            revokedAt: IsNull(),
          },
        }),
      ).toBe(0);

      const agencyLogin = await request(app.getHttpServer())
        .post('/auth/agency/login')
        .send({ phone: '09000000001', password: STRONG_PASSWORD });
      expect(agencyLogin.status).toBe(200);
      expect(agencyLogin.body.data.accessToken).toBeDefined();

      const customerLogin = await request(app.getHttpServer())
        .post('/auth/customer/login-password')
        .send({ phone: '09000000002', password: STRONG_PASSWORD });
      expect(customerLogin.status).toBe(200);
      expect(customerLogin.body.data.accessToken).toBeDefined();
    });

    it('refuses a canonical phone conflict before changing either temporary account', async () => {
      const userRepository = dataSource.getRepository(User);
      await userRepository.update(
        { username: 'uat.agency' },
        { phone: '09000000001' },
      );
      const conflict = await userRepository.save(
        userRepository.create({
          role: Role.USER,
          phone: '+989000000001',
          username: 'uat-phone-reconciliation-conflict',
          passwordHash: await argon2.hash(OTHER_STRONG_PASSWORD),
          email: null,
          fullName: 'UAT phone conflict test',
          updatedAt: new Date(),
        }),
      );

      try {
        const result = reconcilePhoneLogins();
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain(
          'canonical reserved UAT phone is owned by an ineligible account',
        );
        expect(
          await userRepository.findOneByOrFail({ username: 'uat.agency' }),
        ).toMatchObject({ phone: '09000000001' });
        expect(
          await userRepository.findOneByOrFail({ username: 'uat.customer' }),
        ).toMatchObject({ phone: '+989000000002' });

        // Sandbox login resolves the immutable UAT identity directly, so a
        // historical owner of the canonical phone can never block access.
        const agencyLogin = await request(app.getHttpServer())
          .post('/auth/agency/login')
          .send({ phone: '09000000001', password: STRONG_PASSWORD });
        expect(agencyLogin.status).toBe(200);
        expect(agencyLogin.body.data.accessToken).toBeDefined();

        const preserved = reconcilePhoneLogins({}, true);
        expect(preserved.status).toBe(0);
        expect(JSON.parse(preserved.stdout)).toMatchObject({
          preservedConflictCount: 1,
          accounts: expect.arrayContaining([
            expect.objectContaining({
              username: 'uat.agency',
              status: 'preserved_conflict',
            }),
          ]),
        });
      } finally {
        await userRepository.delete(conflict.id);
      }
    });

    it('releases an exact legacy passwordless OTP shadow while preserving its row and restoring the agency login', async () => {
      const userRepository = dataSource.getRepository(User);
      const refreshRepository = dataSource.getRepository(RefreshToken);
      await userRepository.update(
        { username: 'uat.agency' },
        { phone: '09000000001' },
      );
      const canonicalPhone = '+989000000001';
      const shadow = await userRepository.save(
        userRepository.create({
          role: Role.USER,
          phone: canonicalPhone,
          // Reproduce the legacy row: the phone was canonicalized later while
          // its placeholder display name remained in local Iranian form.
          fullName: '09000000001',
          updatedAt: new Date(),
        }),
      );
      await refreshRepository.save(
        refreshRepository.create({
          userId: shadow.id,
          tokenHash: `legacy-otp-shadow-${shadow.id}`,
          expiresAt: new Date(Date.now() + 60_000),
        }),
      );

      try {
        const result = reconcilePhoneLogins();
        expect(result.status).toBe(0);
        expect(JSON.parse(result.stdout).releasedLegacyOtpShadowCount).toBe(1);
        expect(
          await userRepository.findOneByOrFail({ id: shadow.id }),
        ).toMatchObject({
          phone: null,
          role: Role.USER,
          fullName: '09000000001',
        });
        expect(
          await refreshRepository.count({
            where: { userId: shadow.id, revokedAt: IsNull() },
          }),
        ).toBe(0);

        const agencyLogin = await request(app.getHttpServer())
          .post('/auth/agency/login')
          .send({ phone: '09000000001', password: STRONG_PASSWORD });
        expect(agencyLogin.status).toBe(200);
        expect(agencyLogin.body.data.accessToken).toBeDefined();
      } finally {
        await dataSource.getRepository(AuditLog).delete({ actorId: shadow.id });
        await refreshRepository.delete({ userId: shadow.id });
        await userRepository.delete(shadow.id);
      }
    });
  });

  describe('rotation', () => {
    beforeEach(() => {
      const result = bootstrap();
      expect(result.status).toBe(0);
    });

    it('rotates every account to the new shared password (fresh hash per account) and revokes their active refresh tokens', async () => {
      const userRepo = dataSource.getRepository(User);
      const users = await userRepo.find({
        where: { username: In(ALL_USERNAMES) },
      });
      const refreshRepo = dataSource.getRepository(RefreshToken);
      for (const user of users) {
        await refreshRepo.save(
          refreshRepo.create({
            userId: user.id,
            tokenHash: `test-hash-${user.id}`,
            expiresAt: new Date(Date.now() + 60_000),
          }),
        );
      }

      const result = rotate();
      expect(result.status).toBe(0);
      expect(result.stdout).not.toContain(OTHER_STRONG_PASSWORD);
      expect(
        JSON.stringify(JSON.parse(result.stdout)).toLowerCase(),
      ).not.toContain('password');

      const rotatedUsers = await userRepo.find({
        where: { username: In(ALL_USERNAMES) },
      });
      const hashes = rotatedUsers.map((u) => u.passwordHash);
      expect(new Set(hashes).size).toBe(hashes.length);
      for (const user of rotatedUsers) {
        expect(
          await argon2.verify(user.passwordHash!, OTHER_STRONG_PASSWORD),
        ).toBe(true);
        expect(await argon2.verify(user.passwordHash!, STRONG_PASSWORD)).toBe(
          false,
        );
      }

      const activeTokens = await refreshRepo
        .createQueryBuilder('rt')
        .where('rt.userId IN (:...ids)', { ids: users.map((u) => u.id) })
        .andWhere('rt.revokedAt IS NULL')
        .getCount();
      expect(activeTokens).toBe(0);
    });

    it('preserves each account expiry when existing and newly bootstrapped accounts have different deadlines', async () => {
      const userRepo = dataSource.getRepository(User);
      const earlierExpiry = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
      await userRepo.update(
        { username: 'uat.siteadmin' },
        { temporaryPasswordOnlyUntil: earlierExpiry },
      );

      const before = await userRepo.find({
        where: { username: In(ALL_USERNAMES) },
      });
      const expiryByUsername = new Map(
        before.map((user) => [
          user.username!,
          user.temporaryPasswordOnlyUntil!.toISOString(),
        ]),
      );

      const result = rotate();
      expect(result.status).toBe(0);
      const parsed = JSON.parse(result.stdout) as {
        accounts: Array<{ username: string; expiresAt: string }>;
      };
      expect(
        new Set(parsed.accounts.map(({ expiresAt }) => expiresAt)).size,
      ).toBeGreaterThan(1);

      const after = await userRepo.find({
        where: { username: In(ALL_USERNAMES) },
      });
      for (const user of after) {
        expect(user.temporaryPasswordOnlyUntil!.toISOString()).toBe(
          expiryByUsername.get(user.username!),
        );
        expect(
          await argon2.verify(user.passwordHash!, OTHER_STRONG_PASSWORD),
        ).toBe(true);
      }
    });

    it('refuses rotation without AUTH_SANDBOX_ENABLED', () => {
      const result = rotate({ AUTH_SANDBOX_ENABLED: 'false' });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/AUTH_SANDBOX_ENABLED/);
    });

    it('refuses rotation with a weak password', () => {
      const result = rotate({ UAT_PANEL_SHARED_PASSWORD: '1234' });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/does not meet the required strength/);
    });
  });

  describe('login with the shared password', () => {
    beforeEach(() => {
      const result = bootstrap();
      expect(result.status).toBe(0);
      // The app under test (not the bootstrap subprocess) must itself see
      // the sandbox flag as on for temp-account login to succeed — set
      // explicitly rather than relying on another spec file's leftover
      // process.env mutation (Jest's node test environment shares the real
      // `process` object across spec files in the same worker).
      process.env.AUTH_SANDBOX_ENABLED = 'true';
    });

    afterEach(() => {
      delete process.env.AUTH_SANDBOX_ENABLED;
    });

    it('a temp EMPLOYEE account logs in directly with the shared password, bypassing 2FA', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/staff/login')
        .send({ username: 'uat.employee', password: STRONG_PASSWORD });
      expect(res.status).toBe(200);
      expect(res.body.data.loginMode).toBe('TEMPORARY_PASSWORD_ONLY');
      expect(res.body.data.accessToken).toBeDefined();
    });

    it('the operations manager account logs in with the shared password', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/staff/login')
        .send({ username: 'uat.operations', password: STRONG_PASSWORD });
      expect(res.status).toBe(200);
      expect(res.body.data.loginMode).toBe('TEMPORARY_PASSWORD_ONLY');
      expect(res.body.data.accessToken).toBeDefined();
    });

    it('the temp agency account logs in with the shared password via /auth/agency/login even with no AgencyProfile', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/agency/login')
        .send({ phone: '09000000001', password: STRONG_PASSWORD });
      expect(res.status).toBe(200);
      expect(res.body.data.accessToken).toBeDefined();
    });

    it('the temp customer account logs in with the shared password via /auth/customer/login-password', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/customer/login-password')
        .send({ phone: '09000000002', password: STRONG_PASSWORD });
      expect(res.status).toBe(200);
      expect(res.body.data.accessToken).toBeDefined();
    });

    it('an expired temp account is rejected even with the correct shared password', async () => {
      await dataSource
        .getRepository(User)
        .update(
          { username: 'uat.siteadmin' },
          { temporaryPasswordOnlyUntil: new Date(Date.now() - 1000) },
        );
      const res = await request(app.getHttpServer())
        .post('/auth/staff/login')
        .send({ username: 'uat.siteadmin', password: STRONG_PASSWORD });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('TEMPORARY_ACCESS_EXPIRED');
    });

    describe('agency-portal real empty state for the UAT sandbox agency (no fabricated data)', () => {
      async function loginUatAgency(): Promise<string> {
        const res = await request(app.getHttpServer())
          .post('/auth/agency/login')
          .send({ phone: '09000000001', password: STRONG_PASSWORD });
        expect(res.status).toBe(200);
        return res.body.data.accessToken as string;
      }

      async function assertNoAgencyBusinessData() {
        const agencyUser = await dataSource
          .getRepository(User)
          .findOneByOrFail({ username: 'uat.agency' });
        expect(
          await dataSource
            .getRepository(AgencyProfile)
            .findOneBy({ userId: agencyUser.id }),
        ).toBeNull();
        expect(
          await dataSource
            .getRepository(AgencyCreditLine)
            .findOneBy({ agencyId: agencyUser.id }),
        ).toBeNull();
        expect(
          await dataSource
            .getRepository(Booking)
            .count({ where: { agencyId: agencyUser.id } }),
        ).toBe(0);
        expect(
          await dataSource
            .getRepository(LedgerEntry)
            .count({ where: { agencyId: agencyUser.id } }),
        ).toBe(0);
      }

      it('dashboard returns 200 with real zero-value/empty data, no AgencyProfile/CreditLine/Booking/Ledger row ever created', async () => {
        const accessToken = await loginUatAgency();
        const res = await request(app.getHttpServer())
          .get('/agency-portal/dashboard')
          .set('Authorization', `Bearer ${accessToken}`);
        expect(res.status).toBe(200);
        expect(res.body.data).toEqual({
          credit: { limitIrr: '0', usedIrr: '0', remainingIrr: '0' },
          kpis: {
            salesThisMonthIrr: '0',
            ticketsIssuedTotal: 0,
            seatsSoldThisMonth: 0,
          },
          monthlySales: [],
        });
        await assertNoAgencyBusinessData();
      });

      it('allotments returns 200 with an empty array, no fabricated rows', async () => {
        const accessToken = await loginUatAgency();
        const res = await request(app.getHttpServer())
          .get('/agency-portal/allotments')
          .set('Authorization', `Bearer ${accessToken}`);
        expect(res.status).toBe(200);
        expect(res.body.data).toEqual([]);
        await assertNoAgencyBusinessData();
      });

      it('seat request options returns the real flight catalogue instead of failing without an agency profile', async () => {
        const accessToken = await loginUatAgency();
        const res = await request(app.getHttpServer())
          .get('/agency-portal/seat-request-options')
          .set('Authorization', `Bearer ${accessToken}`);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.data)).toBe(true);
        await assertNoAgencyBusinessData();
      });

      it('seat request history returns only the UAT agency own persisted requests', async () => {
        const accessToken = await loginUatAgency();
        const agencyUser = await dataSource
          .getRepository(User)
          .findOneByOrFail({ username: 'uat.agency' });
        const otherAgencyId = 'different-agency-user-id';
        const requestRepo = dataSource.getRepository(AgencySeatRequest);
        const ownRequest = await requestRepo.save(
          requestRepo.create({
            agencyId: agencyUser.id,
            routeId: null,
            aircraftType: 'Airbus A320',
            cabin: CabinClass.ECONOMY,
            fareClassCode: 'Y',
            seats: 3,
            termMonths: null,
            unitPriceIrr: 30_000_000n,
            payMethod: AgencySeatRequestPayMethod.INVOICE,
            status: AgencySeatRequestStatus.PENDING,
            invoiceId: null,
            dueAt: null,
            decidedById: null,
            decidedAt: null,
          }),
        );
        const otherRequest = await requestRepo.save(
          requestRepo.create({
            agencyId: otherAgencyId,
            routeId: null,
            aircraftType: 'Airbus A320',
            cabin: CabinClass.ECONOMY,
            fareClassCode: 'Y',
            seats: 9,
            termMonths: null,
            unitPriceIrr: 30_000_000n,
            payMethod: AgencySeatRequestPayMethod.INVOICE,
            status: AgencySeatRequestStatus.PENDING,
            invoiceId: null,
            dueAt: null,
            decidedById: null,
            decidedAt: null,
          }),
        );

        try {
          const res = await request(app.getHttpServer())
            .get('/agency-portal/seat-requests')
            .set('Authorization', `Bearer ${accessToken}`);

          expect(res.status).toBe(200);
          expect(res.body.data).toHaveLength(1);
          expect(res.body.data[0]).toMatchObject({
            id: ownRequest.id,
            seats: 3,
            status: AgencySeatRequestStatus.PENDING,
          });
          expect(
            res.body.data.some(
              (row: { id: string }) => row.id === otherRequest.id,
            ),
          ).toBe(false);
        } finally {
          await requestRepo.delete([ownRequest.id, otherRequest.id]);
        }
      });

      it('every other read endpoint returns a real empty state (200) instead of the profile-not-found 404', async () => {
        const accessToken = await loginUatAgency();
        const auth = `Bearer ${accessToken}`;
        const get = (endpoint: string) =>
          request(app.getHttpServer()).get(endpoint).set('Authorization', auth);

        const credit = await get('/agency-portal/credit');
        expect(credit.status).toBe(200);
        expect(credit.body.data).toEqual({
          limitIrr: '0',
          usedIrr: '0',
          remainingIrr: '0',
        });

        const ledger = await get('/agency-portal/ledger');
        expect(ledger.status).toBe(200);
        expect(ledger.body.data).toEqual([]);

        const invoices = await get('/agency-portal/invoices');
        expect(invoices.status).toBe(200);
        expect(invoices.body.data).toEqual([]);

        const creditRequests = await get('/agency-portal/credit-requests');
        expect(creditRequests.status).toBe(200);
        expect(creditRequests.body.data).toEqual([]);

        const sales = await get('/agency-portal/sales');
        expect(sales.status).toBe(200);
        expect(sales.body.data).toEqual({
          tickets: [],
          perFlight: [],
          summary: {
            totalSalesIrr: '0',
            ticketsIssued: 0,
            avgFareIrr: '0',
            refundRatePct: 0,
          },
        });

        const inbox = await get('/agency-portal/inbox');
        expect(inbox.status).toBe(200);
        expect(inbox.body.data).toEqual([]);

        const profile = await get('/agency-portal/profile');
        expect(profile.status).toBe(200);
        expect(profile.body.data).toEqual({
          fullName: 'UAT Agency',
          managerName: null,
          licenseNo: null,
          phone: '+989000000001',
          email: null,
          city: null,
          address: null,
          tier: null,
          isActive: true,
          suspendedAt: null,
          suspendReason: null,
          joinedAt: expect.any(String),
          isTemporaryReadOnly: true,
        });

        const documents = await get('/agency-portal/documents');
        expect(documents.status).toBe(200);
        expect(documents.body.data).toEqual([]);

        const webserviceRequests = await get(
          '/agency-portal/webservice-requests',
        );
        expect(webserviceRequests.status).toBe(200);
        expect(webserviceRequests.body.data).toEqual([]);

        const apiKeys = await get('/agency-portal/api-keys');
        expect(apiKeys.status).toBe(200);
        expect(apiKeys.body.data).toEqual([]);

        await assertNoAgencyBusinessData();
      });

      it('allows the UAT agency to upload and list its own document without fabricating an agency profile', async () => {
        const accessToken = await loginUatAgency();
        const agencyUser = await dataSource
          .getRepository(User)
          .findOneByOrFail({ username: 'uat.agency' });
        const upload = await request(app.getHttpServer())
          .post('/agency-portal/documents')
          .set('Authorization', `Bearer ${accessToken}`)
          .field('docType', 'LICENSE')
          .attach('file', Buffer.from('test-image'), {
            filename: 'agency-license.png',
            contentType: 'image/png',
          });
        expect(upload.status).toBe(201);
        expect(upload.body.data).toMatchObject({
          agencyId: agencyUser.id,
          docType: 'LICENSE',
          status: 'PENDING',
          file: { fileName: 'agency-license.png' },
        });

        const list = await request(app.getHttpServer())
          .get('/agency-portal/documents')
          .set('Authorization', `Bearer ${accessToken}`);
        expect(list.status).toBe(200);
        expect(list.body.data).toHaveLength(1);
        expect(list.body.data[0].id).toBe(upload.body.data.id);
        await assertNoAgencyBusinessData();

        const documentRepo = dataSource.getRepository(AgencyDocument);
        const storedFileRepo = dataSource.getRepository(StoredFile);
        const document = await documentRepo.findOneByOrFail({
          id: upload.body.data.id,
        });
        const stored = await storedFileRepo.findOneByOrFail({
          id: document.fileId,
        });
        await documentRepo.delete(document.id);
        await storedFileRepo.delete(stored.id);
        if (fs.existsSync(stored.path)) fs.unlinkSync(stored.path);
      });

      it('a mutating request is refused with 403 UAT_TEMPORARY_ACCOUNT_READ_ONLY and writes nothing', async () => {
        const accessToken = await loginUatAgency();
        const res = await request(app.getHttpServer())
          .post('/agency-portal/inbox')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ body: 'سلام' });
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('UAT_TEMPORARY_ACCOUNT_READ_ONLY');
        await assertNoAgencyBusinessData();
      });

      it('every other mutating endpoint is refused the same way', async () => {
        const accessToken = await loginUatAgency();
        const auth = `Bearer ${accessToken}`;

        const creditIncrease = await request(app.getHttpServer())
          .post('/agency-portal/credit-requests')
          .set('Authorization', auth)
          .send({ requestedLimitIrr: '1000000000' });
        expect(creditIncrease.status).toBe(403);
        expect(creditIncrease.body.error.code).toBe(
          'UAT_TEMPORARY_ACCOUNT_READ_ONLY',
        );

        const webserviceRequest = await request(app.getHttpServer())
          .post('/agency-portal/webservice-requests')
          .set('Authorization', auth)
          .send({ scope: 'SEARCH_BOOK', months: 1 });
        expect(webserviceRequest.status).toBe(403);
        expect(webserviceRequest.body.error.code).toBe(
          'UAT_TEMPORARY_ACCOUNT_READ_ONLY',
        );

        const payInvoice = await request(app.getHttpServer())
          .post('/agency-portal/invoices/nonexistent-invoice-id/pay')
          .set('Authorization', auth);
        expect(payInvoice.status).toBe(403);
        expect(payInvoice.body.error.code).toBe(
          'UAT_TEMPORARY_ACCOUNT_READ_ONLY',
        );

        await assertNoAgencyBusinessData();
      });

      describe('the exception never activates outside an active sandbox temp account', () => {
        it('AUTH_SANDBOX_ENABLED=false: dashboard falls back to the normal profile-not-found 404', async () => {
          const accessToken = await loginUatAgency();
          process.env.AUTH_SANDBOX_ENABLED = 'false';
          const res = await request(app.getHttpServer())
            .get('/agency-portal/dashboard')
            .set('Authorization', `Bearer ${accessToken}`);
          expect(res.status).toBe(404);
          expect(res.body.error.code).toBe('NOT_FOUND');
        });

        it('expired temp account: dashboard falls back to the normal profile-not-found 404', async () => {
          const accessToken = await loginUatAgency();
          await dataSource
            .getRepository(User)
            .update(
              { username: 'uat.agency' },
              { temporaryPasswordOnlyUntil: new Date(Date.now() - 1000) },
            );
          const res = await request(app.getHttpServer())
            .get('/agency-portal/dashboard')
            .set('Authorization', `Bearer ${accessToken}`);
          expect(res.status).toBe(404);
          expect(res.body.error.code).toBe('NOT_FOUND');
        });
      });
    });

    describe('sandbox disabled at login time', () => {
      const originalSandbox = process.env.AUTH_SANDBOX_ENABLED;
      const originalNodeEnv = process.env.NODE_ENV;

      beforeEach(() => {
        // The app under test (not the bootstrap subprocess) must itself
        // see the sandbox flag as off for this describe block.
        process.env.AUTH_SANDBOX_ENABLED = 'false';
        process.env.NODE_ENV = 'production';
      });

      afterEach(() => {
        process.env.AUTH_SANDBOX_ENABLED = originalSandbox;
        process.env.NODE_ENV = originalNodeEnv;
      });

      it('rejects a temp staff login even with the correct shared password', async () => {
        const res = await request(app.getHttpServer())
          .post('/auth/staff/login')
          .send({ username: 'uat.employee', password: STRONG_PASSWORD });
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('SANDBOX_AUTH_DISABLED');
      });

      it('rejects a temp agency login even with the correct shared password', async () => {
        const res = await request(app.getHttpServer())
          .post('/auth/agency/login')
          .send({ phone: '09000000001', password: STRONG_PASSWORD });
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('SANDBOX_AUTH_DISABLED');
      });

      it('rejects a temp customer login even with the correct shared password', async () => {
        const res = await request(app.getHttpServer())
          .post('/auth/customer/login-password')
          .send({ phone: '09000000002', password: STRONG_PASSWORD });
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('SANDBOX_AUTH_DISABLED');
      });
    });
  });

  it('the sandbox mock OTP default is unchanged at 123456', () => {
    delete process.env.AUTH_SANDBOX_OTP;
    delete process.env.DEV_FIXED_OTP_CODE;
    expect(getSandboxOtpCode()).toBe('123456');
  });
});
