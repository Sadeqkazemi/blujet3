import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Logger } from 'nestjs-pino';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import * as crypto from 'node:crypto';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { AuditLog } from '../src/database/entities/audit-log.entity';
import { FarePricingProposal } from '../src/database/entities/fare-pricing-proposal.entity';
import { Flight } from '../src/database/entities/flight.entity';
import { FlightInstance } from '../src/database/entities/flight-instance.entity';
import {
  PRICE_SUGGESTION_PROVIDER,
  type PriceSuggestionProvider,
  type PriceSuggestionResult,
} from '../src/modules/ai/price-suggestion.provider';
import { FlightDefinitionStatus } from '../src/database/enums';
import { loginAs } from './helpers/login.helper';

/** Deterministic in-test stand-in for the ml-service — set `nextResult` to
 * null to simulate the service being down (graceful-degradation tests). */
class FakePriceSuggestionProvider implements PriceSuggestionProvider {
  nextResult: PriceSuggestionResult | null = null;
  lastItems: unknown[] = [];

  suggest(items: unknown[]): Promise<PriceSuggestionResult | null> {
    this.lastItems = items;
    return Promise.resolve(this.nextResult);
  }
}

describe('Pricing (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let fakeMl: FakePriceSuggestionProvider;

  beforeEach(async () => {
    fakeMl = new FakePriceSuggestionProvider();
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PRICE_SUGGESTION_PROVIDER)
      .useValue(fakeMl)
      .compile();
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

  async function createScheduledInstance() {
    const flight = await dataSource
      .getRepository(Flight)
      .createQueryBuilder('f')
      .getOneOrFail();
    const instanceRepo = dataSource.getRepository(FlightInstance);
    return instanceRepo.save(
      instanceRepo.create({
        flightId: flight.id,
        departureAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        arrivalAt: new Date(
          Date.now() + 14 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000,
        ),
        capacity: 180,
        charterSeats: 60,
        status: 'SCHEDULED',
        // Pricing CEO-register path requires ops gate complete → PENDING_CEO.
        definitionStatus: FlightDefinitionStatus.PENDING_CEO,
      }),
    );
  }

  async function setProposalCompetitor(
    proposalId: string,
    competitorPriceIrr = 40_000_000n,
  ) {
    await dataSource
      .createQueryBuilder()
      .update(FarePricingProposal)
      .set({ competitorPriceIrr })
      .where('id = :id', { id: proposalId })
      .execute();
  }

  it('Commercial proposes a price for a scheduled flight; re-PUT while PENDING edits it', async () => {
    const instance = await createScheduledInstance();
    const { accessToken } = await loginAs(app, 'comm');

    const created = await request(app.getHttpServer())
      .put(`/pricing/flights/${instance.id}/proposal`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        proposedPriceIrr: 38_500_000,
        legalRateIrr: 42_000_000,
        note: 'تست',
      });
    expect(created.status).toBe(200);
    expect(created.body.data.status).toBe('PENDING');

    const edited = await request(app.getHttpServer())
      .put(`/pricing/flights/${instance.id}/proposal`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ proposedPriceIrr: 39_000_000 });
    expect(edited.status).toBe(200);
    expect(edited.body.data.proposedPriceIrr).toBe('39000000');

    const audit = await dataSource
      .getRepository(AuditLog)
      .createQueryBuilder('a')
      .where('a.category = :category', { category: 'PRICING' })
      .andWhere('a.entityId = :entityId', { entityId: created.body.data.id })
      .getOne();
    expect(audit).not.toBeNull();
  });

  it('PUT as CEO → 403; unknown flight → 404; missing price → 400', async () => {
    const instance = await createScheduledInstance();
    const ceo = await loginAs(app, 'ceo');
    const forbidden = await request(app.getHttpServer())
      .put(`/pricing/flights/${instance.id}/proposal`)
      .set('Authorization', `Bearer ${ceo.accessToken}`)
      .send({ proposedPriceIrr: 1_000_000 });
    expect(forbidden.status).toBe(403);

    const commercial = await loginAs(app, 'comm');
    const notFound = await request(app.getHttpServer())
      .put(`/pricing/flights/${crypto.randomUUID()}/proposal`)
      .set('Authorization', `Bearer ${commercial.accessToken}`)
      .send({ proposedPriceIrr: 1_000_000 });
    expect(notFound.status).toBe(404);

    const invalid = await request(app.getHttpServer())
      .put(`/pricing/flights/${instance.id}/proposal`)
      .set('Authorization', `Bearer ${commercial.accessToken}`)
      .send({});
    expect(invalid.status).toBe(400);
  });

  it('CEO registers with source=PROPOSED without step-up/OTP; RBAC + audit log + idempotency are preserved; further edits → 409', async () => {
    const instance = await createScheduledInstance();
    const commercial = await loginAs(app, 'comm');
    const created = await request(app.getHttpServer())
      .put(`/pricing/flights/${instance.id}/proposal`)
      .set('Authorization', `Bearer ${commercial.accessToken}`)
      .send({ proposedPriceIrr: 38_500_000 });
    const proposalId = created.body.data.id as string;

    // No stepUpChallengeId/stepUpCode anywhere in this body — step-up is
    // no longer part of the CEO price/flight-definition approval contract.
    const ceo = await loginAs(app, 'ceo');
    const registered = await request(app.getHttpServer())
      .patch(`/pricing/proposals/${proposalId}/register`)
      .set('Authorization', `Bearer ${ceo.accessToken}`)
      .send({ source: 'PROPOSED' });
    expect(registered.status).toBe(200);
    expect(registered.body.data.status).toBe('REGISTERED');
    expect(registered.body.data.registeredPriceIrr).toBe('38500000');
    expect(registered.body.data.approvedBy.role).toBe('CEO');

    // RBAC still gates the endpoint (no step-up needed to be *rejected* either).
    const forbidden = await request(app.getHttpServer())
      .patch(`/pricing/proposals/${created.body.data.id}/register`)
      .set('Authorization', `Bearer ${commercial.accessToken}`)
      .send({ source: 'PROPOSED' });
    expect(forbidden.status).toBe(403);

    // Audit log still records the approval.
    const audit = await dataSource
      .getRepository(AuditLog)
      .createQueryBuilder('a')
      .where('a.category = :category', { category: 'PRICING' })
      .andWhere('a.entityId = :entityId', { entityId: proposalId })
      .andWhere("a.action = 'تأیید قیمت پیشنهادی بازرگانی'")
      .getOne();
    expect(audit).not.toBeNull();
    expect(audit!.actorRole).toBe('CEO');

    const reEdit = await request(app.getHttpServer())
      .put(`/pricing/flights/${instance.id}/proposal`)
      .set('Authorization', `Bearer ${commercial.accessToken}`)
      .send({ proposedPriceIrr: 40_000_000 });
    expect(reEdit.status).toBe(409);

    const reRegister = await request(app.getHttpServer())
      .patch(`/pricing/proposals/${proposalId}/register`)
      .set('Authorization', `Bearer ${ceo.accessToken}`)
      .send({ source: 'PROPOSED' });
    // Re-register is idempotent (same REGISTERED row); commercial re-edit stays 409.
    expect(reRegister.status).toBe(200);
    expect(reRegister.body.data.status).toBe('REGISTERED');
    expect(reRegister.body.data.registeredPriceIrr).toBe('38500000');
  });

  it('PATCH .../approve is a canonical alias for register — same result, still no step-up', async () => {
    const instance = await createScheduledInstance();
    const commercial = await loginAs(app, 'comm');
    const created = await request(app.getHttpServer())
      .put(`/pricing/flights/${instance.id}/proposal`)
      .set('Authorization', `Bearer ${commercial.accessToken}`)
      .send({ proposedPriceIrr: 38_500_000 });
    const proposalId = created.body.data.id as string;

    const ceo = await loginAs(app, 'ceo');
    const approved = await request(app.getHttpServer())
      .patch(`/pricing/proposals/${proposalId}/approve`)
      .set('Authorization', `Bearer ${ceo.accessToken}`)
      .send({ source: 'PROPOSED' });
    expect(approved.status).toBe(200);
    expect(approved.body.data.status).toBe('REGISTERED');
    expect(approved.body.data.registeredPriceIrr).toBe('38500000');

    const forbidden = await request(app.getHttpServer())
      .patch(`/pricing/proposals/${proposalId}/approve`)
      .set('Authorization', `Bearer ${commercial.accessToken}`)
      .send({ source: 'PROPOSED' });
    expect(forbidden.status).toBe(403);
  });

  it('register with source=AI without a stored suggestion → 409 with a clear message', async () => {
    const instance = await createScheduledInstance();
    const commercial = await loginAs(app, 'comm');
    const created = await request(app.getHttpServer())
      .put(`/pricing/flights/${instance.id}/proposal`)
      .set('Authorization', `Bearer ${commercial.accessToken}`)
      .send({ proposedPriceIrr: 38_500_000 });

    const ceo = await loginAs(app, 'ceo');
    const res = await request(app.getHttpServer())
      .patch(`/pricing/proposals/${created.body.data.id}/register`)
      .set('Authorization', `Bearer ${ceo.accessToken}`)
      .send({ source: 'AI' });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toContain('هوش مصنوعی');
  });

  it('AI analysis persists suggestions with modelVersion, mutates nothing else, and register {source:AI} uses it', async () => {
    const instance = await createScheduledInstance();
    const commercial = await loginAs(app, 'comm');
    const created = await request(app.getHttpServer())
      .put(`/pricing/flights/${instance.id}/proposal`)
      .set('Authorization', `Bearer ${commercial.accessToken}`)
      .send({ proposedPriceIrr: 38_500_000 });
    const proposalId = created.body.data.id as string;
    await setProposalCompetitor(proposalId);

    fakeMl.nextResult = {
      model_version: 'heuristic-test',
      suggestions: [
        {
          proposal_id: proposalId,
          price_irr: 39_200_000,
          reason_fa: 'دلیل تستی',
          factors_fa: ['فاکتور ۱'],
          season_fa: 'فصل عادی',
          occasion_fa: 'بدون مناسبت خاص',
          confidence: 0.8,
        },
      ],
    };

    const ceo = await loginAs(app, 'ceo');
    const analysis = await request(app.getHttpServer())
      .post('/pricing/proposals/ai-analysis')
      .set('Authorization', `Bearer ${ceo.accessToken}`);
    expect(analysis.status).toBe(201);
    expect(analysis.body.data.available).toBe(true);
    expect(analysis.body.data.analyzed).toBeGreaterThanOrEqual(1);

    const stored = await dataSource
      .getRepository(FarePricingProposal)
      .createQueryBuilder('p')
      .where('p.id = :id', { id: proposalId })
      .getOneOrFail();
    const suggestion = stored.aiSuggestion as {
      priceIrr: number;
      modelVersion: string;
    };
    expect(suggestion.priceIrr).toBe(39_200_000);
    expect(suggestion.modelVersion).toBe('heuristic-test');
    // Advisory only — nothing else changed.
    expect(stored.status).toBe('PENDING');
    // stored is a direct TypeORM read (not JSON over HTTP) — proposedPriceIrr
    // is a native bigint column.
    expect(stored.proposedPriceIrr).toBe(38_500_000n);
    expect(stored.registeredPriceIrr).toBeNull();

    const registered = await request(app.getHttpServer())
      .patch(`/pricing/proposals/${proposalId}/register`)
      .set('Authorization', `Bearer ${ceo.accessToken}`)
      .send({ source: 'AI' });
    expect(registered.status).toBe(200);
    expect(registered.body.data.registeredPriceIrr).toBe('39200000');
  });

  it('editing a PENDING proposal after AI analysis clears the stale suggestion — register {source:AI} then 409s', async () => {
    const instance = await createScheduledInstance();
    const commercial = await loginAs(app, 'comm');
    const created = await request(app.getHttpServer())
      .put(`/pricing/flights/${instance.id}/proposal`)
      .set('Authorization', `Bearer ${commercial.accessToken}`)
      .send({ proposedPriceIrr: 38_500_000 });
    const proposalId = created.body.data.id as string;
    await setProposalCompetitor(proposalId);

    fakeMl.nextResult = {
      model_version: 'heuristic-test',
      suggestions: [
        {
          proposal_id: proposalId,
          price_irr: 39_200_000,
          reason_fa: 'دلیل تستی',
          factors_fa: ['فاکتور ۱'],
          season_fa: 'فصل عادی',
          occasion_fa: 'بدون مناسبت خاص',
          confidence: 0.8,
        },
      ],
    };
    const ceo = await loginAs(app, 'ceo');
    await request(app.getHttpServer())
      .post('/pricing/proposals/ai-analysis')
      .set('Authorization', `Bearer ${ceo.accessToken}`);

    // Commercial edits the still-PENDING proposal's price after the AI
    // suggestion was computed against the old figure.
    const edited = await request(app.getHttpServer())
      .put(`/pricing/flights/${instance.id}/proposal`)
      .set('Authorization', `Bearer ${commercial.accessToken}`)
      .send({ proposedPriceIrr: 30_000_000 });
    expect(edited.status).toBe(200);

    const stored = await dataSource
      .getRepository(FarePricingProposal)
      .createQueryBuilder('p')
      .where('p.id = :id', { id: proposalId })
      .getOneOrFail();
    expect(stored.aiSuggestion).toBeNull();

    const registered = await request(app.getHttpServer())
      .patch(`/pricing/proposals/${proposalId}/register`)
      .set('Authorization', `Bearer ${ceo.accessToken}`)
      .send({ source: 'AI' });
    expect(registered.status).toBe(409);
    expect(registered.body.error.message).toContain('هوش مصنوعی');
  });

  it('register {source:AI} rejects a suggestion above the CEO-approved legal rate', async () => {
    const instance = await createScheduledInstance();
    const commercial = await loginAs(app, 'comm');
    const created = await request(app.getHttpServer())
      .put(`/pricing/flights/${instance.id}/proposal`)
      .set('Authorization', `Bearer ${commercial.accessToken}`)
      .send({ proposedPriceIrr: 38_500_000, legalRateIrr: 40_000_000 });
    const proposalId = created.body.data.id as string;
    await setProposalCompetitor(proposalId);

    fakeMl.nextResult = {
      model_version: 'heuristic-test',
      suggestions: [
        {
          proposal_id: proposalId,
          price_irr: 55_000_000, // above the 40,000,000 legal ceiling
          reason_fa: 'دلیل تستی',
          factors_fa: ['فاکتور ۱'],
          season_fa: 'فصل عادی',
          occasion_fa: 'بدون مناسبت خاص',
          confidence: 0.8,
        },
      ],
    };
    const ceo = await loginAs(app, 'ceo');
    await request(app.getHttpServer())
      .post('/pricing/proposals/ai-analysis')
      .set('Authorization', `Bearer ${ceo.accessToken}`);

    const registered = await request(app.getHttpServer())
      .patch(`/pricing/proposals/${proposalId}/register`)
      .set('Authorization', `Bearer ${ceo.accessToken}`)
      .send({ source: 'AI' });
    expect(registered.status).toBe(409);
    expect(registered.body.error.message).toContain('نرخ قانونی');

    const stored = await dataSource
      .getRepository(FarePricingProposal)
      .createQueryBuilder('p')
      .where('p.id = :id', { id: proposalId })
      .getOneOrFail();
    expect(stored.status).toBe('PENDING');
    expect(stored.registeredPriceIrr).toBeNull();
  });

  it('ml-service down: ai-analysis degrades gracefully (available:false, no 500) and register-by-proposed still works', async () => {
    const instance = await createScheduledInstance();
    const commercial = await loginAs(app, 'comm');
    const created = await request(app.getHttpServer())
      .put(`/pricing/flights/${instance.id}/proposal`)
      .set('Authorization', `Bearer ${commercial.accessToken}`)
      .send({ proposedPriceIrr: 38_500_000 });

    fakeMl.nextResult = null; // simulate outage
    const ceo = await loginAs(app, 'ceo');
    const analysis = await request(app.getHttpServer())
      .post('/pricing/proposals/ai-analysis')
      .set('Authorization', `Bearer ${ceo.accessToken}`);
    expect(analysis.status).toBe(201);
    expect(analysis.body.data.available).toBe(false);

    const registered = await request(app.getHttpServer())
      .patch(`/pricing/proposals/${created.body.data.id}/register`)
      .set('Authorization', `Bearer ${ceo.accessToken}`)
      .send({ source: 'PROPOSED' });
    expect(registered.status).toBe(200);
  });

  it('ai-analysis skips proposals without a real competitor price', async () => {
    const instance = await createScheduledInstance();
    const commercial = await loginAs(app, 'comm');
    await request(app.getHttpServer())
      .put(`/pricing/flights/${instance.id}/proposal`)
      .set('Authorization', `Bearer ${commercial.accessToken}`)
      .send({ proposedPriceIrr: 38_500_000 });

    await dataSource
      .createQueryBuilder()
      .update(FarePricingProposal)
      .set({ competitorPriceIrr: null })
      .where('status = :status', { status: 'PENDING' })
      .execute();

    const ceo = await loginAs(app, 'ceo');
    const analysis = await request(app.getHttpServer())
      .post('/pricing/proposals/ai-analysis')
      .set('Authorization', `Bearer ${ceo.accessToken}`);
    expect(analysis.status).toBe(201);
    expect(analysis.body.data).toEqual({ analyzed: 0, available: true });
    expect(fakeMl.lastItems).toEqual([]);
  });

  it('CEO legal-rate PATCH stores + audits; Finance/Board Chair get 403 everywhere', async () => {
    const instance = await createScheduledInstance();
    const commercial = await loginAs(app, 'comm');
    const created = await request(app.getHttpServer())
      .put(`/pricing/flights/${instance.id}/proposal`)
      .set('Authorization', `Bearer ${commercial.accessToken}`)
      .send({ proposedPriceIrr: 38_500_000 });
    const proposalId = created.body.data.id as string;

    const ceo = await loginAs(app, 'ceo');
    const legal = await request(app.getHttpServer())
      .patch(`/pricing/proposals/${proposalId}/legal-rate`)
      .set('Authorization', `Bearer ${ceo.accessToken}`)
      .send({ legalRateIrr: 45_000_000 });
    expect(legal.status).toBe(200);
    expect(legal.body.data.legalRateIrr).toBe('45000000');

    const registered = await request(app.getHttpServer())
      .patch(`/pricing/proposals/${proposalId}/register`)
      .set('Authorization', `Bearer ${ceo.accessToken}`)
      .send({ source: 'PROPOSED' });
    expect(registered.status).toBe(200);

    const lockedLegalRate = await request(app.getHttpServer())
      .patch(`/pricing/proposals/${proposalId}/legal-rate`)
      .set('Authorization', `Bearer ${ceo.accessToken}`)
      .send({ legalRateIrr: 46_000_000 });
    expect(lockedLegalRate.status).toBe(409);

    const finance = await loginAs(app, 'finance');
    const listForbidden = await request(app.getHttpServer())
      .get('/pricing/proposals')
      .set('Authorization', `Bearer ${finance.accessToken}`);
    expect(listForbidden.status).toBe(403);

    const registerForbidden = await request(app.getHttpServer())
      .patch(`/pricing/proposals/${proposalId}/register`)
      .set('Authorization', `Bearer ${finance.accessToken}`)
      .send({ source: 'PROPOSED' });
    expect(registerForbidden.status).toBe(403);
  });

  it('role-shaped GET: CEO gets pending/registered lists, Commercial gets flight rows joined with proposals', async () => {
    const instance = await createScheduledInstance();
    const commercial = await loginAs(app, 'comm');
    await request(app.getHttpServer())
      .put(`/pricing/flights/${instance.id}/proposal`)
      .set('Authorization', `Bearer ${commercial.accessToken}`)
      .send({ proposedPriceIrr: 38_500_000 });

    const ceo = await loginAs(app, 'ceo');
    const ceoList = await request(app.getHttpServer())
      .get('/pricing/proposals')
      .set('Authorization', `Bearer ${ceo.accessToken}`);
    expect(ceoList.status).toBe(200);
    expect(Array.isArray(ceoList.body.data.pending)).toBe(true);
    expect(Array.isArray(ceoList.body.data.registered)).toBe(true);

    const commercialList = await request(app.getHttpServer())
      .get('/pricing/proposals')
      .set('Authorization', `Bearer ${commercial.accessToken}`);
    expect(commercialList.status).toBe(200);
    const row = commercialList.body.data.flights.find(
      (f: { id: string }) => f.id === instance.id,
    );
    expect(row).toBeDefined();
    expect(row.pricing.status).toBe('PENDING');
  });
});
