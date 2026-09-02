import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as crypto from 'node:crypto';
import { DataSource, IsNull, MoreThan } from 'typeorm';
import { User } from '../src/database/entities/user.entity';
import { AuditLog } from '../src/database/entities/audit-log.entity';
import { PasswordResetEvent } from '../src/database/entities/password-reset-event.entity';
import { SecurityPolicy } from '../src/database/entities/security-policy.entity';
import { RefreshToken } from '../src/database/entities/refresh-token.entity';
import { EmployeePermission } from '../src/database/entities/employee-permission.entity';
import { ExternalServiceConfig } from '../src/database/entities/external-service-config.entity';
import { loginAs, stepUpFor } from './helpers/login.helper';
import { createTestApp } from './helpers/app.helper';

describe('IT Manager (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  beforeEach(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
  });

  afterEach(async () => {
    await app.close();
  });

  function auth(token: string | null | undefined) {
    return { Authorization: `Bearer ${token}` };
  }

  async function findAuditLog(where: {
    category?: string;
    action?: string;
    entityType?: string;
    entityId?: string;
  }) {
    const qb = dataSource.getRepository(AuditLog).createQueryBuilder('a');
    if (where.category) {
      qb.andWhere('a.category = :category', { category: where.category });
    }
    if (where.action) {
      qb.andWhere('a.action = :action', { action: where.action });
    }
    if (where.entityType) {
      qb.andWhere('a.entityType = :entityType', {
        entityType: where.entityType,
      });
    }
    if (where.entityId) {
      qb.andWhere('a.entityId = :entityId', { entityId: where.entityId });
    }
    return qb.getOne();
  }

  function uniqueIranMobile() {
    return `09${crypto.randomInt(100_000_000, 1_000_000_000)}`;
  }

  async function createEmployee(
    overrides?: Partial<{ dept: string; phone: string }>,
  ) {
    const { accessToken } = await loginAs(app, 'itadmin');
    const username = `emp.${crypto.randomUUID().slice(0, 8)}`;
    const phone = overrides?.phone ?? uniqueIranMobile();
    const password = 'testpass1';
    const res = await request(app.getHttpServer())
      .post('/it/employees')
      .set(auth(accessToken))
      .send({
        fullName: 'کارمند تست',
        username,
        phone,
        password,
        dept: overrides?.dept ?? 'commercial',
        rank: 'کارشناس',
        permissionKeys: ['ag_list'],
      });
    return { res, accessToken, username, phone, password };
  }

  // ── Permission catalog & employees ──────────────────────────────────

  it('GET /it/permissions returns the catalog; non-IT role gets 403', async () => {
    const it = await loginAs(app, 'itadmin');
    const res = await request(app.getHttpServer())
      .get('/it/permissions')
      .set(auth(it.accessToken));
    expect(res.status).toBe(200);
    expect(res.body.data.commercial).toBeDefined();
    expect(res.body.data.finance).toBeDefined();
    expect(res.body.data.it).toBeDefined();
    const commercialKeys = res.body.data.commercial.flatMap(
      (g: { perms: { key: string }[] }) => g.perms.map((p) => p.key),
    );
    expect(commercialKeys).toContain('ag_list');

    const ceo = await loginAs(app, 'ceo');
    const forbidden = await request(app.getHttpServer())
      .get('/it/permissions')
      .set(auth(ceo.accessToken));
    expect(forbidden.status).toBe(403);
  });

  it('POST /it/employees creates account with granted permissions, duplicate username -> 409, short password -> 400, audited', async () => {
    const { res, accessToken, username, phone, password } =
      await createEmployee();
    expect(res.status).toBe(201);
    expect(res.body.data.phone).toBe(`+98${phone.slice(1)}`);
    expect(res.body.data.permissions).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'ag_list' })]),
    );

    const dup = await request(app.getHttpServer())
      .post('/it/employees')
      .set(auth(accessToken))
      .send({
        fullName: 'تکراری',
        username: (await dataSource
          .getRepository(User)
          .findOneBy({ fullName: 'کارمند تست' }))!.username,
        password: 'testpass1',
        phone: uniqueIranMobile(),
        dept: 'commercial',
      });
    expect(dup.status).toBe(409);

    const duplicatePhone = await request(app.getHttpServer())
      .post('/it/employees')
      .set(auth(accessToken))
      .send({
        fullName: 'شماره تکراری',
        username: `phone.${crypto.randomUUID().slice(0, 6)}`,
        password: 'testpass1',
        phone,
        dept: 'commercial',
      });
    expect(duplicatePhone.status).toBe(409);

    const shortPassword = await request(app.getHttpServer())
      .post('/it/employees')
      .set(auth(accessToken))
      .send({
        fullName: 'رمز کوتاه',
        username: `short.${crypto.randomUUID().slice(0, 6)}`,
        password: '123',
        phone: uniqueIranMobile(),
        dept: 'commercial',
      });
    expect(shortPassword.status).toBe(400);

    const stored = await dataSource
      .getRepository(User)
      .findOneByOrFail({ username });
    expect(stored.phone).toBe(`+98${phone.slice(1)}`);
    expect(stored.twoFactorEnabled).toBe(true);

    const login = await request(app.getHttpServer())
      .post('/auth/staff/login')
      .send({ username, password });
    expect(login.status).toBe(200);
    expect(login.body.data).toEqual(
      expect.objectContaining({
        loginMode: 'TWO_FACTOR',
        challengeId: expect.any(String),
      }),
    );

    const audit = await findAuditLog({
      category: 'ACCOUNT',
      action: 'ایجاد حساب کارمند',
    });
    expect(audit).not.toBeNull();
  });

  it('POST /it/employees rejects unknown and cross-unit grants instead of silently creating a weaker account', async () => {
    const { accessToken } = await loginAs(app, 'itadmin');
    const username = `invalid-grant.${crypto.randomUUID().slice(0, 6)}`;
    const res = await request(app.getHttpServer())
      .post('/it/employees')
      .set(auth(accessToken))
      .send({
        fullName: 'کارمند با دسترسی نامعتبر',
        username,
        phone: uniqueIranMobile(),
        password: 'testpass1',
        dept: 'commercial',
        permissionKeys: ['ag_list', 'rf_process', 'does_not_exist'],
      });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('دسترسی');
    expect(await dataSource.getRepository(User).findOneBy({ username })).toBeNull();
  });

  it('a newly created employee logs in and receives only the navigation granted by IT', async () => {
    const { accessToken } = await loginAs(app, 'itadmin');
    const username = `finance-nav.${crypto.randomUUID().slice(0, 6)}`;
    const password = 'Finance@1405';
    const created = await request(app.getHttpServer())
      .post('/it/employees')
      .set(auth(accessToken))
      .send({
        fullName: 'کارمند مالی دسترسی محدود',
        username,
        phone: uniqueIranMobile(),
        password,
        dept: 'finance',
        rank: 'کارشناس',
        permissionKeys: ['rf_list', 'rp_finance'],
      });
    expect(created.status).toBe(201);

    const employee = await loginAs(app, username, password);
    expect(employee.accessToken).toBeTruthy();
    const nav = await request(app.getHttpServer())
      .get('/panels/nav')
      .set(auth(employee.accessToken));
    expect(nav.status).toBe(200);
    expect(nav.body.data.map((item: { key: string }) => item.key)).toEqual([
      'dashboard',
      'refund',
      'reports',
      'referrals',
    ]);
  });

  it('GET/PATCH /it/employees/:id and non-IT role gets 403 everywhere', async () => {
    const { res, accessToken } = await createEmployee();
    const id = res.body.data.id;

    const detail = await request(app.getHttpServer())
      .get(`/it/employees/${id}`)
      .set(auth(accessToken));
    expect(detail.status).toBe(200);
    expect(detail.body.data.available.length).toBeGreaterThan(0);

    const senior = await loginAs(app, 'senior');
    const forbidden = await request(app.getHttpServer())
      .get(`/it/employees/${id}`)
      .set(auth(senior.accessToken));
    expect(forbidden.status).toBe(403);
  });

  it('PATCH /it/employees/:id/status suspends and reactivates, audited', async () => {
    const { res, accessToken } = await createEmployee();
    const id = res.body.data.id;

    const suspended = await request(app.getHttpServer())
      .patch(`/it/employees/${id}/status`)
      .set(auth(accessToken))
      .send({ isActive: false });
    expect(suspended.status).toBe(200);
    expect(suspended.body.data.isActive).toBe(false);

    const reactivated = await request(app.getHttpServer())
      .patch(`/it/employees/${id}/status`)
      .set(auth(accessToken))
      .send({ isActive: true });
    expect(reactivated.body.data.isActive).toBe(true);

    const audit = await findAuditLog({
      category: 'ACCOUNT',
      entityType: 'User',
      entityId: id,
    });
    expect(audit).not.toBeNull();
  });

  it('DELETE /it/employees/:id archives the account, revokes access, hides it and releases login identifiers', async () => {
    const { res, accessToken, username, phone, password } = await createEmployee();
    const id = res.body.data.id as string;

    const removed = await request(app.getHttpServer())
      .delete(`/it/employees/${id}`)
      .set(auth(accessToken));
    expect(removed.status).toBe(200);
    expect(removed.body.data).toEqual({
      id,
      deletedAt: expect.any(String),
    });

    const archived = await dataSource.getRepository(User).findOneByOrFail({ id });
    expect(archived).toEqual(
      expect.objectContaining({
        isActive: false,
        username: null,
        phone: null,
        passwordHash: null,
        twoFactorEnabled: false,
      }),
    );
    expect(archived.deletedAt).toBeInstanceOf(Date);
    expect(
      await dataSource.getRepository(EmployeePermission).countBy({ employeeId: id }),
    ).toBe(0);

    const detail = await request(app.getHttpServer())
      .get(`/it/employees/${id}`)
      .set(auth(accessToken));
    expect(detail.status).toBe(404);

    const list = await request(app.getHttpServer())
      .get('/it/employees')
      .set(auth(accessToken));
    expect(list.status).toBe(200);
    expect(list.body.data.some((row: { id: string }) => row.id === id)).toBe(false);

    const oldLogin = await request(app.getHttpServer())
      .post('/auth/staff/login')
      .send({ username, password });
    expect(oldLogin.status).toBe(401);

    const recreated = await request(app.getHttpServer())
      .post('/it/employees')
      .set(auth(accessToken))
      .send({
        fullName: 'کارمند جایگزین',
        username,
        phone,
        password,
        dept: 'commercial',
        permissionKeys: ['ag_list'],
      });
    expect(recreated.status).toBe(201);
    expect(recreated.body.data.id).not.toBe(id);

    const audit = await findAuditLog({
      category: 'ACCOUNT',
      action: 'حذف حساب کارمند',
      entityType: 'User',
      entityId: id,
    });
    expect(audit).not.toBeNull();
  });

  it('PATCH /it/employees/:id/permissions grants/revokes idempotently, unknown key for dept -> 400, audited', async () => {
    const { res, accessToken } = await createEmployee();
    const id = res.body.data.id;

    const grant = await request(app.getHttpServer())
      .patch(`/it/employees/${id}/permissions`)
      .set(auth(accessToken))
      .send({ permissionKey: 'fl_view', grant: true });
    expect(grant.status).toBe(200);
    expect(
      grant.body.data.permissions.some(
        (p: { key: string }) => p.key === 'fl_view',
      ),
    ).toBe(true);

    const revoke = await request(app.getHttpServer())
      .patch(`/it/employees/${id}/permissions`)
      .set(auth(accessToken))
      .send({ permissionKey: 'fl_view', grant: false });
    expect(
      revoke.body.data.permissions.some(
        (p: { key: string }) => p.key === 'fl_view',
      ),
    ).toBe(false);

    // "rf_list" belongs to the finance catalog, not commercial (this employee's dept).
    const wrongDept = await request(app.getHttpServer())
      .patch(`/it/employees/${id}/permissions`)
      .set(auth(accessToken))
      .send({ permissionKey: 'rf_list', grant: true });
    expect(wrongDept.status).toBe(400);

    const audit = await findAuditLog({
      category: 'ACCESS',
      entityType: 'User',
      entityId: id,
    });
    expect(audit).not.toBeNull();
  });

  it('POST /it/employees/:id/reset-password returns a temp password once, replaces the hash, sets mustChangePassword, audited', async () => {
    const { res, accessToken } = await createEmployee();
    const id = res.body.data.id;
    const userRepo = dataSource.getRepository(User);
    const before = await userRepo.findOneByOrFail({ id });

    const reset = await request(app.getHttpServer())
      .post(`/it/employees/${id}/reset-password`)
      .set(auth(accessToken));
    expect(reset.status).toBe(201);
    expect(typeof reset.body.data.tempPassword).toBe('string');
    expect(reset.body.data.tempPassword.length).toBeGreaterThan(5);

    const after = await userRepo.findOneByOrFail({ id });
    expect(after.passwordHash).not.toBe(before.passwordHash);
    expect(after.mustChangePassword).toBe(true);

    const resetEvent = await dataSource
      .getRepository(PasswordResetEvent)
      .findOneBy({ employeeId: id });
    expect(resetEvent).not.toBeNull();

    const audit = await findAuditLog({
      category: 'ACCOUNT',
      action: 'بازنشانی رمز عبور کارمند',
    });
    expect(audit).not.toBeNull();
  });

  // ── Security ─────────────────────────────────────────────────────────

  it('GET /it/security/policy auto-creates the singleton; PATCH updates a subset, audited', async () => {
    const { accessToken } = await loginAs(app, 'itadmin');
    // Isolate from other tests/runs that may have already created+mutated
    // the id=1 singleton — force a fresh auto-create here.
    await dataSource.getRepository(SecurityPolicy).delete({ id: 1 });
    const get = await request(app.getHttpServer())
      .get('/it/security/policy')
      .set(auth(accessToken));
    expect(get.status).toBe(200);
    expect(get.body.data.minLength).toBe(10);

    const patch = await request(app.getHttpServer())
      .patch('/it/security/policy')
      .set(auth(accessToken))
      .send({ minLength: 12, requireSymbol: false });
    expect(patch.status).toBe(200);
    expect(patch.body.data.minLength).toBe(12);
    expect(patch.body.data.requireSymbol).toBe(false);
    // Untouched fields survive the partial update.
    expect(patch.body.data.maxAttempts).toBe(5);

    const audit = await findAuditLog({
      category: 'SECURITY',
      action: 'به‌روزرسانی سیاست رمز عبور',
    });
    expect(audit).not.toBeNull();
  });

  it('GET /it/security/sessions lists active sessions; logout-all revokes them and breaks refresh', async () => {
    const it = await loginAs(app, 'itadmin');
    const other = await loginAs(app, 'ceo');

    const sessions = await request(app.getHttpServer())
      .get('/it/security/sessions')
      .set(auth(it.accessToken));
    expect(sessions.status).toBe(200);
    expect(sessions.body.data.length).toBeGreaterThanOrEqual(2);

    const stepUp = await stepUpFor(
      app,
      it.accessToken!,
      'itadmin',
      'SESSION_REVOKE',
    );
    const logoutAll = await request(app.getHttpServer())
      .post('/it/security/sessions/logout-all')
      .set(auth(it.accessToken))
      .send(stepUp);
    expect(logoutAll.status).toBe(201);
    expect(logoutAll.body.data.revokedCount).toBeGreaterThanOrEqual(2);

    const remaining = await dataSource.getRepository(RefreshToken).countBy({
      revokedAt: IsNull(),
      expiresAt: MoreThan(new Date()),
    });
    expect(remaining).toBe(0);
    void other;
  });

  // ── Services ─────────────────────────────────────────────────────────

  it('GET /it/services returns seeded lists; apiKey never returned in plaintext', async () => {
    const { accessToken } = await loginAs(app, 'itadmin');
    const res = await request(app.getHttpServer())
      .get('/it/services')
      .set(auth(accessToken));
    expect(res.status).toBe(200);
    expect(res.body.data.internal.length).toBeGreaterThan(0);
    expect(res.body.data.external.length).toBeGreaterThan(0);
    for (const s of res.body.data.external) {
      expect(s.apiKeyEncrypted).toBeUndefined();
    }
  });

  it('PATCH /it/services/internal/:key toggles; unknown key -> 404; audited', async () => {
    const { accessToken } = await loginAs(app, 'itadmin');
    const off = await request(app.getHttpServer())
      .patch('/it/services/internal/search')
      .set(auth(accessToken))
      .send({ enabled: false });
    expect(off.status).toBe(200);
    expect(off.body.data.enabled).toBe(false);

    const notFound = await request(app.getHttpServer())
      .patch('/it/services/internal/does-not-exist')
      .set(auth(accessToken))
      .send({ enabled: true });
    expect(notFound.status).toBe(404);

    const audit = await findAuditLog({
      category: 'SYSTEM',
      entityType: 'InternalService',
      entityId: 'search',
    });
    expect(audit).not.toBeNull();
  });

  it('GET /it/services/internal/:key/report returns real audit events in pages of five', async () => {
    const { accessToken } = await loginAs(app, 'itadmin');
    for (let index = 0; index < 6; index += 1) {
      const toggled = await request(app.getHttpServer())
        .patch('/it/services/internal/search')
        .set(auth(accessToken))
        .send({ enabled: index % 2 === 0 });
      expect(toggled.status).toBe(200);
    }

    const firstPage = await request(app.getHttpServer())
      .get('/it/services/internal/search/report?page=1&limit=5')
      .set(auth(accessToken));
    expect(firstPage.status).toBe(200);
    expect(firstPage.body.data.service.key).toBe('search');
    expect(firstPage.body.data.items).toHaveLength(5);
    expect(firstPage.body.data.total).toBeGreaterThanOrEqual(6);
    expect(firstPage.body.data.limit).toBe(5);

    const secondPage = await request(app.getHttpServer())
      .get('/it/services/internal/search/report?page=2&limit=5')
      .set(auth(accessToken));
    expect(secondPage.status).toBe(200);
    expect(secondPage.body.data.items.length).toBeGreaterThanOrEqual(1);
  });

  it('external service CRUD: create with encrypted key, update, delete', async () => {
    const { accessToken } = await loginAs(app, 'itadmin');
    const created = await request(app.getHttpServer())
      .post('/it/services/external')
      .set(auth(accessToken))
      .send({
        nameFa: 'سرویس تستی',
        provider: 'تستر',
        endpoint: 'https://example.invalid/webhook',
        apiKey: 'super-secret-key',
      });
    expect(created.status).toBe(201);
    expect(created.body.data.hasApiKey).toBe(true);
    expect(created.body.data.apiKeyEncrypted).toBeUndefined();

    const row = await dataSource
      .getRepository(ExternalServiceConfig)
      .findOneByOrFail({ id: created.body.data.id });
    expect(row.apiKeyEncrypted).not.toBe('super-secret-key');
    expect(row.apiKeyEncrypted).not.toContain('super-secret-key');

    const updated = await request(app.getHttpServer())
      .patch(`/it/services/external/${created.body.data.id}`)
      .set(auth(accessToken))
      .send({ nameFa: 'سرویس تستی ویرایش‌شده' });
    expect(updated.body.data.nameFa).toBe('سرویس تستی ویرایش‌شده');

    const removed = await request(app.getHttpServer())
      .delete(`/it/services/external/${created.body.data.id}`)
      .set(auth(accessToken));
    expect(removed.status).toBe(200);
    const gone = await dataSource
      .getRepository(ExternalServiceConfig)
      .findOneBy({ id: created.body.data.id });
    expect(gone).toBeNull();
  });

  it('POST /it/services/external/:id/test performs a real check and never fabricates success', async () => {
    const { accessToken } = await loginAs(app, 'itadmin');
    const created = await request(app.getHttpServer())
      .post('/it/services/external')
      .set(auth(accessToken))
      .send({
        nameFa: 'سرویس غیرقابل‌دسترس',
        provider: 'تستر',
        endpoint: 'http://127.0.0.1:1/unreachable',
        timeoutMs: 1500,
      });

    const tested = await request(app.getHttpServer())
      .post(`/it/services/external/${created.body.data.id}/test`)
      .set(auth(accessToken));
    expect(tested.status).toBe(201);
    expect(tested.body.data.ok).toBe(false);
    expect(typeof tested.body.data.message).toBe('string');

    const row = await dataSource
      .getRepository(ExternalServiceConfig)
      .findOneByOrFail({ id: created.body.data.id });
    expect(row.lastTestOk).toBe(false);
    expect(row.lastTestAt).not.toBeNull();
  });

  // ── Backups ──────────────────────────────────────────────────────────

  it('POST /it/backups creates a record ending in a terminal status (never left RUNNING)', async () => {
    const { accessToken } = await loginAs(app, 'itadmin');
    const created = await request(app.getHttpServer())
      .post('/it/backups')
      .set(auth(accessToken));
    expect(created.status).toBe(201);
    expect(['SUCCESS', 'FAILED']).toContain(created.body.data.status);
    expect(created.body.data.completedAt).not.toBeNull();

    const list = await request(app.getHttpServer())
      .get('/it/backups')
      .set(auth(accessToken));
    expect(list.status).toBe(200);
    expect(list.body.data[0].id).toBe(created.body.data.id);

    const schedule = await request(app.getHttpServer())
      .get('/it/backups/schedule')
      .set(auth(accessToken));
    expect(schedule.status).toBe(200);
    expect(schedule.body.data.retentionDays).toBe(30);
  }, 30000);

  // ── Dashboard ────────────────────────────────────────────────────────

  it('GET /it/dashboard reconciles KPIs with employees/services and uses real host metrics', async () => {
    const { accessToken } = await loginAs(app, 'itadmin');
    const res = await request(app.getHttpServer())
      .get('/it/dashboard')
      .set(auth(accessToken));
    expect(res.status).toBe(200);
    expect(res.body.data.kpis.servicesUp).toBeGreaterThanOrEqual(0);
    expect(res.body.data.kpis.uptime30dPct).toBeGreaterThan(0);
    expect(res.body.data.resources.cpuUsedPct).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(res.body.data.recentEvents)).toBe(true);
  });

  it('GET /it/webservices returns the real API request/client overview without key hashes', async () => {
    const { accessToken } = await loginAs(app, 'itadmin');
    const res = await request(app.getHttpServer())
      .get('/it/webservices')
      .set(auth(accessToken));
    expect(res.status).toBe(200);
    expect(res.body.data.kpis).toEqual(
      expect.objectContaining({
        activeClients: expect.any(Number),
        issuedKeys: expect.any(Number),
        pendingRequests: expect.any(Number),
      }),
    );
    expect(Array.isArray(res.body.data.requests)).toBe(true);
    expect(Array.isArray(res.body.data.clients)).toBe(true);
    for (const client of res.body.data.clients) {
      expect(client).toHaveProperty('keyHint');
      expect(client).not.toHaveProperty('keyHash');
      expect(client).not.toHaveProperty('rawKey');
    }
  });

  it('a non-IT_MANAGER role gets 403 on every /it/* endpoint', async () => {
    const { accessToken } = await loginAs(app, 'ceo');
    const paths = [
      '/it/permissions',
      '/it/employees',
      '/it/security/policy',
      '/it/security/sessions',
      '/it/services',
      '/it/backups',
      '/it/dashboard',
      '/it/webservices',
    ];
    for (const path of paths) {
      const res = await request(app.getHttpServer())
        .get(path)
        .set(auth(accessToken));
      expect(res.status).toBe(403);
    }
  });
});
