import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { App } from 'supertest/types';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

describe('Loyalty read boundary (real PostgreSQL)', () => {
  let app: INestApplication<App>;
  let writer: DataSource;
  const owner = randomUUID();
  const other = randomUUID();
  const memberId = randomUUID();
  const otherMemberId = randomUUID();
  const lockId = randomUUID();
  const at = '2026-09-04T12:00:00.000Z';
  const token = 'test-loyalty-internal-token-at-least-32-characters';
  const headers = { 'X-Internal-Token': token, 'X-Loyalty-User-Id': owner };
  const path = '/internal/v1/loyalty';

  beforeAll(async () => {
    writer = await new DataSource({
      type: 'postgres',
      url: process.env.LOYALTY_DATABASE_URL,
      entities: [],
      synchronize: false,
    }).initialize();
    await writer.transaction(async (tx) => {
      for (const id of [owner, other]) {
        await tx.query(
          'INSERT INTO identity.users (id, role, "fullName", "updatedAt") VALUES ($1, $2, $3, NOW())',
          [id, 'USER', 'Loyalty test'],
        );
      }
      for (const [id, userId] of [
        [memberId, owner],
        [otherMemberId, other],
      ]) {
        await tx.query(
          'INSERT INTO loyalty.club_members (id, "userId", "fullName", email, "nationalIdEnc", "nationalIdHash", points) VALUES ($1, $2, $3, $4, $5, $6, 999)',
          [
            id,
            userId,
            'Private name',
            'private@example.invalid',
            'secret-national-id',
            'secret-hash',
          ],
        );
      }
      await tx.query(
        'INSERT INTO loyalty.club_points_entries (id, "clubMemberId", type, "signedPoints") VALUES ($1,$2,$3,100),($4,$2,$3,-30)',
        [randomUUID(), memberId, 'EARN', randomUUID()],
      );
      const flights = await tx.query<Array<{ id: string }>>(
        'SELECT id FROM inventory.flight_instances LIMIT 1',
      );
      if (!flights[0])
        throw new Error('Run backend migrations and seed before E2E');
      for (const [id, userId, expiry, status, createdAt] of [
        [lockId, owner, '2026-09-05T12:00:00.000Z', 'ACTIVE', at],
        [randomUUID(), owner, at, 'ACTIVE', '2026-09-04T11:00:00.000Z'],
        [
          randomUUID(),
          owner,
          '2026-09-05T12:00:00.000Z',
          'EXPIRED',
          '2026-09-04T13:00:00.000Z',
        ],
        [randomUUID(), other, '2026-09-05T12:00:00.000Z', 'ACTIVE', at],
      ]) {
        await tx.query(
          'INSERT INTO loyalty.price_locks (id, "userId", "flightInstanceId", cabin, "lockedPriceIrr", "feeIrr", status, "expiresAt", "createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
          [
            id,
            userId,
            flights[0].id,
            'ECONOMY',
            '9007199254740993',
            '300000',
            status,
            expiry,
            createdAt,
          ],
        );
      }
    });
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication<INestApplication<App>>({
      logger: false,
    });
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
    if (writer?.isInitialized) {
      await writer.transaction(async (tx) => {
        await tx.query(
          'DELETE FROM loyalty.price_locks WHERE "userId" IN ($1,$2)',
          [owner, other],
        );
        await tx.query(
          'DELETE FROM loyalty.club_points_entries WHERE "clubMemberId" IN ($1,$2)',
          [memberId, otherMemberId],
        );
        await tx.query('DELETE FROM loyalty.club_members WHERE id IN ($1,$2)', [
          memberId,
          otherMemberId,
        ]);
        await tx.query('DELETE FROM identity.users WHERE id IN ($1,$2)', [
          owner,
          other,
        ]);
      });
      await writer.destroy();
    }
  });

  it('requires service identity and a matching trusted owner assertion', async () => {
    await request(app.getHttpServer())
      .get(`${path}/members/${owner}`)
      .expect(401);
    await request(app.getHttpServer())
      .get(`${path}/members/${owner}`)
      .set({ ...headers, 'X-Internal-Token': 'wrong' })
      .expect(401);
    await request(app.getHttpServer())
      .get(`${path}/members/${owner}`)
      .set('X-Internal-Token', token)
      .expect(403);
    await request(app.getHttpServer())
      .get(`${path}/price-locks/${other}`)
      .set(headers)
      .expect(403);
  });

  it('validates UUIDs, timestamps and extra query fields', async () => {
    await request(app.getHttpServer())
      .get(`${path}/members/not-a-uuid`)
      .set(headers)
      .expect(400);
    for (const query of [
      'at=invalid',
      'at=2026-02-30T12:00:00Z',
      'at=2026-09-04T12:00:00',
      'unexpected=true',
    ]) {
      await request(app.getHttpServer())
        .get(`${path}/price-locks/${owner}?${query}`)
        .set(headers)
        .expect(400);
    }
  });

  it('projects ledger points, not the stale membership cache, and never PII', async () => {
    const response = await request(app.getHttpServer())
      .get(`${path}/members/${owner}`)
      .set({ ...headers, 'X-Request-Id': 'loyalty-e2e' })
      .expect(200);
    expect(response.body as unknown).toEqual({
      success: true,
      data: {
        id: memberId,
        userId: owner,
        level: 'SILVER',
        cardStatus: 'NONE',
        points: '70',
      },
    });
    expect(response.headers['x-request-id'] as unknown).toBe('loyalty-e2e');
    expect(response.headers['cache-control'] as unknown).toBe('no-store');
  });

  it('returns zero for an empty ledger and 404 for missing/deactivated membership', async () => {
    const response = await request(app.getHttpServer())
      .get(`${path}/members/${other}`)
      .set({ ...headers, 'X-Loyalty-User-Id': other })
      .expect(200);
    expect(response.body as unknown).toMatchObject({ data: { points: '0' } });
    await writer.query(
      'UPDATE loyalty.club_members SET "deactivatedAt" = NOW() WHERE id=$1',
      [otherMemberId],
    );
    await request(app.getHttpServer())
      .get(`${path}/members/${other}`)
      .set({ ...headers, 'X-Loyalty-User-Id': other })
      .expect(404);
    const missing = randomUUID();
    await request(app.getHttpServer())
      .get(`${path}/members/${missing}`)
      .set({ ...headers, 'X-Loyalty-User-Id': missing })
      .expect(404);
  });

  it('filters owner/status/strict expiry and preserves bigint IRR and UTC exactly', async () => {
    const response = await request(app.getHttpServer())
      .get(`${path}/price-locks/${owner}`)
      .query({ at })
      .set(headers)
      .expect(200);
    expect(response.body as unknown).toEqual({
      success: true,
      data: [
        {
          id: lockId,
          flightInstanceId: expect.any(String) as unknown,
          cabin: 'ECONOMY',
          lockedPriceIrr: '9007199254740993',
          feeIrr: '300000',
          status: 'ACTIVE',
          expiresAt: '2026-09-05T12:00:00.000Z',
          createdAt: at,
          bookingId: null,
        },
      ],
    });
    await request(app.getHttpServer())
      .get(`${path}/price-locks/${owner}`)
      .query({ at: '2027-01-01T00:00:00Z' })
      .set(headers)
      .expect(200, { success: true, data: [] });
  });

  it('returns the owner-bound all-status history newest first without inventory data', async () => {
    const response = await request(app.getHttpServer())
      .get(`${path}/price-lock-history/${owner}`)
      .set(headers)
      .expect(200);
    expect(response.body as unknown).toEqual({
      success: true,
      data: {
        userId: owner,
        locks: [
          expect.objectContaining({
            status: 'EXPIRED',
            createdAt: '2026-09-04T13:00:00.000Z',
            lockedPriceIrr: '9007199254740993',
          }) as unknown,
          expect.objectContaining({
            id: lockId,
            status: 'ACTIVE',
            createdAt: at,
          }) as unknown,
          expect.objectContaining({
            status: 'ACTIVE',
            createdAt: '2026-09-04T11:00:00.000Z',
          }) as unknown,
        ],
      },
    });
    expect(response.text).not.toContain('flightNo');
    expect(response.text).not.toContain('originCode');
    expect(response.text).not.toContain('destCode');

    await request(app.getHttpServer())
      .get(`${path}/price-lock-history/${other}`)
      .set(headers)
      .expect(403);
    const missing = randomUUID();
    await request(app.getHttpServer())
      .get(`${path}/price-lock-history/${missing}`)
      .set({ ...headers, 'X-Loyalty-User-Id': missing })
      .expect(200, { success: true, data: { userId: missing, locks: [] } });
  });

  it('rejects writes at database and HTTP boundaries; reads leave cache unchanged', async () => {
    const db = app.get(DataSource);
    await expect(
      db.query('UPDATE loyalty.club_members SET points=points WHERE id=$1', [
        memberId,
      ]),
    ).rejects.toMatchObject({ driverError: { code: '25006' } });
    expect(
      await writer.query<unknown[]>(
        'SELECT points FROM loyalty.club_members WHERE id=$1',
        [memberId],
      ),
    ).toEqual([{ points: 999 }]);
    await request(app.getHttpServer())
      .post(`${path}/members/${owner}`)
      .set(headers)
      .send({ points: 123 })
      .expect(404);
  });

  it('reports liveness and schema readiness without credentials', async () => {
    await request(app.getHttpServer()).get('/health').expect(200);
    const response = await request(app.getHttpServer())
      .get('/ready')
      .expect(200);
    expect(response.body as unknown).toEqual({
      status: 'ok',
      service: 'blujet-loyalty',
      version: '0.1.0',
      commit: process.env.GIT_COMMIT_SHA ?? 'unknown',
    });
  });

  it('returns sanitized 503 when readiness loses database access', async () => {
    const fault = jest
      .spyOn(app.get(DataSource), 'transaction')
      .mockRejectedValueOnce(new Error('private SQL and credentials'));
    try {
      const response = await request(app.getHttpServer())
        .get('/ready')
        .expect(503);
      expect(response.body as unknown).toMatchObject({
        success: false,
        error: { code: 'SERVICE_UNAVAILABLE' },
      });
      expect(response.text).not.toContain('private SQL');
    } finally {
      fault.mockRestore();
    }
    await request(app.getHttpServer()).get('/ready').expect(200);
  });

  it('returns exactly 1000 rows but rejects overflow instead of silently truncating', async () => {
    const insert = async (count: number) => {
      await writer.query(
        'INSERT INTO loyalty.price_locks (id, "userId", "flightInstanceId", cabin, "lockedPriceIrr", "feeIrr", status, "expiresAt", "createdAt") SELECT md5($2 || series::text)::uuid::text, "userId", "flightInstanceId", cabin, "lockedPriceIrr", "feeIrr", status, "expiresAt", "createdAt" FROM loyalty.price_locks CROSS JOIN generate_series(1, $3::int) AS series WHERE id=$1',
        [lockId, randomUUID(), count],
      );
    };
    await insert(999);
    const response = await request(app.getHttpServer())
      .get(`${path}/price-locks/${owner}`)
      .query({ at })
      .set(headers)
      .expect(200);
    const body: unknown = response.body;
    expect(body).toMatchObject({
      success: true,
      data: expect.any(Array) as unknown,
    });
    if (
      typeof body !== 'object' ||
      body === null ||
      !('data' in body) ||
      !Array.isArray(body.data)
    )
      throw new Error('Invalid envelope');
    expect(body.data).toHaveLength(1000);
    await insert(1);
    const overflow = await request(app.getHttpServer())
      .get(`${path}/price-locks/${owner}`)
      .query({ at })
      .set(headers)
      .expect(409);
    expect(overflow.body as unknown).toMatchObject({
      success: false,
      error: { code: 'CONFLICT' },
    });
    await request(app.getHttpServer())
      .get(`${path}/price-lock-history/${owner}`)
      .set(headers)
      .expect(409);
  });
});
