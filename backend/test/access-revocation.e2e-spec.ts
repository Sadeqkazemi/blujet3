import { INestApplication } from '@nestjs/common';
import * as argon2 from 'argon2';
import * as crypto from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AgencyProfile } from '../src/database/entities/agency-profile.entity';
import { AuditLog } from '../src/database/entities/audit-log.entity';
import { Notification } from '../src/database/entities/notification.entity';
import { User } from '../src/database/entities/user.entity';
import { loginAs, loginAsCustomer } from './helpers/login.helper';
import { createTestApp } from './helpers/app.helper';
import { TWO_FACTOR_PROVIDER } from '../src/modules/auth/providers/two-factor-provider.interface';
import { MockTwoFactorProvider } from '../src/modules/auth/providers/mock-two-factor.provider';

const AGENCY_PASSWORD = 'AgencyRevokeTest@123';

describe('Access revocation (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  beforeEach(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
  });

  afterEach(async () => {
    await app.close();
  });

  async function createManagedAdmin(
    role: 'IT_MANAGER' | 'SENIOR_MANAGER' = 'IT_MANAGER',
  ) {
    const suffix = crypto.randomUUID().slice(0, 8);
    const userRepo = dataSource.getRepository(User);
    return userRepo.save(
      userRepo.create({
        role,
        username: `ar.${suffix}`,
        email: `ar.${suffix}@test.example`,
        fullName: `مدیر تست ${suffix}`,
        passwordHash: await argon2.hash('Blujet@1404'),
        twoFactorEnabled: true,
        isActive: true,
        updatedAt: new Date(),
      }),
    );
  }

  async function createFreshAgency() {
    const suffix = crypto.randomUUID().slice(0, 8);
    const phone = `+9891${crypto.randomInt(10_000_000, 100_000_000)}`;
    const passwordHash = await argon2.hash(AGENCY_PASSWORD);
    const userRepo = dataSource.getRepository(User);
    const user = await userRepo.save(
      userRepo.create({
        role: 'AGENCY',
        phone,
        fullName: `آژانس تست ${suffix}`,
        passwordHash,
        isActive: true,
        updatedAt: new Date(),
      }),
    );
    await dataSource.getRepository(AgencyProfile).save(
      dataSource.getRepository(AgencyProfile).create({
        userId: user.id,
        licenseNo: `AG-AR-${suffix}`,
        managerName: 'مدیر آژانس تست',
        phone,
        email: `${suffix}@ar.test.example`,
        city: 'تهران',
        address: 'آدرس تست',
        tier: 'NORMAL',
      }),
    );
    return { user, phone };
  }

  async function loginAsStaffUsername(
    username: string,
    password = 'Blujet@1404',
  ) {
    const loginRes = await request(app.getHttpServer())
      .post('/auth/staff/login')
      .send({ username, password });
    const twoFactor = app.get<MockTwoFactorProvider>(TWO_FACTOR_PROVIDER);
    const userRepo = dataSource.getRepository(User);
    const targetUser = await userRepo.findOneByOrFail({ username });
    const code = twoFactor.getLastCode(targetUser.id);
    if (!code) throw new Error(`No 2FA code recorded for staff ${username}`);
    const verifyRes = await request(app.getHttpServer())
      .post('/auth/staff/login/verify')
      .send({ challengeId: loginRes.body.data.challengeId, code });
    return {
      accessToken: verifyRes.body?.data?.accessToken as string | undefined,
      userId: targetUser.id,
    };
  }

  async function loginAsAgencyUser(userId: string, phone: string) {
    const loginRes = await request(app.getHttpServer())
      .post('/auth/agency/login')
      .send({ phone, password: AGENCY_PASSWORD });
    const challengeId = loginRes.body?.data?.challengeId as string | undefined;
    if (!challengeId) {
      return {
        accessToken: loginRes.body?.data?.accessToken as string | undefined,
      };
    }
    const twoFactor = app.get<MockTwoFactorProvider>(TWO_FACTOR_PROVIDER);
    const code = twoFactor.getLastCode(userId);
    if (!code) throw new Error(`No 2FA code recorded for agency ${phone}`);
    const verifyRes = await request(app.getHttpServer())
      .post('/auth/agency/login/verify')
      .send({ challengeId, code });
    return {
      accessToken: verifyRes.body?.data?.accessToken as string | undefined,
    };
  }

  it('manager: blocking via PATCH /admins/:id/block invalidates an already-issued access token immediately (403 ACCESS_REVOKED); unblocking restores it; audit+notification recorded', async () => {
    const target = await createManagedAdmin('IT_MANAGER');
    const { accessToken } = await loginAsStaffUsername(target.username!);
    expect(accessToken).toBeTruthy();

    const before = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(before.status).toBe(200);

    const ceo = await loginAs(app, 'ceo');
    const blockRes = await request(app.getHttpServer())
      .patch(`/admins/${target.id}/block`)
      .set('Authorization', `Bearer ${ceo.accessToken}`);
    expect(blockRes.status).toBe(200);

    // Same still-unexpired access token, immediately after the block.
    const after = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(after.status).toBe(403);
    expect(after.body.error.code).toBe('ACCESS_REVOKED');

    const audit = await dataSource
      .getRepository(AuditLog)
      .createQueryBuilder('a')
      .where('a.entityType = :t', { t: 'User' })
      .andWhere('a.entityId = :id', { id: target.id })
      .andWhere("a.action = 'مسدودسازی ورود مدیر'")
      .getOne();
    expect(audit).not.toBeNull();

    const notification = await dataSource
      .getRepository(Notification)
      .createQueryBuilder('n')
      .where('n.recipientId = :id', { id: target.id })
      .andWhere("n.action = 'ACCESS_REVOKED'")
      .getOne();
    expect(notification).not.toBeNull();

    const unblockRes = await request(app.getHttpServer())
      .patch(`/admins/${target.id}/unblock`)
      .set('Authorization', `Bearer ${ceo.accessToken}`);
    expect(unblockRes.status).toBe(200);

    const afterUnblock = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(afterUnblock.status).toBe(200);
  });

  it('employee: PATCH /it/employees/:id/status {isActive:false} invalidates an already-issued access token immediately', async () => {
    const it = await loginAs(app, 'itadmin');
    const username = `are.${crypto.randomUUID().slice(0, 8)}`;
    const created = await request(app.getHttpServer())
      .post('/it/employees')
      .set('Authorization', `Bearer ${it.accessToken}`)
      .send({
        fullName: 'کارمند تست لغو دسترسی',
        username,
        phone: `09${crypto.randomInt(100_000_000, 1_000_000_000)}`,
        password: 'testpass1',
        dept: 'commercial',
        rank: 'کارشناس',
        permissionKeys: [],
      });
    expect(created.status).toBe(201);
    const employeeId = created.body.data.id as string;

    const { accessToken } = await loginAsStaffUsername(username, 'testpass1');
    expect(accessToken).toBeTruthy();
    const before = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(before.status).toBe(200);

    const disableRes = await request(app.getHttpServer())
      .patch(`/it/employees/${employeeId}/status`)
      .set('Authorization', `Bearer ${it.accessToken}`)
      .send({ isActive: false });
    expect(disableRes.status).toBe(200);

    const after = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(after.status).toBe(403);
    expect(after.body.error.code).toBe('ACCESS_REVOKED');

    const notification = await dataSource
      .getRepository(Notification)
      .createQueryBuilder('n')
      .where('n.recipientId = :id', { id: employeeId })
      .andWhere("n.action = 'ACCESS_REVOKED'")
      .getOne();
    expect(notification).not.toBeNull();
  });

  it('agency: PATCH /agencies/:id/suspend invalidates an already-issued access token immediately', async () => {
    const { user: agencyUser, phone } = await createFreshAgency();
    const { accessToken } = await loginAsAgencyUser(agencyUser.id, phone);
    expect(accessToken).toBeTruthy();

    const before = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(before.status).toBe(200);

    const senior = await loginAs(app, 'senior');
    const suspendRes = await request(app.getHttpServer())
      .patch(`/agencies/${agencyUser.id}/suspend`)
      .set('Authorization', `Bearer ${senior.accessToken}`)
      .send({ reason: 'تست لغو دسترسی' });
    expect(suspendRes.status).toBe(200);

    const after = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(after.status).toBe(403);
    expect(after.body.error.code).toBe('ACCESS_REVOKED');

    const notification = await dataSource
      .getRepository(Notification)
      .createQueryBuilder('n')
      .where('n.recipientId = :id', { id: agencyUser.id })
      .andWhere("n.action = 'ACCESS_REVOKED'")
      .getOne();
    expect(notification).not.toBeNull();
  });

  it('customer: an account disabled at the DB level (isActive=false) is rejected on its very next request with the same still-valid access token — proves the guard-level mechanism is role-agnostic (no staff/agency-only special case). No dedicated "block a customer" admin endpoint exists yet in this codebase; this test exercises the same isActive flag any such future endpoint would flip.', async () => {
    const phone = `0913${crypto.randomInt(1_000_000, 10_000_000)}`;
    const { accessToken } = await loginAsCustomer(app, phone);
    expect(accessToken).toBeTruthy();

    const before = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(before.status).toBe(200);
    const userId = before.body.data.id as string;

    await dataSource
      .getRepository(User)
      .update({ id: userId }, { isActive: false, updatedAt: new Date() });

    const after = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(after.status).toBe(403);
    expect(after.body.error.code).toBe('ACCESS_REVOKED');
  });
});
