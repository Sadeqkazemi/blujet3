import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as crypto from 'node:crypto';
import { DataSource } from 'typeorm';
import { User } from '../src/database/entities/user.entity';
import { Flight } from '../src/database/entities/flight.entity';
import { FlightInstance } from '../src/database/entities/flight-instance.entity';
import { AgencyProfile } from '../src/database/entities/agency-profile.entity';
import { AgencyInvoice } from '../src/database/entities/agency-invoice.entity';
import { LedgerEntry } from '../src/database/entities/ledger-entry.entity';
import { loginAs } from './helpers/login.helper';
import { createTestApp } from './helpers/app.helper';

/**
 * Phase 27: EMPLOYEE with fl_manage/ag_settle/fn_invoices gets real write
 * access on the flights + agencies write endpoints those catalog keys were
 * widened to cover — see the @RequiresPermission additions on
 * FlightsController/AgenciesController and EMPLOYEE_SECTION_NAV in
 * panel-nav.config.ts. fl_manage is a 'commercial'-dept catalog key while
 * ag_settle/fn_invoices are 'finance'-dept — an employee's dept is fixed at
 * creation (catalogDeptFor(employee.dept) never changes), so a single
 * EMPLOYEE can only ever hold keys from one dept; tests use two separate
 * fixture employees accordingly, not one combined one.
 */
