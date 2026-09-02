import { INestApplication } from '@nestjs/common';
import * as crypto from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, In } from 'typeorm';
import { dataSourceOptions } from '../src/database/data-source.options';
import { User } from '../src/database/entities/user.entity';
import { AuditLog } from '../src/database/entities/audit-log.entity';
import { loginAs } from './helpers/login.helper';
import { createTestApp } from './helpers/app.helper';

describe('Audit (e2e)', () => {
  let app: INestApplication<App>;
  let financeActorId: string;
  let resourceFilterEntryId: string;
  // Unique per test run so resource-filter assertions stay exact even
  // though the shared audit_logs table isn't truncated between suite runs.
  const resourceTag = `RefundTestResource-${crypto.randomUUID().slice(0, 8)}`;

  // Fresh app per test — avoids leaking the shared login-route throttle budget across tests.
  beforeEach(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  beforeAll(async () => {
    const setupDataSource = new DataSource(dataSourceOptions);
    await setupDataSource.initialize();

    const users = await setupDataSource.getRepository(User).find({
      where: { username: In(['finance', 'senior', 'ceo']) },
    });
    const byUsername = Object.fromEntries(users.map((u) => [u.username, u]));
    financeActorId = byUsername['finance'].id;

    const auditRepo = setupDataSource.getRepository(AuditLog);
    const saved = await auditRepo.save(
      auditRepo.create([
        {
          actorId: byUsername['finance'].id,
          actorRole: 'FINANCE_MANAGER',
          category: 'REFUND',
          action: 'تأیید استرداد',
          detail: 'test entry from finance manager',
        },
        {
          actorId: byUsername['senior'].id,
          actorRole: 'SENIOR_MANAGER',
          category: 'ACCESS',
          action: 'تغییر دسترسی',
          detail: 'test entry from senior manager',
        },
        {
          actorId: byUsername['ceo'].id,
          actorRole: 'CEO',
          category: 'PRICING',
          action: 'تأیید قیمت',
          detail: 'test entry from ceo',
        },
        // Dedicated fixture for the resource/date filter tests below —
        // kept separate from the rows above so backdating it can never
        // affect the pre-existing "includes FINANCE_MANAGER" assertions.
        {
          actorId: byUsername['finance'].id,
          actorRole: 'FINANCE_MANAGER',
          category: 'REFUND',
          action: 'تأیید استرداد (resource filter fixture)',
          detail: 'resource/date filter fixture row',
          entityType: resourceTag,
          entityId: crypto.randomUUID(),
        },
      ]),
    );
    resourceFilterEntryId = saved[3].id;
    // Backdated well outside any dateFrom used below, so the dateFrom
    // filter test has a deterministic row to exclude.
    await auditRepo.update(
      { id: resourceFilterEntryId },
      { createdAt: new Date('2020-01-01T00:00:00.000Z') },
    );

    await setupDataSource.destroy();
  });

  it("CEO's manager-reports excludes CEO/SENIOR_MANAGER/BOARD_CHAIR as actor", async () => {
    const { accessToken } = await loginAs(app, 'ceo');
    const res = await request(app.getHttpServer())
      .get('/audit/manager-reports')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    const roles = res.body.data.map((r: { actorRole: string }) => r.actorRole);
    expect(roles).not.toContain('CEO');
    expect(roles).not.toContain('SENIOR_MANAGER');
    expect(roles).not.toContain('BOARD_CHAIR');
    expect(roles).toContain('FINANCE_MANAGER');
    expect(res.body.data[0]).toHaveProperty('actorName');
    expect(typeof res.body.data[0].actorName).toBe('string');
  });

  it("Senior Manager's manager-reports includes every role, unfiltered", async () => {
    const { accessToken } = await loginAs(app, 'senior');
    const res = await request(app.getHttpServer())
      .get('/audit/manager-reports')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    const roles = res.body.data.map((r: { actorRole: string }) => r.actorRole);
    expect(roles).toContain('CEO');
    expect(roles).toContain('SENIOR_MANAGER');
    expect(roles).toContain('FINANCE_MANAGER');
  });

  it('a non-CEO/Chair/Senior role gets 403 on manager-reports', async () => {
    const { accessToken } = await loginAs(app, 'finance');
    const res = await request(app.getHttpServer())
      .get('/audit/manager-reports')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(403);
  });

  it("IT Manager's system logs only include SYSTEM/ACCOUNT categories", async () => {
    const { accessToken } = await loginAs(app, 'itadmin');
    const res = await request(app.getHttpServer())
      .get('/audit/logs')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    for (const row of res.body.data) {
      expect(['SYSTEM', 'ACCOUNT']).toContain(row.category);
      expect(row).toHaveProperty('actorName');
      expect(row).toHaveProperty('unit');
      expect(row).toHaveProperty('level');
    }
  });

  it('a non-IT role gets 403 on /audit/logs', async () => {
    const { accessToken } = await loginAs(app, 'ceo');
    const res = await request(app.getHttpServer())
      .get('/audit/logs')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(403);
  });

  // ── Pagination + filters (task #30 / PR #126 contract) ─────────────────

  it('manager-reports paginates with page/limit and returns meta {total,page,limit}', async () => {
    const { accessToken } = await loginAs(app, 'senior');
    const page1 = await request(app.getHttpServer())
      .get('/audit/manager-reports')
      .query({ limit: 1, page: 1 })
      .set('Authorization', `Bearer ${accessToken}`);
    expect(page1.status).toBe(200);
    expect(page1.body.data).toHaveLength(1);
    expect(page1.body.meta.page).toBe(1);
    expect(page1.body.meta.limit).toBe(1);
    expect(page1.body.meta.total).toBeGreaterThanOrEqual(3);

    const page2 = await request(app.getHttpServer())
      .get('/audit/manager-reports')
      .query({ limit: 1, page: 2 })
      .set('Authorization', `Bearer ${accessToken}`);
    expect(page2.status).toBe(200);
    expect(page2.body.data).toHaveLength(1);
    expect(page2.body.data[0].id).not.toBe(page1.body.data[0].id);
  });

  it('manager-reports filters by actor (actorId)', async () => {
    const { accessToken } = await loginAs(app, 'senior');
    const res = await request(app.getHttpServer())
      .get('/audit/manager-reports')
      .query({ actor: financeActorId })
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    for (const row of res.body.data) {
      expect(row.actorId).toBe(financeActorId);
    }
  });

  it('manager-reports filters by action (partial match)', async () => {
    const { accessToken } = await loginAs(app, 'senior');
    const res = await request(app.getHttpServer())
      .get('/audit/manager-reports')
      .query({ action: 'استرداد' })
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    for (const row of res.body.data) {
      expect(row.action).toContain('استرداد');
    }
  });

  it('manager-reports filters by resource (entityType)', async () => {
    const { accessToken } = await loginAs(app, 'senior');
    const res = await request(app.getHttpServer())
      .get('/audit/manager-reports')
      .query({ resource: resourceTag })
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(resourceFilterEntryId);
  });

  it('manager-reports filters by dateFrom, excluding backdated rows', async () => {
    const { accessToken } = await loginAs(app, 'senior');
    const res = await request(app.getHttpServer())
      .get('/audit/manager-reports')
      .query({ dateFrom: '2024-01-01T00:00:00.000Z' })
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.map((r: { id: string }) => r.id);
    expect(ids).not.toContain(resourceFilterEntryId);
  });

  it('manager-reports filters by dateTo, excluding rows created after the boundary', async () => {
    const { accessToken } = await loginAs(app, 'senior');
    const res = await request(app.getHttpServer())
      .get('/audit/manager-reports')
      .query({ dateTo: '2021-01-01T00:00:00.000Z', resource: resourceTag })
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.map((r: { id: string }) => r.id);
    // Combined with resource so this stays exact even though other suites
    // may leave their own pre-2021 fixture rows in the shared table.
    expect(ids).toEqual([resourceFilterEntryId]);
    for (const row of res.body.data as { createdAt: string }[]) {
      expect(new Date(row.createdAt).getTime()).toBeLessThanOrEqual(
        new Date('2021-01-01T00:00:00.000Z').getTime(),
      );
    }
  });

  it('/audit/logs paginates and filters by resource, with meta present', async () => {
    const { accessToken } = await loginAs(app, 'itadmin');
    const res = await request(app.getHttpServer())
      .get('/audit/logs')
      .query({ limit: 5, page: 1 })
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.meta).toEqual({
      total: expect.any(Number),
      page: 1,
      limit: 5,
    });
    expect(res.body.data.length).toBeLessThanOrEqual(5);
  });

  it("CEO's /audit/system-events paginates and filters by actor/dateFrom/dateTo/resource", async () => {
    const { accessToken } = await loginAs(app, 'ceo');
    const res = await request(app.getHttpServer())
      .get('/audit/system-events')
      .query({ actor: financeActorId, limit: 10 })
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.meta.limit).toBe(10);
    for (const row of res.body.data) {
      // system-events doesn't echo actorId on the row, only the display
      // name — assert the join actually scoped it, not a UI-only filter.
      expect(row).toHaveProperty('user');
    }

    const scoped = await request(app.getHttpServer())
      .get('/audit/system-events')
      .query({ resource: resourceTag })
      .set('Authorization', `Bearer ${accessToken}`);
    expect(scoped.status).toBe(200);
    expect(scoped.body.data).toHaveLength(1);
  });

  // ── Permission enforcement (EmployeePermissionGuard, live DB check) ────

  it('EMPLOYEE without lg_view is 403 on /audit/logs even though @Roles allows EMPLOYEE', async () => {
    const it_ = await loginAs(app, 'itadmin');
    const username = `au.${crypto.randomUUID().slice(0, 8)}`;
    const created = await request(app.getHttpServer())
      .post('/it/employees')
      .set('Authorization', `Bearer ${it_.accessToken}`)
      .send({
        fullName: 'کارمند تست بدون دسترسی لاگ',
        username,
        phone: `09${crypto.randomInt(100_000_000, 1_000_000_000)}`,
        password: 'testpass1',
        dept: 'it',
        rank: 'کارشناس',
        permissionKeys: [],
      });
    expect(created.status).toBe(201);

    const { accessToken } = await loginAs(app, username, 'testpass1');
    const res = await request(app.getHttpServer())
      .get('/audit/logs')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('granting lg_view takes immediate effect on the very next request; revoking it does too (no permission cache)', async () => {
    const it_ = await loginAs(app, 'itadmin');
    const username = `au.${crypto.randomUUID().slice(0, 8)}`;
    const created = await request(app.getHttpServer())
      .post('/it/employees')
      .set('Authorization', `Bearer ${it_.accessToken}`)
      .send({
        fullName: 'کارمند تست دسترسی آنی لاگ',
        username,
        phone: `09${crypto.randomInt(100_000_000, 1_000_000_000)}`,
        password: 'testpass1',
        dept: 'it',
        rank: 'کارشناس',
        permissionKeys: [],
      });
    expect(created.status).toBe(201);
    const employeeId = created.body.data.id as string;

    const { accessToken } = await loginAs(app, username, 'testpass1');

    const before = await request(app.getHttpServer())
      .get('/audit/logs')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(before.status).toBe(403);

    const grant = await request(app.getHttpServer())
      .patch(`/it/employees/${employeeId}/permissions`)
      .set('Authorization', `Bearer ${it_.accessToken}`)
      .send({ permissionKey: 'lg_view', grant: true });
    expect(grant.status).toBe(200);

    // Same still-valid access token, no re-login — proves the guard reads
    // the grant live from the DB rather than a cached snapshot from login.
    const afterGrant = await request(app.getHttpServer())
      .get('/audit/logs')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(afterGrant.status).toBe(200);

    const revoke = await request(app.getHttpServer())
      .patch(`/it/employees/${employeeId}/permissions`)
      .set('Authorization', `Bearer ${it_.accessToken}`)
      .send({ permissionKey: 'lg_view', grant: false });
    expect(revoke.status).toBe(200);

    const afterRevoke = await request(app.getHttpServer())
      .get('/audit/logs')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(afterRevoke.status).toBe(403);
  });
});
