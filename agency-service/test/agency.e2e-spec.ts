import { randomBytes, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
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
  let readerUrl: string;

  async function shadow(
    agencyId: string,
    page = '1',
    overrides: NodeJS.ProcessEnv = {},
    invoiceId?: string,
  ) {
    const serviceUrl = await app.getUrl();
    return new Promise<{ code: number; stdout: string; stderr: string }>(
      (resolveResult, reject) => {
        execFile(
          process.execPath,
          [
            'dist/database/report-agency-shadow.js',
            agencyId,
            page,
            ...(invoiceId === undefined ? [] : [invoiceId]),
          ],
          {
            cwd: resolve(__dirname, '../../backend'),
            env: {
              ...process.env,
              DATABASE_URL: readerUrl,
              AGENCY_SHADOW_ENABLED: 'true',
              AGENCY_SERVICE_URL: serviceUrl,
              AGENCY_INTERNAL_TOKEN: token,
              ...overrides,
            },
            timeout: 15000,
            windowsHide: true,
          },
          (error, stdout, stderr) => {
            if (error && typeof error.code !== 'number')
              return reject(new Error('Shadow CLI process unavailable'));
            resolveResult({
              code: typeof error?.code === 'number' ? error.code : 0,
              stdout,
              stderr,
            });
          },
        );
      },
    );
  }

  function safeReport(
    result: { code: number; stdout: string; stderr: string },
    status: string,
    code = 0,
  ) {
    expect(result.code).toBe(code);
    expect(result.stderr).toBe('');
    expect(result.stdout.trim().split('\n')).toHaveLength(1);
    const report: unknown = JSON.parse(result.stdout);
    expect(report).toMatchObject({ status });
    for (const secret of [
      password,
      token,
      owner,
      other,
      readerUrl,
      'private-description',
      '9007199254740993',
    ])
      expect(result.stdout).not.toContain(secret);
  }

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
    readerUrl = url.toString();
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
    await app.listen(0, '127.0.0.1');
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

  it('serves the compatible portal profile only with explicit opt-in grants', async () => {
    const extra =
      'SELECT ("managerName","licenseNo",phone,email,address,"suspendReason") ON agency.agency_profiles';
    await writer.query('GRANT ' + extra + ' TO ' + quotedRole);
    app.get(ConfigService).set('AGENCY_PORTAL_PROFILE_ENABLED', 'true');
    try {
      const result = await request(app.getHttpServer())
        .get(path + '/portal-profile')
        .set(headers)
        .expect(200);
      expect(result.body as unknown).toEqual({
        success: true,
        data: {
          agencyId: owner,
          managerName: 'private-manager',
          licenseNo: 'private-license',
          phone: 'private-phone',
          email: 'private@agency.invalid',
          city: 'تهران',
          address: 'private-address',
          tier: 'NORMAL',
          suspendedAt: null,
          suspendReason: null,
          joinedAt: '2026-09-04T12:34:56.789Z',
        },
      });
      expect(await verifyReader(reader, false, true)).toMatchObject({
        status: 'PASS',
      });
      expect(await verifyReader(reader)).toMatchObject({
        status: 'FAIL',
        checks: { exactReads: false },
      });
      await request(app.getHttpServer()).get('/ready').expect(200);
      const second = await request(app.getHttpServer())
        .get('/internal/v1/agencies/' + other + '/portal-profile')
        .set({ ...headers, 'X-Agency-Id': other })
        .expect(200);
      expect(second.body as unknown).toMatchObject({
        data: { agencyId: other, managerName: 'private-manager' },
      });
    } finally {
      app.get(ConfigService).set('AGENCY_PORTAL_PROFILE_ENABLED', 'false');
      await writer.query('REVOKE ' + extra + ' FROM ' + quotedRole);
    }
  });

  it('keeps portal profiles disabled, authenticated, owner-bound and grant-gated', async () => {
    await request(app.getHttpServer())
      .get(path + '/portal-profile')
      .expect(401);
    await request(app.getHttpServer())
      .get(path + '/portal-profile')
      .set({ ...headers, 'X-Agency-Id': other })
      .expect(403);
    await request(app.getHttpServer())
      .get('/internal/v1/agencies/invalid/portal-profile')
      .set(headers)
      .expect(400);
    await request(app.getHttpServer())
      .get(path + '/portal-profile')
      .set(headers)
      .expect(503);
    expect(await verifyReader(reader, false, true)).toMatchObject({
      status: 'FAIL',
      checks: { requiredReads: false },
    });
    app.get(ConfigService).set('AGENCY_PORTAL_PROFILE_ENABLED', 'true');
    try {
      await request(app.getHttpServer()).get('/ready').expect(503);
      const response = await request(app.getHttpServer())
        .get(path + '/portal-profile')
        .set(headers)
        .expect(500);
      expect(response.text).not.toContain('private-license');
    } finally {
      app.get(ConfigService).set('AGENCY_PORTAL_PROFILE_ENABLED', 'false');
    }
  });

  it('returns missing portal profiles honestly and refuses oversized data', async () => {
    const extra =
      'SELECT ("managerName","licenseNo",phone,email,address,"suspendReason") ON agency.agency_profiles';
    await writer.query('GRANT ' + extra + ' TO ' + quotedRole);
    app.get(ConfigService).set('AGENCY_PORTAL_PROFILE_ENABLED', 'true');
    try {
      const missing = randomUUID();
      await request(app.getHttpServer())
        .get('/internal/v1/agencies/' + missing + '/portal-profile')
        .set({ ...headers, 'X-Agency-Id': missing })
        .expect(404);
      await writer.query(
        'UPDATE agency.agency_profiles SET address=$1 WHERE "userId"=$2',
        ['x'.repeat(64 * 1024), owner],
      );
      const oversized = await request(app.getHttpServer())
        .get(path + '/portal-profile')
        .set(headers)
        .expect(503);
      expect(oversized.text.length).toBeLessThan(500);
    } finally {
      await writer.query(
        'UPDATE agency.agency_profiles SET address=$1 WHERE "userId"=$2',
        ['private-address', owner],
      );
      app.get(ConfigService).set('AGENCY_PORTAL_PROFILE_ENABLED', 'false');
      await writer.query('REVOKE ' + extra + ' FROM ' + quotedRole);
    }
  });

  it('serves the complete compatible invoice array only with explicit opt-in grants', async () => {
    const extra =
      'SELECT ("bookingId","issuedById","descriptionFa") ON agency.agency_invoices';
    await writer.query('GRANT ' + extra + ' TO ' + quotedRole);
    app.get(ConfigService).set('AGENCY_PORTAL_INVOICES_ENABLED', 'true');
    try {
      const result = await request(app.getHttpServer())
        .get(path + '/portal-invoices')
        .set(headers)
        .expect(200);
      const body = result.body as { data: Array<Record<string, unknown>> };
      expect(body.data).toHaveLength(12);
      expect(body.data.find((row) => row.id === ids[0])).toMatchObject({
        agencyId: owner,
        bookingId: null,
        issuedById: owner,
        descriptionFa: 'private-description',
        amountIrr: '9007199254740993',
      });
      expect(body.data.some((row) => row.id === foreignInvoice)).toBe(false);
      const second = await request(app.getHttpServer())
        .get('/internal/v1/agencies/' + other + '/portal-invoices')
        .set({ ...headers, 'X-Agency-Id': other })
        .expect(200);
      expect(second.body as unknown).toMatchObject({
        data: [
          {
            id: foreignInvoice,
            agencyId: other,
            status: 'PAID',
            paidAt: '2026-09-05T10:00:00.123Z',
          },
        ],
      });
      expect(await verifyReader(reader, true)).toMatchObject({
        status: 'PASS',
      });
      expect(await verifyReader(reader)).toMatchObject({
        status: 'FAIL',
        checks: { exactReads: false },
      });
      await request(app.getHttpServer()).get('/ready').expect(200);
      const serviceUrl = await app.getUrl();
      const remote = await new Promise<string>((resolveOutput, reject) => {
        execFile(
          process.execPath,
          [
            '-e',
            `require('reflect-metadata');
             const {ConfigService}=require('@nestjs/config');
             const {DataSource}=require('typeorm');
             const {dataSourceOptions}=require('./dist/database/data-source.options');
             const {AgencyInvoice}=require('./dist/database/entities/agency-invoice.entity');
             const {AgencyInvoiceClient}=require('./dist/modules/agency-portal/agency-invoice.client');
             const client=new AgencyInvoiceClient(new ConfigService(process.env),{warn(){}});
             const db=new DataSource({...dataSourceOptions,url:process.env.DATABASE_URL,synchronize:false,migrationsRun:false,logging:false,extra:{options:'-c default_transaction_read_only=on -c timezone=UTC'}});
             (async()=>{try {await db.initialize();
               const remote=await client.list(process.argv[1],'real-agency-client-test');
               const legacy=await db.getRepository(AgencyInvoice).find({where:{agencyId:process.argv[1]},order:{issuedAt:'DESC'}});
               process.stdout.write(JSON.stringify({remote,legacy},(_,value)=>typeof value==='bigint'?value.toString():value));
             } finally {if(db.isInitialized) await db.destroy();}})().catch(()=>{process.exitCode=1;});`,
            owner,
          ],
          {
            cwd: resolve(__dirname, '../../backend'),
            windowsHide: true,
            timeout: 15000,
            env: {
              ...process.env,
              AGENCY_INVOICES_READ_ENABLED: 'true',
              TZ: 'UTC',
              DATABASE_URL: readerUrl,
              AGENCY_SERVICE_URL: serviceUrl,
              AGENCY_INTERNAL_TOKEN: token,
            },
          },
          (error, stdout) =>
            error
              ? reject(new Error('Built Agency invoice client failed'))
              : resolveOutput(stdout),
        );
      });
      const expected = ids
        .map((id, index) => ({
          id,
          agencyId: owner,
          bookingId: null,
          invoiceNo: 'TEST-' + id,
          issuedById: owner,
          descriptionFa: 'private-description',
          amountIrr:
            index === 0
              ? '9007199254740993'
              : (1000n + BigInt(index)).toString(),
          status: 'UNPAID',
          issuedAt: '2026-09-04T12:34:56.789Z',
          dueAt: '2026-10-04T12:34:56.789Z',
          paidAt: null,
        }))
        .sort((a, b) => a.id.localeCompare(b.id));
      const resultRows = JSON.parse(remote) as {
        remote: Array<{ id: string }>;
        legacy: Array<{ id: string }>;
      };
      for (const rows of [resultRows.remote, resultRows.legacy])
        expect(rows.sort((a, b) => a.id.localeCompare(b.id))).toEqual(expected);
    } finally {
      app.get(ConfigService).set('AGENCY_PORTAL_INVOICES_ENABLED', 'false');
      await writer.query('REVOKE ' + extra + ' FROM ' + quotedRole);
    }
  });

  it('keeps the compatibility route disabled, authenticated and owner-bound', async () => {
    await request(app.getHttpServer())
      .get(path + '/portal-invoices')
      .expect(401);
    await request(app.getHttpServer())
      .get(path + '/portal-invoices')
      .set({ ...headers, 'X-Agency-Id': other })
      .expect(403);
    await request(app.getHttpServer())
      .get('/internal/v1/agencies/invalid/portal-invoices')
      .set(headers)
      .expect(400);
    await request(app.getHttpServer())
      .get(path + '/portal-invoices')
      .set(headers)
      .expect(503);
    expect(await verifyReader(reader, true)).toMatchObject({
      status: 'FAIL',
      checks: { requiredReads: false },
    });
    app.get(ConfigService).set('AGENCY_PORTAL_INVOICES_ENABLED', 'true');
    try {
      await request(app.getHttpServer()).get('/ready').expect(503);
      const response = await request(app.getHttpServer())
        .get(path + '/portal-invoices')
        .set(headers)
        .expect(500);
      expect(response.text).not.toContain('descriptionFa');
    } finally {
      app.get(ConfigService).set('AGENCY_PORTAL_INVOICES_ENABLED', 'false');
    }
  });

  it('returns empty and absent owners honestly and refuses oversized snapshots', async () => {
    const extra =
      'SELECT ("bookingId","issuedById","descriptionFa") ON agency.agency_invoices';
    await writer.query('GRANT ' + extra + ' TO ' + quotedRole);
    app.get(ConfigService).set('AGENCY_PORTAL_INVOICES_ENABLED', 'true');
    try {
      const missing = randomUUID();
      await request(app.getHttpServer())
        .get('/internal/v1/agencies/' + missing + '/portal-invoices')
        .set({ ...headers, 'X-Agency-Id': missing })
        .expect(404);
      const response = await request(app.getHttpServer())
        .get('/internal/v1/agencies/' + empty + '/portal-invoices')
        .set({ ...headers, 'X-Agency-Id': empty })
        .expect(200);
      expect(response.body as unknown).toEqual({ success: true, data: [] });
      await writer.query(
        'UPDATE agency.agency_invoices SET "descriptionFa"=$1 WHERE id=$2',
        ['x'.repeat(1024 * 1024), ids[0]],
      );
      const large = await request(app.getHttpServer())
        .get(path + '/portal-invoices')
        .set(headers)
        .expect(503);
      expect(large.text.length).toBeLessThan(500);
    } finally {
      await writer.query(
        'UPDATE agency.agency_invoices SET "descriptionFa"=$1 WHERE id=$2',
        ['private-description', ids[0]],
      );
      app.get(ConfigService).set('AGENCY_PORTAL_INVOICES_ENABLED', 'false');
      await writer.query('REVOKE ' + extra + ' FROM ' + quotedRole);
    }
  });

  it('refuses a 1001-row snapshot instead of returning a partial invoice list', async () => {
    const extra =
      'SELECT ("bookingId","issuedById","descriptionFa") ON agency.agency_invoices';
    const overflowIds = Array.from({ length: 1001 }, () => randomUUID());
    await writer.query('GRANT ' + extra + ' TO ' + quotedRole);
    app.get(ConfigService).set('AGENCY_PORTAL_INVOICES_ENABLED', 'true');
    try {
      await writer.query(
        `INSERT INTO agency.agency_invoices (id,"agencyId","invoiceNo","issuedById","issuedAt","dueAt","amountIrr") SELECT id,$2,'CAP-'||id,$2,'2026-09-04'::timestamp,'2026-10-04'::timestamp,1 FROM unnest($1::text[]) id`,
        [overflowIds, empty],
      );
      const response = await request(app.getHttpServer())
        .get('/internal/v1/agencies/' + empty + '/portal-invoices')
        .set({ ...headers, 'X-Agency-Id': empty })
        .expect(503);
      expect(response.body as unknown).toMatchObject({
        success: false,
        error: { code: 'SERVICE_UNAVAILABLE' },
      });
    } finally {
      await writer.query(
        'DELETE FROM agency.agency_invoices WHERE "agencyId"=$1 AND id=ANY($2::text[])',
        [empty, overflowIds],
      );
      app.get(ConfigService).set('AGENCY_PORTAL_INVOICES_ENABLED', 'false');
      await writer.query('REVOKE ' + extra + ' FROM ' + quotedRole);
    }
  });

  it('rejects an explicitly invalid shadow invoice UUID instead of silently ignoring it', async () => {
    safeReport(await shadow(owner, '1', {}, '../foreign'), 'UNAVAILABLE', 1);
    safeReport(await shadow(owner, '1', {}, ''), 'UNAVAILABLE', 1);
  });

  it.each([
    ['owned exact-IRR invoice', owner, ids[0]],
    ['paid invoice of second tenant', other, foreignInvoice],
    ['owned invoice outside first page', owner, [...ids].sort()[0]],
    ['foreign invoice', owner, foreignInvoice],
    ['absent invoice', owner, randomUUID()],
    ['missing profile', randomUUID(), ids[0]],
  ])(
    'compares explicit invoice detail through built CLI: %s',
    async (_label, id, invoiceId) => {
      const result = await shadow(id, '1', {}, invoiceId);
      safeReport(result, 'MATCH');
      expect(result.stdout).not.toContain(invoiceId);
    },
  );

  it('keeps optional-detail shadow disabled and sanitizes service failures', async () => {
    safeReport(
      await shadow(
        '',
        '',
        {
          AGENCY_SHADOW_ENABLED: 'false',
          DATABASE_URL: '',
          AGENCY_SERVICE_URL: '',
          AGENCY_INTERNAL_TOKEN: '',
        },
        '../invalid',
      ),
      'DISABLED',
    );
    safeReport(
      await shadow(
        owner,
        '1',
        {
          AGENCY_INTERNAL_TOKEN:
            'wrong-service-credential-at-least-32-characters',
        },
        ids[0],
      ),
      'UNAVAILABLE',
      2,
    );
  });

  it.each([
    ['first page with exact IRR', owner, '1'],
    ['second page with deterministic ties', owner, '2'],
    ['other tenant', other, '1'],
    ['empty profile', empty, '1'],
    ['missing profile', randomUUID(), '1'],
  ])('matches built backend shadow CLI for %s', async (_label, id, page) => {
    safeReport(await shadow(id, page), 'MATCH');
  });

  it('keeps the shadow CLI disabled without configuration or an owner', async () => {
    safeReport(
      await shadow('', '', {
        AGENCY_SHADOW_ENABLED: 'false',
        AGENCY_SERVICE_URL: '',
        AGENCY_INTERNAL_TOKEN: '',
        DATABASE_URL: '',
      }),
      'DISABLED',
    );
  });

  it('sanitizes shadow CLI configuration errors before connection', async () => {
    safeReport(await shadow(owner, '0'), 'UNAVAILABLE', 1);
    safeReport(await shadow('../foreign'), 'UNAVAILABLE', 1);
  });

  it('fails closed with wrong service credentials and an unreachable service', async () => {
    safeReport(
      await shadow(owner, '1', {
        AGENCY_INTERNAL_TOKEN:
          'wrong-service-credential-at-least-32-characters',
      }),
      'UNAVAILABLE',
      2,
    );
    safeReport(
      await shadow(owner, '1', { AGENCY_SERVICE_URL: 'http://127.0.0.1:1' }),
      'UNAVAILABLE',
      2,
    );
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
    expect(Object.keys(doc.paths)).toHaveLength(7);
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