describe('Phase 27 — EMPLOYEE fl_manage/ag_settle/fn_invoices (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  beforeEach(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
  });

  afterEach(async () => {
    await app.close();
  });

  function uniqueFlightNo() {
    return `TS${(Date.now() % 9000) + 1000}`;
  }

  function flightDefinitionBody(flightNo = uniqueFlightNo()) {
    return {
      originCode: 'THR',
      destCode: 'MHD',
      flightNo,
      departureAt: new Date(Date.now() + 5 * 24 * 3_600_000).toISOString(),
      durationMinutes: 90,
      capacity: 146,
      cabinCapacities: [
        { cabin: 'ECONOMY', seats: 110 },
        { cabin: 'COMFORT', seats: 20 },
        { cabin: 'BUSINESS', seats: 16 },
      ],
      basePriceIrr: 25_000_000,
    };
  }

  async function createInstance() {
    const flight = await dataSource
      .getRepository(Flight)
      .createQueryBuilder('f')
      .getOneOrFail();
    const departureAt = new Date(Date.now() + 14 * 24 * 3_600_000);
    const instanceRepo = dataSource.getRepository(FlightInstance);
    return instanceRepo.save(
      instanceRepo.create({
        flightId: flight.id,
        departureAt,
        arrivalAt: new Date(departureAt.getTime() + 3 * 3_600_000),
        capacity: 146,
        charterSeats: 60,
        status: 'SCHEDULED',
        basePriceIrr: 30_000_000n,
      }),
    );
  }

  async function createEmployeeWithPermissions(
    dept: string,
    permissionKeys: string[],
  ) {
    const it = await loginAs(app, 'itadmin');
    const username = `e27.${crypto.randomUUID().slice(0, 8)}`;
    const res = await request(app.getHttpServer())
      .post('/it/employees')
      .set('Authorization', `Bearer ${it.accessToken}`)
      .send({
        fullName: 'کارمند تست فاز ۲۷',
        username,
        phone: `09${crypto.randomInt(100_000_000, 1_000_000_000)}`,
        password: 'Blujet@1404',
        dept,
        permissionKeys,
      });
    expect(res.status).toBe(201);
    return { username, id: res.body.data.id as string };
  }

  // Mirrors AgenciesService.resetTestDebt: corrects the agency's *net*
  // ledger balance to an absolute target so this is safe to call even if
  // prior tests already left SALE/SETTLEMENT rows on the same agency.
  async function setAgencyDebt(agencyId: string, targetIrr = 20_000_000n) {
    const creator = await dataSource
      .getRepository(User)
      .findOneByOrFail({ role: 'COMMERCIAL_MANAGER' });
    const sumRow = await dataSource
      .getRepository(LedgerEntry)
      .createQueryBuilder('l')
      .select('SUM(l.signedAmountIrr)', 'sum')
      .where('l.agencyId = :agencyId', { agencyId })
      .andWhere('l.type IN (:...types)', { types: ['SALE', 'SETTLEMENT'] })
      .getRawOne<{ sum: string | null }>();
    const deltaIrr = targetIrr - BigInt(sumRow?.sum ?? '0');
    if (deltaIrr !== 0n) {
      const ledgerRepo = dataSource.getRepository(LedgerEntry);
      await ledgerRepo.save(
        ledgerRepo.create({
          agencyId,
          type: 'SALE',
          signedAmountIrr: deltaIrr,
          createdById: creator.id,
        }),
      );
    }
  }

  async function createAgencyInvoice(agencyId: string) {
    const commercial = await dataSource
      .getRepository(User)
      .findOneByOrFail({ role: 'COMMERCIAL_MANAGER' });
    const invoiceRepo = dataSource.getRepository(AgencyInvoice);
    return invoiceRepo.save(
      invoiceRepo.create({
        agencyId,
        invoiceNo: `INV-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        issuedById: commercial.id,
        dueAt: new Date(Date.now() + 10 * 24 * 3_600_000),
        amountIrr: 5_000_000n,
        status: 'UNPAID',
      }),
    );
  }

  // ── fl_manage ───────────────────────────────────────────────────────
  describe('fl_manage', () => {
    it('an employee freshly granted fl_manage can create a flight and plan an instance; fl_view alone (no fl_manage) is denied', async () => {
      const { username } = await createEmployeeWithPermissions('commercial', [
        'fl_view',
        'fl_manage',
      ]);
      const { accessToken } = await loginAs(app, username);

      const create = await request(app.getHttpServer())
        .post('/flights')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(flightDefinitionBody());
      expect(create.status).toBe(201);

      const instance = await createInstance();
      const plan = await request(app.getHttpServer())
        .patch(`/flights/${instance.id}/plan`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ priceIrr: 32_000_000, agencySeats: 40 });
      expect(plan.status).toBe(200);

      const { username: viewOnlyUsername } =
        await createEmployeeWithPermissions('commercial', ['fl_view']);
      const viewOnly = await loginAs(app, viewOnlyUsername);
      const denied = await request(app.getHttpServer())
        .post('/flights')
        .set('Authorization', `Bearer ${viewOnly.accessToken}`)
        .send(flightDefinitionBody());
      expect(denied.status).toBe(403);
    });

    it('fl_manage grants API access and exposes the matching manager surfaces in the employee sidebar', async () => {
      const { username } = await createEmployeeWithPermissions('commercial', [
        'fl_manage',
      ]);
      const { accessToken } = await loginAs(app, username);

      const nav = await request(app.getHttpServer())
        .get('/panels/nav')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(nav.status).toBe(200);
      const keys = (nav.body.data as { key: string }[]).map((n) => n.key);
      expect(keys).toEqual(
        expect.arrayContaining(['flights', 'routes', 'aircraft']),
      );
    });
  });

  // ── ag_settle ───────────────────────────────────────────────────────
  describe('ag_settle', () => {
    it('an employee freshly granted only ag_settle can still reach the agencies list/detail (reachability fix) and settle an agency', async () => {
      const { username } = await createEmployeeWithPermissions('finance', [
        'ag_settle',
      ]);
      const { accessToken } = await loginAs(app, username);
      const agency = await dataSource
        .getRepository(AgencyProfile)
        .createQueryBuilder('a')
        .getOneOrFail();

      const list = await request(app.getHttpServer())
        .get('/agencies')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(list.status).toBe(200);

      const detail = await request(app.getHttpServer())
        .get(`/agencies/${agency.userId}`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(detail.status).toBe(200);

      await setAgencyDebt(agency.userId);

      const settle = await request(app.getHttpServer())
        .post(`/agencies/${agency.userId}/settle`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(settle.status).toBe(201);
    });

    it('without ag_settle (only ag_list), settle is forbidden', async () => {
      const { username } = await createEmployeeWithPermissions('commercial', [
        'ag_list',
      ]);
      const { accessToken } = await loginAs(app, username);
      const agency = await dataSource
        .getRepository(AgencyProfile)
        .createQueryBuilder('a')
        .getOneOrFail();

      const settle = await request(app.getHttpServer())
        .post(`/agencies/${agency.userId}/settle`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(settle.status).toBe(403);
    });

    it('ag_settle unlocks the "agencies" nav tab', async () => {
      const { username } = await createEmployeeWithPermissions('finance', [
        'ag_settle',
      ]);
      const { accessToken } = await loginAs(app, username);

      const nav = await request(app.getHttpServer())
        .get('/panels/nav')
        .set('Authorization', `Bearer ${accessToken}`);
      const keys = (nav.body.data as { key: string }[]).map((n) => n.key);
      expect(keys).toContain('agencies');
    });
  });

  // ── fn_invoices ─────────────────────────────────────────────────────
  describe('fn_invoices', () => {
    it('an employee freshly granted only fn_invoices can reach agencies list/detail, list/pay/remind invoices, but not settle', async () => {
      const { username } = await createEmployeeWithPermissions('finance', [
        'fn_invoices',
      ]);
      const { accessToken } = await loginAs(app, username);
      const agency = await dataSource
        .getRepository(AgencyProfile)
        .createQueryBuilder('a')
        .getOneOrFail();
      const invoice = await createAgencyInvoice(agency.userId);

      const list = await request(app.getHttpServer())
        .get('/agencies')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(list.status).toBe(200);

      const detail = await request(app.getHttpServer())
        .get(`/agencies/${agency.userId}`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(detail.status).toBe(200);

      const invoices = await request(app.getHttpServer())
        .get(`/agencies/${agency.userId}/invoices`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(invoices.status).toBe(200);

      const remind = await request(app.getHttpServer())
        .post(`/agencies/${agency.userId}/invoices/${invoice.id}/remind`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(remind.status).toBe(201);

      const pay = await request(app.getHttpServer())
        .patch(`/agencies/${agency.userId}/invoices/${invoice.id}/pay`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(pay.status).toBe(200);

      const settle = await request(app.getHttpServer())
        .post(`/agencies/${agency.userId}/settle`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(settle.status).toBe(403);

      // Issuing an invoice stays COMMERCIAL_MANAGER-only, fn_invoices never
      // grants it.
      const issue = await request(app.getHttpServer())
        .post(`/agencies/${agency.userId}/invoices`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          amountIrr: 1_000_000,
          dueAt: new Date(Date.now() + 10 * 24 * 3_600_000).toISOString(),
        });
      expect(issue.status).toBe(403);
    });

    it('without fn_invoices, invoices endpoints are forbidden', async () => {
      const { username } = await createEmployeeWithPermissions('finance', [
        'ag_settle',
      ]);
      const { accessToken } = await loginAs(app, username);
      const agency = await dataSource
        .getRepository(AgencyProfile)
        .createQueryBuilder('a')
        .getOneOrFail();
      const invoice = await createAgencyInvoice(agency.userId);

      const invoices = await request(app.getHttpServer())
        .get(`/agencies/${agency.userId}/invoices`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(invoices.status).toBe(403);

      const pay = await request(app.getHttpServer())
        .patch(`/agencies/${agency.userId}/invoices/${invoice.id}/pay`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(pay.status).toBe(403);
    });

    it('fn_invoices unlocks the "agencies" nav tab', async () => {
      const { username } = await createEmployeeWithPermissions('finance', [
        'fn_invoices',
      ]);
      const { accessToken } = await loginAs(app, username);

      const nav = await request(app.getHttpServer())
        .get('/panels/nav')
        .set('Authorization', `Bearer ${accessToken}`);
      const keys = (nav.body.data as { key: string }[]).map((n) => n.key);
      expect(keys).toContain('agencies');
    });
  });

  it("doesn't affect non-EMPLOYEE roles: SENIOR_MANAGER still has full flights + agencies access despite holding zero EmployeePermission rows", async () => {
    const { accessToken } = await loginAs(app, 'senior');
    const agency = await dataSource
      .getRepository(AgencyProfile)
      .createQueryBuilder('a')
      .getOneOrFail();

    const overview = await request(app.getHttpServer())
      .get('/flights/overview')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(overview.status).toBe(200);

    const detail = await request(app.getHttpServer())
      .get(`/agencies/${agency.userId}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(detail.status).toBe(200);
  });
});
