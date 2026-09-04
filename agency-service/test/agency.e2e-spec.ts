import { randomBytes, randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { databaseOptions } from '../src/config';
import { verifyReader } from '../src/reader-verification';
import type {
  InvoicePage,
  InvoiceView,
  ProfileView,
} from '../src/agency/agency.dto';

describe('Agency read boundary (real restricted PostgreSQL login)', () => {
  const owner = randomUUID(),
    other = randomUUID(),
    empty = randomUUID();
  const ids = Array.from({ length: 12 }, () => randomUUID());
  const foreignInvoice = randomUUID();
  const role = 'agency_reader_test_' + randomBytes(8).toString('hex');
  const quotedRole = '"' + role + '"';
  const password = randomBytes(32).toString('hex');
  const token = 'test-agency-internal-token-at-least-32-characters';
  const headers = { 'X-Internal-Token': token, 'X-Agency-Id': owner };
  const path = '/internal/v1/agencies/' + owner;
  const grants = [
    'SELECT ("userId",city,tier,"joinedAt","suspendedAt") ON agency.agency_profiles',
    'SELECT (id,"agencyId","invoiceNo","amountIrr",status,"issuedAt","dueAt","paidAt") ON agency.agency_invoices',
  ];
  let writer: DataSource, reader: DataSource, app: INestApplication<App>;
  let roleCreated = false;
  let before: unknown;

  async function snapshot() {
    return {
      profiles: await writer.query<unknown[]>(
        'SELECT * FROM agency.agency_profiles WHERE "userId" IN ($1,$2,$3) ORDER BY "userId"',
        [owner, other, empty],
      ),
      invoices: await writer.query<unknown[]>(
        'SELECT * FROM agency.agency_invoices WHERE "agencyId" IN ($1,$2,$3) ORDER BY id',
        [owner, other, empty],
      ),
    };
  }
  beforeAll(async () => {
    const url = new URL(process.env.AGENCY_DATABASE_URL ?? '');
    if (!url.pathname.endsWith('_test'))
      throw new Error('An isolated _test database is required');
    writer = await new DataSource({
      type: 'postgres',
      url: url.toString(),
      entities: [],
      synchronize: false,
      logging: false,
    }).initialize();
    await writer.transaction(async (tx) => {
      for (const id of [owner, other, empty]) {
        await tx.query(
          'INSERT INTO identity.users (id,role,"fullName","updatedAt") VALUES ($1,$2,$3,NOW())',
          [id, 'AGENCY', 'Agency boundary fixture'],
        );
        await tx.query(
          'INSERT INTO agency.agency_profiles ("userId","licenseNo","managerName",phone,email,city,address,"joinedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
          [
            id,
            'private-license',
            'private-manager',
            'private-phone',
            'private@agency.invalid',
            'تهران',
            'private-address',
            '2026-09-04T12:34:56.789Z',
          ],
        );
      }
      for (const [index, id] of [...ids, foreignInvoice].entries()) {
        const agencyId = id === foreignInvoice ? other : owner;
        await tx.query(
          'INSERT INTO agency.agency_invoices (id,"agencyId","invoiceNo","issuedById","issuedAt","dueAt","amountIrr","descriptionFa",status,"paidAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
          [
            id,
            agencyId,
            'TEST-' + id,
            owner,
            '2026-09-04T12:34:56.789Z',
            '2026-10-04T12:34:56.789Z',
            index === 0
              ? '9007199254740993'
              : (1000n + BigInt(index)).toString(),
            'private-description',
            agencyId === other ? 'PAID' : 'UNPAID',
            agencyId === other ? '2026-09-05T10:00:00.123Z' : null,
          ],
        );
      }
    });
    before = await snapshot();
    try {
      await writer.query(
        'CREATE ROLE ' +
          quotedRole +
          " LOGIN PASSWORD '" +
          password +
          "' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS",
      );
      roleCreated = true;
    } catch {
      throw new Error('Unable to provision ephemeral agency reader');
    }
    await writer.query('GRANT USAGE ON SCHEMA agency TO ' + quotedRole);
    for (const grant of grants)
      await writer.query('GRANT ' + grant + ' TO ' + quotedRole);
    await writer.query(
      'ALTER ROLE ' + quotedRole + ' SET default_transaction_read_only=on',
    );
    url.username = role;
    url.password = password;
    reader = await new DataSource(databaseOptions(url.toString())).initialize();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DataSource)
      .useValue(reader)
      .compile();
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
  afterEach(async () => {
    expect(await snapshot()).toEqual(before);
  });
  afterAll(async () => {
    try {
      if (app) await app.close();
    } finally {
      if (reader?.isInitialized) await reader.destroy();
      if (writer?.isInitialized) {
        try {
          await writer.transaction(async (tx) => {
            await tx.query(
              'DELETE FROM agency.agency_invoices WHERE "agencyId" IN ($1,$2,$3)',
              [owner, other, empty],
            );
            await tx.query(
              'DELETE FROM agency.agency_profiles WHERE "userId" IN ($1,$2,$3)',
              [owner, other, empty],
            );
            await tx.query(
              'DELETE FROM identity.users WHERE id IN ($1,$2,$3)',
              [owner, other, empty],
            );
          });
          if (roleCreated) {
            for (const grant of grants)
              await writer.query('REVOKE ' + grant + ' FROM ' + quotedRole);
            await writer.query(
              'REVOKE USAGE ON SCHEMA agency FROM ' + quotedRole,
            );
            await writer.query('DROP ROLE ' + quotedRole);
          }
        } finally {
          await writer.destroy();
        }
      }
    }
  });

  it('passes the catalog gate with real minimized HTTP fixture grants', async () => {
    expect(await verifyReader(reader)).toMatchObject({ status: 'PASS' });
  });

  it('requires service identity on every data route', async () => {
    for (const suffix of ['/profile', '/invoices', '/invoices/' + ids[0]]) {
      for (const h of [{}, { ...headers, 'X-Internal-Token': 'wrong' }]) {
        const res = await request(app.getHttpServer())
          .get(path + suffix)
          .set(h)
          .expect(401);
        expect(res.body as unknown).toMatchObject({
          success: false,
          error: { code: 'UNAUTHORIZED' },
        });
      }
    }
  });
  it('rejects missing or mismatched tenant assertions on every route', async () => {
    for (const suffix of ['/profile', '/invoices', '/invoices/' + ids[0]]) {
      await request(app.getHttpServer())
        .get(path + suffix)
        .set({ 'X-Internal-Token': token })
        .expect(403);
      await request(app.getHttpServer())
        .get(path + suffix)
        .set({ ...headers, 'X-Agency-Id': other })
        .expect(403);
    }
  });
  it('validates UUIDs, page bounds and unknown query fields', async () => {
    await request(app.getHttpServer())
      .get('/internal/v1/agencies/not-a-uuid/profile')
      .set(headers)
      .expect(400);
    await request(app.getHttpServer())
      .get(path + '/invoices/not-a-uuid')
      .set(headers)
      .expect(400);
    for (const query of [
      'page=0',
      'page=1001',
      'page=1.5',
      'page=nan',
      'page=1&page=2',
      'agencyId=' + other,
    ]) {
      await request(app.getHttpServer())
        .get(path + '/invoices?' + query)
        .set(headers)
        .expect(400);
    }
  });
  it('returns only the owned minimized profile with UTC and request correlation', async () => {
    const res = await request(app.getHttpServer())
      .get(path + '/profile')
      .set({ ...headers, 'X-Request-Id': 'agency-contract-test' })
      .expect(200);
    expect(res.body as { data: ProfileView }).toEqual({
      success: true,
      data: {
        agencyId: owner,
        city: 'تهران',
        tier: 'NORMAL',
        joinedAt: '2026-09-04T12:34:56.789Z',
        suspendedAt: null,
      },
    });
    expect(res.headers['x-request-id']).toBe('agency-contract-test');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.text).not.toContain('private');
  });
  it('paginates ten owned invoices deterministically with tenant-scoped totals', async () => {
    const first = await request(app.getHttpServer())
      .get(path + '/invoices')
      .set(headers)
      .expect(200);
    const second = await request(app.getHttpServer())
      .get(path + '/invoices?page=2')
      .set(headers)
      .expect(200);
    const a = (first.body as { data: InvoicePage }).data,
      b = (second.body as { data: InvoicePage }).data;
    expect(a).toMatchObject({ total: '12', page: 1, pageSize: 10 });
    expect(a.items).toHaveLength(10);
    expect(b.items).toHaveLength(2);
    expect([...a.items, ...b.items].map((x) => x.id)).toEqual(
      [...ids].sort().reverse(),
    );
    expect(first.text + second.text).not.toContain(foreignInvoice);
    expect(first.text + second.text).not.toContain('private');
  });
  it('preserves exact IRR beyond JS safe integer and never returns issuer/booking/free text', async () => {
    const res = await request(app.getHttpServer())
      .get(path + '/invoices/' + ids[0])
      .set(headers)
      .expect(200);
    const view = (res.body as { data: InvoiceView }).data;
    expect(view).toEqual({
      id: ids[0],
      invoiceNo: 'TEST-' + ids[0],
      amountIrr: '9007199254740993',
      status: 'UNPAID',
      issuedAt: '2026-09-04T12:34:56.789Z',
      dueAt: '2026-10-04T12:34:56.789Z',
      paidAt: null,
    });
    expect(res.headers['cache-control']).toBe('no-store');
  });
  it('uses the same 404 for foreign and nonexistent invoices', async () => {
    const foreign = await request(app.getHttpServer())
      .get(path + '/invoices/' + foreignInvoice)
      .set(headers)
      .expect(404);
    const missing = await request(app.getHttpServer())
      .get(path + '/invoices/' + randomUUID())
      .set(headers)
      .expect(404);
    expect(foreign.body as unknown).toEqual(missing.body as unknown);
  });
  it('reads the second tenant only with its own trusted assertion', async () => {
    const res = await request(app.getHttpServer())
      .get('/internal/v1/agencies/' + other + '/invoices/' + foreignInvoice)
      .set({ ...headers, 'X-Agency-Id': other })
      .expect(200);
    expect(res.body as unknown).toMatchObject({
      data: {
        id: foreignInvoice,
        status: 'PAID',
        paidAt: '2026-09-05T10:00:00.123Z',
      },
    });
  });
  it('returns honest empty pages but rejects absent profiles', async () => {
    const res = await request(app.getHttpServer())
      .get('/internal/v1/agencies/' + empty + '/invoices')
      .set({ ...headers, 'X-Agency-Id': empty })
      .expect(200);
    expect(res.body as unknown).toEqual({
      success: true,
      data: { items: [], total: '0', page: 1, pageSize: 10 },
    });
    const absent = randomUUID();
    for (const suffix of ['/profile', '/invoices', '/invoices/' + ids[0]]) {
      await request(app.getHttpServer())
        .get('/internal/v1/agencies/' + absent + suffix)
        .set({ ...headers, 'X-Agency-Id': absent })
        .expect(404);
    }
  });
  it('reports suspension without changing existing read behavior or Partner API status', async () => {
    await writer.query(
      'UPDATE agency.agency_profiles SET "suspendedAt"=$1 WHERE "userId"=$2',
      ['2026-09-04T15:00:00.000Z', owner],
    );
    try {
      const res = await request(app.getHttpServer())
        .get(path + '/profile')
        .set(headers)
        .expect(200);
      expect(res.body as unknown).toMatchObject({
        data: { suspendedAt: '2026-09-04T15:00:00.000Z' },
      });
      await request(app.getHttpServer())
        .get(path + '/invoices')
        .set(headers)
        .expect(200);
    } finally {
      await writer.query(
        'UPDATE agency.agency_profiles SET "suspendedAt"=NULL WHERE "userId"=$1',
        [owner],
      );
    }
  });
  it('has no write routes', async () => {
    await request(app.getHttpServer())
      .post(path + '/invoices')
      .set(headers)
      .send({ amountIrr: '1' })
      .expect(404);
    await request(app.getHttpServer())
      .post(path + '/invoices/' + ids[0] + '/pay')
      .set(headers)
      .expect(404);
  });
  it('denies writes and sensitive/cross-domain reads even with session read-only disabled', async () => {
    const runner = reader.createQueryRunner();
    try {
      await runner.connect();
      await runner.query('SET default_transaction_read_only=off');
      for (const sql of [
        'UPDATE agency.agency_invoices SET status=status WHERE false',
        'DELETE FROM agency.agency_invoices WHERE false',
        'SELECT "managerName" FROM agency.agency_profiles LIMIT 0',
        'SELECT "descriptionFa" FROM agency.agency_invoices LIMIT 0',
        'SELECT id FROM identity.users LIMIT 0',
        'SELECT * FROM payments.ledger_entries LIMIT 0',
      ]) {
        await expect(runner.query(sql)).rejects.toMatchObject({
          driverError: { code: '42501' },
        });
      }
    } finally {
      await runner.query('SET default_transaction_read_only=on');
      await runner.release();
    }
  });
  it('serves safe health and readiness with the real reader', async () => {
    for (const route of ['/health', '/ready']) {
      const res = await request(app.getHttpServer()).get(route).expect(200);
      expect(res.body as unknown).toMatchObject({
        status: 'ok',
        service: 'blujet-agency',
      });
      expect(res.headers['x-request-id']).toEqual(expect.any(String));
      expect(res.text).not.toContain(password);
    }
  });
  it('fails readiness and requests safely when a required column grant is missing', async () => {
    await writer.query(
      'REVOKE SELECT ("amountIrr") ON agency.agency_invoices FROM ' +
        quotedRole,
    );
    try {
      const ready = await request(app.getHttpServer())
        .get('/ready')
        .expect(503);
      const invoices = await request(app.getHttpServer())
        .get(path + '/invoices')
        .set(headers)
        .expect(500);
      expect(ready.body as unknown).toMatchObject({
        error: { code: 'SERVICE_UNAVAILABLE' },
      });
      expect(invoices.body as unknown).toMatchObject({
        error: { code: 'INTERNAL_ERROR' },
      });
      for (const secret of [
        password,
        role,
        'SELECT',
        'agency_invoices',
        'amountIrr',
      ])
        expect(ready.text + invoices.text).not.toContain(secret);
    } finally {
      await writer.query(
        'GRANT SELECT ("amountIrr") ON agency.agency_invoices TO ' + quotedRole,
      );
    }
  });
  it('documents only internal read operations with typed successful responses', () => {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Agency internal API')
        .setVersion('0.1.0')
        .build(),
    );
    expect(Object.keys(doc.paths)).toHaveLength(5);
    expect(
      doc.paths['/internal/v1/agencies/{agencyId}/invoices']?.get?.responses[
        '200'
      ],
    ).toBeDefined();
    expect(doc.components?.schemas?.InvoiceView).toBeDefined();
    expect(
      Object.values(doc.paths).every(
        (p) => !p?.post && !p?.patch && !p?.delete,
      ),
    ).toBe(true);
  });
});
