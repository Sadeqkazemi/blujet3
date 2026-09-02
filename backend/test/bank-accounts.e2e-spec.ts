import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { SavedBankAccount } from '../src/database/entities/saved-bank-account.entity';
import { loginAs, loginAsCustomer } from './helpers/login.helper';
import { createTestApp } from './helpers/app.helper';
import { resetCustomerPhones } from './helpers/customer-state.helper';

const VALID_SHEBA = 'IR820540102680020817909002';
const VALID_CARD = '6104337112344521';
const SECOND_SHEBA = 'IR060120000000332211452192';

describe('Bank accounts (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  beforeEach(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    await resetCustomerPhones(dataSource, [
      '09180000001',
      '09180000002',
      '09180000004',
    ]);
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET/POST/PATCH/DELETE /my/bank-accounts — USER only; PII encrypted at rest', async () => {
    const { accessToken, userId } = await loginAsCustomer(app, '09180000001');

    const create = await request(app.getHttpServer())
      .post('/my/bank-accounts')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ cardNo: VALID_CARD, sheba: VALID_SHEBA });
    expect(create.status).toBe(201);
    expect(create.body.data.bankName).toContain('ملت');
    expect(create.body.data.cardMasked).toBe('6104 3371 •••• 4521');
    expect(create.body.data.isDefault).toBe(true);

    const list = await request(app.getHttpServer())
      .get('/my/bank-accounts')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);

    const second = await request(app.getHttpServer())
      .post('/my/bank-accounts')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ cardNo: '6219861977777730', sheba: SECOND_SHEBA });
    expect(second.status).toBe(201);
    expect(second.body.data.isDefault).toBe(false);

    const dup = await request(app.getHttpServer())
      .post('/my/bank-accounts')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ cardNo: VALID_CARD, sheba: VALID_SHEBA });
    expect(dup.status).toBe(409);

    const patch = await request(app.getHttpServer())
      .patch(`/my/bank-accounts/${second.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ isDefault: true });
    expect(patch.status).toBe(200);
    expect(patch.body.data.isDefault).toBe(true);

    const del = await request(app.getHttpServer())
      .delete(`/my/bank-accounts/${create.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(del.status).toBe(200);

    const stored = await dataSource
      .getRepository(SavedBankAccount)
      .findBy({ userId: userId! });
    expect(stored.every((r) => r.id !== create.body.data.id)).toBe(true);
    expect(stored.some((r) => r.shebaEnc.includes(VALID_SHEBA))).toBe(false);
  });

  it('400 on invalid sheba/card; 403 for staff; 404 for other user row', async () => {
    const customer = await loginAsCustomer(app, '09180000002');
    const bad = await request(app.getHttpServer())
      .post('/my/bank-accounts')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ cardNo: '1234', sheba: 'IR000000000000000000000000' });
    expect(bad.status).toBe(400);

    const save = await request(app.getHttpServer())
      .post('/my/bank-accounts')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ cardNo: VALID_CARD, sheba: VALID_SHEBA });
    expect(save.status).toBe(201);

    const ceo = await loginAs(app, 'ceo');
    const forbidden = await request(app.getHttpServer())
      .get('/my/bank-accounts')
      .set('Authorization', `Bearer ${ceo.accessToken}`);
    expect(forbidden.status).toBe(403);

    const other = await loginAsCustomer(app, '09180000004');
    const notFound = await request(app.getHttpServer())
      .delete(`/my/bank-accounts/${save.body.data.id}`)
      .set('Authorization', `Bearer ${other.accessToken}`);
    expect(notFound.status).toBe(404);
  });
});
