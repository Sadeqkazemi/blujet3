import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as crypto from 'node:crypto';
import * as argon2 from 'argon2';
import { DataSource } from 'typeorm';
import { User } from '../src/database/entities/user.entity';
import { AgencyProfile } from '../src/database/entities/agency-profile.entity';
import { AgencyCreditLine } from '../src/database/entities/agency-credit-line.entity';
import { loginAs } from './helpers/login.helper';
import { createTestApp } from './helpers/app.helper';

const AGENCY_PASSWORD = 'AgencyTest@123';

describe('Webservice pricing (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  beforeEach(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
  });

  afterEach(async () => {
    await app.close();
  });

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
    const profileRepo = dataSource.getRepository(AgencyProfile);
    await profileRepo.save(
      profileRepo.create({
        userId: user.id,
        licenseNo: `AG-TEST-${suffix}`,
        managerName: 'مدیر تست',
        phone,
        email: `${suffix}@test.example`,
        city: 'تهران',
        address: 'آدرس تست',
        tier: 'NORMAL',
      }),
    );
    const creditRepo = dataSource.getRepository(AgencyCreditLine);
    await creditRepo.save(
      creditRepo.create({
        agencyId: user.id,
        limitIrr: 1_000_000_000n,
        updatedAt: new Date(),
      }),
    );
    return phone;
  }

  async function loginAsAgency(phone: string) {
    const res = await request(app.getHttpServer())
      .post('/auth/agency/login')
      .send({ phone, password: AGENCY_PASSWORD });
    return res.body?.data?.accessToken as string;
  }

  it('COMMERCIAL_MANAGER patches plan prices; agency portal reads them on new requests', async () => {
    const commercial = await loginAs(app, 'comm');

    const patchRes = await request(app.getHttpServer())
      .patch('/webservice/pricing')
      .set('Authorization', `Bearer ${commercial.accessToken}`)
      .send({
        month1PriceIrr: 50_000_000,
        month3PriceIrr: 130_000_000,
        month12PriceIrr: 450_000_000,
      });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.prices['1']).toBe(50_000_000);

    const phone = await createFreshAgency();
    const agencyToken = await loginAsAgency(phone);

    const plansRes = await request(app.getHttpServer())
      .get('/agency-portal/webservice-plans')
      .set('Authorization', `Bearer ${agencyToken}`);
    expect(plansRes.status).toBe(200);
    expect(
      plansRes.body.data.plans.find((p: { months: number }) => p.months === 1)
        .priceIrr,
    ).toBe('50000000');

    const createRes = await request(app.getHttpServer())
      .post('/agency-portal/webservice-requests')
      .set('Authorization', `Bearer ${agencyToken}`)
      .send({ scope: 'SEARCH_BOOK', months: 1 });
    expect(createRes.status).toBe(201);
    expect(createRes.body.data.priceIrr).toBe('50000000');

    await request(app.getHttpServer())
      .patch('/webservice/pricing')
      .set('Authorization', `Bearer ${commercial.accessToken}`)
      .send({
        month1PriceIrr: 45_000_000,
        month3PriceIrr: 120_000_000,
        month12PriceIrr: 420_000_000,
      });
  });

  it('FINANCE_MANAGER cannot patch webservice pricing (403)', async () => {
    const finance = await loginAs(app, 'finance');
    const res = await request(app.getHttpServer())
      .patch('/webservice/pricing')
      .set('Authorization', `Bearer ${finance.accessToken}`)
      .send({
        month1PriceIrr: 1,
        month3PriceIrr: 1,
        month12PriceIrr: 1,
      });
    expect(res.status).toBe(403);
  });
});
