import {
  INestApplication,
  ServiceUnavailableException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Logger } from 'nestjs-pino';
import cookieParser from 'cookie-parser';
import { createHmac, randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { ErrorCode } from '../src/common/errors';
import { BankLoanApplication } from '../src/database/entities/bank-loan-application.entity';
import { BankLoanWebhookEvent } from '../src/database/entities/bank-loan-webhook-event.entity';
import { WalletEntry } from '../src/database/entities/wallet-entry.entity';
import {
  BANK_LOAN_PROVIDER,
  BankLoanHttpAdapter,
} from '../src/modules/loans/bank-loan.http.adapter';
import type { BankLoanProvider } from '../src/modules/loans/bank-loan.types';
import { bankScopedIdempotencyKey } from '../src/modules/loans/loan-idempotency';
import {
  loginAs,
  loginAsCustomer as loginAsCustomerRaw,
} from './helpers/login.helper';

class FakeBank implements BankLoanProvider {
  created = 0;
  delayMs = 0;
  /** Fail this many create calls with retryable bank errors. */
  failTimes = 0;
  keysSeen: string[] = [];
  requestAccountOpening() {
    return Promise.resolve({
      referenceId: 'OPEN-E2E',
      status: 'COMPLETED' as const,
      customerNumber: '1234567890',
    });
  }
  getAccountOpeningStatus() {
    return this.requestAccountOpening();
  }
  requestEligibility() {
    return Promise.resolve({
      referenceId: `ELIGIBLE-${randomUUID()}`,
      status: 'ELIGIBLE' as const,
      eligibleAmountIrr: '10000000000',
    });
  }
  getEligibilityStatus() {
    return this.requestEligibility();
  }
  createApplication(req: {
    idempotencyKey: string;
    requestedAmountIrr: string;
  }) {
    this.created += 1;
    this.keysSeen.push(req.idempotencyKey);
    // Stable bank reference for a given bank-scoped idempotency key.
    const payload = {
      bankReferenceId: `BANK-${req.idempotencyKey.slice(0, 24)}`,
      bankStatus: 'SUBMITTED' as const,
      summary: { status: 'SUBMITTED' },
    };
    if (this.failTimes > 0) {
      this.failTimes -= 1;
      return Promise.reject(
        new ServiceUnavailableException({
          code: ErrorCode.INTERNAL_ERROR,
          message: 'ارتباط با بانک برقرار نشد. لطفاً بعداً تلاش کنید.',
        }),
      );
    }
    if (this.delayMs <= 0) return Promise.resolve(payload);
    return new Promise((resolve) => {
      setTimeout(() => resolve(payload), this.delayMs);
    });
  }
  getStatus(bankReferenceId: string) {
    return Promise.resolve({
      bankReferenceId,
      bankStatus: 'UNDER_REVIEW' as const,
      summary: { status: 'UNDER_REVIEW' },
    });
  }
}

function sign(payload: unknown) {
  const raw = JSON.stringify(payload);
  const sig = createHmac('sha256', 'e2e-bank-webhook-secret')
    .update(raw)
    .digest('hex');
  return { raw, sig };
}

describe('Bank loans adapter (e2e)', () => {
  let app: INestApplication<App>;
  let fake: FakeBank;
  let dataSource: DataSource;

  async function loginAsCustomer(
    appInstance: INestApplication<App>,
    phone: string,
  ) {
    const login = await loginAsCustomerRaw(appInstance, phone);
    const response = await request(appInstance.getHttpServer())
      .post('/me/loan-profile/eligibility')
      .set('Authorization', `Bearer ${login.accessToken}`)
      .send({
        customerNumber: '1234567890',
        idempotencyKey: `eligibility-${phone}-${randomUUID()}`,
      });
    expect(response.status).toBe(201);
    expect(response.body.data.eligibilityStatus).toBe('ELIGIBLE');
    return login;
  }

  beforeEach(async () => {
    fake = new FakeBank();
    process.env.BANK_LOAN_WEBHOOK_SECRET = 'e2e-bank-webhook-secret';
    process.env.BANK_LOAN_PROVIDER = 'e2e-bank';
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(BANK_LOAN_PROVIDER)
      .useValue(fake)
      .overrideProvider(BankLoanHttpAdapter)
      .useValue(fake)
      .compile();
    app = moduleFixture.createNestApplication({
      bufferLogs: true,
      rawBody: true,
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

  async function postWebhook(payload: Record<string, unknown>) {
    const { sig } = sign(payload);
    return request(app.getHttpServer())
      .post('/webhooks/bank-loans')
      .set('Content-Type', 'application/json')
      .set('X-Bank-Signature', sig)
      .send(payload);
  }

  async function walletTopups(userId: string) {
    return dataSource.getRepository(WalletEntry).count({
      where: { userId, type: 'TOPUP' },
    });
  }

  it('create is idempotent; webhook updates status with valid signature', async () => {
    const { accessToken } = await loginAsCustomer(app, '09138880001');
    const key = `loan-e2e-${Date.now()}`;
    const created = await request(app.getHttpServer())
      .post('/me/loan-applications')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ requestedAmountIrr: '500000000', idempotencyKey: key });
    expect(created.status).toBe(201);
    expect(created.body.data.displayStatus).toBe('awaiting_bank');
    expect(fake.created).toBe(1);

    const replay = await request(app.getHttpServer())
      .post('/me/loan-applications')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ requestedAmountIrr: '500000000', idempotencyKey: key });
    expect(replay.status).toBe(201);
    expect(replay.body.data.id).toBe(created.body.data.id);
    expect(fake.created).toBe(1);

    const payload = {
      eventId: `evt-${key}`,
      bankReferenceId: created.body.data.bankReferenceId,
      status: 'APPROVED',
      occurredAt: new Date().toISOString(),
    };
    const wh = await postWebhook(payload);
    expect(wh.status).toBe(200);

    const got = await request(app.getHttpServer())
      .get(`/me/loan-applications/${created.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(got.status).toBe(200);
    expect(got.body.data.displayStatus).toBe('approved');

    const dup = await postWebhook(payload);
    expect(dup.status).toBe(200);
    expect(dup.body.data.duplicate).toBe(true);

    const events = await dataSource.getRepository(BankLoanWebhookEvent).count({
      where: { eventId: payload.eventId },
    });
    expect(events).toBe(1);
  });

  it('site-admin list/detail include the related real customer identity and remain read-only', async () => {
    const phone = '09138880031';
    const customer = await loginAsCustomer(app, phone);
    const key = `loan-admin-view-${Date.now()}`;
    const created = await request(app.getHttpServer())
      .post('/me/loan-applications')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ requestedAmountIrr: '540000000', idempotencyKey: key });
    expect(created.status).toBe(201);

    const siteAdmin = await loginAs(app, 'site.admin');
    const list = await request(app.getHttpServer())
      .get('/admin/loan-applications?page=1&pageSize=100')
      .set('Authorization', `Bearer ${siteAdmin.accessToken}`);
    expect(list.status).toBe(200);
    const row = list.body.data.items.find(
      (item: { id: string }) => item.id === created.body.data.id,
    );
    expect(row.customer.id).toBe(customer.userId);
    expect(row.customer.phone).toBe('+989138880031');
    expect(row.customer.fullName).toBeTruthy();

    const detail = await request(app.getHttpServer())
      .get(`/admin/loan-applications/${created.body.data.id}`)
      .set('Authorization', `Bearer ${siteAdmin.accessToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.customer.id).toBe(customer.userId);
  });

  it('PENDING and REJECTED never credit the wallet', async () => {
    const { accessToken, userId } = await loginAsCustomer(app, '09138880011');
    expect(userId).toBeTruthy();
    const key = `loan-no-credit-${Date.now()}`;
    const amount = '750000000';
    const created = await request(app.getHttpServer())
      .post('/me/loan-applications')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ requestedAmountIrr: amount, idempotencyKey: key });
    expect(created.status).toBe(201);
    const before = await walletTopups(userId!);
    const ref = created.body.data.bankReferenceId as string;

    const pending = await postWebhook({
      eventId: `evt-pending-${key}`,
      bankReferenceId: ref,
      status: 'PENDING',
      walletCreditIrr: amount,
      walletCreditReference: `cred-pending-${key}`,
      occurredAt: new Date(Date.now() - 60_000).toISOString(),
    });
    expect(pending.status).toBe(200);

    const rejected = await postWebhook({
      eventId: `evt-rejected-${key}`,
      bankReferenceId: ref,
      status: 'REJECTED',
      walletCreditIrr: amount,
      walletCreditReference: `cred-rejected-${key}`,
      occurredAt: new Date().toISOString(),
    });
    expect(rejected.status).toBe(200);

    const after = await walletTopups(userId!);
    expect(after).toBe(before);
    const loan = await dataSource
      .getRepository(BankLoanApplication)
      .findOneByOrFail({ id: created.body.data.id });
    expect(loan.walletCreditReference).toBeNull();
    expect(loan.bankStatus).toBe('REJECTED');
  });

  it('duplicate/concurrent DISBURSED credits wallet only once', async () => {
    const { accessToken, userId } = await loginAsCustomer(app, '09138880012');
    const key = `loan-disb-${Date.now()}`;
    const amount = '600000000';
    const created = await request(app.getHttpServer())
      .post('/me/loan-applications')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ requestedAmountIrr: amount, idempotencyKey: key });
    expect(created.status).toBe(201);
    const before = await walletTopups(userId!);
    const ref = created.body.data.bankReferenceId as string;
    const creditRef = `cred-disb-${key}`;
    const occurredAt = new Date().toISOString();

    const payloads = [1, 2].map((n) => ({
      eventId: `evt-disb-${key}-${n}`,
      bankReferenceId: ref,
      status: 'DISBURSED',
      walletCreditIrr: amount,
      walletCreditReference: creditRef,
      occurredAt,
    }));

    const results = await Promise.all(payloads.map((p) => postWebhook(p)));
    for (const r of results) expect(r.status).toBe(200);

    const after = await walletTopups(userId!);
    expect(after - before).toBe(1);
    const loan = await dataSource
      .getRepository(BankLoanApplication)
      .findOneByOrFail({ id: created.body.data.id });
    expect(loan.walletCreditReference).toBe(creditRef);
    expect(loan.bankStatus).toBe('DISBURSED');
  });

  it('same idempotencyKey across users does not leak entities', async () => {
    const a = await loginAsCustomer(app, '09138880013');
    const b = await loginAsCustomer(app, '09138880014');
    const key = `shared-key-${Date.now()}`;
    const amount = '400000000';

    const createdA = await request(app.getHttpServer())
      .post('/me/loan-applications')
      .set('Authorization', `Bearer ${a.accessToken}`)
      .send({ requestedAmountIrr: amount, idempotencyKey: key });
    expect(createdA.status).toBe(201);

    const createdB = await request(app.getHttpServer())
      .post('/me/loan-applications')
      .set('Authorization', `Bearer ${b.accessToken}`)
      .send({ requestedAmountIrr: amount, idempotencyKey: key });
    expect(createdB.status).toBe(201);
    expect(createdB.body.data.id).not.toBe(createdA.body.data.id);
    expect(createdB.body.data.bankReferenceId).not.toBe(
      createdA.body.data.bankReferenceId,
    );

    const leak = await request(app.getHttpServer())
      .get(`/me/loan-applications/${createdA.body.data.id}`)
      .set('Authorization', `Bearer ${b.accessToken}`);
    expect(leak.status).toBe(404);

    const own = await request(app.getHttpServer())
      .get(`/me/loan-applications/${createdB.body.data.id}`)
      .set('Authorization', `Bearer ${b.accessToken}`);
    expect(own.status).toBe(200);
    expect(own.body.data.id).toBe(createdB.body.data.id);
  });

  it('concurrent same-user idempotency reserves once and calls bank once', async () => {
    fake.delayMs = 120;
    const { accessToken } = await loginAsCustomer(app, '09138880016');
    const key = `loan-conc-idem-${Date.now()}`;
    const body = { requestedAmountIrr: '550000000', idempotencyKey: key };
    const [a, b] = await Promise.all([
      request(app.getHttpServer())
        .post('/me/loan-applications')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(body),
      request(app.getHttpServer())
        .post('/me/loan-applications')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(body),
    ]);
    expect([201, 202]).toContain(a.status);
    expect([201, 202]).toContain(b.status);
    expect(a.body.data.id).toBe(b.body.data.id);
    expect(fake.created).toBe(1);
    expect(fake.keysSeen[0]).toMatch(/^[a-f0-9]{64}$/);
    // At least the winner finishes with a bank reference; never a silent
    // incomplete 201 with null bankReferenceId.
    const statuses = [a, b];
    for (const res of statuses) {
      if (res.status === 201) {
        expect(res.body.data.bankReferenceId).toBeTruthy();
      }
    }
  });

  it('concurrent identical eventId yields one APPLIED and one DUPLICATE', async () => {
    const { accessToken, userId } = await loginAsCustomer(app, '09138880017');
    const key = `loan-evt-race-${Date.now()}`;
    const amount = '610000000';
    const created = await request(app.getHttpServer())
      .post('/me/loan-applications')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ requestedAmountIrr: amount, idempotencyKey: key });
    expect(created.status).toBe(201);
    const before = await walletTopups(userId!);
    const payload = {
      eventId: `evt-same-${key}`,
      bankReferenceId: created.body.data.bankReferenceId,
      status: 'DISBURSED',
      walletCreditIrr: amount,
      walletCreditReference: `cred-evt-${key}`,
      occurredAt: new Date().toISOString(),
    };
    const [w1, w2] = await Promise.all([
      postWebhook(payload),
      postWebhook(payload),
    ]);
    expect(w1.status).toBe(200);
    expect(w2.status).toBe(200);
    const outcomes = [w1.body.data.result, w2.body.data.result].sort();
    expect(outcomes).toEqual(['APPLIED', 'DUPLICATE']);
    expect((await walletTopups(userId!)) - before).toBe(1);
    const events = await dataSource.getRepository(BankLoanWebhookEvent).count({
      where: { eventId: payload.eventId },
    });
    expect(events).toBe(1);
  });

  it('same creditReference across two loans credits wallet only once', async () => {
    const a = await loginAsCustomer(app, '09138880018');
    const b = await loginAsCustomer(app, '09138880019');
    const stamp = Date.now();
    const amount = '620000000';
    const creditRef = `cred-shared-${stamp}`;
    const createdA = await request(app.getHttpServer())
      .post('/me/loan-applications')
      .set('Authorization', `Bearer ${a.accessToken}`)
      .send({
        requestedAmountIrr: amount,
        idempotencyKey: `loan-a-${stamp}`,
      });
    const createdB = await request(app.getHttpServer())
      .post('/me/loan-applications')
      .set('Authorization', `Bearer ${b.accessToken}`)
      .send({
        requestedAmountIrr: amount,
        idempotencyKey: `loan-b-${stamp}`,
      });
    expect(createdA.status).toBe(201);
    expect(createdB.status).toBe(201);
    const beforeA = await walletTopups(a.userId!);
    const beforeB = await walletTopups(b.userId!);

    const [wa, wb] = await Promise.all([
      postWebhook({
        eventId: `evt-a-${stamp}`,
        bankReferenceId: createdA.body.data.bankReferenceId,
        status: 'DISBURSED',
        walletCreditIrr: amount,
        walletCreditReference: creditRef,
        occurredAt: new Date().toISOString(),
      }),
      postWebhook({
        eventId: `evt-b-${stamp}`,
        bankReferenceId: createdB.body.data.bankReferenceId,
        status: 'DISBURSED',
        walletCreditIrr: amount,
        walletCreditReference: creditRef,
        occurredAt: new Date().toISOString(),
      }),
    ]);
    expect(wa.status).toBe(200);
    expect(wb.status).toBe(200);
    expect(wa.body.data.result).not.toBe('error');
    expect(wb.body.data.result).not.toBe('error');

    const afterA = await walletTopups(a.userId!);
    const afterB = await walletTopups(b.userId!);
    expect(afterA - beforeA + (afterB - beforeB)).toBe(1);

    const loanA = await dataSource
      .getRepository(BankLoanApplication)
      .findOneByOrFail({ id: createdA.body.data.id });
    const loanB = await dataSource
      .getRepository(BankLoanApplication)
      .findOneByOrFail({ id: createdB.body.data.id });
    const refs = [loanA.walletCreditReference, loanB.walletCreditReference];
    expect(refs.filter((r) => r === creditRef)).toHaveLength(1);
    expect(refs.filter((r) => r == null)).toHaveLength(1);
  });

  it('stale webhook cannot rollback DISBURSED/REJECTED', async () => {
    const { accessToken } = await loginAsCustomer(app, '09138880015');
    const key = `loan-stale-${Date.now()}`;
    const created = await request(app.getHttpServer())
      .post('/me/loan-applications')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ requestedAmountIrr: '300000000', idempotencyKey: key });
    expect(created.status).toBe(201);
    const ref = created.body.data.bankReferenceId as string;

    const newer = await postWebhook({
      eventId: `evt-new-${key}`,
      bankReferenceId: ref,
      status: 'DISBURSED',
      walletCreditIrr: '300000000',
      walletCreditReference: `cred-stale-${key}`,
      occurredAt: new Date('2026-08-09T12:00:00.000Z').toISOString(),
    });
    expect(newer.status).toBe(200);

    const stale = await postWebhook({
      eventId: `evt-old-${key}`,
      bankReferenceId: ref,
      status: 'PENDING',
      occurredAt: new Date('2026-08-09T10:00:00.000Z').toISOString(),
    });
    expect(stale.status).toBe(200);
    expect(stale.body.data.ignored).toBe(true);

    const got = await request(app.getHttpServer())
      .get(`/me/loan-applications/${created.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(got.body.data.displayStatus).toBe('disbursed');
    expect(got.body.data.bankStatus).toBe('DISBURSED');
  });

  it('same user/key with different amount returns 409 IDEMPOTENCY_PAYLOAD_MISMATCH', async () => {
    const { accessToken } = await loginAsCustomer(app, '09138880020');
    const key = `loan-mismatch-${Date.now()}`;
    const first = await request(app.getHttpServer())
      .post('/me/loan-applications')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ requestedAmountIrr: '500000000', idempotencyKey: key });
    expect(first.status).toBe(201);

    const second = await request(app.getHttpServer())
      .post('/me/loan-applications')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ requestedAmountIrr: '600000000', idempotencyKey: key });
    expect(second.status).toBe(409);
    expect(second.body.error?.code).toBe(
      ErrorCode.IDEMPOTENCY_PAYLOAD_MISMATCH,
    );
    expect(second.body.data?.id).toBeUndefined();
  });

  it('stale INITIATING reservation is reclaimed safely with same bank key', async () => {
    const { accessToken, userId } = await loginAsCustomer(app, '09138880021');
    expect(userId).toBeTruthy();
    const key = `loan-reclaim-${Date.now()}`;
    const amount = '510000000';
    const id = randomUUID();
    const past = new Date(Date.now() - 60_000);
    await dataSource.query(
      `
      INSERT INTO "bank_loan_applications"
        ("id", "userId", "idempotencyKey", "requestedAmountIrr", "bankStatus",
         "initiationStartedAt", "initiationLeaseUntil", "createdAt", "updatedAt")
      VALUES ($1, $2, $3, $4, 'INITIATING', $5, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `,
      [id, userId, key, amount, past],
    );

    const recovered = await request(app.getHttpServer())
      .post('/me/loan-applications')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ requestedAmountIrr: amount, idempotencyKey: key });
    expect(recovered.status).toBe(201);
    expect(recovered.body.data.id).toBe(id);
    expect(recovered.body.data.bankReferenceId).toBeTruthy();
    expect(fake.created).toBe(1);
    expect(fake.keysSeen[0]).toBe(bankScopedIdempotencyKey(userId!, key));
  });

  it('bank timeout then retry uses the same bank-scoped idempotency key', async () => {
    fake.failTimes = 1;
    const { accessToken, userId } = await loginAsCustomer(app, '09138880022');
    const key = `loan-timeout-${Date.now()}`;
    const amount = '520000000';
    const expectedBankKey = bankScopedIdempotencyKey(userId!, key);

    const first = await request(app.getHttpServer())
      .post('/me/loan-applications')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ requestedAmountIrr: amount, idempotencyKey: key });
    expect(first.status).toBe(503);
    expect(first.body.error?.code).toBe(ErrorCode.LOAN_BANK_RETRYABLE);
    expect(fake.keysSeen[0]).toBe(expectedBankKey);

    const retry = await request(app.getHttpServer())
      .post('/me/loan-applications')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ requestedAmountIrr: amount, idempotencyKey: key });
    expect(retry.status).toBe(201);
    expect(retry.body.data.bankReferenceId).toBeTruthy();
    expect(fake.created).toBe(2);
    expect(fake.keysSeen[1]).toBe(expectedBankKey);
    expect(fake.keysSeen[0]).toBe(fake.keysSeen[1]);
  });

  it('concurrent create during long bank call does not return incomplete 201', async () => {
    fake.delayMs = 2_500;
    process.env.BANK_LOAN_INIT_WAIT_MS = '400';
    await app.close();
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(BANK_LOAN_PROVIDER)
      .useValue(fake)
      .overrideProvider(BankLoanHttpAdapter)
      .useValue(fake)
      .compile();
    app = moduleFixture.createNestApplication({
      bufferLogs: true,
      rawBody: true,
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

    const { accessToken } = await loginAsCustomer(app, '09138880023');
    const key = `loan-long-${Date.now()}`;
    const body = { requestedAmountIrr: '530000000', idempotencyKey: key };

    const slow = request(app.getHttpServer())
      .post('/me/loan-applications')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(body);
    await new Promise((r) => setTimeout(r, 50));
    const peer = await request(app.getHttpServer())
      .post('/me/loan-applications')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(body);

    // Never a successful create without bankReferenceId.
    if (peer.status === 201) {
      expect(peer.body.data.bankReferenceId).toBeTruthy();
    } else {
      expect([202, 503]).toContain(peer.status);
      if (peer.status === 202) {
        expect(peer.body.data.bankReferenceId).toBeNull();
        expect(peer.body.data.displayStatus).toBe('processing');
      }
    }

    const winner = await slow;
    if (winner.status === 201) {
      expect(winner.body.data.bankReferenceId).toBeTruthy();
    } else {
      expect([202, 503]).toContain(winner.status);
    }
    expect(fake.created).toBe(1);
    delete process.env.BANK_LOAN_INIT_WAIT_MS;
  });
});
