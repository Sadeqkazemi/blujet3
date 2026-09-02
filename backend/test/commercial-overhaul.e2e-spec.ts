import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as crypto from 'node:crypto';
import * as argon2 from 'argon2';
import { DataSource } from 'typeorm';
import { AgencyCreditLine } from '../src/database/entities/agency-credit-line.entity';
import { AgencyAllotment } from '../src/database/entities/agency-allotment.entity';
import { AgencyInvoice } from '../src/database/entities/agency-invoice.entity';
import { AgencyProfile } from '../src/database/entities/agency-profile.entity';
import { AgencySeatRequest } from '../src/database/entities/agency-seat-request.entity';
import { AgencySeatRequestFlight } from '../src/database/entities/agency-seat-request-flight.entity';
import { AncillaryService } from '../src/database/entities/ancillary-service.entity';
import { AuditLog } from '../src/database/entities/audit-log.entity';
import { CartableTask } from '../src/database/entities/cartable-task.entity';
import { FlightInstance } from '../src/database/entities/flight-instance.entity';
import { FareRule } from '../src/database/entities/fare-rule.entity';
import { User } from '../src/database/entities/user.entity';
import { CabinClass, FlightDefinitionStatus } from '../src/database/enums';
import { loginAs } from './helpers/login.helper';
import { createTestApp } from './helpers/app.helper';

const AGENCY_PASSWORD = 'AgencyTest@123';

