import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { dataSourceOptions } from '../src/database/data-source.options';
import { FlightInstance } from '../src/database/entities/flight-instance.entity';
import { SavedFlight } from '../src/database/entities/saved-flight.entity';
import { loginAs, loginAsCustomer } from './helpers/login.helper';
import { createTestApp } from './helpers/app.helper';
import { resetCustomerPhones } from './helpers/customer-state.helper';

describe('Saved flights (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let flightInstanceId: string;

  beforeAll(async () => {
    const setupDataSource = new DataSource(dataSourceOptions);
    await setupDataSource.initialize();
    const instance = await setupDataSource
      .getRepository(FlightInstance)
      .createQueryBuilder('fi')
      .where('fi.status = :status', { status: 'SCHEDULED' })
      .andWhere('fi.departureAt > :now', { now: new Date() })
      .orderBy('fi.departureAt', 'ASC')
      .getOne();
    if (!instance) throw new Error('No future SCHEDULED flight in seed');
    flightInstanceId = instance.id;
    await setupDataSource.destroy();
  });

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

  it('GET/POST/DELETE /my/saved-flights — USER only; list includes flight detail + live price', async () => {
    const { accessToken, userId } = await loginAsCustomer(app, '09180000001');

    const save = await request(app.getHttpServer())
      .post('/my/saved-flights')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ flightInstanceId, cabin: 'ECONOMY' });
    expect(save.status).toBe(201);

    const list = await request(app.getHttpServer())
      .get('/my/saved-flights')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(list.status).toBe(200);
    const row = list.body.data.find(
      (r: { flightInstanceId: string }) =>
        r.flightInstanceId === flightInstanceId,
    );
    expect(row).toBeDefined();
    expect(row.flightNo).toBeTruthy();
    expect(row.originCode).toBeTruthy();
    expect(Number(row.priceIrr)).toBeGreaterThan(0);

    const dup = await request(app.getHttpServer())
      .post('/my/saved-flights')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ flightInstanceId, cabin: 'ECONOMY' });
    expect(dup.status).toBe(409);

    const del = await request(app.getHttpServer())
      .delete(`/my/saved-flights/${save.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(del.status).toBe(200);

    const after = await dataSource
      .getRepository(SavedFlight)
      .findBy({ userId: userId! });
    expect(after.every((r) => r.id !== save.body.data.id)).toBe(true);
  });

  it('403 for staff; 404 when removing another user saved row', async () => {
    const customer = await loginAsCustomer(app, '09180000002');
    const save = await request(app.getHttpServer())
      .post('/my/saved-flights')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ flightInstanceId, cabin: 'BUSINESS' });
    expect(save.status).toBe(201);

    const ceo = await loginAs(app, 'ceo');
    const forbidden = await request(app.getHttpServer())
      .get('/my/saved-flights')
      .set('Authorization', `Bearer ${ceo.accessToken}`);
    expect(forbidden.status).toBe(403);

    const other = await loginAsCustomer(app, '09180000004');
    const notFound = await request(app.getHttpServer())
      .delete(`/my/saved-flights/${save.body.data.id}`)
      .set('Authorization', `Bearer ${other.accessToken}`);
    expect(notFound.status).toBe(404);
  });
});
