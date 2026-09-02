import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { User } from '../src/database/entities/user.entity';
import { CustomerIdentityVerification } from '../src/database/entities/customer-identity-verification.entity';
import { encryptPii } from '../src/common/pii-crypto';
import { loginAs, loginAsCustomer } from './helpers/login.helper';
import { createTestApp } from './helpers/app.helper';
import { resetCustomerPhones } from './helpers/customer-state.helper';

const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/** SITE_ADMIN KYC review queue — the staff side of /my/identity. */
describe('Identity admin review (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  beforeEach(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    await resetCustomerPhones(dataSource, [
      '09180000201',
      '09180000202',
      '09180000203',
      '09180000204',
      '09180000205',
    ]);
  });

  afterEach(async () => {
    await app.close();
  });

  /** Drives a customer through the full submit flow, returning the
   * verification row id. */
  async function submitAsCustomer(phone: string) {
    const { accessToken, userId } = await loginAsCustomer(app, phone);
    await dataSource.getRepository(User).update(
      { id: userId! },
      {
        fullName: 'مشتری تست کیوسی',
        nationalIdEnc: encryptPii('0012345679'),
        nationalIdHash: `hash-${phone}`,
        birthDate: new Date('1990-01-01'),
      },
    );
    const upload = await request(app.getHttpServer())
      .post('/my/identity/id-card')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', PNG_BYTES, {
        filename: 'کارت-ملی.png',
        contentType: 'image/png',
      });
    expect(upload.status).toBe(201);
    const submit = await request(app.getHttpServer())
      .post('/my/identity/submit')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(submit.status).toBe(201);
    const row = await dataSource
      .getRepository(CustomerIdentityVerification)
      .findOneByOrFail({ userId: userId! });
    return { rowId: row.id, customerToken: accessToken!, userId: userId! };
  }

  it('lists submitted verifications with customer info and id-card download; approve flow', async () => {
    const { rowId, customerToken } = await submitAsCustomer('09180000201');
    const admin = await loginAs(app, 'site.admin');

    const list = await request(app.getHttpServer())
      .get('/identity-verifications')
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(list.status).toBe(200);
    const mine = list.body.data.find((r: { id: string }) => r.id === rowId);
    expect(mine).toBeDefined();
    expect(mine.status).toBe('SUBMITTED');
    expect(mine.fullName).toBe('مشتری تست کیوسی');
    expect(mine.nationalId).toBe('0012345679');
    expect(mine.idCardFileName).toBe('کارت-ملی.png');

    const idCard = await request(app.getHttpServer())
      .get(`/identity-verifications/${rowId}/id-card`)
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(idCard.status).toBe(200);
    expect(idCard.headers['content-type']).toContain('image/png');

    const approve = await request(app.getHttpServer())
      .patch(`/identity-verifications/${rowId}/approve`)
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(approve.status).toBe(200);
    expect(approve.body.data.status).toBe('APPROVED');

    // Customer sees APPROVED; second approve is a 409 (no longer SUBMITTED).
    const my = await request(app.getHttpServer())
      .get('/my/identity')
      .set('Authorization', `Bearer ${customerToken}`);
    expect(my.body.data.status).toBe('APPROVED');
    expect(my.body.data.isComplete).toBe(true);

    const again = await request(app.getHttpServer())
      .patch(`/identity-verifications/${rowId}/approve`)
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(again.status).toBe(409);
  });

  it('keeps the admin queue available when legacy PII cannot be decrypted', async () => {
    const { rowId, userId } = await submitAsCustomer('09180000205');
    await dataSource
      .getRepository(User)
      .update(
        { id: userId },
        { nationalIdEnc: 'legacy-ciphertext-from-another-key' },
      );
    const admin = await loginAs(app, 'site.admin');

    const list = await request(app.getHttpServer())
      .get('/identity-verifications')
      .set('Authorization', `Bearer ${admin.accessToken}`);

    expect(list.status).toBe(200);
    const mine = list.body.data.find((r: { id: string }) => r.id === rowId);
    expect(mine).toBeDefined();
    expect(mine.nationalId).toBeNull();
  });

  it('reject requires a reason, surfaces it to the customer, and re-submit works', async () => {
    const { rowId, customerToken } = await submitAsCustomer('09180000202');
    const admin = await loginAs(app, 'site.admin');

    const noReason = await request(app.getHttpServer())
      .patch(`/identity-verifications/${rowId}/reject`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({});
    expect(noReason.status).toBe(400);

    const reject = await request(app.getHttpServer())
      .patch(`/identity-verifications/${rowId}/reject`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ rejectReason: 'تصویر کارت ملی ناخوانا است.' });
    expect(reject.status).toBe(200);
    expect(reject.body.data.status).toBe('REJECTED');

    const my = await request(app.getHttpServer())
      .get('/my/identity')
      .set('Authorization', `Bearer ${customerToken}`);
    expect(my.body.data.status).toBe('REJECTED');
    expect(my.body.data.rejectReason).toBe('تصویر کارت ملی ناخوانا است.');
    expect(my.body.data.canSubmit).toBe(true);

    const resubmit = await request(app.getHttpServer())
      .post('/my/identity/submit')
      .set('Authorization', `Bearer ${customerToken}`);
    expect(resubmit.status).toBe(201);
    expect(resubmit.body.data.status).toBe('SUBMITTED');
  });

  it('403 for non-SITE_ADMIN staff and customers; 404 unknown id', async () => {
    const { rowId } = await submitAsCustomer('09180000203');

    const ceo = await loginAs(app, 'ceo');
    const forbidden = await request(app.getHttpServer())
      .get('/identity-verifications')
      .set('Authorization', `Bearer ${ceo.accessToken}`);
    expect(forbidden.status).toBe(403);

    const { accessToken: customerToken } = await loginAsCustomer(
      app,
      '09180000204',
    );
    const forbiddenCustomer = await request(app.getHttpServer())
      .patch(`/identity-verifications/${rowId}/approve`)
      .set('Authorization', `Bearer ${customerToken}`);
    expect(forbiddenCustomer.status).toBe(403);

    const admin = await loginAs(app, 'site.admin');
    const notFound = await request(app.getHttpServer())
      .patch(
        '/identity-verifications/00000000-0000-0000-0000-000000000000/approve',
      )
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(notFound.status).toBe(404);
  });
});
