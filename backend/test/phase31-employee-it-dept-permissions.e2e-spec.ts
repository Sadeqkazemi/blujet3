import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as crypto from 'node:crypto';
import { loginAs } from './helpers/login.helper';
import { createTestApp } from './helpers/app.helper';

/**
 * Phase 31: the four IT-dept PERMISSION_CATALOG keys deferred since
 * Phase 27 (us_manage/sv_control/sc_manage/lg_view) are wired for
 * EMPLOYEE, but deliberately much narrower than the raw IT_MANAGER
 * endpoint list behind them — see the comments on
 * EmployeesController/ItServicesController/SecurityController/
 * AuditController and EmployeesService.deptScopeForEmployee. No frontend
 * nav wiring this phase — the design has zero page body for any of these
 * four tabs (see docs/API.md's Phase 31 section), so wiring a nav entry
 * would only produce a dead/blank tab.
 */
describe('Phase 31 — EMPLOYEE narrow access to IT-dept permission keys (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  async function createEmployeeWithPermissions(
    dept: string,
    permissionKeys: string[],
  ) {
    const it = await loginAs(app, 'itadmin');
    const username = `e31.${crypto.randomUUID().slice(0, 8)}`;
    const res = await request(app.getHttpServer())
      .post('/it/employees')
      .set('Authorization', `Bearer ${it.accessToken}`)
      .send({
        fullName: 'کارمند تست فاز ۳۱',
        username,
        phone: `09${crypto.randomInt(100_000_000, 1_000_000_000)}`,
        password: 'Blujet@1404',
        dept,
        permissionKeys,
      });
    expect(res.status).toBe(201);
    return { username, id: res.body.data.id as string };
  }

  // ── us_manage ───────────────────────────────────────────────────────
  describe('us_manage', () => {
    it('an employee freshly granted us_manage can list/view employees of their OWN dept only, and cannot list without it', async () => {
      const itEmployee = await createEmployeeWithPermissions('it', [
        'us_manage',
      ]);
      const commercialEmployee = await createEmployeeWithPermissions(
        'commercial',
        [],
      );
      const { accessToken } = await loginAs(app, itEmployee.username);

      const list = await request(app.getHttpServer())
        .get('/it/employees')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(list.status).toBe(200);
      const ids = (list.body.data as { id: string }[]).map((e) => e.id);
      expect(ids).toContain(itEmployee.id);
      expect(ids).not.toContain(commercialEmployee.id);

      // Even if the query string asks for another dept, the server-side
      // scope wins — proving it can't be bypassed by the client.
      const spoofed = await request(app.getHttpServer())
        .get('/it/employees?dept=commercial')
        .set('Authorization', `Bearer ${accessToken}`);
      const spoofedIds = (spoofed.body.data as { id: string }[]).map(
        (e) => e.id,
      );
      expect(spoofedIds).not.toContain(commercialEmployee.id);

      const ownDeptDetail = await request(app.getHttpServer())
        .get(`/it/employees/${itEmployee.id}`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(ownDeptDetail.status).toBe(200);

      const otherDeptDetail = await request(app.getHttpServer())
        .get(`/it/employees/${commercialEmployee.id}`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(otherDeptDetail.status).toBe(403);
    });

    it('without us_manage, GET /it/employees is 403', async () => {
      const { username } = await createEmployeeWithPermissions('it', []);
      const { accessToken } = await loginAs(app, username);

      const res = await request(app.getHttpServer())
        .get('/it/employees')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(403);
    });

    it('us_manage never unlocks create/suspend/grant-permissions — only IT_MANAGER can', async () => {
      const itEmployee = await createEmployeeWithPermissions('it', [
        'us_manage',
      ]);
      const target = await createEmployeeWithPermissions('it', []);
      const { accessToken } = await loginAs(app, itEmployee.username);

      const create = await request(app.getHttpServer())
        .post('/it/employees')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          fullName: 'تلاش برای ایجاد',
          username: `e31.${crypto.randomUUID().slice(0, 8)}`,
          phone: `09${crypto.randomInt(100_000_000, 1_000_000_000)}`,
          password: 'Blujet@1404',
          dept: 'it',
        });
      expect(create.status).toBe(403);

      const suspend = await request(app.getHttpServer())
        .patch(`/it/employees/${target.id}/status`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ isActive: false });
      expect(suspend.status).toBe(403);

      const grant = await request(app.getHttpServer())
        .patch(`/it/employees/${target.id}/permissions`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ permissionKey: 'sv_control', grant: true });
      expect(grant.status).toBe(403);
    });

    it('us_manage can reset a same-dept colleague’s password, but never their own, and never another dept’s', async () => {
      const itEmployee = await createEmployeeWithPermissions('it', [
        'us_manage',
      ]);
      const colleague = await createEmployeeWithPermissions('it', []);
      const otherDept = await createEmployeeWithPermissions('finance', []);
      const { accessToken } = await loginAs(app, itEmployee.username);

      const resetColleague = await request(app.getHttpServer())
        .post(`/it/employees/${colleague.id}/reset-password`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(resetColleague.status).toBe(201);
      expect(resetColleague.body.data.tempPassword).toBeDefined();

      const resetSelf = await request(app.getHttpServer())
        .post(`/it/employees/${itEmployee.id}/reset-password`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(resetSelf.status).toBe(403);

      const resetOtherDept = await request(app.getHttpServer())
        .post(`/it/employees/${otherDept.id}/reset-password`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(resetOtherDept.status).toBe(403);
    });
  });

  // ── sv_control ──────────────────────────────────────────────────────
  describe('sv_control', () => {
    it('an employee freshly granted sv_control can view services but not toggle/create/delete/test them', async () => {
      const { username } = await createEmployeeWithPermissions('it', [
        'sv_control',
      ]);
      const { accessToken } = await loginAs(app, username);

      const list = await request(app.getHttpServer())
        .get('/it/services')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(list.status).toBe(200);
      const internalKey = (list.body.data.internal as { key: string }[])[0].key;

      const toggle = await request(app.getHttpServer())
        .patch(`/it/services/internal/${internalKey}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ enabled: false });
      expect(toggle.status).toBe(403);

      const createExternal = await request(app.getHttpServer())
        .post('/it/services/external')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          nameFa: 'تلاش برای ایجاد',
          provider: 'x',
          endpoint: 'https://example.com',
        });
      expect(createExternal.status).toBe(403);
    });

    it('without sv_control, GET /it/services is 403', async () => {
      const { username } = await createEmployeeWithPermissions('it', []);
      const { accessToken } = await loginAs(app, username);

      const res = await request(app.getHttpServer())
        .get('/it/services')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(403);
    });
  });

  // ── sc_manage ───────────────────────────────────────────────────────
  describe('sc_manage', () => {
    it('an employee freshly granted sc_manage can view the security policy but not sessions, update the policy, or force-logout everyone', async () => {
      const { username } = await createEmployeeWithPermissions('it', [
        'sc_manage',
      ]);
      const { accessToken } = await loginAs(app, username);

      const policy = await request(app.getHttpServer())
        .get('/it/security/policy')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(policy.status).toBe(200);

      const sessions = await request(app.getHttpServer())
        .get('/it/security/sessions')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(sessions.status).toBe(403);

      const updatePolicy = await request(app.getHttpServer())
        .patch('/it/security/policy')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ minLength: 12 });
      expect(updatePolicy.status).toBe(403);

      const logoutAll = await request(app.getHttpServer())
        .post('/it/security/sessions/logout-all')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ stepUpChallengeId: 'x', stepUpCode: '000000' });
      expect(logoutAll.status).toBe(403);
    });

    it('without sc_manage, GET /it/security/policy is 403', async () => {
      const { username } = await createEmployeeWithPermissions('it', []);
      const { accessToken } = await loginAs(app, username);

      const res = await request(app.getHttpServer())
        .get('/it/security/policy')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(403);
    });
  });

  // ── lg_view ─────────────────────────────────────────────────────────
  describe('lg_view', () => {
    it('an employee freshly granted lg_view can read the system event log', async () => {
      const { username } = await createEmployeeWithPermissions('it', [
        'lg_view',
      ]);
      const { accessToken } = await loginAs(app, username);

      const res = await request(app.getHttpServer())
        .get('/audit/logs')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
    });

    it('without lg_view, GET /audit/logs is 403', async () => {
      const { username } = await createEmployeeWithPermissions('it', []);
      const { accessToken } = await loginAs(app, username);

      const res = await request(app.getHttpServer())
        .get('/audit/logs')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(403);
    });
  });

  it("doesn't affect IT_MANAGER: still has full access despite EMPLOYEE now holding narrow grants", async () => {
    const { accessToken } = await loginAs(app, 'itadmin');

    const employees = await request(app.getHttpServer())
      .get('/it/employees')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(employees.status).toBe(200);

    const sessions = await request(app.getHttpServer())
      .get('/it/security/sessions')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(sessions.status).toBe(200);
  });
});
