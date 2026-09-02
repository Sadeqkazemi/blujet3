/* eslint-disable @typescript-eslint/no-unsafe-assignment -- supertest response payloads are narrowed below. */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

interface HealthBody {
  status: string;
  service: string;
  key: { alg: string; use: string };
  privateKey?: unknown;
}

interface JwksBody {
  keys: Array<Record<string, unknown>>;
}

describe('Identity key-discovery contract (e2e)', () => {
  let app: INestApplication;
  const token = () => process.env.IDENTITY_INTERNAL_TOKEN ?? '';
  const server = () => app.getHttpServer() as unknown as App;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('exposes liveness without secrets and keeps JWKS internal-only', async () => {
    const live = await request(server()).get('/health/live').expect(200, {
      status: 'ok',
      service: 'blujet-identity',
    });
    expect(live.headers['x-request-id']).toMatch(/^[A-Za-z0-9._-]{1,128}$/);
    const health = await request(server()).get('/health').expect(200);
    const healthBody = health.body as unknown as HealthBody;
    expect(healthBody).toEqual(
      expect.objectContaining({
        status: 'ok',
        service: 'blujet-identity',
        key: expect.objectContaining({ alg: 'RS256', use: 'sig' }),
      }),
    );
    expect(healthBody).not.toHaveProperty('privateKey');
    await request(server()).get('/internal/v1/identity/jwks.json').expect(401);
  });

  it('returns only the public RS256 key with the internal service token', async () => {
    const response = await request(server())
      .get('/internal/v1/identity/jwks.json')
      .set('x-internal-token', token())
      .expect(200);
    const body = response.body as unknown as JwksBody;
    expect(body.keys).toHaveLength(1);
    expect(body.keys[0]).toEqual(
      expect.objectContaining({
        kty: 'RSA',
        alg: 'RS256',
        use: 'sig',
        kid: 'identity-e2e-key',
      }),
    );
    expect(body.keys[0]).not.toHaveProperty('d');
    expect(body.keys[0]).not.toHaveProperty('p');
  });
});
