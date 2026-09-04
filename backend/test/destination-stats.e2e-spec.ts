import request from 'supertest';
import { createTestApp } from './helpers/app.helper';

jest.setTimeout(60_000);

describe('Destination stats (e2e)', () => {
  let app: Awaited<ReturnType<typeof createTestApp>> | undefined;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('returns non-hardcoded counts (zeros allowed)', async () => {
    if (!app) throw new Error('Test application was not initialized.');
    const res = await request(app.getHttpServer()).get(
      '/site-content/destination-stats',
    );
    expect(res.status).toBe(200);
    const d = res.body.data as {
      activeDestinations: number;
      domesticDestinations: number;
      internationalDestinations: number;
    };
    expect(typeof d.activeDestinations).toBe('number');
    expect(d.activeDestinations).toBe(
      d.domesticDestinations + d.internationalDestinations,
    );
    expect(d.activeDestinations).not.toBe(12);
    expect(d.activeDestinations).toBeLessThan(200);
    expect(d.domesticDestinations).toBeGreaterThanOrEqual(0);
    expect(d.internationalDestinations).toBeGreaterThanOrEqual(0);
  });
});
