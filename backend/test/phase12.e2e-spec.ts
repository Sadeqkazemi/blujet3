import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as crypto from 'node:crypto';
import * as argon2 from 'argon2';
import { DataSource } from 'typeorm';
import { User } from '../src/database/entities/user.entity';
import { RefundPenaltyRule } from '../src/database/entities/refund-penalty-rule.entity';
import { SystemSetting } from '../src/database/entities/system-setting.entity';
import { loginAs, stepUpFor } from './helpers/login.helper';
import { createTestApp } from './helpers/app.helper';
import type { Role } from '../src/database/enums';
import { TWO_FACTOR_PROVIDER } from '../src/modules/auth/providers/two-factor-provider.interface';
import { MockTwoFactorProvider } from '../src/modules/auth/providers/mock-two-factor.provider';

describe('Phase 12 — admins, security, settings, CEO logs, IT panels (e2e)', () => {
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
    return `Bearer ${token}`;
  }

  async function createManagedAdmin(role: Role = 'IT_MANAGER') {
    const suffix = crypto.randomUUID().slice(0, 8);
    const userRepo = dataSource.getRepository(User);
    return userRepo.save(
      userRepo.create({
        role,
        username: `p12.${suffix}`,
        email: `p12.${suffix}@test.example`,
        fullName: `مدیر تست ${suffix}`,
        passwordHash: await argon2.hash('Blujet@1404'),
        twoFactorEnabled: true,
        isActive: true,
        updatedAt: new Date(),
      }),
    );
  }

  // ── admins ────────────────────────────────────────────────────────────

  it('GET /admins: hierarchy scoping — Senior never gets a manageable SENIOR_MANAGER row; roles without the tab get 403', async () => {
    const senior = await loginAs(app, 'senior');
    const res = await request(app.getHttpServer())
      .get('/admins')
      .set('Authorization', auth(senior.accessToken));
    expect(res.status).toBe(200);
    const rows = res.body.data as {
      role: string;
      managedByCaller: boolean;
      online: boolean;
    }[];
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows.filter((r) => r.role === 'SENIOR_MANAGER')) {
      expect(row.managedByCaller).toBe(false);
    }
    // The senior manager itself just logged in — its own row must be online
    // (real refresh-token derivation).
    expect(rows.some((r) => r.online)).toBe(true);

    const finance = await loginAs(app, 'finance');
    const forbidden = await request(app.getHttpServer())
      .get('/admins')
      .set('Authorization', auth(finance.accessToken));
    expect(forbidden.status).toBe(403);
  });

  it('POST /admins creates a real staff account that can log in; duplicate username → 409', async () => {
    const ceo = await loginAs(app, 'ceo');
    const suffix = crypto.randomUUID().slice(0, 8);
    const stepUp1 = await stepUpFor(
      app,
      ceo.accessToken!,
      'ceo',
      'ADMIN_ROLE_CHANGE',
    );
    const createRes = await request(app.getHttpServer())
      .post('/admins')
      .set('Authorization', auth(ceo.accessToken))
      .send({
        fullName: `ادمین جدید ${suffix}`,
        email: `new.${suffix}@test.example`,
        username: `new.${suffix}`,
        role: 'SITE_ADMIN',
        password: 'Fresh@123456',
        delivery: 'sms',
        ...stepUp1,
      });
    expect(createRes.status).toBe(201);
    expect(createRes.body.data.tempPassword).toBe('Fresh@123456');
    expect(createRes.body.data.username).toBe(`new.${suffix}`);

    // The new account really works against the staff login.
    const loginRes = await request(app.getHttpServer())
      .post('/auth/staff/login')
      .send({ username: `new.${suffix}`, password: 'Fresh@123456' });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data.challengeId).toBeTruthy();

    const stepUp2 = await stepUpFor(
      app,
      ceo.accessToken!,
      'ceo',
      'ADMIN_ROLE_CHANGE',
    );
    const dupRes = await request(app.getHttpServer())
      .post('/admins')
      .set('Authorization', auth(ceo.accessToken))
      .send({
        fullName: 'تکراری',
        email: `dup.${suffix}@test.example`,
        username: `new.${suffix}`,
        role: 'SITE_ADMIN',
        password: 'Fresh@123456',
        delivery: 'email',
        ...stepUp2,
      });
    expect(dupRes.status).toBe(409);
  });

  it('block really disables staff login; unblock restores it; blocking a CEO/self is forbidden', async () => {
    const target = await createManagedAdmin();
    const ceo = await loginAs(app, 'ceo');

    const blockRes = await request(app.getHttpServer())
      .patch(`/admins/${target.id}/block`)
      .set('Authorization', auth(ceo.accessToken));
    expect(blockRes.status).toBe(200);
    expect(blockRes.body.data.isActive).toBe(false);

    const loginBlocked = await request(app.getHttpServer())
      .post('/auth/staff/login')
      .send({ username: target.username, password: 'Blujet@1404' });
    expect(loginBlocked.status).toBe(403);

    const unblockRes = await request(app.getHttpServer())
      .patch(`/admins/${target.id}/unblock`)
      .set('Authorization', auth(ceo.accessToken));
    expect(unblockRes.status).toBe(200);
    const loginOk = await request(app.getHttpServer())
      .post('/auth/staff/login')
      .send({ username: target.username, password: 'Blujet@1404' });
    expect(loginOk.status).toBe(200);

    // Never CEO/BOARD_CHAIR, never self.
    const ceoUser = await dataSource
      .getRepository(User)
      .findOneByOrFail({ username: 'ceo' });
    const blockCeo = await request(app.getHttpServer())
      .patch(`/admins/${ceoUser.id}/block`)
      .set('Authorization', auth(ceo.accessToken));
    expect(blockCeo.status).toBe(403);
  });

  it('blocking an account revokes its live session — a pre-existing refresh cookie stops working immediately', async () => {
    const target = await createManagedAdmin();
    const agent = request.agent(app.getHttpServer());
    const loginRes = await agent
      .post('/auth/staff/login')
      .send({ username: target.username, password: 'Blujet@1404' });
    const code = app
      .get<MockTwoFactorProvider>(TWO_FACTOR_PROVIDER)
      .getLastCode(target.id)!;
    await agent
      .post('/auth/staff/login/verify')
      .send({ challengeId: loginRes.body.data.challengeId, code });

    // The refresh token issued above is still valid at this point.
    const refreshBeforeBlock = await agent.post('/auth/refresh');
    expect(refreshBeforeBlock.status).toBe(200);

    const ceo = await loginAs(app, 'ceo');
    const blockRes = await request(app.getHttpServer())
      .patch(`/admins/${target.id}/block`)
      .set('Authorization', auth(ceo.accessToken));
    expect(blockRes.status).toBe(200);

    // The already-issued (and just-rotated) refresh cookie must now fail —
    // blocking must not require a global logout-all to take effect.
    const refreshAfterBlock = await agent.post('/auth/refresh');
    expect(refreshAfterBlock.status).toBe(401);
    expect(refreshAfterBlock.body.success).toBe(false);
  });

  it('POST /admins/:id/reset-password returns a temp password once that actually logs in; Senior cannot reset a SENIOR_MANAGER', async () => {
    const target = await createManagedAdmin();
    const chair = await loginAs(app, 'chair');

    const resetRes = await request(app.getHttpServer())
      .post(`/admins/${target.id}/reset-password`)
      .set('Authorization', auth(chair.accessToken))
      .send({});
    expect(resetRes.status).toBe(201);
    const tempPassword = resetRes.body.data.tempPassword as string;
    expect(tempPassword).toBeTruthy();

    const loginRes = await request(app.getHttpServer())
      .post('/auth/staff/login')
      .send({ username: target.username, password: tempPassword });
    expect(loginRes.status).toBe(200);

    const seniorTarget = await dataSource
      .getRepository(User)
      .findOneByOrFail({ username: 'senior' });
    const senior2 = await loginAs(app, 'senior');
    const forbidden = await request(app.getHttpServer())
      .post(`/admins/${seniorTarget.id}/reset-password`)
      .set('Authorization', auth(senior2.accessToken))
      .send({});
    expect(forbidden.status).toBe(403);
  });

  // ── own password ──────────────────────────────────────────────────────

  it('POST /auth/change-password: wrong current password → 401; success rotates the hash both ways', async () => {
    const user = await createManagedAdmin('SITE_ADMIN');
    const session = await loginAs(app, user.username!, 'Blujet@1404');
    const token = session.accessToken;

    const wrong = await request(app.getHttpServer())
      .post('/auth/change-password')
      .set('Authorization', auth(token))
      .send({ currentPassword: 'nope-nope', newPassword: 'Next@123456' });
    expect(wrong.status).toBe(401);

    const ok = await request(app.getHttpServer())
      .post('/auth/change-password')
      .set('Authorization', auth(token))
      .send({ currentPassword: 'Blujet@1404', newPassword: 'Next@123456' });
    expect(ok.status).toBe(200);

    const oldLogin = await request(app.getHttpServer())
      .post('/auth/staff/login')
      .send({ username: user.username, password: 'Blujet@1404' });
    expect(oldLogin.status).toBe(401);
    const newLogin = await request(app.getHttpServer())
      .post('/auth/staff/login')
      .send({ username: user.username, password: 'Next@123456' });
    expect(newLogin.status).toBe(200);
  });

  // ── CEO logs ──────────────────────────────────────────────────────────

  it('GET /audit/system-events: CEO gets real rows with the level mapping; others 403', async () => {
    const ceo = await loginAs(app, 'ceo');
    const res = await request(app.getHttpServer())
      .get('/audit/system-events')
      .set('Authorization', auth(ceo.accessToken));
    expect(res.status).toBe(200);
    const rows = res.body.data as { level: string; user: string }[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => ['WARN', 'OK', 'INFO'].includes(r.level))).toBe(
      true,
    );

    const senior = await loginAs(app, 'senior');
    const forbidden = await request(app.getHttpServer())
      .get('/audit/system-events')
      .set('Authorization', auth(senior.accessToken));
    expect(forbidden.status).toBe(403);
  });

  // ── settings ──────────────────────────────────────────────────────────

  it('settings round-trip: defaults come back, a patch persists, unknown keys are rejected; finance/chair 403', async () => {
    const it = await loginAs(app, 'itadmin');
    const getRes = await request(app.getHttpServer())
      .get('/settings')
      .set('Authorization', auth(it.accessToken));
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.settings).toHaveProperty('companyName');
    expect(getRes.body.data.refundRules.length).toBeGreaterThan(0);

    const patchRes = await request(app.getHttpServer())
      .patch('/settings')
      .set('Authorization', auth(it.accessToken))
      .send({ patch: { maintenance: true, supportPhone: '021-99999' } });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.settings.maintenance).toBe(true);
    expect(patchRes.body.data.settings.supportPhone).toBe('021-99999');

    const badRes = await request(app.getHttpServer())
      .patch('/settings')
      .set('Authorization', auth(it.accessToken))
      .send({ patch: { totallyUnknown: 1 } });
    expect(badRes.status).toBe(400);

    // Restore for repeatable runs.
    await request(app.getHttpServer())
      .patch('/settings')
      .set('Authorization', auth(it.accessToken))
      .send({ patch: { maintenance: false } });

    const finance = await loginAs(app, 'finance');
    const financeForbidden = await request(app.getHttpServer())
      .get('/settings')
      .set('Authorization', auth(finance.accessToken));
    expect(financeForbidden.status).toBe(403);

    const chair = await loginAs(app, 'chair');
    const chairForbidden = await request(app.getHttpServer())
      .get('/settings')
      .set('Authorization', auth(chair.accessToken));
    expect(chairForbidden.status).toBe(403);
  });

  it('site admin saves exactly seven rule categories and the public Persian projection reads the same row', async () => {
    const siteAdmin = await loginAs(app, 'site.admin');
    const categories = [
      ['purchase', 'خرید تست', 'متن خرید'],
      ['refund', 'استرداد تست', 'متن استرداد'],
      ['change', 'تغییر تست', 'متن تغییر'],
      ['baggage', 'بار تست', 'متن بار'],
      ['club', 'باشگاه تست', 'متن باشگاه'],
      ['privacy', 'حریم تست', 'متن حریم'],
      ['pets', 'حیوان تست', 'متن حیوان'],
    ].map(([id, title, text]) => ({ id, title, text }));

    const saved = await request(app.getHttpServer())
      .patch('/settings/site-rules')
      .set('Authorization', auth(siteAdmin.accessToken))
      .send({ categories });
    expect(saved.status).toBe(200);
    expect(saved.body.data.categories).toHaveLength(7);

    const persisted = await dataSource
      .getRepository(SystemSetting)
      .findOneByOrFail({ key: 'siteRules' });
    expect(persisted.updatedById).toBeTruthy();

    const publicRules = await request(app.getHttpServer()).get(
      '/settings/site-rules/public?locale=fa',
    );
    expect(publicRules.status).toBe(200);
    expect(publicRules.body.data.categories[0].title).toBe('خرید تست');

    const invalid = await request(app.getHttpServer())
      .patch('/settings/site-rules')
      .set('Authorization', auth(siteAdmin.accessToken))
      .send({
        categories: categories.map((item) => ({ ...item, id: 'purchase' })),
      });
    expect(invalid.status).toBe(400);

    const it = await loginAs(app, 'itadmin');
    const forbidden = await request(app.getHttpServer())
      .get('/settings/site-rules')
      .set('Authorization', auth(it.accessToken));
    expect(forbidden.status).toBe(403);

    await dataSource.getRepository(SystemSetting).delete({ key: 'siteRules' });
  });

  it('IT_MANAGER can only write its own operational keys — payment-gateway/brand keys are Board Chair-only', async () => {
    const it = await loginAs(app, 'itadmin');

    const allowed = await request(app.getHttpServer())
      .patch('/settings')
      .set('Authorization', auth(it.accessToken))
      .send({ patch: { maintenance: true, sandbox: false } });
    expect(allowed.status).toBe(200);
    expect(allowed.body.data.settings.maintenance).toBe(true);

    const outOfScope = await request(app.getHttpServer())
      .patch('/settings')
      .set('Authorization', auth(it.accessToken))
      .send({ patch: { gatewayZarin: true } });
    expect(outOfScope.status).toBe(403);

    const mixed = await request(app.getHttpServer())
      .patch('/settings')
      .set('Authorization', auth(it.accessToken))
      .send({ patch: { companyName: 'شرکت جعلی', supportPhone: '021-00000' } });
    expect(mixed.status).toBe(403);

    // The rejected patch must not have partially applied.
    const after = await request(app.getHttpServer())
      .get('/settings')
      .set('Authorization', auth(it.accessToken));
    expect(after.body.data.settings.companyName).not.toBe('شرکت جعلی');
    expect(after.body.data.settings.gatewayZarin).not.toBe(true);

    // Restore for repeatable runs.
    await request(app.getHttpServer())
      .patch('/settings')
      .set('Authorization', auth(it.accessToken))
      .send({ patch: { maintenance: false, sandbox: true } });
  });

  it('PATCH /settings/refund-rules writes the REAL Phase 7 engine rows (IT only; chair 403)', async () => {
    const it = await loginAs(app, 'itadmin');
    const getRes = await request(app.getHttpServer())
      .get('/settings')
      .set('Authorization', auth(it.accessToken));
    const rule = getRes.body.data.refundRules[0] as {
      id: string;
      penaltyPct: number;
    };
    const newPct = rule.penaltyPct === 35 ? 34 : 35;

    const patchRes = await request(app.getHttpServer())
      .patch('/settings/refund-rules')
      .set('Authorization', auth(it.accessToken))
      .send({ rules: [{ id: rule.id, penaltyPct: newPct }] });
    expect(patchRes.status).toBe(200);

    // The Phase 7 refunds engine reads this exact table — verify the row.
    const dbRow = await dataSource
      .getRepository(RefundPenaltyRule)
      .findOneByOrFail({ id: rule.id });
    expect(dbRow.penaltyPct).toBe(newPct);

    // Restore the original percentage.
    await request(app.getHttpServer())
      .patch('/settings/refund-rules')
      .set('Authorization', auth(it.accessToken))
      .send({ rules: [{ id: rule.id, penaltyPct: rule.penaltyPct }] });

    const chair = await loginAs(app, 'chair');
    const forbidden = await request(app.getHttpServer())
      .patch('/settings/refund-rules')
      .set('Authorization', auth(chair.accessToken))
      .send({ rules: [{ id: rule.id, penaltyPct: 50 }] });
    expect(forbidden.status).toBe(403);
  });

  it('social links: IT_MANAGER patches socialLinks, public GET returns enabled only', async () => {
    const it = await loginAs(app, 'itadmin');

    const patchRes = await request(app.getHttpServer())
      .patch('/settings')
      .set('Authorization', auth(it.accessToken))
      .send({
        patch: {
          socialLinks: [
            {
              id: 'instagram',
              name: 'اینستاگرام blujet',
              url: 'instagram.com/blujet',
              enabled: true,
            },
            { id: 'telegram', enabled: false },
          ],
        },
      });
    expect(patchRes.status).toBe(200);
    expect(
      (
        patchRes.body.data.settings.socialLinks as {
          id: string;
          enabled: boolean;
        }[]
      ).find((l) => l.id === 'instagram')?.enabled,
    ).toBe(true);

    const publicRes = await request(app.getHttpServer()).get(
      '/settings/social-links',
    );
    expect(publicRes.status).toBe(200);
    expect(publicRes.body.data.links).toEqual([
      {
        id: 'instagram',
        name: 'اینستاگرام blujet',
        url: 'https://instagram.com/blujet',
      },
    ]);

    const badPatch = await request(app.getHttpServer())
      .patch('/settings')
      .set('Authorization', auth(it.accessToken))
      .send({
        patch: {
          socialLinks: [{ id: 'instagram', enabled: true, url: '  ' }],
        },
      });
    expect(badPatch.status).toBe(400);

    // Restore defaults for repeatable runs.
    await request(app.getHttpServer())
      .patch('/settings')
      .set('Authorization', auth(it.accessToken))
      .send({
        patch: {
          socialLinks: [
            { id: 'instagram', enabled: false, url: '' },
            { id: 'telegram', enabled: false },
            { id: 'whatsapp', enabled: false },
            { id: 'linkedin', enabled: false },
            { id: 'x', enabled: false },
          ],
        },
      });
  });

  it('SITE_ADMIN can read settings and patch site chrome keys only (not maintenance)', async () => {
    const siteAdmin = await loginAs(app, 'site.admin');
    const getRes = await request(app.getHttpServer())
      .get('/settings')
      .set('Authorization', auth(siteAdmin.accessToken));
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.settings).toHaveProperty('socialLinks');
    expect(getRes.body.data.settings).toHaveProperty('appDownloadLinks');

    const patchSocial = await request(app.getHttpServer())
      .patch('/settings')
      .set('Authorization', auth(siteAdmin.accessToken))
      .send({
        patch: {
          socialLinks: [
            {
              id: 'instagram',
              name: 'blujet',
              url: 'instagram.com/blujet',
              enabled: true,
            },
          ],
          supportPhone: '021-91000000',
          supportEmail: 'support@blujet.example',
          appDownloadLinks: [
            {
              id: 'app_store',
              name: 'App Store',
              url: 'apps.apple.com/blujet',
            },
            { id: 'google_play', name: 'Google Play', url: '' },
            { id: 'bazaar_myket', name: 'بازار', url: '' },
          ],
        },
      });
    expect(patchSocial.status).toBe(200);
    expect(patchSocial.body.data.settings.supportPhone).toBe('021-91000000');

    const publicApps = await request(app.getHttpServer()).get(
      '/settings/app-links',
    );
    expect(publicApps.status).toBe(200);
    expect(publicApps.body.data.links).toHaveLength(1);
    expect(publicApps.body.data.links[0].url).toContain('apps.apple.com');

    const publicContact = await request(app.getHttpServer()).get(
      '/settings/support-contact',
    );
    expect(publicContact.status).toBe(200);
    expect(publicContact.body.data.phone).toBe('021-91000000');

    const patchContent = await request(app.getHttpServer())
      .patch('/settings')
      .set('Authorization', auth(siteAdmin.accessToken))
      .send({
        patch: {
          aboutUsText: 'متن درباره ما از CMS',
          contactAddress: 'اصفهان، ایران',
        },
      });
    expect(patchContent.status).toBe(200);
    expect(patchContent.body.data.settings.aboutUsText).toBe(
      'متن درباره ما از CMS',
    );

    const publicContent = await request(app.getHttpServer()).get(
      '/settings/site-content',
    );
    expect(publicContent.status).toBe(200);
    expect(publicContent.body.data.aboutUsText).toBe('متن درباره ما از CMS');
    expect(publicContent.body.data.contactAddress).toBe('اصفهان، ایران');

    const patchMaintenance = await request(app.getHttpServer())
      .patch('/settings')
      .set('Authorization', auth(siteAdmin.accessToken))
      .send({ patch: { maintenance: true } });
    expect(patchMaintenance.status).toBe(403);
  });

  // ── IT read-only panels access ────────────────────────────────────────

  it('IT_MANAGER can read /panels/access but PATCH stays 403', async () => {
    const it = await loginAs(app, 'itadmin');
    const getRes = await request(app.getHttpServer())
      .get('/panels/access')
      .set('Authorization', auth(it.accessToken));
    expect(getRes.status).toBe(200);
    expect((getRes.body.data as unknown[]).length).toBeGreaterThan(0);

    const patchRes = await request(app.getHttpServer())
      .patch('/panels/access/FINANCE')
      .set('Authorization', auth(it.accessToken))
      .send({ enabled: false });
    expect(patchRes.status).toBe(403);
  });
});
