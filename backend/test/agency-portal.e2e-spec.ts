import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as crypto from 'node:crypto';
import * as argon2 from 'argon2';
import { DataSource } from 'typeorm';
import { AgencyApiKey } from '../src/database/entities/agency-api-key.entity';
import { AgencyCreditLine } from '../src/database/entities/agency-credit-line.entity';
import { AgencyDocument } from '../src/database/entities/agency-document.entity';
import { AgencyMembershipRequest } from '../src/database/entities/agency-membership-request.entity';
import { AgencyProfile } from '../src/database/entities/agency-profile.entity';
import { Booking } from '../src/database/entities/booking.entity';
import { FlightInstance } from '../src/database/entities/flight-instance.entity';
import { LedgerEntry } from '../src/database/entities/ledger-entry.entity';
import { Passenger } from '../src/database/entities/passenger.entity';
import { StoredFile } from '../src/database/entities/stored-file.entity';
import { User } from '../src/database/entities/user.entity';
import { AgencyAllotment } from '../src/database/entities/agency-allotment.entity';
import { loginAs, stepUpFor } from './helpers/login.helper';
import { createTestApp } from './helpers/app.helper';

const AGENCY_PASSWORD = 'AgencyTest@123';

type FreeSeat = {
  seatCode: string;
  cabin: 'ECONOMY' | 'COMFORT' | 'BUSINESS' | 'FIRST';
};

