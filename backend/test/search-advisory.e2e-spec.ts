import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers/app.helper';

describe('Search advisory & price calendar (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /search/advisory returns advisory payload for a seeded route', async () => {
    const res = await request(app.getHttpServer())
      .get('/search/advisory')
      .query({ origin: 'THR', dest: 'MHD', date: '2026-08-15' })
      .expect(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.data.available).toBe('boolean');
  });

  it('GET /search/price-calendar returns 7 days', async () => {
    const res = await request(app.getHttpServer())
      .get('/search/price-calendar')
      .query({ origin: 'THR', dest: 'MHD', date: '2026-08-15' })
      .expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(7);
  });

  it('GET /settings/site-content?locale=en returns English hero title', async () => {
    const res = await request(app.getHttpServer())
      .get('/settings/site-content')
      .query({ locale: 'en' })
      .expect(200);
    expect(res.body.data.homeHeroTitle).toContain('Fly');
  });

  it('POST /auth/agency/password-reset/request accepts 09-format phone', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/agency/password-reset/request')
      .send({ phone: '09120000002' })
      .expect(200);
    expect(res.body.data.challengeId).toBeTruthy();
  });
});