describe('Commercial manager overhaul (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  beforeEach(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
  });

  afterEach(async () => {
    await dataSource
      .createQueryBuilder()
      .delete()
      .from(AgencySeatRequest)
      .execute();
    await dataSource
      .getRepository(AncillaryService)
      .update({ key: 'seat-normal' }, { priceIrr: 0n, enabled: true });
    await dataSource
      .getRepository(AncillaryService)
      .update({ key: 'cip' }, { enabled: false });
    await app.close();
  });

  function auth(token: string | null | undefined) {
    return `Bearer ${token}`;
  }

  async function createFreshAgency() {
    const suffix = crypto.randomUUID().slice(0, 8);
    const phone = `+9891${crypto.randomInt(10_000_000, 100_000_000)}`;
    const userRepo = dataSource.getRepository(User);
    const user = await userRepo.save(
      userRepo.create({
        role: 'AGENCY',
        phone,
        fullName: `آژانس تست ${suffix}`,
        passwordHash: await argon2.hash(AGENCY_PASSWORD),
        isActive: true,
        updatedAt: new Date(),
      }),
    );
    await dataSource.getRepository(AgencyProfile).save(
      dataSource.getRepository(AgencyProfile).create({
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
    await dataSource.getRepository(AgencyCreditLine).save(
      dataSource.getRepository(AgencyCreditLine).create({
        agencyId: user.id,
        limitIrr: 1_000_000_000n,
        updatedAt: new Date(),
      }),
    );
    return { id: user.id, phone, fullName: user.fullName };
  }

  async function loginAsAgency(phone: string) {
    const res = await request(app.getHttpServer())
      .post('/auth/agency/login')
      .send({ phone, password: AGENCY_PASSWORD });
    return res.body?.data?.accessToken as string;
  }

  async function futureInstance() {
    const sample = await dataSource.getRepository(FlightInstance).findOne({
      relations: { flight: true },
      where: {},
    });
    if (!sample) throw new Error('seed flightInstance missing');
    const repo = dataSource.getRepository(FlightInstance);
    const departureAt = new Date(Date.now() + 5 * 60 * 1000);
    const saved = await repo.save(
      repo.create({
        flightId: sample.flightId,
        departureAt,
        arrivalAt: new Date(departureAt.getTime() + 90 * 60 * 1000),
        capacity: 80,
        status: 'SCHEDULED',
        scheduleId: null,
        aircraftTypeOverride: sample.aircraftTypeOverride ?? 'Airbus A320',
        basePriceIrr: sample.basePriceIrr ?? 5_000_000n,
        definitionStatus: FlightDefinitionStatus.PUBLISHED,
      }),
    );
    await dataSource.getRepository(FareRule).save(
      dataSource.getRepository(FareRule).create({
        flightInstanceId: saved.id,
        cabin: CabinClass.ECONOMY,
        classCode: 'Y',
        priceIrr: 5_000_000n,
        sitePriceIrr: 5_000_000n,
        seatsAllocated: 80,
        agencySeatsReleased: 40,
        agencyReleasePriceIrr: 4_500_000n,
        agencySpecialOffer: false,
        taxIrr: 0n,
      }),
    );
    saved.flight = sample.flight;
    return saved;
  }

  describe('GET /agencies current-month metrics', () => {
    it('returns typed zero aggregates for an agency with no bookings or ledger sales', async () => {
      const agency = await createFreshAgency();
      const commercial = await loginAs(app, 'comm');

      const response = await request(app.getHttpServer())
        .get('/agencies')
        .set('Authorization', auth(commercial.accessToken))
        .expect(200);
      const row = (
        response.body.data.agencies as Array<{
          id: string;
          monthlyTicketsSold: number;
          monthlySalesIrr: string;
        }>
      ).find((item) => item.id === agency.id);

      expect(row).toMatchObject({
        monthlyTicketsSold: 0,
        monthlySalesIrr: '0',
      });
      expect(typeof row?.monthlyTicketsSold).toBe('number');
      expect(typeof row?.monthlySalesIrr).toBe('string');
    });
  });

  describe('GET /agencies/invoices', () => {
    it('is forbidden for finance and empty for commercial when none exist', async () => {
      const finance = await loginAs(app, 'finance');
      await request(app.getHttpServer())
        .get('/agencies/invoices')
        .set('Authorization', auth(finance.accessToken))
        .expect(403);

      const commercial = await loginAs(app, 'comm');
      const res = await request(app.getHttpServer())
        .get('/agencies/invoices?status=VOIDED')
        .set('Authorization', auth(commercial.accessToken))
        .expect(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('rejects an invalid status query', async () => {
      const commercial = await loginAs(app, 'comm');
      await request(app.getHttpServer())
        .get('/agencies/invoices?status=OVERDUE')
        .set('Authorization', auth(commercial.accessToken))
        .expect(400);
    });

    it('serializes amounts as decimal strings and maps OVERDUE to UNPAID', async () => {
      const agency = await createFreshAgency();
      const commercial = await loginAs(app, 'comm');
      await dataSource.getRepository(AgencyInvoice).save(
        dataSource.getRepository(AgencyInvoice).create({
          agencyId: agency.id,
          invoiceNo: `INV-E2E-${crypto.randomUUID().slice(0, 6)}`,
          issuedById: (
            await dataSource
              .getRepository(User)
              .findOneByOrFail({ username: 'comm' })
          ).id,
          dueAt: new Date('2026-01-01T00:00:00.000Z'),
          amountIrr: 9_007_199_254_740_991n,
          status: 'OVERDUE',
          descriptionFa: 'بدهی معوق',
        }),
      );
      const res = await request(app.getHttpServer())
        .get('/agencies/invoices?status=UNPAID')
        .set('Authorization', auth(commercial.accessToken))
        .expect(200);
      const row = (
        res.body.data as Array<{
          amountIrr: string;
          status: string;
          agencyId: string;
          agencyName: string;
        }>
      ).find((item) => item.agencyId === agency.id);
      expect(row).toBeDefined();
      expect(row?.status).toBe('UNPAID');
      expect(row?.amountIrr).toBe('9007199254740991');
      expect(typeof row?.amountIrr).toBe('string');
      expect(row?.agencyName).toBe(agency.fullName);
    });
  });

  describe('seat requests', () => {
    it('lists sellable flights while keeping agency request capacity closed until its independent release is saved', async () => {
      const agency = await createFreshAgency();
      const instance = await futureInstance();
      await dataSource.getRepository(FareRule).update(
        {
          flightInstanceId: instance.id,
          cabin: CabinClass.ECONOMY,
          classCode: 'Y',
        },
        { agencySeatsReleased: 0, agencyReleasePriceIrr: null },
      );
      const agencyToken = await loginAsAgency(agency.phone);

      const catalogue = await request(app.getHttpServer())
        .get('/agency-portal/seat-request-options')
        .set('Authorization', auth(agencyToken))
        .expect(200);
      const closedOption = (
        catalogue.body.data as Array<{
          flightInstanceId: string;
          fareClassCode: string;
          agencySeatsReleased: number;
          availableToRequest: number;
          pricePerSeatIrr: string;
          sellableSeats: number;
        }>
      ).find(
        (row) =>
          row.flightInstanceId === instance.id && row.fareClassCode === 'Y',
      );
      expect(closedOption).toMatchObject({
        flightInstanceId: instance.id,
        agencySeatsReleased: 0,
        availableToRequest: 0,
      });
      expect(closedOption?.sellableSeats).toBeGreaterThan(0);

      await request(app.getHttpServer())
        .post('/agency-portal/seat-requests')
        .set('Authorization', auth(agencyToken))
        .send({
          flightInstanceId: instance.id,
          cabin: 'ECONOMY',
          fareClassCode: 'Y',
          seats: 4,
          payMethod: 'INVOICE',
        })
        .expect(400);

      const rule = await dataSource.getRepository(FareRule).findOneByOrFail({
        flightInstanceId: instance.id,
        cabin: CabinClass.ECONOMY,
        classCode: 'Y',
      });
      const commercial = await loginAs(app, 'comm');
      await request(app.getHttpServer())
        .put(`/flights/${instance.id}/fare-rules/${rule.id}/agency-release`)
        .set('Authorization', auth(commercial.accessToken))
        .send({ seats: 8, priceIrr: '4500000', specialOffer: false })
        .expect(200);

      const reopenedCatalogue = await request(app.getHttpServer())
        .get('/agency-portal/seat-request-options')
        .set('Authorization', auth(agencyToken))
        .expect(200);
      const option = (
        reopenedCatalogue.body.data as Array<{
          flightInstanceId: string;
          fareClassCode: string;
          agencySeatsReleased: number;
          availableToRequest: number;
          pricePerSeatIrr: string;
        }>
      ).find(
        (row) =>
          row.flightInstanceId === instance.id && row.fareClassCode === 'Y',
      );
      expect(option).toMatchObject({
        flightInstanceId: instance.id,
        agencySeatsReleased: 8,
        availableToRequest: 8,
        pricePerSeatIrr: '4500000',
      });

      const submitted = await request(app.getHttpServer())
        .post('/agency-portal/seat-requests')
        .set('Authorization', auth(agencyToken))
        .send({
          flightInstanceId: instance.id,
          cabin: 'ECONOMY',
          fareClassCode: 'Y',
          seats: 4,
          payMethod: 'INVOICE',
        })
        .expect(201);
      expect(submitted.body.data).toMatchObject({
        flightInstanceId: instance.id,
        seats: 4,
        status: 'SUBMITTED',
      });
    });

    it('agency submission creates a structured row; manager list, approve, reject, and 409 work', async () => {
      const agency = await createFreshAgency();
      const instance = await futureInstance();
      const agencyToken = await loginAsAgency(agency.phone);
      const submitted = await request(app.getHttpServer())
        .post('/agency-portal/seat-requests')
        .set('Authorization', auth(agencyToken))
        .send({
          flightInstanceId: instance.id,
          cabin: 'ECONOMY',
          fareClassCode: 'Y',
          seats: 4,
          payMethod: 'INVOICE',
        });
      expect(submitted.status).toBe(201);
      expect(submitted.body.data?.id).toBeTruthy();
      const requestId = submitted.body.data.id as string;

      const persisted = await dataSource
        .getRepository(AgencySeatRequest)
        .findOneByOrFail({ id: requestId });
      expect(persisted.status).toBe('PENDING');
      expect(persisted.seats).toBe(4);
      expect(persisted.termMonths).toBeNull();
      expect(persisted.cabin).toBe('ECONOMY');
      expect(persisted.fareClassCode).toBe('Y');

      const ownHistory = await request(app.getHttpServer())
        .get('/agency-portal/seat-requests')
        .set('Authorization', auth(agencyToken))
        .expect(200);
      const ownRow = (
        ownHistory.body.data as Array<{
          id: string;
          status: string;
          seats: number;
          totalPriceIrr: string;
          flights: Array<{ flightInstanceId: string }>;
        }>
      ).find((item) => item.id === requestId);
      expect(ownRow).toMatchObject({
        id: requestId,
        status: 'PENDING',
        seats: 4,
      });
      expect(typeof ownRow?.totalPriceIrr).toBe('string');
      expect(
        ownRow?.flights.some(
          (flight) => flight.flightInstanceId === instance.id,
        ),
      ).toBe(true);

      const tasks = await dataSource.getRepository(CartableTask).findBy({
        sourceType: 'AGENCY_REQUEST',
        sourceId: requestId,
      });
      expect(tasks.length).toBeGreaterThan(0);

      const commercial = await loginAs(app, 'comm');
      const listed = await request(app.getHttpServer())
        .get('/agencies/seat-requests')
        .set('Authorization', auth(commercial.accessToken))
        .expect(200);
      const row = (
        listed.body.data as Array<{
          id: string;
          unitPriceIrr: string;
          months: number;
        }>
      ).find((item) => item.id === requestId);
      expect(row).toBeDefined();
      expect(typeof row?.unitPriceIrr).toBe('string');
      expect(row?.months).toBe(1);

      const finance = await loginAs(app, 'finance');
      await request(app.getHttpServer())
        .get('/agencies/seat-requests')
        .set('Authorization', auth(finance.accessToken))
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/agencies/seat-requests/${requestId}/decide`)
        .set('Authorization', auth(finance.accessToken))
        .send({ approve: true, dueAt: '2026-09-01T00:00:00.000Z' })
        .expect(403);

      await request(app.getHttpServer())
        .patch(`/agencies/seat-requests/${requestId}/decide`)
        .set('Authorization', auth(commercial.accessToken))
        .send({ approve: true, dueAt: 'not-a-date' })
        .expect(400);

      const approved = await request(app.getHttpServer())
        .patch(`/agencies/seat-requests/${requestId}/decide`)
        .set('Authorization', auth(commercial.accessToken))
        .send({ approve: true, dueAt: '2026-09-01T00:00:00.000Z' })
        .expect(200);
      expect(approved.body.data.status).toBe('PENDING_FINANCE');

      const invoices = await dataSource.getRepository(AgencyInvoice).findBy({
        agencyId: agency.id,
      });
      const occurrenceCount = await dataSource
        .getRepository(AgencySeatRequestFlight)
        .countBy({ seatRequestId: requestId });
      expect(occurrenceCount).toBeGreaterThan(0);
      expect(invoices).toHaveLength(1);
      expect(invoices[0]?.descriptionFa).toBe('فاکتور خرید سهمیه صندلی آژانس');
      expect(invoices[0]?.amountIrr.toString()).toBe(
        (persisted.unitPriceIrr * 4n * BigInt(occurrenceCount)).toString(),
      );

      await request(app.getHttpServer())
        .patch(`/agencies/seat-requests/${requestId}/decide`)
        .set('Authorization', auth(commercial.accessToken))
        .send({ approve: true, dueAt: '2026-09-01T00:00:00.000Z' })
        .expect(409);
      expect(
        await dataSource
          .getRepository(AgencyInvoice)
          .countBy({ agencyId: agency.id }),
      ).toBe(1);

      expect(
        await dataSource
          .getRepository(AgencyAllotment)
          .countBy({ seatRequestId: requestId }),
      ).toBe(0);
      await request(app.getHttpServer())
        .post(`/agency-portal/invoices/${invoices[0].id}/pay`)
        .set('Authorization', auth(agencyToken))
        .expect(201);
      const activated = await dataSource
        .getRepository(AgencyAllotment)
        .findBy({ seatRequestId: requestId });
      expect(activated).toHaveLength(occurrenceCount);
      expect(activated[0]).toMatchObject({
        cabin: 'ECONOMY',
        fareClassCode: 'Y',
        seatsAllocated: 4,
      });
      expect(
        (
          await dataSource
            .getRepository(AgencySeatRequest)
            .findOneByOrFail({ id: requestId })
        ).status,
      ).toBe('APPROVED');

      const closed = await dataSource.getRepository(CartableTask).findBy({
        sourceType: 'AGENCY_REQUEST',
        sourceId: requestId,
      });
      expect(closed.every((task) => task.status !== 'OPEN')).toBe(true);

      const audits = await dataSource.getRepository(AuditLog).find({
        where: { entityType: 'AgencySeatRequest', entityId: requestId },
      });
      expect(audits.some((entry) => entry.action.includes('تأیید'))).toBe(true);
    });

    it('rejection does not create an invoice and blocks later decisions', async () => {
      const agency = await createFreshAgency();
      const instance = await futureInstance();
      const agencyToken = await loginAsAgency(agency.phone);
      const submitted = await request(app.getHttpServer())
        .post('/agency-portal/seat-requests')
        .set('Authorization', auth(agencyToken))
        .send({
          flightInstanceId: instance.id,
          cabin: 'ECONOMY',
          fareClassCode: 'Y',
          seats: 2,
          payMethod: 'INVOICE',
        });
      expect(submitted.status).toBe(201);
      const requestId = submitted.body.data.id as string;
      const commercial = await loginAs(app, 'comm');
      await request(app.getHttpServer())
        .patch(`/agencies/seat-requests/${requestId}/decide`)
        .set('Authorization', auth(commercial.accessToken))
        .send({ approve: false })
        .expect(200);
      expect(
        await dataSource
          .getRepository(AgencyInvoice)
          .countBy({ agencyId: agency.id }),
      ).toBe(0);
      await request(app.getHttpServer())
        .patch(`/agencies/seat-requests/${requestId}/decide`)
        .set('Authorization', auth(commercial.accessToken))
        .send({ approve: true, dueAt: '2026-09-01T00:00:00.000Z' })
        .expect(409);
    });

    it('rolls back the decision when invoice creation fails', async () => {
      const instance = await futureInstance();
      const commercialUser = await dataSource
        .getRepository(User)
        .findOneByOrFail({ username: 'comm' });
      const orphanId = crypto.randomUUID();
      await dataSource.getRepository(AgencySeatRequest).save(
        dataSource.getRepository(AgencySeatRequest).create({
          id: orphanId,
          agencyId: crypto.randomUUID(),
          routeId: instance.flight.routeId,
          aircraftType: 'Airbus A320',
          seats: 2,
          termMonths: 1,
          unitPriceIrr: 1_000_000n,
          payMethod: 'INVOICE',
          status: 'PENDING',
        }),
      );
      const commercial = await loginAs(app, 'comm');
      const res = await request(app.getHttpServer())
        .patch(`/agencies/seat-requests/${orphanId}/decide`)
        .set('Authorization', auth(commercial.accessToken))
        .send({ approve: true, dueAt: '2026-09-01T00:00:00.000Z' });
      expect([400, 404]).toContain(res.status);
      const row = await dataSource
        .getRepository(AgencySeatRequest)
        .findOneByOrFail({ id: orphanId });
      expect(row.status).toBe('PENDING');
      expect(row.invoiceId).toBeNull();
      expect(commercialUser.id).toBeTruthy();
    });
  });

  describe('ancillary services', () => {
    it('lists grouped services, mutates price/enabled, and blocks built-in delete', async () => {
      const finance = await loginAs(app, 'finance');
      await request(app.getHttpServer())
        .get('/ancillary-services')
        .set('Authorization', auth(finance.accessToken))
        .expect(403);

      const commercial = await loginAs(app, 'comm');
      const listed = await request(app.getHttpServer())
        .get('/ancillary-services')
        .set('Authorization', auth(commercial.accessToken))
        .expect(200);
      expect(listed.body.data.seatServices.length).toBeGreaterThanOrEqual(3);
      expect(listed.body.data.otherServices.length).toBeGreaterThanOrEqual(7);
      expect(
        listed.body.data.otherServices.some(
          (service: { key: string }) => service.key === 'refund-fee',
        ),
      ).toBe(false);
      expect(listed.body.data.seatServices[0].priceIrr).toEqual(
        expect.any(String),
      );

      await request(app.getHttpServer())
        .patch('/ancillary-services/seat-normal/price')
        .set('Authorization', auth(commercial.accessToken))
        .send({ priceIrr: '-1' })
        .expect(400);

      await request(app.getHttpServer())
        .patch('/ancillary-services/seat-normal/price')
        .set('Authorization', auth(commercial.accessToken))
        .send({ priceIrr: '1500000' })
        .expect(200);

      await request(app.getHttpServer())
        .patch('/ancillary-services/cip/enabled')
        .set('Authorization', auth(commercial.accessToken))
        .send({ enabled: true })
        .expect(200);

      const created = await request(app.getHttpServer())
        .post('/ancillary-services')
        .set('Authorization', auth(commercial.accessToken))
        .send({
          titleFa: 'اینترنت پروازی',
          descriptionFa: 'وایفای',
          priceIrr: '1000000',
        })
        .expect(201);
      const custom = (
        created.body.data.otherServices as Array<{
          key: string;
          isCustom: boolean;
        }>
      ).find((row) => row.isCustom);
      expect(custom?.key).toMatch(/^custom-/);

      await request(app.getHttpServer())
        .delete('/ancillary-services/seat-normal')
        .set('Authorization', auth(commercial.accessToken))
        .expect(400);

      await request(app.getHttpServer())
        .delete(`/ancillary-services/${custom!.key}`)
        .set('Authorization', auth(commercial.accessToken))
        .expect(200);

      const publicList = await request(app.getHttpServer())
        .get('/public/ancillary-services')
        .expect(200);
      expect(
        (
          publicList.body.data as Array<{
            key: string;
            updatedById?: unknown;
            isCustom?: unknown;
          }>
        ).every(
          (row) =>
            row.key !== 'seat-normal' &&
            row.key !== 'pet' &&
            row.updatedById === undefined &&
            row.isCustom === undefined,
        ),
      ).toBe(true);
      expect(
        (publicList.body.data as Array<{ priceIrr: unknown }>).every(
          (row) => typeof row.priceIrr === 'string',
        ),
      ).toBe(true);

      const audits = await dataSource.getRepository(AuditLog).find({
        where: { entityType: 'AncillaryService' },
      });
      expect(audits.length).toBeGreaterThan(0);
    });
  });
});
