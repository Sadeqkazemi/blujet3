import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as crypto from 'node:crypto';
import { DataSource } from 'typeorm';
import { Flight } from '../src/database/entities/flight.entity';
import { FlightInstance } from '../src/database/entities/flight-instance.entity';
import { Booking } from '../src/database/entities/booking.entity';
import { RefundRequest } from '../src/database/entities/refund-request.entity';
import { LedgerEntry } from '../src/database/entities/ledger-entry.entity';
import { User } from '../src/database/entities/user.entity';
import { AuditLog } from '../src/database/entities/audit-log.entity';
import { encryptPii } from '../src/common/pii-crypto';
import { loginAs, stepUpFor } from './helpers/login.helper';
import { createTestApp } from './helpers/app.helper';
import type { RefundStatus } from '../src/database/enums';

describe('Refunds (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  beforeEach(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
  });

  afterEach(async () => {
    await app.close();
  });

  async function createRequest(
    status: RefundStatus,
    totalPaidIrr = 30_000_000,
  ) {
    const flight = await dataSource
      .getRepository(Flight)
      .createQueryBuilder('f')
      .getOneOrFail();
    const instanceRepo = dataSource.getRepository(FlightInstance);
    const instance = await instanceRepo.save(
      instanceRepo.create({
        flightId: flight.id,
        departureAt: new Date(Date.now() + 7 * 24 * 3_600_000),
        arrivalAt: new Date(Date.now() + 7 * 24 * 3_600_000 + 3 * 3_600_000),
        capacity: 180,
        charterSeats: 0,
        status: 'SCHEDULED',
      }),
    );
    const bookingRepo = dataSource.getRepository(Booking);
    const booking = await bookingRepo.save(
      bookingRepo.create({
        pnr: `RT${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
        flightInstanceId: instance.id,
        channel: 'SYSTEM',
        status: 'TICKETED',
        priceIrr: BigInt(totalPaidIrr),
      }),
    );
    const penaltyAmountIrr = Math.round(totalPaidIrr * 0.3);
    const refundRepo = dataSource.getRepository(RefundRequest);
    const req = await refundRepo.save(
      refundRepo.create({
        trackingCode: `RF-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
        bookingId: booking.id,
        passengerName: `مسافر ${crypto.randomUUID().slice(0, 4)}`,
        ibanEnc: encryptPii('IR820170000000332211009900'),
        nidEnc: encryptPii('0012345679'),
        totalPaidIrr: BigInt(totalPaidIrr),
        penaltyPct: 30,
        penaltyAmountIrr: BigInt(penaltyAmountIrr),
        refundableIrr: BigInt(totalPaidIrr - penaltyAmountIrr),
        status,
        history: [{ step: 'submitted', labelFa: 'ثبت درخواست', at: 'اکنون' }],
      }),
    );
    return { booking, req };
  }

  it('GET /refunds returns the cards + reconciling KPI counts; PII never in the list', async () => {
    await createRequest('FINANCE');
    await createRequest('SUBMITTED');
    const { accessToken } = await loginAs(app, 'finance');

    const res = await request(app.getHttpServer())
      .get('/refunds')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    const { requests, kpis } = res.body.data as {
      requests: Record<string, unknown>[];
      kpis: { payoutQueue: number; paid: number; awaitingAdmin: number };
    };
    expect(kpis.payoutQueue).toBeGreaterThanOrEqual(1);
    expect(kpis.awaitingAdmin).toBeGreaterThanOrEqual(1);
    expect(kpis.payoutQueue + kpis.paid + kpis.awaitingAdmin).toBe(
      requests.length,
    );
    expect(
      requests.every(
        (r) => !('ibanEnc' in r) && !('nidEnc' in r) && !('iban' in r),
      ),
    ).toBe(true);
  });

  it('detail decrypts the شبا for the finance surface; the DB row stays encrypted', async () => {
    const { req } = await createRequest('FINANCE');
    const { accessToken } = await loginAs(app, 'finance');

    const res = await request(app.getHttpServer())
      .get(`/refunds/${req.id}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.iban).toBe('IR820170000000332211009900');
    expect(res.body.data.nationalId).toBe('0012345679');

    const row = await dataSource
      .getRepository(RefundRequest)
      .createQueryBuilder('r')
      .where('r.id = :id', { id: req.id })
      .getOneOrFail();
    expect(row.ibanEnc).not.toContain('IR8201');
  });

  it('every endpoint 403s for non-finance roles', async () => {
    const { req } = await createRequest('FINANCE');
    const ceo = await loginAs(app, 'ceo');

    const list = await request(app.getHttpServer())
      .get('/refunds')
      .set('Authorization', `Bearer ${ceo.accessToken}`);
    expect(list.status).toBe(403);

    const pay = await request(app.getHttpServer())
      .patch(`/refunds/${req.id}/pay`)
      .set('Authorization', `Bearer ${ceo.accessToken}`);
    expect(pay.status).toBe(403);
  });

  it('finance reassignment changes assignee + history without changing FINANCE; non-finance assignee → 400', async () => {
    const { req } = await createRequest('FINANCE');
    const { accessToken } = await loginAs(app, 'finance');
    const staffer = await dataSource
      .getRepository(User)
      .findOneByOrFail({ username: 'finance' });

    const res = await request(app.getHttpServer())
      .patch(`/refunds/${req.id}/refer`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ assigneeId: staffer.id });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('FINANCE'); // unchanged, per design
    expect(res.body.data.assigneeId).toBe(staffer.id);
    const history = res.body.data.history as { labelFa: string }[];
    expect(history.some((h) => h.labelFa.includes('تغییر مسئول'))).toBe(true);

    const customer = await dataSource
      .getRepository(User)
      .findOneByOrFail({ role: 'USER' });
    const invalid = await request(app.getHttpServer())
      .patch(`/refunds/${req.id}/refer`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ assigneeId: customer.id });
    expect(invalid.status).toBe(400);
  });

  it('pay is transactional: ledger REFUND row + booking REFUNDED + PAID with processedBy; audited', async () => {
    const { booking, req } = await createRequest('FINANCE');
    const { accessToken } = await loginAs(app, 'finance');
    const stepUp = await stepUpFor(
      app,
      accessToken!,
      'finance',
      'REFUND_PAYOUT',
    );

    const res = await request(app.getHttpServer())
      .patch(`/refunds/${req.id}/pay`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(stepUp);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('PAID');
    expect(res.body.data.processedBy.role).toBe('FINANCE_MANAGER');
    expect(res.body.data.paidAt).toBeTruthy();

    const ledger = await dataSource
      .getRepository(LedgerEntry)
      .findBy({ bookingId: booking.id, type: 'REFUND' });
    expect(ledger).toHaveLength(1);
    expect(ledger[0].signedAmountIrr).toBe(-req.refundableIrr);

    const updatedBooking = await dataSource
      .getRepository(Booking)
      .createQueryBuilder('b')
      .where('b.id = :id', { id: booking.id })
      .getOneOrFail();
    expect(updatedBooking.status).toBe('REFUNDED');

    const audit = await dataSource
      .getRepository(AuditLog)
      .createQueryBuilder('a')
      .where('a.category = :category', { category: 'REFUND' })
      .andWhere('a.entityType = :entityType', { entityType: 'RefundRequest' })
      .andWhere('a.entityId = :entityId', { entityId: req.id })
      .getOne();
    expect(audit).not.toBeNull();
  });

  it('pay on SUBMITTED → 409 «در انتظار ادمین»; double-pay → 409 with exactly ONE ledger row', async () => {
    const submitted = await createRequest('SUBMITTED');
    const { accessToken } = await loginAs(app, 'finance');
    const stepUp1 = await stepUpFor(
      app,
      accessToken!,
      'finance',
      'REFUND_PAYOUT',
    );

    const early = await request(app.getHttpServer())
      .patch(`/refunds/${submitted.req.id}/pay`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(stepUp1);
    expect(early.status).toBe(409);
    expect(early.body.error.message).toBe('در انتظار ادمین');

    const payable = await createRequest('FINANCE');
    const stepUp2 = await stepUpFor(
      app,
      accessToken!,
      'finance',
      'REFUND_PAYOUT',
    );
    const first = await request(app.getHttpServer())
      .patch(`/refunds/${payable.req.id}/pay`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(stepUp2);
    expect(first.status).toBe(200);

    const stepUp3 = await stepUpFor(
      app,
      accessToken!,
      'finance',
      'REFUND_PAYOUT',
    );
    const replay = await request(app.getHttpServer())
      .patch(`/refunds/${payable.req.id}/pay`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(stepUp3);
    expect(replay.status).toBe(409);

    const ledger = await dataSource
      .getRepository(LedgerEntry)
      .countBy({ bookingId: payable.booking.id, type: 'REFUND' });
    expect(ledger).toBe(1);
  });

  it('the ledger reconciles: sum of REFUND entries equals the paid requests’ refundable totals', async () => {
    const a = await createRequest('FINANCE', 20_000_000);
    const b = await createRequest('FINANCE', 40_000_000);
    const { accessToken } = await loginAs(app, 'finance');

    for (const { req } of [a, b]) {
      const stepUp = await stepUpFor(
        app,
        accessToken!,
        'finance',
        'REFUND_PAYOUT',
      );
      const res = await request(app.getHttpServer())
        .patch(`/refunds/${req.id}/pay`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(stepUp);
      expect(res.status).toBe(200);
    }

    const ledgerSum = await dataSource
      .getRepository(LedgerEntry)
      .createQueryBuilder('l')
      .select('SUM(l.signedAmountIrr)', 'sum')
      .where('l.bookingId IN (:...bookingIds)', {
        bookingIds: [a.booking.id, b.booking.id],
      })
      .andWhere('l.type = :type', { type: 'REFUND' })
      .getRawOne<{ sum: string }>();
    expect(BigInt(ledgerSum!.sum)).toBe(
      -(a.req.refundableIrr + b.req.refundableIrr),
    );
  });
});
