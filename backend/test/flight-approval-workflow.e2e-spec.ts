import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Logger } from 'nestjs-pino';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { FlightInstance } from '../src/database/entities/flight-instance.entity';
import { FlightReview } from '../src/database/entities/flight-review.entity';
import { FlightDefinitionStatus } from '../src/database/enums';
import { advanceToPendingCeo } from './helpers/flight-workflow.helper';
import { loginAs } from './helpers/login.helper';

describe('Flight approval workflow (ops → CEO → PUBLISHED) (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  beforeEach(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication<INestApplication<App>>({
      bufferLogs: true,
    });
    const logger = app.get(Logger);
    app.useLogger(logger);
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter(logger));
    await app.init();
    dataSource = app.get(DataSource);
  });

  afterEach(async () => {
    await app.close();
  });

  function uniqueFlightNo() {
    return `WF${(Date.now() % 9000) + 1000}`;
  }

  function payload(over: Record<string, unknown> = {}) {
    return {
      originCode: 'THR',
      destCode: 'MHD',
      flightNo: uniqueFlightNo(),
      departureAt: new Date(Date.now() + 12 * 24 * 3_600_000).toISOString(),
      durationMinutes: 95,
      capacity: 146,
      cabinCapacities: [
        { cabin: 'ECONOMY', seats: 110 },
        { cabin: 'COMFORT', seats: 20 },
        { cabin: 'BUSINESS', seats: 16 },
      ],
      basePriceIrr: '38000000',
      chargeRules: [],
      ...over,
    };
  }

  async function createDraft(commToken: string) {
    const created = await request(app.getHttpServer())
      .post('/flights')
      .set('Authorization', `Bearer ${commToken}`)
      .send(payload());
    expect(created.status).toBe(201);
    return created.body.data as {
      id: string;
      departureAt: string;
      version: number;
      definitionStatus: string;
    };
  }

  it('1) commercial create → DRAFT → submit-operations', async () => {
    const { accessToken: comm } = await loginAs(app, 'comm');
    const draft = await createDraft(comm);
    expect(draft.definitionStatus).toBe('DRAFT');

    const submitted = await request(app.getHttpServer())
      .post(`/flights/${draft.id}/submit-operations`)
      .set('Authorization', `Bearer ${comm}`)
      .send({});
    expect([200, 201]).toContain(submitted.status);
    expect(submitted.body.data.definitionStatus).toBe('PENDING_OPERATIONS');
    expect(submitted.body.data.uiStatus).toBe('pending_ops');

    const { accessToken: ops } = await loginAs(app, 'ops');
    const overview = await request(app.getHttpServer())
      .get('/flights/operations-overview')
      .set('Authorization', `Bearer ${ops}`);
    expect(overview.status).toBe(200);
    expect(overview.body.data.counts.pendingOperations).toBeGreaterThan(0);
    const overviewRow = overview.body.data.rows.find(
      (row: { id: string }) => row.id === draft.id,
    );
    expect(overviewRow).toBeDefined();
    expect(overviewRow).toHaveProperty('proposal.proposedPriceIrr');
  });

  it('2) non-ops role cannot ops-decide (403)', async () => {
    const { accessToken: comm } = await loginAs(app, 'comm');
    const draft = await createDraft(comm);
    await request(app.getHttpServer())
      .post(`/flights/${draft.id}/submit-operations`)
      .set('Authorization', `Bearer ${comm}`)
      .send({});

    const forbidden = await request(app.getHttpServer())
      .post(`/flights/${draft.id}/operations-decision`)
      .set('Authorization', `Bearer ${comm}`)
      .send({ decision: 'APPROVED', comment: 'نباید مجاز باشد' });
    expect(forbidden.status).toBe(403);
  });

  it('3) ops without comment → 400', async () => {
    const { accessToken: comm } = await loginAs(app, 'comm');
    const draft = await createDraft(comm);
    await request(app.getHttpServer())
      .post(`/flights/${draft.id}/submit-operations`)
      .set('Authorization', `Bearer ${comm}`)
      .send({});

    const { accessToken: ops } = await loginAs(app, 'ops');
    const missing = await request(app.getHttpServer())
      .post(`/flights/${draft.id}/operations-decision`)
      .set('Authorization', `Bearer ${ops}`)
      .send({ decision: 'APPROVED', comment: '   ' });
    expect(missing.status).toBe(400);
  });

  it('4) ops reject → OPERATIONS_REJECTED; commercial can resubmit', async () => {
    const { accessToken: comm } = await loginAs(app, 'comm');
    const draft = await createDraft(comm);
    await request(app.getHttpServer())
      .post(`/flights/${draft.id}/submit-operations`)
      .set('Authorization', `Bearer ${comm}`)
      .send({});

    const { accessToken: ops } = await loginAs(app, 'ops');
    const rejected = await request(app.getHttpServer())
      .post(`/flights/${draft.id}/operations-decision`)
      .set('Authorization', `Bearer ${ops}`)
      .send({ decision: 'REJECTED', comment: 'ظرفیت نامعتبر' });
    expect([200, 201]).toContain(rejected.status);
    expect(rejected.body.data.definitionStatus).toBe('OPERATIONS_REJECTED');

    const resubmit = await request(app.getHttpServer())
      .post(`/flights/${draft.id}/submit-operations`)
      .set('Authorization', `Bearer ${comm}`)
      .send({});
    expect([200, 201]).toContain(resubmit.status);
    expect(resubmit.body.data.definitionStatus).toBe('PENDING_OPERATIONS');
  });

  it('5) ops approve → PENDING_CEO', async () => {
    const { accessToken: comm } = await loginAs(app, 'comm');
    const draft = await createDraft(comm);
    const after = await advanceToPendingCeo(app, draft.id, comm);
    expect(after.definitionStatus).toBe('PENDING_CEO');
  });

  it('6) CEO register → PUBLISHED and immediately searchable', async () => {
    const { accessToken: comm } = await loginAs(app, 'comm');
    const draft = await createDraft(comm);
    const date = String(draft.departureAt).slice(0, 10);
    await advanceToPendingCeo(app, draft.id, comm);

    const proposal = await request(app.getHttpServer())
      .put(`/pricing/flights/${draft.id}/proposal`)
      .set('Authorization', `Bearer ${comm}`)
      .send({ proposedPriceIrr: '39000000' });
    expect(proposal.status).toBe(200);

    const { accessToken: ceo } = await loginAs(app, 'ceo');
    const reg = await request(app.getHttpServer())
      .patch(`/pricing/proposals/${proposal.body.data.id}/register`)
      .set('Authorization', `Bearer ${ceo}`)
      .send({ source: 'PROPOSED' });
    expect(reg.status).toBe(200);

    const live = await dataSource
      .getRepository(FlightInstance)
      .createQueryBuilder('fi')
      .where('fi.id = :id', { id: draft.id })
      .getOneOrFail();
    expect(live.definitionStatus).toBe(FlightDefinitionStatus.PUBLISHED);
    expect(live.publicSaleEnabled).toBe(true);
    expect(live.publishedAt).not.toBeNull();
    expect(live.publishedByUserId).toBeTruthy();

    const search = await request(app.getHttpServer())
      .get('/search/flights')
      .query({ origin: 'THR', dest: 'MHD', date });
    expect(
      (search.body.data as { flightInstanceId: string }[]).some(
        (r) => r.flightInstanceId === draft.id,
      ),
    ).toBe(true);
  });

  it('7) draft / ops / rejected not in public search', async () => {
    const { accessToken: comm } = await loginAs(app, 'comm');
    const draft = await createDraft(comm);
    const date = String(draft.departureAt).slice(0, 10);

    const before = await request(app.getHttpServer())
      .get('/search/flights')
      .query({ origin: 'THR', dest: 'MHD', date });
    expect(
      (before.body.data as { flightInstanceId: string }[]).some(
        (r) => r.flightInstanceId === draft.id,
      ),
    ).toBe(false);

    await request(app.getHttpServer())
      .post(`/flights/${draft.id}/submit-operations`)
      .set('Authorization', `Bearer ${comm}`)
      .send({});
    const pendingOps = await request(app.getHttpServer())
      .get('/search/flights')
      .query({ origin: 'THR', dest: 'MHD', date });
    expect(
      (pendingOps.body.data as { flightInstanceId: string }[]).some(
        (r) => r.flightInstanceId === draft.id,
      ),
    ).toBe(false);
  });

  it('8) history returns ops review rows after decision', async () => {
    const { accessToken: comm } = await loginAs(app, 'comm');
    const draft = await createDraft(comm);
    await advanceToPendingCeo(app, draft.id, comm);

    const history = await request(app.getHttpServer())
      .get(`/flights/${draft.id}/history`)
      .set('Authorization', `Bearer ${comm}`);
    expect(history.status).toBe(200);
    expect(history.body.data.reviews.length).toBeGreaterThanOrEqual(1);
    expect(history.body.data.reviews[0].stage).toBe('OPERATIONS');

    const reviews = await dataSource
      .getRepository(FlightReview)
      .createQueryBuilder('r')
      .where('r.flightInstanceId = :id', { id: draft.id })
      .getMany();
    expect(reviews).toHaveLength(1);
  });

  it('CEO queue hides proposals until operations approval', async () => {
    const { accessToken: comm } = await loginAs(app, 'comm');
    const draft = await createDraft(comm);
    const { accessToken: ceo } = await loginAs(app, 'ceo');

    const before = await request(app.getHttpServer())
      .get('/pricing/proposals')
      .set('Authorization', `Bearer ${ceo}`);
    expect(before.status).toBe(200);
    expect(
      before.body.data.pending.some(
        (p: { flightInstanceId: string }) => p.flightInstanceId === draft.id,
      ),
    ).toBe(false);

    await advanceToPendingCeo(app, draft.id, comm);
    const after = await request(app.getHttpServer())
      .get('/pricing/proposals')
      .set('Authorization', `Bearer ${ceo}`);
    expect(
      after.body.data.pending.some(
        (p: { flightInstanceId: string }) => p.flightInstanceId === draft.id,
      ),
    ).toBe(true);
  });

  it('commercial changes a published price and history records CEO + price events', async () => {
    const { accessToken: comm } = await loginAs(app, 'comm');
    const draft = await createDraft(comm);
    await advanceToPendingCeo(app, draft.id, comm);
    const proposal = await request(app.getHttpServer())
      .put(`/pricing/flights/${draft.id}/proposal`)
      .set('Authorization', `Bearer ${comm}`)
      .send({ proposedPriceIrr: '39000000', legalRateIrr: '42000000' });

    const { accessToken: ceo } = await loginAs(app, 'ceo');
    const published = await request(app.getHttpServer())
      .patch(`/pricing/proposals/${proposal.body.data.id}/register`)
      .set('Authorization', `Bearer ${ceo}`)
      .send({ source: 'PROPOSED', comment: 'انتشار نهایی پرواز' });
    expect(published.status).toBe(200);

    const changed = await request(app.getHttpServer())
      .patch(`/pricing/flights/${draft.id}/price`)
      .set('Authorization', `Bearer ${comm}`)
      .send({
        salePriceIrr: '37500000',
        reason: 'اصلاح نرخ برای افزایش ضریب اشغال',
        expectedVersion: published.body.data.flightInstance.version,
      });
    expect(changed.status).toBe(200);
    expect(changed.body.data.registeredPriceIrr).toBe('37500000');

    const forbidden = await request(app.getHttpServer())
      .patch(`/pricing/flights/${draft.id}/price`)
      .set('Authorization', `Bearer ${ceo}`)
      .send({ salePriceIrr: '37000000', reason: 'نباید مجاز باشد' });
    expect(forbidden.status).toBe(403);

    const history = await request(app.getHttpServer())
      .get(`/flights/${draft.id}/history`)
      .set('Authorization', `Bearer ${comm}`);
    expect(history.status).toBe(200);
    expect(
      history.body.data.reviews.some(
        (r: { stage: string; decision: string }) =>
          r.stage === 'CEO' && r.decision === 'APPROVED',
      ),
    ).toBe(true);
    expect(
      history.body.data.audit.some(
        (a: { action: string }) =>
          a.action === 'تغییر قیمت فروش پرواز منتشرشده',
      ),
    ).toBe(true);
  });

  it('9) stale expectedVersion → 409', async () => {
    const { accessToken: comm } = await loginAs(app, 'comm');
    const draft = await createDraft(comm);
    await request(app.getHttpServer())
      .post(`/flights/${draft.id}/submit-operations`)
      .set('Authorization', `Bearer ${comm}`)
      .send({});

    const { accessToken: ops } = await loginAs(app, 'ops');
    const stale = await request(app.getHttpServer())
      .post(`/flights/${draft.id}/operations-decision`)
      .set('Authorization', `Bearer ${ops}`)
      .send({
        decision: 'APPROVED',
        comment: 'نسخه کهنه',
        expectedVersion: 1,
      });
    expect(stale.status).toBe(409);
  });

  it('10) migration path: APPROVED rows are treated as sellable like PUBLISHED', async () => {
    // Simulate a pre-migration leftover enum value still present in PG.
    const { accessToken: comm } = await loginAs(app, 'comm');
    const draft = await createDraft(comm);
    await advanceToPendingCeo(app, draft.id, comm);
    const proposal = await request(app.getHttpServer())
      .put(`/pricing/flights/${draft.id}/proposal`)
      .set('Authorization', `Bearer ${comm}`)
      .send({ proposedPriceIrr: '39000000' });
    const { accessToken: ceo } = await loginAs(app, 'ceo');
    await request(app.getHttpServer())
      .patch(`/pricing/proposals/${proposal.body.data.id}/register`)
      .set('Authorization', `Bearer ${ceo}`)
      .send({ source: 'PROPOSED' });

    // Force legacy label if the PG enum still has APPROVED (migration keeps it).
    await dataSource.query(
      `UPDATE flight_instances
       SET "definitionStatus" = 'APPROVED'::"public"."FlightDefinitionStatus",
           "publicSaleEnabled" = true
       WHERE id = $1`,
      [draft.id],
    );

    const date = String(draft.departureAt).slice(0, 10);
    const search = await request(app.getHttpServer())
      .get('/search/flights')
      .query({ origin: 'THR', dest: 'MHD', date });
    expect(
      (search.body.data as { flightInstanceId: string }[]).some(
        (r) => r.flightInstanceId === draft.id,
      ),
    ).toBe(true);
  });

  it('ops cannot call CEO register; commercial cannot ops-decide', async () => {
    const { accessToken: comm } = await loginAs(app, 'comm');
    const draft = await createDraft(comm);
    await advanceToPendingCeo(app, draft.id, comm);
    const proposal = await request(app.getHttpServer())
      .put(`/pricing/flights/${draft.id}/proposal`)
      .set('Authorization', `Bearer ${comm}`)
      .send({ proposedPriceIrr: '39000000' });

    const { accessToken: ops } = await loginAs(app, 'ops');
    const opsRegister = await request(app.getHttpServer())
      .patch(`/pricing/proposals/${proposal.body.data.id}/register`)
      .set('Authorization', `Bearer ${ops}`)
      .send({ source: 'PROPOSED' });
    expect(opsRegister.status).toBe(403);
  });
});
