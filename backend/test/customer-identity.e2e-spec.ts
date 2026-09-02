import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { User } from '../src/database/entities/user.entity';
import { encryptPii } from '../src/common/pii-crypto';
import { loginAs, loginAsCustomer } from './helpers/login.helper';
import { createTestApp } from './helpers/app.helper';
import { resetCustomerPhones } from './helpers/customer-state.helper';

const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

describe('Customer identity verification (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  beforeEach(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    await resetCustomerPhones(dataSource, ['09180000101', '09180000102']);
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /my/identity — steps reflect profile + id card; submit flow', async () => {
    const phone = '09180000101';
    const { accessToken, userId } = await loginAsCustomer(app, phone);

    let res = await request(app.getHttpServer())
      .get('/my/identity')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.steps[0].done).toBe(false);

    await dataSource.getRepository(User).update(
      { id: userId! },
      {
        fullName: 'کاربر تست',
        nationalIdEnc: encryptPii('0012345679'),
        nationalIdHash: 'hash',
        birthDate: new Date('1990-01-01'),
      },
    );

    res = await request(app.getHttpServer())
      .get('/my/identity')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.body.data.steps[0].done).toBe(true);
    expect(res.body.data.canSubmit).toBe(false);

    const upload = await request(app.getHttpServer())
      .post('/my/identity/id-card')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', PNG_BYTES, {
        filename: 'کارت-ملی.png',
        contentType: 'image/png',
      });
    expect(upload.status).toBe(201);

    res = await request(app.getHttpServer())
      .get('/my/identity')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.body.data.steps[1].done).toBe(true);
    expect(res.body.data.canSubmit).toBe(true);

    const submit = await request(app.getHttpServer())
      .post('/my/identity/submit')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(submit.status).toBe(201);
    expect(submit.body.data.status).toBe('SUBMITTED');
  });

  it('403 for staff; 400 submit without id card', async () => {
    const phone = '09180000102';
    const { accessToken, userId } = await loginAsCustomer(app, phone);
    await dataSource.getRepository(User).update(
      { id: userId! },
      {
        nationalIdEnc: encryptPii('0012345679'),
        birthDate: new Date('1990-01-01'),
      },
    );

    const bad = await request(app.getHttpServer())
      .post('/my/identity/submit')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(bad.status).toBe(400);

    const ceo = await loginAs(app, 'ceo');
    const forbidden = await request(app.getHttpServer())
      .get('/my/identity')
      .set('Authorization', `Bearer ${ceo.accessToken}`);
    expect(forbidden.status).toBe(403);
  });
});
