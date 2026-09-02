import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { TravelExtraSetting } from '../src/database/entities/travel-extra-setting.entity';
import { AncillaryService } from '../src/database/entities/ancillary-service.entity';
import { createTestApp } from './helpers/app.helper';
import { loginAs } from './helpers/login.helper';

describe('Travel costs (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  beforeEach(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    await dataSource.getRepository(TravelExtraSetting).clear();
  });

  afterEach(async () => {
    await dataSource
      .getRepository(AncillaryService)
      .update({ key: 'baggage' }, { priceIrr: 2_000_000n, enabled: true });
    await app.close();
  });

  it('starts empty and only allows the commercial manager to manage costs', async () => {
    await request(app.getHttpServer())
      .get('/public/travel-costs')
      .expect(200)
      .expect(({ body }) => expect(body.data).toEqual([]));

    const finance = await loginAs(app, 'finance');
    await request(app.getHttpServer())
      .get('/travel-costs')
      .set('Authorization', `Bearer ${finance.accessToken}`)
      .expect(403);

    const commercial = await loginAs(app, 'comm');
    await request(app.getHttpServer())
      .get('/travel-costs')
      .set('Authorization', `Bearer ${commercial.accessToken}`)
      .expect(200)
      .expect(({ body }) => expect(body.data).toEqual([]));
  });

  it('publishes only active manager-defined costs and supports updates/removal', async () => {
    const commercial = await loginAs(app, 'comm');
    const auth = { Authorization: `Bearer ${commercial.accessToken}` };
    const createRes = await request(app.getHttpServer())
      .post('/travel-costs')
      .set(auth)
      .send({
        code: 'EXTRA_BAGGAGE',
        titleFa: 'بار اضافه',
        billingUnit: 'PER_KG',
        priceIrr: '4500000',
        active: true,
        purchaseEnabled: true,
      })
      .expect(201);

    const id = createRes.body.data.id as string;
    await request(app.getHttpServer())
      .patch('/ancillary-services/baggage/price')
      .set(auth)
      .send({ priceIrr: '4500000' })
      .expect(200);
    await request(app.getHttpServer())
      .get('/public/travel-costs')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toHaveLength(1);
        expect(body.data[0]).toMatchObject({
          id,
          code: 'EXTRA_BAGGAGE',
          priceIrr: '4500000',
        });
      });

    await request(app.getHttpServer())
      .patch(`/travel-costs/${id}`)
      .set(auth)
      .send({ active: false, priceIrr: '5000000' })
      .expect(200);

    await request(app.getHttpServer())
      .get('/public/travel-costs')
      .expect(200)
      .expect(({ body }) => expect(body.data).toEqual([]));

    await request(app.getHttpServer())
      .delete(`/travel-costs/${id}`)
      .set(auth)
      .expect(200);
    expect(await dataSource.getRepository(TravelExtraSetting).count()).toBe(0);
  });

  it('supports pet, wheelchair and multiple custom commercial services', async () => {
    const commercial = await loginAs(app, 'comm');
    const auth = { Authorization: `Bearer ${commercial.accessToken}` };
    const services = [
      { code: 'PET', titleFa: 'حیوان خانگی', billingUnit: 'PER_BOOKING' },
      {
        code: 'WHEELCHAIR',
        titleFa: 'افزودن ویلچر',
        billingUnit: 'PER_PASSENGER',
      },
      {
        code: 'CUSTOM_LOUNGE-2026',
        titleFa: 'لانژ اختصاصی',
        billingUnit: 'PER_PASSENGER',
      },
      {
        code: 'CUSTOM_FASTTRACK-2026',
        titleFa: 'فست ترک',
        billingUnit: 'PER_BOOKING',
      },
    ];

    for (const service of services) {
      await request(app.getHttpServer())
        .post('/travel-costs')
        .set(auth)
        .send({
          ...service,
          priceIrr: '500000',
          active: true,
          purchaseEnabled: true,
        })
        .expect(201);
    }

    await request(app.getHttpServer())
      .get('/public/travel-costs')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.map((item: { code: string }) => item.code)).toEqual(
          expect.arrayContaining(services.map(({ code }) => code)),
        );
      });

    await request(app.getHttpServer())
      .post('/travel-costs')
      .set(auth)
      .send({
        code: 'CUSTOM_bad code',
        titleFa: 'نامعتبر',
        billingUnit: 'PER_BOOKING',
        priceIrr: '500000',
      })
      .expect(400);
  });
});
