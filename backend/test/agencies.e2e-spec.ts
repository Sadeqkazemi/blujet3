import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as crypto from 'node:crypto';
import { DataSource } from 'typeorm';
import { User } from '../src/database/entities/user.entity';
import { AgencyProfile } from '../src/database/entities/agency-profile.entity';
import { AgencyCreditLine } from '../src/database/entities/agency-credit-line.entity';
import { AgencyMembershipRequest } from '../src/database/entities/agency-membership-request.entity';
import { AgencyInvoice } from '../src/database/entities/agency-invoice.entity';
import { AgencyApiKey } from '../src/database/entities/agency-api-key.entity';
import { FlightInstance } from '../src/database/entities/flight-instance.entity';
import { Booking } from '../src/database/entities/booking.entity';
import { LedgerEntry } from '../src/database/entities/ledger-entry.entity';
import { AuditLog } from '../src/database/entities/audit-log.entity';
import { loginAs, stepUpFor } from './helpers/login.helper';
import { createTestApp } from './helpers/app.helper';

describe('Agencies (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  // Fresh app per test — avoids leaking the shared login-route throttle budget
  // across tests (matches panels.e2e-spec.ts's convention for this module).
  beforeEach(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
  });

  afterEach(async () => {
    await app.close();
  });

  /** A throwaway agency + credit line, independent of shared seed data, so
   * mutation-heavy tests never depend on execution order. */
  async function createFreshAgency(overrides?: { limitIrr?: number }) {
    const suffix = crypto.randomUUID().slice(0, 8);
    const userRepo = dataSource.getRepository(User);
    const user = await userRepo.save(
      userRepo.create({
        role: 'AGENCY',
        // Hex→'0' mapping collided as test users accumulated (unique-phone flake) — use real random digits.
        phone: `+9891${crypto.randomInt(10_000_000, 100_000_000)}`,
        fullName: `آژانس تست ${suffix}`,
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
        phone: user.phone!,
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
    return user.id;
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
  }

  async function createFreshMembershipRequest(
    status: 'PENDING' | 'REFERRED' = 'PENDING',
  ) {
    const suffix = crypto.randomUUID().slice(0, 8);
    const repo = dataSource.getRepository(AgencyMembershipRequest);
    return repo.save(
      repo.create({
        applicantName: `متقاضی تست ${suffix}`,
        managerName: 'مدیر متقاضی',
        licenseNo: `AG-REQ-${suffix}`,
        city: 'شیراز',
        phone: `+9892${crypto.randomInt(10_000_000, 100_000_000)}`,
        email: `${suffix}@applicant.example`,
        status,
      }),
    );
  }

  // ── Listing & detail ────────────────────────────────────────────────

  it('GET /agencies returns the same 4 KPI cards for all 3 agency-tab roles', async () => {
    for (const username of ['senior', 'finance', 'comm']) {
      const { accessToken } = await loginAs(app, username);
      const res = await request(app.getHttpServer())
        .get('/agencies')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
      const kpis = res.body.data.kpis as Record<string, unknown>;
      expect(Object.keys(kpis).sort()).toEqual(
        [
          'activeCount',
          'pendingSettlementCount',
          'totalCreditGrantedIrr',
          'totalUsedIrr',
        ].sort(),
      );
    }
  });

  it('a non-agency-tab role (IT_MANAGER) gets 403 on the agencies list and detail endpoints', async () => {
    const { accessToken } = await loginAs(app, 'itadmin');
    const agencyId = await createFreshAgency();

    const list = await request(app.getHttpServer())
      .get('/agencies')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(list.status).toBe(403);

    const detail = await request(app.getHttpServer())
      .get(`/agencies/${agencyId}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(detail.status).toBe(403);
  });

  it('GET /agencies?q= searches by manager name', async () => {
    const suffix = crypto.randomUUID().slice(0, 6);
    const agencyId = await createFreshAgency();
    await dataSource
      .getRepository(AgencyProfile)
      .update({ userId: agencyId }, { managerName: `جستجوپذیر-${suffix}` });

    const { accessToken } = await loginAs(app, 'senior');
    const res = await request(app.getHttpServer())
      .get(`/agencies?q=${encodeURIComponent(`جستجوپذیر-${suffix}`)}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.agencies).toHaveLength(1);
    expect(res.body.data.agencies[0].id).toBe(agencyId);
  });

  it('debtorsOnly=true (Commercial) returns only agencies with usedIrr > 0 or a pending invoice', async () => {
    const debtor = await createFreshAgency();
    await addAgencySale(debtor, 500_000_000);
    const healthy = await createFreshAgency();

    const { accessToken } = await loginAs(app, 'comm');
    const res = await request(app.getHttpServer())
      .get('/agencies?debtorsOnly=true')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.agencies.map((a: { id: string }) => a.id);
    expect(ids).toContain(debtor);
    expect(ids).not.toContain(healthy);
  });

  it('detail stats reconcile against Booking rows for that agency', async () => {
    const agencyId = await createFreshAgency();
    await addAgencySale(agencyId, 300_000_000);
    await addAgencySale(agencyId, 200_000_000);

    const { accessToken } = await loginAs(app, 'senior');
    const res = await request(app.getHttpServer())
      .get(`/agencies/${agencyId}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.stats.ticketsIssued).toBe(2);
    // Money fields are decimal STRINGs on the wire (BigInt.prototype.toJSON —
    // see src/common/bigint-json.ts): a JS number can't safely hold IRR
    // amounts above 2^53.
    expect(res.body.data.stats.totalSalesIrr).toBe('500000000');
    expect(res.body.data.credit.usedIrr).toBe('500000000');
  });

  it('activityScore is included for Finance/Commercial but omitted for Senior Manager', async () => {
    const agencyId = await createFreshAgency();

    const senior = await loginAs(app, 'senior');
    const seniorRes = await request(app.getHttpServer())
      .get(`/agencies/${agencyId}`)
      .set('Authorization', `Bearer ${senior.accessToken}`);
    expect(seniorRes.body.data.activityScore).toBeUndefined();

    const finance = await loginAs(app, 'finance');
    const financeRes = await request(app.getHttpServer())
      .get(`/agencies/${agencyId}`)
      .set('Authorization', `Bearer ${finance.accessToken}`);
    expect(financeRes.body.data.activityScore).toEqual(
      expect.objectContaining({
        score: expect.any(Number),
        badge: expect.any(String),
      }),
    );
  });

  it('activityScore matches the confirmed formula exactly: seatsSold*10 + paidInvoices*100 - unpaidInvoices*60 + (isActive?40:0)', async () => {
    const agencyId = await createFreshAgency();
    const instance = await dataSource
      .getRepository(FlightInstance)
      .createQueryBuilder('fi')
      .getOneOrFail();
    const commercial = await dataSource
      .getRepository(User)
      .findOneByOrFail({ username: 'comm' });

    // 2 ticketed bookings, 1 paid invoice, 1 unpaid invoice, agency active
    // -> 2*10 + 1*100 - 1*60 + 40 = 100 (BRONZE, since < 400).
    const bookingRepo = dataSource.getRepository(Booking);
    for (let i = 0; i < 2; i++) {
      await bookingRepo.save(
        bookingRepo.create({
          pnr: `SCR${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
          flightInstanceId: instance.id,
          channel: 'AGENCY',
          agencyId,
          status: 'TICKETED',
          priceIrr: 100_000_000n,
        }),
      );
    }
    const invoiceRepo = dataSource.getRepository(AgencyInvoice);
    await invoiceRepo.save(
      invoiceRepo.create({
        agencyId,
        invoiceNo: `SCR-PAID-${crypto.randomUUID().slice(0, 8)}`,
        issuedById: commercial.id,
        dueAt: new Date(),
        amountIrr: 50_000_000n,
        status: 'PAID',
        paidAt: new Date(),
      }),
    );
    await invoiceRepo.save(
      invoiceRepo.create({
        agencyId,
        invoiceNo: `SCR-UNPAID-${crypto.randomUUID().slice(0, 8)}`,
        issuedById: commercial.id,
        dueAt: new Date(),
        amountIrr: 50_000_000n,
        status: 'UNPAID',
      }),
    );

    const { accessToken } = await loginAs(app, 'finance');
    const res = await request(app.getHttpServer())
      .get(`/agencies/${agencyId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.body.data.activityScore).toEqual({
      score: 100,
      badge: 'BRONZE',
    });
  });

  // ── Credit & settlement ──────────────────────────────────────────────

  it('PATCH credit updates only limitIrr — usedIrr in the response is always derived, never the submitted value', async () => {
    const agencyId = await createFreshAgency();
    await addAgencySale(agencyId, 400_000_000);

    const { accessToken } = await loginAs(app, 'finance');
    const res = await request(app.getHttpServer())
      .patch(`/agencies/${agencyId}/credit`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ limitIrr: 2_000_000_000 });

    expect(res.status).toBe(200);
    expect(res.body.data.limitIrr).toBe('2000000000');
    expect(res.body.data.usedIrr).toBe('400000000');

    const auditRow = await dataSource
      .getRepository(AuditLog)
      .createQueryBuilder('a')
      .where('a.category = :category', { category: 'AGENCY' })
      .andWhere('a.entityType = :entityType', { entityType: 'AgencyProfile' })
      .andWhere('a.entityId = :entityId', { entityId: agencyId })
      .andWhere('a.action = :action', {
        action: 'تغییر سقف اعتبار آژانس',
      })
      .orderBy('a.createdAt', 'DESC')
      .getOne();
    expect(auditRow).not.toBeNull();
  });

  it('usedIrr decreases exactly by the settlement amount after POST /settle, verified against LedgerEntry sums', async () => {
    const agencyId = await createFreshAgency();
    await addAgencySale(agencyId, 700_000_000);

    const { accessToken } = await loginAs(app, 'finance');
    const res = await request(app.getHttpServer())
      .post(`/agencies/${agencyId}/settle`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(201);
    expect(res.body.data.settledIrr).toBe('700000000');

    const sumRow = await dataSource
      .getRepository(LedgerEntry)
      .createQueryBuilder('l')
      .select('SUM(l.signedAmountIrr)', 'sum')
      .where('l.agencyId = :agencyId', { agencyId })
      .andWhere('l.type IN (:...types)', { types: ['SALE', 'SETTLEMENT'] })
      .getRawOne<{ sum: string | null }>();
    expect(BigInt(sumRow!.sum ?? '0')).toBe(0n);
  });

  it('two concurrent POST /settle calls on the same agency settle exactly once — no phantom credit from a double-settlement race', async () => {
    const agencyId = await createFreshAgency();
    await addAgencySale(agencyId, 500_000_000);

    const { accessToken } = await loginAs(app, 'finance');
    const [first, second] = await Promise.all([
      request(app.getHttpServer())
        .post(`/agencies/${agencyId}/settle`)
        .set('Authorization', `Bearer ${accessToken}`),
      request(app.getHttpServer())
        .post(`/agencies/${agencyId}/settle`)
        .set('Authorization', `Bearer ${accessToken}`),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 409]);

    const settlementCount = await dataSource
      .getRepository(LedgerEntry)
      .countBy({ agencyId, type: 'SETTLEMENT' });
    expect(settlementCount).toBe(1);

    // The critical invariant: outstanding never goes negative (phantom credit).
    const sumRow = await dataSource
      .getRepository(LedgerEntry)
      .createQueryBuilder('l')
      .select('SUM(l.signedAmountIrr)', 'sum')
      .where('l.agencyId = :agencyId', { agencyId })
      .andWhere('l.type IN (:...types)', { types: ['SALE', 'SETTLEMENT'] })
      .getRawOne<{ sum: string | null }>();
    expect(BigInt(sumRow!.sum ?? '0')).toBe(0n);
  });

  // Money columns are now BigInt (no Int32 ceiling by design — that's the
  // whole point of this migration), so a large limit like 3,000,000,000 is
  // legitimately accepted now. The validation guard itself (MinIrrAmount /
  // IsIrrAmount on UpdateCreditDto) is still real, so this test now proves
  // that guard against a genuinely invalid input (negative) instead.
  it('PATCH credit rejects a negative limit with 400, not a DB 500', async () => {
    const agencyId = await createFreshAgency();
    const { accessToken } = await loginAs(app, 'finance');
    const res = await request(app.getHttpServer())
      .patch(`/agencies/${agencyId}/credit`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ limitIrr: -1 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('POST /settle is 403 for COMMERCIAL_MANAGER', async () => {
    const agencyId = await createFreshAgency();
    const { accessToken } = await loginAs(app, 'comm');
    const res = await request(app.getHttpServer())
      .post(`/agencies/${agencyId}/settle`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(403);
  });

  // ── Suspension ────────────────────────────────────────────────────────

  it('PATCH suspend without a reason -> 400', async () => {
    const agencyId = await createFreshAgency();
    const { accessToken } = await loginAs(app, 'senior');
    const res = await request(app.getHttpServer())
      .patch(`/agencies/${agencyId}/suspend`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('PATCH reactivate clears suspendedAt/suspendReason', async () => {
    const agencyId = await createFreshAgency();
    const { accessToken } = await loginAs(app, 'senior');

    await request(app.getHttpServer())
      .patch(`/agencies/${agencyId}/suspend`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ reason: 'دلیل تست' });

    const res = await request(app.getHttpServer())
      .patch(`/agencies/${agencyId}/reactivate`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.suspendedAt).toBeNull();
    expect(res.body.data.suspendReason).toBeNull();
  });

  // ── Membership requests ───────────────────────────────────────────────

  it('creates an agency only after commercial then finance approval', async () => {
    const reqRow = await createFreshMembershipRequest('PENDING');
    const commercial = await loginAs(app, 'comm');

    const commercialRes = await request(app.getHttpServer())
      .patch(`/agencies/requests/${reqRow.id}/approve`)
      .set('Authorization', `Bearer ${commercial.accessToken}`);
    expect(commercialRes.status).toBe(200);
    expect(commercialRes.body.data.stage).toBe('AWAITING_FINANCE');
    expect(
      await dataSource.getRepository(User).findOneBy({ phone: reqRow.phone }),
    ).toBeNull();

    const finance = await loginAs(app, 'finance');
    const financeRes = await request(app.getHttpServer())
      .patch(`/agencies/requests/${reqRow.id}/approve`)
      .set('Authorization', `Bearer ${finance.accessToken}`);
    expect(financeRes.status).toBe(200);
    expect(financeRes.body.data.stage).toBe('APPROVED');

    const newAgencyId = financeRes.body.data.agencyId as string;
    const user = await dataSource
      .getRepository(User)
      .findOneBy({ id: newAgencyId });
    const profile = await dataSource
      .getRepository(AgencyProfile)
      .findOneBy({ userId: newAgencyId });
    expect(user?.role).toBe('AGENCY');
    expect(profile).not.toBeNull();
  });

  it('rejecting a request sets status without creating any User/AgencyProfile', async () => {
    const reqRow = await createFreshMembershipRequest('PENDING');
    const { accessToken } = await loginAs(app, 'senior');

    const res = await request(app.getHttpServer())
      .patch(`/agencies/requests/${reqRow.id}/reject`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ reviewNote: 'رد شد' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('REJECTED');

    const usersWithThisPhone = await dataSource
      .getRepository(User)
      .find({ where: { phone: reqRow.phone } });
    expect(usersWithThisPhone).toHaveLength(0);
  });

  it('rejects finance approval before commercial approval', async () => {
    const reqRow = await createFreshMembershipRequest('PENDING');
    const finance = await loginAs(app, 'finance');
    const res = await request(app.getHttpServer())
      .patch(`/agencies/requests/${reqRow.id}/approve`)
      .set('Authorization', `Bearer ${finance.accessToken}`);
    expect(res.status).toBe(409);
    expect(
      await dataSource.getRepository(User).countBy({ phone: reqRow.phone }),
    ).toBe(0);
  });

  it('creates exactly one account under concurrent finance approvals', async () => {
    const reqRow = await createFreshMembershipRequest('PENDING');
    const commercial = await loginAs(app, 'comm');
    await request(app.getHttpServer())
      .patch(`/agencies/requests/${reqRow.id}/approve`)
      .set('Authorization', `Bearer ${commercial.accessToken}`);
    const finance = await loginAs(app, 'finance');
    const responses = await Promise.all([
      request(app.getHttpServer())
        .patch(`/agencies/requests/${reqRow.id}/approve`)
        .set('Authorization', `Bearer ${finance.accessToken}`),
      request(app.getHttpServer())
        .patch(`/agencies/requests/${reqRow.id}/approve`)
        .set('Authorization', `Bearer ${finance.accessToken}`),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    const users = await dataSource
      .getRepository(User)
      .findBy({ phone: reqRow.phone });
    expect(users).toHaveLength(1);
    expect(
      await dataSource
        .getRepository(AgencyProfile)
        .countBy({ userId: users[0].id }),
    ).toBe(1);
    expect(
      await dataSource
        .getRepository(AgencyCreditLine)
        .countBy({ agencyId: users[0].id }),
    ).toBe(1);
  });

  it('PATCH .../refer is 403 for FINANCE_MANAGER', async () => {
    const reqRow = await createFreshMembershipRequest('PENDING');
    const senior = await dataSource
      .getRepository(User)
      .findOneByOrFail({ username: 'senior' });
    const { accessToken } = await loginAs(app, 'finance');

    const res = await request(app.getHttpServer())
      .patch(`/agencies/requests/${reqRow.id}/refer`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ referredToId: senior.id });
    expect(res.status).toBe(403);
  });

  it('approving an already-decided request -> 409, not a silent overwrite', async () => {
    const reqRow = await createFreshMembershipRequest('PENDING');
    const { accessToken } = await loginAs(app, 'comm');

    const first = await request(app.getHttpServer())
      .patch(`/agencies/requests/${reqRow.id}/approve`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(first.status).toBe(200);

    const second = await request(app.getHttpServer())
      .patch(`/agencies/requests/${reqRow.id}/approve`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(second.status).toBe(409);
  });

  // ── API keys (Senior Manager only) ─────────────────────────────────────

  it('POST .../api-key for a non-Senior-Manager role -> 403', async () => {
    const agencyId = await createFreshAgency();
    const { accessToken } = await loginAs(app, 'finance');
    const res = await request(app.getHttpServer())
      .post(`/agencies/${agencyId}/api-key`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ scope: 'FULL' });
    expect(res.status).toBe(403);
  });

  it('the raw API key is returned once at creation and the DB only stores a hash', async () => {
    const agencyId = await createFreshAgency();
    const { accessToken } = await loginAs(app, 'senior');
    const stepUp = await stepUpFor(
      app,
      accessToken!,
      'senior',
      'API_KEY_ROTATE',
    );
    const res = await request(app.getHttpServer())
      .post(`/agencies/${agencyId}/api-key`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ scope: 'FULL', ...stepUp });

    expect(res.status).toBe(201);
    expect(typeof res.body.data.rawKey).toBe('string');

    const row = await dataSource
      .getRepository(AgencyApiKey)
      .findOneBy({ id: res.body.data.id });
    expect(row?.keyHash).not.toBe(res.body.data.rawKey);
    expect(row).not.toHaveProperty('rawKey');
  });

  it('regenerating a key changes its stored hash (old key hash no longer matches)', async () => {
    const agencyId = await createFreshAgency();
    const { accessToken } = await loginAs(app, 'senior');
    const stepUp1 = await stepUpFor(
      app,
      accessToken!,
      'senior',
      'API_KEY_ROTATE',
    );
    const created = await request(app.getHttpServer())
      .post(`/agencies/${agencyId}/api-key`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ scope: 'FULL', ...stepUp1 });
    const originalHash = (
      await dataSource
        .getRepository(AgencyApiKey)
        .findOneBy({ id: created.body.data.id })
    )?.keyHash;

    const stepUp2 = await stepUpFor(
      app,
      accessToken!,
      'senior',
      'API_KEY_ROTATE',
    );
    const regenerated = await request(app.getHttpServer())
      .patch(`/agencies/${agencyId}/api-key/${created.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ regenerate: true, ...stepUp2 });

    expect(regenerated.status).toBe(200);
    const newHash = (
      await dataSource
        .getRepository(AgencyApiKey)
        .findOneBy({ id: created.body.data.id })
    )?.keyHash;
    expect(newHash).not.toBe(originalHash);
  });

  // ── Invoices & messaging (Commercial only, Finance read-only) ──────────

  it('POST .../invoices is 403 for SENIOR_MANAGER and FINANCE_MANAGER, 200-range for COMMERCIAL_MANAGER', async () => {
    const agencyId = await createFreshAgency();
    const body = {
      amountIrr: 100_000_000,
      dueAt: new Date(Date.now() + 86_400_000).toISOString(),
    };

    const senior = await loginAs(app, 'senior');
    const seniorRes = await request(app.getHttpServer())
      .post(`/agencies/${agencyId}/invoices`)
      .set('Authorization', `Bearer ${senior.accessToken}`)
      .send(body);
    expect(seniorRes.status).toBe(403);

    const finance = await loginAs(app, 'finance');
    const financeRes = await request(app.getHttpServer())
      .post(`/agencies/${agencyId}/invoices`)
      .set('Authorization', `Bearer ${finance.accessToken}`)
      .send(body);
    expect(financeRes.status).toBe(403);

    const commercial = await loginAs(app, 'comm');
    const commercialRes = await request(app.getHttpServer())
      .post(`/agencies/${agencyId}/invoices`)
      .set('Authorization', `Bearer ${commercial.accessToken}`)
      .send(body);
    expect(commercialRes.status).toBe(201);
  });

  it('GET .../invoices is 200 (read) for all 3 roles', async () => {
    const agencyId = await createFreshAgency();
    for (const username of ['senior', 'finance', 'comm']) {
      const { accessToken } = await loginAs(app, username);
      const res = await request(app.getHttpServer())
        .get(`/agencies/${agencyId}/invoices`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
    }
  });

  it('paying an invoice writes exactly one SETTLEMENT ledger entry and is idempotent (double pay -> 409)', async () => {
    const agencyId = await createFreshAgency();
    const commercial = await loginAs(app, 'comm');
    const issued = await request(app.getHttpServer())
      .post(`/agencies/${agencyId}/invoices`)
      .set('Authorization', `Bearer ${commercial.accessToken}`)
      .send({
        amountIrr: 150_000_000,
        dueAt: new Date(Date.now() + 86_400_000).toISOString(),
      });
    const invoiceId = issued.body.data.id as string;

    const finance = await loginAs(app, 'finance');
    const pay1 = await request(app.getHttpServer())
      .patch(`/agencies/${agencyId}/invoices/${invoiceId}/pay`)
      .set('Authorization', `Bearer ${finance.accessToken}`);
    expect(pay1.status).toBe(200);

    const pay2 = await request(app.getHttpServer())
      .patch(`/agencies/${agencyId}/invoices/${invoiceId}/pay`)
      .set('Authorization', `Bearer ${finance.accessToken}`);
    expect(pay2.status).toBe(409);

    const settlementEntries = await dataSource
      .getRepository(LedgerEntry)
      .countBy({
        agencyId,
        type: 'SETTLEMENT',
        signedAmountIrr: -150_000_000n,
      });
    expect(settlementEntries).toBe(1);
  });

  it('GET/POST .../messages is 403 for SENIOR_MANAGER and FINANCE_MANAGER', async () => {
    const agencyId = await createFreshAgency();

    const senior = await loginAs(app, 'senior');
    const seniorGet = await request(app.getHttpServer())
      .get(`/agencies/${agencyId}/messages`)
      .set('Authorization', `Bearer ${senior.accessToken}`);
    expect(seniorGet.status).toBe(403);

    const finance = await loginAs(app, 'finance');
    const financePost = await request(app.getHttpServer())
      .post(`/agencies/${agencyId}/messages`)
      .set('Authorization', `Bearer ${finance.accessToken}`)
      .send({ body: 'سلام' });
    expect(financePost.status).toBe(403);

    const commercial = await loginAs(app, 'comm');
    const commercialRes = await request(app.getHttpServer())
      .post(`/agencies/${agencyId}/messages`)
      .set('Authorization', `Bearer ${commercial.accessToken}`)
      .send({ body: 'سلام' });
    expect(commercialRes.status).toBe(201);
  });

  // ── Concurrency ──────────────────────────────────────────────────────

  it('two simultaneous PATCH .../credit calls do not crash, last write wins, and both are audited', async () => {
    const agencyId = await createFreshAgency();
    const seniorA = await loginAs(app, 'senior');
    const financeB = await loginAs(app, 'finance');

    const [resA, resB] = await Promise.all([
      request(app.getHttpServer())
        .patch(`/agencies/${agencyId}/credit`)
        .set('Authorization', `Bearer ${seniorA.accessToken}`)
        .send({ limitIrr: 1_100_000_000 }),
      request(app.getHttpServer())
        .patch(`/agencies/${agencyId}/credit`)
        .set('Authorization', `Bearer ${financeB.accessToken}`)
        .send({ limitIrr: 1_200_000_000 }),
    ]);

    expect([resA.status, resB.status]).toEqual([200, 200]);

    const finalLine = await dataSource
      .getRepository(AgencyCreditLine)
      .findOneByOrFail({ agencyId });
    expect([1_100_000_000n, 1_200_000_000n]).toContain(finalLine.limitIrr);

    const auditRows = await dataSource
      .getRepository(AuditLog)
      .createQueryBuilder('a')
      .where('a.category = :category', { category: 'AGENCY' })
      .andWhere('a.entityType = :entityType', { entityType: 'AgencyProfile' })
      .andWhere('a.entityId = :entityId', { entityId: agencyId })
      .andWhere('a.action = :action', {
        action: 'تغییر سقف اعتبار آژانس',
      })
      .getMany();
    expect(auditRows).toHaveLength(2);
  });
});
