import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { User } from '../src/database/entities/user.entity';
import { Role } from '../src/database/enums';
import { encryptPii, hashPii } from '../src/common/pii-crypto';
import { loginAs } from './helpers/login.helper';
import { createTestApp } from './helpers/app.helper';

describe('Customers (SITE_ADMIN and SENIOR_MANAGER) (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  beforeEach(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
  });

  afterEach(async () => {
    await app.close();
  });

  it('rejects unauthenticated and non–site-admin callers', async () => {
    const anon = await request(app.getHttpServer()).get('/customers');
    expect(anon.status).toBe(401);

    const { accessToken } = await loginAs(app, 'finance');
    const forbidden = await request(app.getHttpServer())
      .get('/customers')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(forbidden.status).toBe(403);
  });

  it('lists USER customers, supports mobile search, and returns incompleteCount', async () => {
    const { accessToken } = await loginAs(app, 'site.admin');

    // Ensure seeded نگار has a complete profile for the «کامل» row.
    const userRepo = dataSource.getRepository(User);
    const negar = await userRepo.findOneByOrFail({ phone: '+989120000001' });
    await userRepo.update(
      { id: negar.id },
      {
        fullName: 'نگار رضایی',
        email: 'negar@email.example',
        nationalIdEnc: encryptPii('0012345679'),
        nationalIdHash: hashPii('0012345679'),
        birthDate: new Date('1990-01-01'),
        passportNoEnc: encryptPii('A12345678'),
        addressEnc: encryptPii('تهران، خیابان ولیعصر، پلاک ۱۲'),
        emailVerifiedAt: new Date(),
        updatedAt: new Date(),
      },
    );

    // Incomplete customer (no national ID) — unique phone so re-runs on a
    // shared seeded DB don't collide with users_phone_key.
    const incompletePhone = `+98919${Date.now().toString().slice(-7)}`;
    await userRepo.save(
      userRepo.create({
        role: Role.USER,
        phone: incompletePhone,
        fullName: '',
        isActive: true,
        updatedAt: new Date(),
      }),
    );

    const list = await request(app.getHttpServer())
      .get('/customers')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(list.status).toBe(200);
    expect(list.body.success).toBe(true);
    expect(Array.isArray(list.body.data.customers)).toBe(true);
    expect(list.body.data.incompleteCount).toBeGreaterThanOrEqual(1);

    const found = list.body.data.customers.find(
      (c: { phone: string | null }) => c.phone === '09120000001',
    );
    expect(found).toBeTruthy();
    expect(found.fullName).toBe('نگار رضایی');
    expect(found.profileIncomplete).toBe(false);
    expect(found.completionPct).toBe(100);
    expect(found.missingProfileFields).toEqual([]);
    expect(found.nationalId).toBe('0012345679');

    const search = await request(app.getHttpServer())
      .get('/customers')
      .query({ q: '۰۹۱۲۰۰۰۰۰۰۱' })
      .set('Authorization', `Bearer ${accessToken}`);
    expect(search.status).toBe(200);
    expect(search.body.data.customers.length).toBeGreaterThanOrEqual(1);
    expect(
      search.body.data.customers.every(
        (c: { phone: string | null }) =>
          (c.phone ?? '').includes('09120000001') ||
          (c.phone ?? '').includes('9120000001'),
      ),
    ).toBe(true);

    const badge = await request(app.getHttpServer())
      .get('/customers/incomplete-count')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(badge.status).toBe(200);
    expect(badge.body.data.count).toBe(list.body.data.incompleteCount);

    const detail = await request(app.getHttpServer())
      .get(`/customers/${negar.id}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.fullName).toBe('نگار رضایی');
    expect(detail.body.data.club.isMember).toBe(true);
    expect(detail.body.data.club.level).toBe('GOLD');
    expect(Array.isArray(detail.body.data.purchases)).toBe(true);
    expect(Array.isArray(detail.body.data.contacts)).toBe(true);
    expect(Array.isArray(detail.body.data.docs)).toBe(true);
    expect(Array.isArray(detail.body.data.refunds)).toBe(true);

    const senior = await loginAs(app, 'senior');
    const seniorDetail = await request(app.getHttpServer())
      .get(`/customers/${negar.id}`)
      .set('Authorization', `Bearer ${senior.accessToken}`);
    expect(seniorDetail.status).toBe(200);
    expect(seniorDetail.body.data.profileIncomplete).toBe(false);
    expect(seniorDetail.body.data.nationalId).not.toBe('0012345679');
    expect(seniorDetail.body.data.nationalId).toMatch(/\*/);
  });

  it('returns 404 for unknown customer id', async () => {
    const { accessToken } = await loginAs(app, 'site.admin');
    const res = await request(app.getHttpServer())
      .get('/customers/00000000-0000-4000-8000-000000000099')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(404);
  });
});
