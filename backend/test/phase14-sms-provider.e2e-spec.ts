import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import request from 'supertest';
import { DataSource, IsNull, Like } from 'typeorm';
import { SmsLog } from '../src/database/entities/sms-log.entity';
import { User } from '../src/database/entities/user.entity';
import { SmsMessageType, SmsStatus } from '../src/database/enums';
import { createTestApp } from './helpers/app.helper';
import { loginAs, loginAsCustomer, stepUpFor } from './helpers/login.helper';
import { normalizeIranPhone } from '../src/common/normalize-iran-phone';

/** Phase 14 — real SmsProvider + management log: OTP/temp-password sends
 * now write a genuine SmsLog row instead of only claiming delivery in an
 * audit-log sentence; the only fabricated-free failure mode is a missing
 * phone number. See docs/DB_SCHEMA.md Phase 14. */
describe('Phase 14 — SMS provider + management log', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await dataSource.getRepository(User).delete({ username: Like('p14.%') });
    await app.close();
  });

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  it('customer OTP login writes a real SUCCESS SmsLog row for that phone', async () => {
    const phone = `0912${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;
    const { accessToken } = await loginAsCustomer(app, phone);
    expect(accessToken).toBeDefined();

    const log = await dataSource.getRepository(SmsLog).findOne({
      where: {
        phone: normalizeIranPhone(phone),
        messageType: SmsMessageType.OTP,
      },
      order: { createdAt: 'DESC' },
    });
    expect(log).not.toBeNull();
    expect(log!.status).toBe('SUCCESS');
  });

  it('POST /admins with delivery=sms logs a genuine FAILED row (create never collects a phone)', async () => {
    const ceo = await loginAs(app, 'ceo');
    const username = `p14.admin.${Date.now()}`;
    const stepUp = await stepUpFor(
      app,
      ceo.accessToken!,
      'ceo',
      'ADMIN_ROLE_CHANGE',
    );
    const created = await request(app.getHttpServer())
      .post('/admins')
      .set(auth(ceo.accessToken!))
      .send({
        fullName: 'مدیر تست فاز ۱۴',
        email: `${username}@blujet.example`,
        username,
        role: 'IT_MANAGER',
        password: 'Blujet@1404',
        delivery: 'sms',
        ...stepUp,
      });
    expect(created.status).toBe(201);

    const log = await dataSource.getRepository(SmsLog).findOne({
      where: { messageType: SmsMessageType.TEMP_PASSWORD, phone: IsNull() },
      order: { createdAt: 'DESC' },
    });
    expect(log).not.toBeNull();
    expect(log!.status).toBe('FAILED');
    expect(log!.failureReason).toContain('شماره موبایل');
  });

  it('POST /admins/:id/reset-password (default delivery) logs FAILED for a phoneless target', async () => {
    const ceo = await loginAs(app, 'ceo');
    // A dedicated throwaway target — never reuse a shared seeded fixture
    // account here, since reset-password actually changes its real
    // password (mustChangePassword: true), which would break every other
    // test/dev session relying on that account's known seed password.
    const username = `p14.target.${Date.now()}`;
    const stepUp = await stepUpFor(
      app,
      ceo.accessToken!,
      'ceo',
      'ADMIN_ROLE_CHANGE',
    );
    const target = await request(app.getHttpServer())
      .post('/admins')
      .set(auth(ceo.accessToken!))
      .send({
        fullName: 'هدف بازنشانی فاز ۱۴',
        email: `${username}@blujet.example`,
        username,
        role: 'IT_MANAGER',
        password: 'Blujet@1404',
        delivery: 'email',
        ...stepUp,
      });
    expect(target.status).toBe(201);

    const before = await dataSource.getRepository(SmsLog).count({
      where: {
        messageType: SmsMessageType.TEMP_PASSWORD,
        status: SmsStatus.FAILED,
      },
    });

    const reset = await request(app.getHttpServer())
      .post(`/admins/${target.body.data.id}/reset-password`)
      .set(auth(ceo.accessToken!))
      .send({});
    expect(reset.status).toBe(201);
    expect(reset.body.data.tempPassword).toBeDefined();

    const after = await dataSource.getRepository(SmsLog).count({
      where: {
        messageType: SmsMessageType.TEMP_PASSWORD,
        status: SmsStatus.FAILED,
      },
    });
    expect(after).toBe(before + 1);
  });

  it('GET /it/services/sms-log returns real enabled/counters/recent — no uptime field', async () => {
    const { accessToken } = await loginAs(app, 'itadmin');
    const res = await request(app.getHttpServer())
      .get('/it/services/sms-log')
      .set(auth(accessToken!));
    expect(res.status).toBe(200);
    expect(typeof res.body.data.enabled).toBe('boolean');
    expect(typeof res.body.data.todaySuccessCount).toBe('number');
    expect(typeof res.body.data.todayFailedCount).toBe('number');
    expect(res.body.data.uptimePct).toBeUndefined();
    expect(Array.isArray(res.body.data.recent)).toBe(true);

    const withPhone = res.body.data.recent.find(
      (r: { phoneMasked: string | null }) => r.phoneMasked,
    );
    if (withPhone) {
      expect(withPhone.phoneMasked).not.toMatch(/^\+?\d{10,}$/);
    }
  });

  it('SENIOR_MANAGER cannot read the IT panel sms-log (role-gated)', async () => {
    const { accessToken } = await loginAs(app, 'senior');
    const res = await request(app.getHttpServer())
      .get('/it/services/sms-log')
      .set(auth(accessToken!));
    expect(res.status).toBe(403);
  });
});
