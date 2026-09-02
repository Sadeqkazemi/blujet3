import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Logger } from 'nestjs-pino';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { Booking } from '../src/database/entities/booking.entity';
import { FlightChargeRule } from '../src/database/entities/flight-charge-rule.entity';
import { FlightInstance } from '../src/database/entities/flight-instance.entity';
import { FarePricingProposal } from '../src/database/entities/fare-pricing-proposal.entity';
import { advanceToPendingCeo } from './helpers/flight-workflow.helper';
import { loginAs, loginAsCustomer } from './helpers/login.helper';

describe('Flight definition + charge rules + CEO approval (e2e)', () => {
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
    return `XY${(Date.now() % 9000) + 1000}`;
  }

  function payload(over: Record<string, unknown> = {}) {
    return {
      originCode: 'THR',
      destCode: 'MHD',
      flightNo: uniqueFlightNo(),
      departureAt: new Date(Date.now() + 10 * 24 * 3_600_000).toISOString(),
      durationMinutes: 95,
      capacity: 146,
      cabinCapacities: [
        { cabin: 'ECONOMY', seats: 110 },
        { cabin: 'COMFORT', seats: 20 },
        { cabin: 'BUSINESS', seats: 16 },
      ],
      basePriceIrr: '38000000',
      chargeRules: [
        {
          title: 'عوارض فرودگاهی',
          kind: 'FEE',
          calculationMode: 'FIXED',
          fixedAmountIrr: '500000',
          percentageBasisPoints: null,
          cabin: null,
          validFrom: null,
          validUntil: null,
          active: true,
        },
        {
          title: 'مالیات بیزینس',
          kind: 'TAX',
          calculationMode: 'PERCENTAGE',
          fixedAmountIrr: null,
          percentageBasisPoints: 1000,
          cabin: 'BUSINESS',
          active: true,
        },
      ],
      competitorPriceIrr: '40000000',
      ...over,
    };
  }

  it('creates XY1234-style flight with independent ECONOMY/COMFORT/BUSINESS', async () => {
    const { accessToken } = await loginAs(app, 'comm');
    const body = payload({ flightNo: 'XY1234' });
    // Avoid unique collision if prior run left XY1234 — pick unique when needed.
    const create = await request(app.getHttpServer())
      .post('/flights')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ ...body, flightNo: uniqueFlightNo() });
    expect(create.status).toBe(201);
    expect(create.body.success).toBe(true);
    expect(create.body.data.cabinCapacities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cabin: 'ECONOMY', seats: 110 }),
        expect.objectContaining({ cabin: 'COMFORT', seats: 20 }),
        expect.objectContaining({ cabin: 'BUSINESS', seats: 16 }),
      ]),
    );
    expect(create.body.data.durationMinutes).toBe(95);
    expect(create.body.data.chargeRules.length).toBe(2);
    expect(create.body.data.approvalStatus).toBe('DRAFT');
    expect(create.body.data.definitionStatus).toBe('DRAFT');
    const proposals = await dataSource
      .getRepository(FarePricingProposal)
      .createQueryBuilder('p')
      .where('p.flightInstanceId = :id', { id: create.body.data.id })
      .getMany();
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({
      status: 'PENDING',
      proposedById: expect.any(String),
      proposedPriceIrr: 38000000n,
      basePriceIrr: 38000000n,
    });
  });

  it('rejects flight numbers XY-1234, XY 1234, X1234', async () => {
    const { accessToken } = await loginAs(app, 'comm');
    for (const flightNo of ['XY-1234', 'XY 1234', 'X1234']) {
      const res = await request(app.getHttpServer())
        .post('/flights')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(payload({ flightNo }));
      expect(res.status).toBe(400);
    }
  });

  it('rejects duplicate cabin and capacity sum mismatch', async () => {
    const { accessToken } = await loginAs(app, 'comm');
    const dupCabin = await request(app.getHttpServer())
      .post('/flights')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(
        payload({
          cabinCapacities: [
            { cabin: 'ECONOMY', seats: 100 },
            { cabin: 'ECONOMY', seats: 80 },
          ],
        }),
      );
    expect(dupCabin.status).toBe(400);

    const badSum = await request(app.getHttpServer())
      .post('/flights')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(
        payload({
          capacity: 146,
          cabinCapacities: [
            { cabin: 'ECONOMY', seats: 100 },
            { cabin: 'COMFORT', seats: 20 },
            { cabin: 'BUSINESS', seats: 16 },
          ],
        }),
      );
    expect(badSum.status).toBe(400);
  });

  it('GET/PUT definition; PUBLISHED edit stages PENDING_REVISION', async () => {
    const { accessToken: comm } = await loginAs(app, 'comm');
    const created = await request(app.getHttpServer())
      .post('/flights')
      .set('Authorization', `Bearer ${comm}`)
      .send(payload());
    expect(created.status).toBe(201);
    const id = created.body.data.id as string;

    const got = await request(app.getHttpServer())
      .get(`/flights/${id}/definition`)
      .set('Authorization', `Bearer ${comm}`);
    expect(got.status).toBe(200);
    expect(got.body.data.durationMinutes).toBe(95);

    const proposal = await request(app.getHttpServer())
      .put(`/pricing/flights/${id}/proposal`)
      .set('Authorization', `Bearer ${comm}`)
      .send({ proposedPriceIrr: '39000000' });
    expect(proposal.status).toBe(200);

    await advanceToPendingCeo(app, id, comm);

    const { accessToken: ceo } = await loginAs(app, 'ceo');
    const reg = await request(app.getHttpServer())
      .patch(`/pricing/proposals/${proposal.body.data.id}/register`)
      .set('Authorization', `Bearer ${ceo}`)
      .send({ source: 'PROPOSED' });
    expect(reg.status).toBe(200);
    expect(reg.body.data.status).toBe('REGISTERED');

    const defAfter = await request(app.getHttpServer())
      .get(`/flights/${id}/definition`)
      .set('Authorization', `Bearer ${comm}`);
    expect(defAfter.body.data.approvalStatus).toBe('PUBLISHED');
    expect(defAfter.body.data.definitionStatus).toBe('PUBLISHED');
    expect(defAfter.body.data.approvedSnapshot?.charterSeats).toBe(0);

    const revised = await request(app.getHttpServer())
      .put(`/flights/${id}/definition`)
      .set('Authorization', `Bearer ${comm}`)
      .send(
        payload({
          flightNo: defAfter.body.data.flightNo,
          durationMinutes: 110,
          basePriceIrr: '40000000',
        }),
      );
    expect(revised.status).toBe(200);
    expect(revised.body.data.approvalStatus).toBe('PENDING_REVISION');
    expect(revised.body.data.pendingRevision).toBe(true);

    const live = await dataSource
      .getRepository(FlightInstance)
      .createQueryBuilder('fi')
      .where('fi.id = :id', { id })
      .getOneOrFail();
    // Live duration stays at approved value until CEO re-approves.
    expect(live.durationMinutes).toBe(95);
    expect(live.definitionStatus).toBe('PENDING_REVISION');
  });

  it('approving a revision that moves departureAt invalidates BOTH the old and new search-cache dates', async () => {
    const { accessToken: comm } = await loginAs(app, 'comm');
    const created = await request(app.getHttpServer())
      .post('/flights')
      .set('Authorization', `Bearer ${comm}`)
      .send(payload());
    expect(created.status).toBe(201);
    const id = created.body.data.id as string;
    const oldDate = String(created.body.data.departureAt).slice(0, 10);

    const proposal = await request(app.getHttpServer())
      .put(`/pricing/flights/${id}/proposal`)
      .set('Authorization', `Bearer ${comm}`)
      .send({ proposedPriceIrr: '39000000' });
    await advanceToPendingCeo(app, id, comm);
    const { accessToken: ceo } = await loginAs(app, 'ceo');
    const reg1 = await request(app.getHttpServer())
      .patch(`/pricing/proposals/${proposal.body.data.id}/register`)
      .set('Authorization', `Bearer ${ceo}`)
      .send({ source: 'PROPOSED' });
    expect(reg1.status).toBe(200);

    const visible = await request(app.getHttpServer())
      .patch(`/flights/${id}/sales-visibility`)
      .set('Authorization', `Bearer ${comm}`)
      .send({ enabled: true });
    expect(visible.status).toBe(200);

    // Prime the search cache for the flight's original date, exactly as a
    // customer browsing نتایج پرواز would before the revision below.
    const primed = await request(app.getHttpServer())
      .get('/search/flights')
      .query({ origin: 'THR', dest: 'MHD', date: oldDate });
    expect(primed.status).toBe(200);
    expect(
      (primed.body.data as { flightInstanceId: string }[]).some(
        (r) => r.flightInstanceId === id,
      ),
    ).toBe(true);

    // Revise the flight to a different departure date (a "dangerous"
    // change on an already-PUBLISHED flight → PENDING_REVISION; live
    // inventory, and therefore the primed cache entry above, must stay
    // exactly as-is until the CEO re-approves).
    const newDeparture = new Date(Date.now() + 20 * 24 * 3_600_000);
    const newDate = newDeparture.toISOString().slice(0, 10);
    const revised = await request(app.getHttpServer())
      .put(`/flights/${id}/definition`)
      .set('Authorization', `Bearer ${comm}`)
      .send(
        payload({
          flightNo: created.body.data.flightNo,
          departureAt: newDeparture.toISOString(),
        }),
      );
    expect(revised.status).toBe(200);
    expect(revised.body.data.approvalStatus).toBe('PENDING_REVISION');

    const stillOldDate = await request(app.getHttpServer())
      .get('/search/flights')
      .query({ origin: 'THR', dest: 'MHD', date: oldDate });
    expect(
      (stillOldDate.body.data as { flightInstanceId: string }[]).some(
        (r) => r.flightInstanceId === id,
      ),
    ).toBe(true);

    // CEO approves the revision (reopens the same proposal).
    const revisionProposal = await dataSource
      .getRepository(FarePricingProposal)
      .createQueryBuilder('p')
      .where('p.flightInstanceId = :id', { id })
      .getOneOrFail();
    const reg2 = await request(app.getHttpServer())
      .patch(`/pricing/proposals/${revisionProposal.id}/register`)
      .set('Authorization', `Bearer ${ceo}`)
      .send({ source: 'PROPOSED' });
    expect(reg2.status).toBe(200);
    expect(reg2.body.data.flightInstance.departureAt.slice(0, 10)).toBe(
      newDate,
    );

    // Regression: the OLD date's cache entry must be busted too — not just
    // the new one — or the moved flight keeps appearing on its stale
    // former date until the 5-minute search-cache TTL expires.
    const oldDateAfter = await request(app.getHttpServer())
      .get('/search/flights')
      .query({ origin: 'THR', dest: 'MHD', date: oldDate });
    expect(
      (oldDateAfter.body.data as { flightInstanceId: string }[]).some(
        (r) => r.flightInstanceId === id,
      ),
    ).toBe(false);

    const newDateAfter = await request(app.getHttpServer())
      .get('/search/flights')
      .query({ origin: 'THR', dest: 'MHD', date: newDate });
    expect(
      (newDateAfter.body.data as { flightInstanceId: string }[]).some(
        (r) => r.flightInstanceId === id,
      ),
    ).toBe(true);
  });

  it('CEO pending-count increments only after operations approval', async () => {
    const { accessToken: ceo } = await loginAs(app, 'ceo');
    // Clear is not allowed — just assert endpoint shape; count is non-negative.
    const emptyish = await request(app.getHttpServer())
      .get('/pricing/proposals/pending-count')
      .set('Authorization', `Bearer ${ceo}`);
    expect(emptyish.status).toBe(200);
    expect(typeof emptyish.body.data.pendingApprovalsCount).toBe('number');
    expect(emptyish.body.data.pendingApprovalsCount).toBeGreaterThanOrEqual(0);

    const before = emptyish.body.data.pendingApprovalsCount as number;
    const { accessToken: comm } = await loginAs(app, 'comm');
    const created = await request(app.getHttpServer())
      .post('/flights')
      .set('Authorization', `Bearer ${comm}`)
      .send(payload());
    const beforeOps = await request(app.getHttpServer())
      .get('/pricing/proposals/pending-count')
      .set('Authorization', `Bearer ${ceo}`);
    expect(beforeOps.body.data.pendingApprovalsCount).toBe(before);

    await advanceToPendingCeo(app, created.body.data.id as string, comm);
    const after = await request(app.getHttpServer())
      .get('/pricing/proposals/pending-count')
      .set('Authorization', `Bearer ${ceo}`);
    expect(after.body.data.pendingApprovalsCount).toBe(before + 1);
  });

  it('CEO reject requires a reason but no step-up/OTP; unauthorized roles are 403; register is idempotent', async () => {
    const { accessToken: comm } = await loginAs(app, 'comm');
    const created = await request(app.getHttpServer())
      .post('/flights')
      .set('Authorization', `Bearer ${comm}`)
      .send(payload());
    const id = created.body.data.id as string;
    const proposal = await request(app.getHttpServer())
      .put(`/pricing/flights/${id}/proposal`)
      .set('Authorization', `Bearer ${comm}`)
      .send({ proposedPriceIrr: '39000000' });
    const proposalId = proposal.body.data.id as string;

    await advanceToPendingCeo(app, id, comm);

    const { accessToken: finance } = await loginAs(app, 'finance');
    const forbidden = await request(app.getHttpServer())
      .patch(`/pricing/proposals/${proposalId}/reject`)
      .set('Authorization', `Bearer ${finance}`)
      .send({ rejectionReason: 'nope' });
    expect(forbidden.status).toBe(403);

    const { accessToken: ceo } = await loginAs(app, 'ceo');
    const missingReason = await request(app.getHttpServer())
      .patch(`/pricing/proposals/${proposalId}/reject`)
      .set('Authorization', `Bearer ${ceo}`)
      .send({ rejectionReason: '   ' });
    expect(missingReason.status).toBe(400);

    // No stepUpChallengeId/stepUpCode required — a bare reason is enough.
    const rejectedNoStepUp = await request(app.getHttpServer())
      .patch(`/pricing/proposals/${proposalId}/reject`)
      .set('Authorization', `Bearer ${ceo}`)
      .send({ rejectionReason: '  نرخ نامناسب  ' });
    expect(rejectedNoStepUp.status).toBe(200);
    expect(rejectedNoStepUp.body.data.status).toBe('REJECTED');
    expect(rejectedNoStepUp.body.data.rejectionReason).toBe('نرخ نامناسب');

    const live = await dataSource
      .getRepository(FlightInstance)
      .createQueryBuilder('fi')
      .where('fi.id = :id', { id })
      .getOneOrFail();
    // Rejected first-cycle definition becomes REJECTED; capacity unchanged.
    expect(live.definitionStatus).toBe('REJECTED');
    expect(live.capacity).toBe(146);

    // Register path + idempotency — also no step-up/OTP required.
    const created3 = await request(app.getHttpServer())
      .post('/flights')
      .set('Authorization', `Bearer ${comm}`)
      .send(payload());
    const p3 = await request(app.getHttpServer())
      .put(`/pricing/flights/${created3.body.data.id}/proposal`)
      .set('Authorization', `Bearer ${comm}`)
      .send({ proposedPriceIrr: '39200000' });
    await advanceToPendingCeo(app, created3.body.data.id as string, comm);
    const r1 = await request(app.getHttpServer())
      .patch(`/pricing/proposals/${p3.body.data.id}/register`)
      .set('Authorization', `Bearer ${ceo}`)
      .send({ source: 'PROPOSED' });
    expect(r1.status).toBe(200);
    const r2 = await request(app.getHttpServer())
      .patch(`/pricing/proposals/${p3.body.data.id}/register`)
      .set('Authorization', `Bearer ${ceo}`)
      .send({ source: 'PROPOSED' });
    expect(r2.status).toBe(200);
    expect(r2.body.data.status).toBe('REGISTERED');
    expect(r2.body.data.registeredPriceIrr).toBe(
      r1.body.data.registeredPriceIrr,
    );
  });

  it('persists charge rules and does not invent mock commercial rows', async () => {
    const { accessToken: comm } = await loginAs(app, 'comm');
    const created = await request(app.getHttpServer())
      .post('/flights')
      .set('Authorization', `Bearer ${comm}`)
      .send(payload());
    const rules = await dataSource.getRepository(FlightChargeRule).find({
      where: { flightInstanceId: created.body.data.id },
    });
    expect(rules).toHaveLength(2);
    expect(rules.some((r) => r.cabin === 'BUSINESS')).toBe(true);
    expect(rules.some((r) => r.cabin == null)).toBe(true);

    // No auto-seeded bookings from definition create.
    const bookings = await dataSource.getRepository(Booking).count({
      where: { flightInstanceId: created.body.data.id },
    });
    expect(bookings).toBe(0);
  });

  it('DRAFT/ops-pending are hidden; CEO publish makes COMFORT searchable, bookable, and payable', async () => {
    const { accessToken: comm } = await loginAs(app, 'comm');
    const body = payload({ flightNo: uniqueFlightNo() });
    const created = await request(app.getHttpServer())
      .post('/flights')
      .set('Authorization', `Bearer ${comm}`)
      .send(body);
    expect(created.status).toBe(201);
    const id = created.body.data.id as string;
    const date = String(body.departureAt).slice(0, 10);

    const draftSearch = await request(app.getHttpServer())
      .get('/search/flights')
      .query({ origin: 'THR', dest: 'MHD', date });
    expect(draftSearch.status).toBe(200);
    expect(
      (draftSearch.body.data as { flightInstanceId: string }[]).some(
        (r) => r.flightInstanceId === id,
      ),
    ).toBe(false);

    const draftSeatmap = await request(app.getHttpServer()).get(
      `/search/flights/${id}/seatmap`,
    );
    expect(draftSeatmap.status).toBe(404);

    const proposal = await request(app.getHttpServer())
      .put(`/pricing/flights/${id}/proposal`)
      .set('Authorization', `Bearer ${comm}`)
      .send({ proposedPriceIrr: '39000000' });
    expect(proposal.status).toBe(200);

    await advanceToPendingCeo(app, id, comm);

    const { accessToken: ceo } = await loginAs(app, 'ceo');
    const reg = await request(app.getHttpServer())
      .patch(`/pricing/proposals/${proposal.body.data.id}/register`)
      .set('Authorization', `Bearer ${ceo}`)
      .send({ source: 'PROPOSED' });
    expect(reg.status).toBe(200);

    const visible = await request(app.getHttpServer())
      .patch(`/flights/${id}/sales-visibility`)
      .set('Authorization', `Bearer ${comm}`)
      .send({ enabled: true });
    expect(visible.status).toBe(200);

    const search = await request(app.getHttpServer())
      .get('/search/flights')
      .query({ origin: 'THR', dest: 'MHD', date, cabin: 'COMFORT' });
    expect(search.status).toBe(200);
    const row = (
      search.body.data as {
        flightInstanceId: string;
        definitionStatus: string;
        publishStatus: string;
        cabins: { cabin: string; seatsLeft: number }[];
      }[]
    ).find((r) => r.flightInstanceId === id);
    expect(row).toBeDefined();
    expect(row!.definitionStatus).toBe('PUBLISHED');
    expect(row!.publishStatus).toBe('PUBLISHED');
    const comfort = row!.cabins.find((c) => c.cabin === 'COMFORT');
    expect(comfort).toBeDefined();
    expect(comfort!.seatsLeft).toBeGreaterThan(0);

    const definitionAfterApproval = await request(app.getHttpServer())
      .get(`/flights/${id}/definition`)
      .set('Authorization', `Bearer ${comm}`);
    expect(definitionAfterApproval.body.data.definitionStatus).toBe(
      'PUBLISHED',
    );
    expect(definitionAfterApproval.body.data.publishStatus).toBe('PUBLISHED');

    const seatmap = await request(app.getHttpServer()).get(
      `/search/flights/${id}/seatmap`,
    );
    expect(seatmap.status).toBe(200);
    const comfortSeat = (
      seatmap.body.data.seats as { seatCode: string; cabin: string }[]
    ).find((s) => s.cabin === 'COMFORT');
    expect(comfortSeat?.seatCode).toMatch(
      /^7[A-F]$|^8[A-F]$|^9[A-F]$|^10[A-F]$/,
    );

    const { accessToken: customer } = await loginAsCustomer(app, '09138880001');
    const book = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${customer}`)
      .send({
        flightInstanceId: id,
        cabin: 'COMFORT',
        passengers: [
          {
            fullName: 'مسافر کامفورت',
            nationalId: '0012345679',
            seatCode: comfortSeat!.seatCode,
          },
        ],
      });
    expect(book.status).toBe(201);
    expect(book.body.data.status).toBe('HELD');
    expect(book.body.data.cabin).toBe('COMFORT');
    expect(typeof book.body.data.priceIrr).toBe('string');
    expect(typeof book.body.data.taxIrr).toBe('string');

    const pay = await request(app.getHttpServer())
      .post(`/bookings/${book.body.data.id}/pay`)
      .set('Authorization', `Bearer ${customer}`)
      .set('idempotency-key', `flight-definition-pay-${id}`)
      .send({ paymentMethod: 'GATEWAY' });
    expect(pay.status).toBe(201);
    expect(pay.body.data.priceChanged).toBe(false);
    expect(pay.body.data.booking.status).toBe('TICKETED');
    expect(pay.body.data.booking.pnr).toBe(book.body.data.pnr);

    const ticket = await request(app.getHttpServer())
      .get(`/bookings/pnr/${book.body.data.pnr}`)
      .set('Authorization', `Bearer ${customer}`);
    expect(ticket.status).toBe(200);
    expect(ticket.body.data.status).toBe('TICKETED');
    expect(ticket.body.data.flightInstanceId).toBe(id);
  });

  it('rejects flight numbers with leading/trailing spaces', async () => {
    const { accessToken } = await loginAs(app, 'comm');
    for (const flightNo of [' XY1234', 'XY1234 ', ' XY1234 ']) {
      const res = await request(app.getHttpServer())
        .post('/flights')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(payload({ flightNo }));
      expect(res.status).toBe(400);
    }
  });
});