describe('Agency Portal (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  beforeEach(async () => {
    delete process.env.AUTH_SANDBOX_ENABLED;
    app = await createTestApp();
    dataSource = app.get(DataSource);
  });

  afterEach(async () => {
    delete process.env.AUTH_SANDBOX_ENABLED;
    await app.close();
  });

  function auth(token: string | null | undefined) {
    return `Bearer ${token}`;
  }

  /** A throwaway agency with a real password, independent of the seed's
   * shared-dev-password agencies, so login tests don't depend on seed order. */
  async function createFreshAgency(overrides?: { limitIrr?: number }) {
    const suffix = crypto.randomUUID().slice(0, 8);
    // Real random digits — the hex→'0' mapping collided on the unique phone column.
    const phone = `+9891${crypto.randomInt(10_000_000, 100_000_000)}`;
    const passwordHash = await argon2.hash(AGENCY_PASSWORD);
    const userRepo = dataSource.getRepository(User);
    const user = await userRepo.save(
      userRepo.create({
        role: 'AGENCY',
        phone,
        fullName: `آژانس تست ${suffix}`,
        passwordHash,
        isActive: true,
        updatedAt: new Date(),
      }),
    );
    const agencyProfileRepo = dataSource.getRepository(AgencyProfile);
    await agencyProfileRepo.save(
      agencyProfileRepo.create({
        userId: user.id,
        licenseNo: `AG-TEST-${suffix}`,
        managerName: 'مدیر تست',
        phone,
        email: `${suffix}@test.example`,
        city: 'تهران',
        address: 'آدرس تست',
        tier: 'NORMAL',
      }),
    );
    const creditLineRepo = dataSource.getRepository(AgencyCreditLine);
    await creditLineRepo.save(
      creditLineRepo.create({
        agencyId: user.id,
        limitIrr: BigInt(overrides?.limitIrr ?? 1_000_000_000),
        updatedAt: new Date(),
      }),
    );
    return { id: user.id, phone };
  }

  async function loginAsAgency(phone: string, password = AGENCY_PASSWORD) {
    const res = await request(app.getHttpServer())
      .post('/auth/agency/login')
      .send({ phone, password });
    return {
      res,
      accessToken: res.body?.data?.accessToken as string | undefined,
    };
  }

  async function findSellableInstanceWithFreeSeats(minimum: number) {
    const instances = await dataSource
      .getRepository(FlightInstance)
      .createQueryBuilder('instance')
      .where('instance.status = :status', { status: 'SCHEDULED' })
      .andWhere(
        `(instance."definitionStatus" IN ('PUBLISHED', 'APPROVED') OR instance."approvedSnapshot" IS NOT NULL)`,
      )
      .getMany();

    for (const instance of instances) {
      await dataSource
        .createQueryBuilder()
        .update(FlightInstance)
        .set({
          saleStartsAt: null,
          saleEndsAt: null,
          publicSaleEnabled: true,
          agencySaleEnabled: true,
          commercialPanelSettings: () =>
            `jsonb_set(COALESCE("commercialPanelSettings", '{}'::jsonb), '{siteVisible}', 'true'::jsonb, true)`,
        })
        .where('id = :id', { id: instance.id })
        .execute();
      const seatMap = await request(app.getHttpServer()).get(
        `/search/flights/${instance.id}/seatmap`,
      );
      const freeSeats = (seatMap.body?.data?.seats ?? []).filter(
        (candidate: { status: string }) => candidate.status === 'FREE',
      ) as FreeSeat[];
      if (freeSeats.length >= minimum) return { instance, freeSeats };
    }

    throw new Error(
      `No public sellable flight has ${minimum} free test seat(s).`,
    );
  }

  async function addAgencySale(agencyId: string, amountIrr: number) {
    const instance = await dataSource
      .getRepository(FlightInstance)
      .createQueryBuilder('fi')
      .getOne();
    if (!instance) throw new Error('seed flightInstance missing');
    const bookingRepo = dataSource.getRepository(Booking);
    const booking = await bookingRepo.save(
      bookingRepo.create({
        pnr: `TST${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
        flightInstanceId: instance.id,
        channel: 'AGENCY',
        agencyId,
        status: 'TICKETED',
        priceIrr: BigInt(amountIrr),
      }),
    );
    const ledgerRepo = dataSource.getRepository(LedgerEntry);
    await ledgerRepo.save(
      ledgerRepo.create({
        bookingId: booking.id,
        agencyId,
        type: 'SALE',
        signedAmountIrr: BigInt(amountIrr),
      }),
    );
    await dataSource.getRepository(Passenger).save(
      dataSource.getRepository(Passenger).create({
        bookingId: booking.id,
        fullName: 'مسافر گزارش آژانس',
        passengerType: 'ADULT',
        gender: null,
        seatCode: null,
        extraSeatCode: null,
        extraSeatRequested: false,
        occupiesSeat: true,
        fareIrr: BigInt(amountIrr),
        taxIrr: 0n,
        extraSeatFareIrr: 0n,
        ticketNo: `780${crypto.randomInt(1_000_000_000, 10_000_000_000)}`,
        ticketIssuedAt: new Date(),
      }),
    );
    return booking;
  }

  // ── Login ──────────────────────────────────────────────────────────────

  it('sandbox agency login requires 123456 before issuing tokens', async () => {
    process.env.AUTH_SANDBOX_ENABLED = 'true';
    const agency = await createFreshAgency();
    const login = await request(app.getHttpServer())
      .post('/auth/agency/login')
      .send({ phone: agency.phone, password: AGENCY_PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.data.loginMode).toBe('TWO_FACTOR');
    expect(login.body.data.accessToken).toBeUndefined();

    const verify = await request(app.getHttpServer())
      .post('/auth/agency/login/verify')
      .send({ challengeId: login.body.data.challengeId, code: '123456' });
    expect(verify.status).toBe(200);
    expect(verify.body.data.user.role).toBe('AGENCY');
    expect(verify.body.data.accessToken).toBeTruthy();
  });

  it('sandbox agency first-login activation sets a chosen password then verifies OTP', async () => {
    process.env.AUTH_SANDBOX_ENABLED = 'true';
    const agency = await createFreshAgency();
    await dataSource
      .getRepository(User)
      .update(
        { id: agency.id },
        { mustChangePassword: true, lastLoginAt: null },
      );

    const setup = await request(app.getHttpServer())
      .post('/auth/agency/first-login/request')
      .send({ phone: agency.phone, newPassword: 'AgencyNew@1405' });
    expect(setup.status).toBe(200);
    const verify = await request(app.getHttpServer())
      .post('/auth/agency/login/verify')
      .send({ challengeId: setup.body.data.challengeId, code: '123456' });
    expect(verify.status).toBe(200);
    expect(verify.body.data.user.mustChangePassword).toBe(false);
  });

  it('POST /auth/agency/login: phone+password, no 2FA, issues tokens directly', async () => {
    const agency = await createFreshAgency();
    const { res, accessToken } = await loginAsAgency(agency.phone);
    expect(res.status).toBe(200);
    expect(accessToken).toBeTruthy();
    expect(res.body.data.user.role).toBe('AGENCY');
  });

  it('POST /auth/agency/login: 401 on wrong password', async () => {
    const agency = await createFreshAgency();
    const { res } = await loginAsAgency(agency.phone, 'wrong-password');
    expect(res.status).toBe(401);
  });

  it('POST /auth/agency/login: 401 for a non-AGENCY phone (staff never has this role)', async () => {
    const { res } = await loginAsAgency('+989120000001', AGENCY_PASSWORD);
    expect(res.status).toBe(401);
  });

  it('POST /auth/agency/login: 403 when the agency is suspended', async () => {
    const agency = await createFreshAgency();
    await dataSource
      .getRepository(AgencyProfile)
      .update(
        { userId: agency.id },
        { suspendedAt: new Date(), suspendReason: 'test' },
      );
    const { res } = await loginAsAgency(agency.phone);
    expect(res.status).toBe(403);
  });

  it('suspending an agency revokes its live session — a pre-existing refresh cookie stops working immediately', async () => {
    const agency = await createFreshAgency();
    const agent = request.agent(app.getHttpServer());
    const loginRes = await agent
      .post('/auth/agency/login')
      .send({ phone: agency.phone, password: AGENCY_PASSWORD });
    expect(loginRes.status).toBe(200);

    // The refresh token issued above is still valid at this point.
    const refreshBeforeSuspend = await agent.post('/auth/refresh');
    expect(refreshBeforeSuspend.status).toBe(200);

    const senior = await loginAs(app, 'senior');
    const suspendRes = await request(app.getHttpServer())
      .patch(`/agencies/${agency.id}/suspend`)
      .set('Authorization', auth(senior.accessToken))
      .send({ reason: 'تست امنیتی' });
    expect(suspendRes.status).toBe(200);

    // The already-issued (and just-rotated) refresh cookie must now fail —
    // suspension must not require a global logout-all to take effect.
    const refreshAfterSuspend = await agent.post('/auth/refresh');
    expect(refreshAfterSuspend.status).toBe(401);
    expect(refreshAfterSuspend.body.success).toBe(false);
  });

  it('approving a membership request issues a one-time temp password that logs in', async () => {
    const commercial = await loginAs(app, 'comm');
    const finance = await loginAs(app, 'finance');
    const suffix = crypto.randomUUID().slice(0, 6);
    const membershipRepo = dataSource.getRepository(AgencyMembershipRequest);
    const reqRow = await membershipRepo.save(
      membershipRepo.create({
        applicantName: `آژانس جدید ${suffix}`,
        managerName: 'مدیر جدید',
        licenseNo: `AG-NEW-${suffix}`,
        city: 'شیراز',
        phone: `+9892${crypto.randomInt(10_000_000, 100_000_000)}`,
        email: `${suffix}@new.example`,
        status: 'PENDING',
      }),
    );
    const commercialApproval = await request(app.getHttpServer())
      .patch(`/agencies/requests/${reqRow.id}/approve`)
      .set('Authorization', auth(commercial.accessToken));
    expect(commercialApproval.status).toBe(200);
    expect(commercialApproval.body.data.stage).toBe('AWAITING_FINANCE');

    const approveRes = await request(app.getHttpServer())
      .patch(`/agencies/requests/${reqRow.id}/approve`)
      .set('Authorization', auth(finance.accessToken));
    expect(approveRes.status).toBe(200);
    const tempPassword = approveRes.body.data.tempPassword as string;
    expect(tempPassword).toBeTruthy();

    const { res, accessToken } = await loginAsAgency(
      reqRow.phone,
      tempPassword,
    );
    expect(res.status).toBe(200);
    expect(accessToken).toBeTruthy();
  });

  // ── Ownership isolation ──────────────────────────────────────────────

  it('a staff JWT gets 403 on /agency-portal/* (AGENCY-only)', async () => {
    const senior = await loginAs(app, 'senior');
    const res = await request(app.getHttpServer())
      .get('/agency-portal/dashboard')
      .set('Authorization', auth(senior.accessToken));
    expect(res.status).toBe(403);
  });

  it('agency A cannot pay agency B invoice (404, ownership implicit via JWT)', async () => {
    const a = await createFreshAgency();
    const b = await createFreshAgency();
    const commercial = await loginAs(app, 'comm');
    const issueRes = await request(app.getHttpServer())
      .post(`/agencies/${b.id}/invoices`)
      .set('Authorization', auth(commercial.accessToken))
      .send({ amountIrr: 1_000_000, dueAt: new Date().toISOString() });
    expect(issueRes.status).toBe(201);

    const { accessToken } = await loginAsAgency(a.phone);
    const payRes = await request(app.getHttpServer())
      .post(`/agency-portal/invoices/${issueRes.body.data.id}/pay`)
      .set('Authorization', auth(accessToken));
    expect(payRes.status).toBe(404);
  });

  // ── Dashboard / credit / invoices ────────────────────────────────────

  it('GET /agency-portal/dashboard returns real, self-scoped KPIs', async () => {
    const agency = await createFreshAgency();
    await addAgencySale(agency.id, 50_000_000);
    const { accessToken } = await loginAsAgency(agency.phone);
    const res = await request(app.getHttpServer())
      .get('/agency-portal/dashboard')
      .set('Authorization', auth(accessToken));
    expect(res.status).toBe(200);
    // Money fields are decimal STRINGs on the wire (BigInt.prototype.toJSON)
    // — parse for a numeric comparison; individual amounts here are far
    // below 2^53 so Number() loses no precision for this display-only check.
    expect(Number(res.body.data.kpis.salesThisMonthIrr)).toBeGreaterThanOrEqual(
      50_000_000,
    );
    expect(res.body.data.monthlySales).toHaveLength(6);
    expect(res.body.data.credit.limitIrr).toBe('1000000000');
  });

  it('GET /agency-portal/credit matches the staff-side derivation', async () => {
    const agency = await createFreshAgency({ limitIrr: 700_000_000 });
    await addAgencySale(agency.id, 100_000_000);
    const { accessToken } = await loginAsAgency(agency.phone);
    const res = await request(app.getHttpServer())
      .get('/agency-portal/credit')
      .set('Authorization', auth(accessToken));
    expect(res.body.data).toEqual({
      limitIrr: '700000000',
      usedIrr: '100000000',
      remainingIrr: '600000000',
    });
  });

  it('POST /agency-portal/invoices/:id/pay: settles via the same transactional logic, 409 on double-pay', async () => {
    const agency = await createFreshAgency();
    const commercial = await loginAs(app, 'comm');
    const issueRes = await request(app.getHttpServer())
      .post(`/agencies/${agency.id}/invoices`)
      .set('Authorization', auth(commercial.accessToken))
      .send({ amountIrr: 20_000_000, dueAt: new Date().toISOString() });
    const invoiceId = issueRes.body.data.id;

    const { accessToken } = await loginAsAgency(agency.phone);
    const payRes = await request(app.getHttpServer())
      .post(`/agency-portal/invoices/${invoiceId}/pay`)
      .set('Authorization', auth(accessToken));
    expect(payRes.status).toBe(201);
    expect(payRes.body.data.status).toBe('PAID');

    const doublePayRes = await request(app.getHttpServer())
      .post(`/agency-portal/invoices/${invoiceId}/pay`)
      .set('Authorization', auth(accessToken));
    expect(doublePayRes.status).toBe(409);
  });

  // ── Credit requests ───────────────────────────────────────────────────

  it('POST /agency-portal/credit-requests: 400 when not exceeding the current limit', async () => {
    const agency = await createFreshAgency({ limitIrr: 500_000_000 });
    const { accessToken } = await loginAsAgency(agency.phone);
    const res = await request(app.getHttpServer())
      .post('/agency-portal/credit-requests')
      .set('Authorization', auth(accessToken))
      .send({ requestedLimitIrr: 500_000_000 });
    expect(res.status).toBe(400);
  });

  it('credit-request approval actually changes the limit via the real updateCredit path; reject leaves it untouched', async () => {
    const agency = await createFreshAgency({ limitIrr: 500_000_000 });
    const { accessToken } = await loginAsAgency(agency.phone);
    const createRes = await request(app.getHttpServer())
      .post('/agency-portal/credit-requests')
      .set('Authorization', auth(accessToken))
      .send({ requestedLimitIrr: 900_000_000, note: 'رشد فروش' });
    expect(createRes.status).toBe(201);
    const requestId = createRes.body.data.id;

    const finance = await loginAs(app, 'finance');
    const approveRes = await request(app.getHttpServer())
      .patch(`/agencies/${agency.id}/credit-requests/${requestId}/decide`)
      .set('Authorization', auth(finance.accessToken))
      .send({ approve: true });
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.status).toBe('APPROVED');

    const creditRes = await request(app.getHttpServer())
      .get(`/agencies/${agency.id}/credit`)
      .set('Authorization', auth(finance.accessToken));
    expect(creditRes.body.data.limitIrr).toBe('900000000');

    const redecideRes = await request(app.getHttpServer())
      .patch(`/agencies/${agency.id}/credit-requests/${requestId}/decide`)
      .set('Authorization', auth(finance.accessToken))
      .send({ approve: false });
    expect(redecideRes.status).toBe(409);
  });

  it('rejecting a credit request leaves the limit unchanged', async () => {
    const agency = await createFreshAgency({ limitIrr: 500_000_000 });
    const { accessToken } = await loginAsAgency(agency.phone);
    const createRes = await request(app.getHttpServer())
      .post('/agency-portal/credit-requests')
      .set('Authorization', auth(accessToken))
      .send({ requestedLimitIrr: 900_000_000 });

    const finance = await loginAs(app, 'finance');
    const rejectRes = await request(app.getHttpServer())
      .patch(
        `/agencies/${agency.id}/credit-requests/${createRes.body.data.id}/decide`,
      )
      .set('Authorization', auth(finance.accessToken))
      .send({ approve: false });
    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.data.status).toBe('REJECTED');

    const creditRes = await request(app.getHttpServer())
      .get(`/agencies/${agency.id}/credit`)
      .set('Authorization', auth(finance.accessToken));
    expect(creditRes.body.data.limitIrr).toBe('500000000');
  });

  // ── Sales & inbox ─────────────────────────────────────────────────────

  it("GET /agency-portal/sales: only this agency's bookings, real KPIs", async () => {
    const agency = await createFreshAgency();
    const other = await createFreshAgency();
    await addAgencySale(agency.id, 30_000_000);
    await addAgencySale(other.id, 999_000_000);

    const { accessToken } = await loginAsAgency(agency.phone);
    const res = await request(app.getHttpServer())
      .get('/agency-portal/sales')
      .set('Authorization', auth(accessToken));
    expect(res.status).toBe(200);
    expect(res.body.data.tickets).toHaveLength(1);
    expect(res.body.data.summary.totalSalesIrr).toBe('30000000');
  });

  it('inbox: agency can read and post, posted messages are senderIsAgency=true, staff sees them', async () => {
    const agency = await createFreshAgency();
    const { accessToken } = await loginAsAgency(agency.phone);
    const postRes = await request(app.getHttpServer())
      .post('/agency-portal/inbox')
      .set('Authorization', auth(accessToken))
      .send({ body: 'سلام، این پیام از آژانس است.' });
    expect(postRes.status).toBe(201);
    expect(postRes.body.data.senderIsAgency).toBe(true);

    const commercial = await loginAs(app, 'comm');
    const staffRes = await request(app.getHttpServer())
      .get(`/agencies/${agency.id}/messages`)
      .set('Authorization', auth(commercial.accessToken));
    expect(
      staffRes.body.data.some(
        (m: { senderIsAgency: boolean }) => m.senderIsAgency,
      ),
    ).toBe(true);
  });

  it('support tickets: agency can create and list an agency-department ticket', async () => {
    const agency = await createFreshAgency();
    const { accessToken } = await loginAsAgency(agency.phone);

    const createRes = await request(app.getHttpServer())
      .post('/my/support-tickets')
      .set('Authorization', auth(accessToken))
      .send({
        requesterName: 'آژانس تست',
        requesterPhone: agency.phone,
        subject: 'خطا در صدور بلیط',
        body: 'پس از پرداخت بلیط صادر نشد.',
      });
    expect(createRes.status).toBe(201);

    const listRes = await request(app.getHttpServer())
      .get('/my/support-tickets')
      .set('Authorization', auth(accessToken));
    expect(listRes.status).toBe(200);
    expect(listRes.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: createRes.body.data.id,
          subject: 'خطا در صدور بلیط',
        }),
      ]),
    );

    const siteAdmin = await loginAs(app, 'site.admin');
    const adminList = await request(app.getHttpServer())
      .get('/support-tickets?dept=AGENCY')
      .set('Authorization', auth(siteAdmin.accessToken));
    expect(adminList.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: createRes.body.data.id,
          dept: 'AGENCY',
        }),
      ]),
    );
  });

  // ── Profile ───────────────────────────────────────────────────────────

  it('GET /agency-portal/profile: own fields only, no audit-log leakage', async () => {
    const agency = await createFreshAgency();
    const { accessToken } = await loginAsAgency(agency.phone);
    const res = await request(app.getHttpServer())
      .get('/agency-portal/profile')
      .set('Authorization', auth(accessToken));
    expect(res.status).toBe(200);
    expect(res.body.data.licenseNo).toMatch(/^AG-TEST-/);
    expect(res.body.data.isTemporaryReadOnly).toBe(false);
    expect(res.body.data.recentActivity).toBeUndefined();
    expect(res.body.data.activityScore).toBeUndefined();
  });

  // ── Webservice (B2B API) purchase requests ──────────────────────────────

  it('POST /agency-portal/webservice-requests: 401 without auth, 400 on invalid months', async () => {
    const noAuth = await request(app.getHttpServer())
      .post('/agency-portal/webservice-requests')
      .send({ scope: 'SEARCH_BOOK', months: 1 });
    expect(noAuth.status).toBe(401);

    const agency = await createFreshAgency();
    const { accessToken } = await loginAsAgency(agency.phone);
    const badMonths = await request(app.getHttpServer())
      .post('/agency-portal/webservice-requests')
      .set('Authorization', auth(accessToken))
      .send({ scope: 'SEARCH_BOOK', months: 6 });
    expect(badMonths.status).toBe(400);
  });

  it('creates a PENDING request with a server-computed price, visible in both the portal and staff views', async () => {
    const agency = await createFreshAgency();
    const { accessToken } = await loginAsAgency(agency.phone);
    const createRes = await request(app.getHttpServer())
      .post('/agency-portal/webservice-requests')
      .set('Authorization', auth(accessToken))
      .send({ scope: 'SEARCH_BOOK', months: 3, note: 'اتصال آزمایشی' });
    expect(createRes.status).toBe(201);
    expect(createRes.body.data.status).toBe('PENDING');
    expect(createRes.body.data.priceIrr).toBe('120000000');

    const mineRes = await request(app.getHttpServer())
      .get('/agency-portal/webservice-requests')
      .set('Authorization', auth(accessToken));
    expect(mineRes.body.data).toHaveLength(1);
    expect(mineRes.body.data[0].id).toBe(createRes.body.data.id);

    const finance = await loginAs(app, 'finance');
    const staffRes = await request(app.getHttpServer())
      .get(`/agencies/${agency.id}/webservice-requests`)
      .set('Authorization', auth(finance.accessToken));
    expect(staffRes.status).toBe(200);
    expect(staffRes.body.data).toHaveLength(1);
    expect(staffRes.body.data[0].priceIrr).toBe('120000000');
  });

  it('rejects a client-supplied price outright (whitelist DTO) — price always comes from the plan catalog', async () => {
    const agency = await createFreshAgency();
    const { accessToken } = await loginAsAgency(agency.phone);
    const rejectedRes = await request(app.getHttpServer())
      .post('/agency-portal/webservice-requests')
      .set('Authorization', auth(accessToken))
      .send({ scope: 'FULL', months: 12, priceIrr: 1 });
    expect(rejectedRes.status).toBe(400);

    const createRes = await request(app.getHttpServer())
      .post('/agency-portal/webservice-requests')
      .set('Authorization', auth(accessToken))
      .send({ scope: 'FULL', months: 12 });
    expect(createRes.status).toBe(201);
    expect(createRes.body.data.priceIrr).toBe('420000000');
  });

  it('approval issues a real API key, delivers the raw key once via the inbox, and self-service reads never expose it', async () => {
    const agency = await createFreshAgency();
    const { accessToken } = await loginAsAgency(agency.phone);
    const createRes = await request(app.getHttpServer())
      .post('/agency-portal/webservice-requests')
      .set('Authorization', auth(accessToken))
      .send({ scope: 'SEARCH_BOOK', months: 1 });
    const requestId = createRes.body.data.id;

    const senior = await loginAs(app, 'senior');
    const stepUp = await stepUpFor(
      app,
      senior.accessToken!,
      'senior',
      'API_KEY_ROTATE',
    );
    const approveRes = await request(app.getHttpServer())
      .patch(`/agencies/${agency.id}/webservice-requests/${requestId}/decide`)
      .set('Authorization', auth(senior.accessToken))
      .send({ approve: true, ...stepUp });
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.request.status).toBe('APPROVED');
    expect(approveRes.body.data.apiKey.rawKey).toMatch(/^bjk_/);
    expect(approveRes.body.data.apiKey).not.toHaveProperty('keyHash');

    const keyRow = await dataSource.getRepository(AgencyApiKey).findOne({
      where: { agencyId: agency.id },
      order: { activatedAt: 'DESC' },
    });
    expect(keyRow?.scope).toBe('SEARCH_BOOK');

    const inboxRes = await request(app.getHttpServer())
      .get('/agency-portal/inbox')
      .set('Authorization', auth(accessToken));
    const approvalMessage = inboxRes.body.data.find((m: { body: string }) =>
      m.body.includes('درخواست وب‌سرویس شما تأیید شد'),
    );
    expect(approvalMessage).toBeDefined();
    expect(approvalMessage.body).not.toContain('bjk_');

    const apiKeysRes = await request(app.getHttpServer())
      .get('/agency-portal/api-keys')
      .set('Authorization', auth(accessToken));
    expect(apiKeysRes.status).toBe(200);
    expect(apiKeysRes.body.data).toHaveLength(1);
    expect(apiKeysRes.body.data[0]).not.toHaveProperty('keyHash');
    expect(apiKeysRes.body.data[0]).not.toHaveProperty('rawKey');

    const redecideRes = await request(app.getHttpServer())
      .patch(`/agencies/${agency.id}/webservice-requests/${requestId}/decide`)
      .set('Authorization', auth(senior.accessToken))
      .send({ approve: false });
    expect(redecideRes.status).toBe(409);
  });

  it('rejecting a webservice request issues no key and leaves the request REJECTED', async () => {
    const agency = await createFreshAgency();
    const { accessToken } = await loginAsAgency(agency.phone);
    const createRes = await request(app.getHttpServer())
      .post('/agency-portal/webservice-requests')
      .set('Authorization', auth(accessToken))
      .send({ scope: 'FULL', months: 1 });

    const commercial = await loginAs(app, 'comm');
    const rejectRes = await request(app.getHttpServer())
      .patch(
        `/agencies/${agency.id}/webservice-requests/${createRes.body.data.id}/decide`,
      )
      .set('Authorization', auth(commercial.accessToken))
      .send({ approve: false });
    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.data.request.status).toBe('REJECTED');

    const keyRow = await dataSource
      .getRepository(AgencyApiKey)
      .findOneBy({ agencyId: agency.id });
    expect(keyRow).toBeNull();
  });

  it('approving with a wrong step-up code leaves the request PENDING (never approved without a real key)', async () => {
    const agency = await createFreshAgency();
    const { accessToken } = await loginAsAgency(agency.phone);
    const createRes = await request(app.getHttpServer())
      .post('/agency-portal/webservice-requests')
      .set('Authorization', auth(accessToken))
      .send({ scope: 'SEARCH_BOOK', months: 1 });
    const requestId = createRes.body.data.id;

    const senior = await loginAs(app, 'senior');
    const stepUp = await stepUpFor(
      app,
      senior.accessToken!,
      'senior',
      'API_KEY_ROTATE',
    );
    const badRes = await request(app.getHttpServer())
      .patch(`/agencies/${agency.id}/webservice-requests/${requestId}/decide`)
      .set('Authorization', auth(senior.accessToken))
      .send({
        approve: true,
        stepUpChallengeId: stepUp.stepUpChallengeId,
        stepUpCode: '000000',
      });
    expect(badRes.status).toBe(401);

    const mineRes = await request(app.getHttpServer())
      .get('/agency-portal/webservice-requests')
      .set('Authorization', auth(accessToken));
    expect(mineRes.body.data[0].status).toBe('PENDING');
  });

  it('GET .../webservice-requests and decide are 403 for a non-AGENCY_TAB staff role', async () => {
    const agency = await createFreshAgency();
    const employee = await loginAs(app, 'com.ahmadi');
    const res = await request(app.getHttpServer())
      .get(`/agencies/${agency.id}/webservice-requests`)
      .set('Authorization', auth(employee.accessToken));
    expect(res.status).toBe(403);
  });

  // ── Document review (staff-side) ────────────────────────────────────────

  async function seedDocument(agencyId: string) {
    const storedFileRepo = dataSource.getRepository(StoredFile);
    const stored = await storedFileRepo.save(
      storedFileRepo.create({
        ownerId: agencyId,
        fileName: 'مجوز-فعالیت.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 12_345,
        path: `/tmp/test-${crypto.randomUUID()}.pdf`,
      }),
    );
    const agencyDocumentRepo = dataSource.getRepository(AgencyDocument);
    return agencyDocumentRepo.save(
      agencyDocumentRepo.create({
        agencyId,
        fileId: stored.id,
        docType: 'LICENSE',
      }),
    );
  }

  it('GET /agencies/:id/documents lists uploaded documents PENDING by default', async () => {
    const agency = await createFreshAgency();
    const doc = await seedDocument(agency.id);
    const senior = await loginAs(app, 'senior');
    const res = await request(app.getHttpServer())
      .get(`/agencies/${agency.id}/documents`)
      .set('Authorization', auth(senior.accessToken));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(doc.id);
    expect(res.body.data[0].status).toBe('PENDING');
    expect(res.body.data[0].file.fileName).toBe('مجوز-فعالیت.pdf');
  });

  it('PATCH /agencies/:id/documents/:docId/decide approves/rejects; re-deciding 409s; wrong agency 404s', async () => {
    const agency = await createFreshAgency();
    const otherAgency = await createFreshAgency();
    const doc = await seedDocument(agency.id);
    const senior = await loginAs(app, 'senior');

    const wrongAgencyRes = await request(app.getHttpServer())
      .patch(`/agencies/${otherAgency.id}/documents/${doc.id}/decide`)
      .set('Authorization', auth(senior.accessToken))
      .send({ approve: true });
    expect(wrongAgencyRes.status).toBe(404);

    const approveRes = await request(app.getHttpServer())
      .patch(`/agencies/${agency.id}/documents/${doc.id}/decide`)
      .set('Authorization', auth(senior.accessToken))
      .send({ approve: true });
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.status).toBe('APPROVED');

    const redecideRes = await request(app.getHttpServer())
      .patch(`/agencies/${agency.id}/documents/${doc.id}/decide`)
      .set('Authorization', auth(senior.accessToken))
      .send({ approve: false });
    expect(redecideRes.status).toBe(409);
  });

  it('GET .../documents and decide are 403 for a non-AGENCY_TAB staff role', async () => {
    const agency = await createFreshAgency();
    const doc = await seedDocument(agency.id);
    const employee = await loginAs(app, 'com.ahmadi');

    const listRes = await request(app.getHttpServer())
      .get(`/agencies/${agency.id}/documents`)
      .set('Authorization', auth(employee.accessToken));
    expect(listRes.status).toBe(403);

    const decideRes = await request(app.getHttpServer())
      .patch(`/agencies/${agency.id}/documents/${doc.id}/decide`)
      .set('Authorization', auth(employee.accessToken))
      .send({ approve: true });
    expect(decideRes.status).toBe(403);
  });

  it('issues one ticket from the owned allotment and charges agency credit idempotently', async () => {
    const agency = await createFreshAgency({ limitIrr: 1_000_000_000 });
    const agencyLogin = await loginAsAgency(agency.phone);
    const commercial = await dataSource
      .getRepository(User)
      .findOneByOrFail({ username: 'comm' });
    const { instance, freeSeats } =
      await findSellableInstanceWithFreeSeats(1);
    const allotmentRepo = dataSource.getRepository(AgencyAllotment);
    const allotment = await allotmentRepo.save(
      allotmentRepo.create({
        agencyId: agency.id,
        flightInstanceId: instance.id,
        seatsAllocated: 1,
        type: 'HARD',
        releaseAt: null,
        contractPriceIrr: 10_000_000n,
        createdById: commercial.id,
      }),
    );
    const [seat] = freeSeats;

    const key = crypto.randomUUID();
    const body = {
      cabin: seat.cabin,
      passengers: [{ fullName: 'مسافر واقعی تست', seatCode: seat.seatCode }],
    };
    const first = await request(app.getHttpServer())
      .post(`/agency-portal/allotments/${allotment.id}/bookings`)
      .set('Authorization', auth(agencyLogin.accessToken))
      .set('Idempotency-Key', key)
      .send(body);
    expect(first.status).toBe(201);
    expect(first.body.data.status).toBe('TICKETED');
    expect(first.body.data.allotmentId).toBe(allotment.id);

    const second = await request(app.getHttpServer())
      .post(`/agency-portal/allotments/${allotment.id}/bookings`)
      .set('Authorization', auth(agencyLogin.accessToken))
      .set('Idempotency-Key', key)
      .send(body);
    expect(second.status).toBe(201);
    expect(second.body.data.id).toBe(first.body.data.id);
    expect(
      await dataSource.getRepository(LedgerEntry).countBy({
        bookingId: first.body.data.id as string,
        type: 'SALE',
      }),
    ).toBe(1);
  });

  it('rejects another agency, released allotments, and insufficient credit', async () => {
    const owner = await createFreshAgency();
    const other = await createFreshAgency();
    const ownerLogin = await loginAsAgency(owner.phone);
    const otherLogin = await loginAsAgency(other.phone);
    const commercial = await dataSource
      .getRepository(User)
      .findOneByOrFail({ username: 'comm' });
    const { instance, freeSeats } =
      await findSellableInstanceWithFreeSeats(1);
    const allotmentRepo = dataSource.getRepository(AgencyAllotment);
    const allotment = await allotmentRepo.save(
      allotmentRepo.create({
        agencyId: owner.id,
        flightInstanceId: instance.id,
        seatsAllocated: 1,
        type: 'HARD',
        releaseAt: null,
        contractPriceIrr: 10_000_000n,
        createdById: commercial.id,
      }),
    );
    const [seat] = freeSeats;
    const body = {
      cabin: seat.cabin,
      passengers: [{ fullName: 'مسافر کنترل دسترسی', seatCode: seat.seatCode }],
    };

    const wrongOwner = await request(app.getHttpServer())
      .post(`/agency-portal/allotments/${allotment.id}/bookings`)
      .set('Authorization', auth(otherLogin.accessToken))
      .send(body);
    expect(wrongOwner.status).toBe(404);

    await allotmentRepo.update(
      { id: allotment.id },
      { type: 'SOFT', releaseAt: new Date(Date.now() - 60_000) },
    );
    const released = await request(app.getHttpServer())
      .post(`/agency-portal/allotments/${allotment.id}/bookings`)
      .set('Authorization', auth(ownerLogin.accessToken))
      .send(body);
    expect(released.status).toBe(404);

    const noCredit = await createFreshAgency({ limitIrr: 0 });
    const noCreditLogin = await loginAsAgency(noCredit.phone);
    const noCreditAllotment = await allotmentRepo.save(
      allotmentRepo.create({
        agencyId: noCredit.id,
        flightInstanceId: instance.id,
        seatsAllocated: 1,
        type: 'HARD',
        releaseAt: null,
        contractPriceIrr: 10_000_000n,
        createdById: commercial.id,
      }),
    );
    const denied = await request(app.getHttpServer())
      .post(`/agency-portal/allotments/${noCreditAllotment.id}/bookings`)
      .set('Authorization', auth(noCreditLogin.accessToken))
      .send(body);
    expect(denied.status).toBe(409);
    expect(
      await dataSource
        .getRepository(Booking)
        .createQueryBuilder('b')
        .where('b.allotmentId = :id', { id: noCreditAllotment.id })
        .getCount(),
    ).toBe(0);
  });

  it('serializes concurrent buyers of the last allotment seat', async () => {
    const agency = await createFreshAgency({ limitIrr: 1_000_000_000 });
    const agencyLogin = await loginAsAgency(agency.phone);
    const commercial = await dataSource
      .getRepository(User)
      .findOneByOrFail({ username: 'comm' });
    const { instance, freeSeats } =
      await findSellableInstanceWithFreeSeats(2);

    const allotmentRepo = dataSource.getRepository(AgencyAllotment);
    const allotment = await allotmentRepo.save(
      allotmentRepo.create({
        agencyId: agency.id,
        flightInstanceId: instance.id,
        seatsAllocated: 1,
        type: 'HARD',
        releaseAt: null,
        contractPriceIrr: 10_000_000n,
        createdById: commercial.id,
      }),
    );
    const responses = await Promise.all(
      freeSeats.slice(0, 2).map((seat, index) =>
        request(app.getHttpServer())
          .post(`/agency-portal/allotments/${allotment.id}/bookings`)
          .set('Authorization', auth(agencyLogin.accessToken))
          .set('Idempotency-Key', crypto.randomUUID())
          .send({
            cabin: seat.cabin,
            passengers: [
              {
                fullName: `مسافر هم‌زمان ${index + 1}`,
                seatCode: seat.seatCode,
              },
            ],
          }),
      ),
    );
    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    expect(
      await dataSource
        .getRepository(Booking)
        .createQueryBuilder('b')
        .where('b.allotmentId = :id', { id: allotment.id })
        .getCount(),
    ).toBe(1);
  });
});
