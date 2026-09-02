import {
  BadRequestException,
  ConflictException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { DataSource, type EntityManager, Repository } from 'typeorm';
import { BankLoanApplication } from '../../database/entities/bank-loan-application.entity';
import { BankLoanCustomerProfile } from '../../database/entities/bank-loan-customer-profile.entity';
import { BankLoanWalletCredit } from '../../database/entities/bank-loan-wallet-credit.entity';
import { WalletEntry } from '../../database/entities/wallet-entry.entity';
import { BankLoanStatus } from '../../database/enums';
import type { JsonValue } from '../../database/json-types';
import { ErrorCode } from '../../common/errors';
import { decryptPii, encryptPii } from '../../common/pii-crypto';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AuditService } from '../audit/audit.service';
import { BANK_LOAN_PROVIDER } from './bank-loan.http.adapter';
import {
  mapBankStatusToDisplay,
  parseBankStatus,
  type BankLoanProvider,
} from './bank-loan.types';
import { bankScopedIdempotencyKey } from './loan-idempotency';
import { canTransitionBankStatus } from './loan-status.transitions';
import { redactWebhookPayload } from './loan-webhook-redact';

function asJsonSummary(
  summary: Record<string, unknown> | null | undefined,
): JsonValue | null {
  if (summary == null) return null;
  return JSON.parse(JSON.stringify(summary)) as JsonValue;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type LoanCreateResult = {
  statusCode: typeof HttpStatus.CREATED | typeof HttpStatus.ACCEPTED;
  data: Record<string, unknown>;
};

@Injectable()
export class LoansService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    @InjectRepository(BankLoanApplication)
    private readonly loanRepo: Repository<BankLoanApplication>,
    @InjectRepository(BankLoanCustomerProfile)
    private readonly profileRepo: Repository<BankLoanCustomerProfile>,
    @Inject(BANK_LOAN_PROVIDER)
    private readonly bank: BankLoanProvider,
    private readonly audit: AuditService,
  ) {}

  private async profileRow(userId: string): Promise<BankLoanCustomerProfile> {
    const current = await this.profileRepo.findOne({ where: { userId } });
    if (current) return current;
    return this.profileRepo.save(
      this.profileRepo.create({
        userId,
        membershipStatus: 'UNDECLARED',
        customerNumberEnc: null,
        customerNumberLast4: null,
        accountOpeningStatus: 'NOT_STARTED',
        accountOpeningReferenceId: null,
        accountOpeningSummary: null,
        eligibilityStatus: 'NOT_STARTED',
        eligibilityReferenceId: null,
        eligibleAmountIrr: null,
        eligibilitySummary: null,
        lastSyncedAt: null,
      }),
    );
  }

  private serializeProfile(row: BankLoanCustomerProfile) {
    return {
      membershipStatus: row.membershipStatus,
      maskedCustomerNumber: row.customerNumberLast4
        ? `••••${row.customerNumberLast4}`
        : null,
      accountOpeningStatus: row.accountOpeningStatus,
      accountOpeningReferenceId: row.accountOpeningReferenceId,
      eligibilityStatus: row.eligibilityStatus,
      eligibilityReferenceId: row.eligibilityReferenceId,
      eligibleAmountIrr: row.eligibleAmountIrr?.toString() ?? null,
      lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async getProfile(actor: AuthenticatedUser) {
    return this.serializeProfile(await this.profileRow(actor.id));
  }

  async startAccountOpening(actor: AuthenticatedUser, idempotencyKey: string) {
    const row = await this.profileRow(actor.id);
    if (
      row.accountOpeningReferenceId &&
      ['SUBMITTED', 'UNDER_REVIEW', 'COMPLETED'].includes(
        row.accountOpeningStatus,
      )
    ) {
      return this.serializeProfile(row);
    }
    const response = await this.bank.requestAccountOpening({
      correlationId: randomUUID(),
      idempotencyKey: bankScopedIdempotencyKey(actor.id, idempotencyKey),
      customerExternalId: actor.id,
    });
    row.membershipStatus =
      response.status === 'COMPLETED'
        ? 'ACCOUNT_OPENED'
        : 'ACCOUNT_OPENING_REQUESTED';
    row.accountOpeningStatus = response.status;
    row.accountOpeningReferenceId = response.referenceId;
    row.accountOpeningSummary = asJsonSummary(response.summary);
    row.lastSyncedAt = new Date();
    if (response.status === 'COMPLETED' && response.customerNumber) {
      this.storeCustomerNumber(row, response.customerNumber);
    }
    await this.profileRepo.save(row);
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'FINANCE',
      action: 'ارسال درخواست افتتاح حساب بانک سامان',
      detail: 'درخواست افتتاح حساب بانکی مشتری ارسال شد.',
      entityType: 'BankLoanCustomerProfile',
      entityId: actor.id,
      metadata: { referenceId: response.referenceId, status: response.status },
    });
    return this.serializeProfile(row);
  }

  async syncAccountOpening(actor: AuthenticatedUser) {
    const row = await this.profileRow(actor.id);
    if (!row.accountOpeningReferenceId) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'ابتدا درخواست افتتاح حساب را ثبت کنید.',
      });
    }
    const response = await this.bank.getAccountOpeningStatus(
      row.accountOpeningReferenceId,
      randomUUID(),
    );
    row.accountOpeningStatus = response.status;
    row.membershipStatus =
      response.status === 'COMPLETED'
        ? 'ACCOUNT_OPENED'
        : 'ACCOUNT_OPENING_REQUESTED';
    row.accountOpeningSummary = asJsonSummary(response.summary);
    row.lastSyncedAt = new Date();
    if (response.status === 'COMPLETED') {
      if (!response.customerNumber) {
        throw new ServiceUnavailableException({
          code: ErrorCode.LOAN_BANK_RETRYABLE,
          message:
            'افتتاح حساب تأیید شد اما شماره مشتری هنوز از بانک دریافت نشده است.',
        });
      }
      this.storeCustomerNumber(row, response.customerNumber);
    }
    await this.profileRepo.save(row);
    return this.serializeProfile(row);
  }

  private storeCustomerNumber(
    row: BankLoanCustomerProfile,
    customerNumber: string,
  ) {
    const normalized = customerNumber.trim();
    if (!/^\d{6,20}$/.test(normalized)) {
      throw new ServiceUnavailableException({
        code: ErrorCode.LOAN_BANK_RETRYABLE,
        message: 'شماره مشتری دریافت‌شده از بانک معتبر نیست.',
      });
    }
    row.customerNumberEnc = encryptPii(normalized);
    row.customerNumberLast4 = normalized.slice(-4);
  }

  async startEligibility(
    actor: AuthenticatedUser,
    customerNumber: string,
    idempotencyKey: string,
  ) {
    const normalized = customerNumber.trim();
    if (!/^\d{6,20}$/.test(normalized)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'شماره مشتری بانک معتبر نیست.',
      });
    }
    const row = await this.profileRow(actor.id);
    if (
      row.eligibilityReferenceId &&
      ['SUBMITTED', 'UNDER_REVIEW', 'ELIGIBLE'].includes(
        row.eligibilityStatus,
      ) &&
      row.customerNumberLast4 === normalized.slice(-4)
    ) {
      return this.serializeProfile(row);
    }
    const response = await this.bank.requestEligibility({
      correlationId: randomUUID(),
      idempotencyKey: bankScopedIdempotencyKey(actor.id, idempotencyKey),
      customerExternalId: actor.id,
      customerNumber: normalized,
    });
    row.membershipStatus = 'BANK_CUSTOMER';
    this.storeCustomerNumber(row, normalized);
    row.eligibilityReferenceId = response.referenceId;
    row.eligibilityStatus = response.status;
    row.eligibilitySummary = asJsonSummary(response.summary);
    row.eligibleAmountIrr = this.eligibleAmount(
      response.status,
      response.eligibleAmountIrr,
    );
    row.lastSyncedAt = new Date();
    await this.profileRepo.save(row);
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'FINANCE',
      action: 'ارسال درخواست اعتبارسنجی بانک سامان',
      detail: 'شماره مشتری به شکل رمز‌شده برای اعتبارسنجی بانکی ثبت شد.',
      entityType: 'BankLoanCustomerProfile',
      entityId: actor.id,
      metadata: { referenceId: response.referenceId, status: response.status },
    });
    return this.serializeProfile(row);
  }

  private eligibleAmount(
    status: string,
    raw: string | null | undefined,
  ): bigint | null {
    if (status !== 'ELIGIBLE') return null;
    if (!raw || !/^\d+$/.test(raw) || BigInt(raw) <= 0n) {
      throw new ServiceUnavailableException({
        code: ErrorCode.LOAN_BANK_RETRYABLE,
        message: 'سقف اعتبار در پاسخ بانک معتبر نیست.',
      });
    }
    return BigInt(raw);
  }

  async syncEligibility(actor: AuthenticatedUser) {
    const row = await this.profileRow(actor.id);
    if (!row.eligibilityReferenceId) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'ابتدا درخواست اعتبارسنجی را ثبت کنید.',
      });
    }
    const response = await this.bank.getEligibilityStatus(
      row.eligibilityReferenceId,
      randomUUID(),
    );
    row.eligibilityStatus = response.status;
    row.eligibilitySummary = asJsonSummary(response.summary);
    row.eligibleAmountIrr = this.eligibleAmount(
      response.status,
      response.eligibleAmountIrr,
    );
    row.lastSyncedAt = new Date();
    await this.profileRepo.save(row);
    return this.serializeProfile(row);
  }

  private async eligibleProfile(
    userId: string,
    requestedAmountIrr: string,
  ): Promise<{ customerNumber: string; eligibleAmountIrr: bigint }> {
    const row = await this.profileRepo.findOne({ where: { userId } });
    if (
      !row ||
      row.eligibilityStatus !== 'ELIGIBLE' ||
      row.eligibleAmountIrr == null ||
      !row.customerNumberEnc
    ) {
      throw new ConflictException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'ابتدا اعتبارسنجی بانکی را تکمیل کنید.',
      });
    }
    if (BigInt(requestedAmountIrr) > row.eligibleAmountIrr) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'مبلغ درخواستی بیشتر از سقف اعتبار تأییدشده بانک است.',
      });
    }
    return {
      customerNumber: decryptPii(row.customerNumberEnc),
      eligibleAmountIrr: row.eligibleAmountIrr,
    };
  }

  private providerKey(): string {
    const fromEnv = this.config.get<string>('BANK_LOAN_PROVIDER')?.trim();
    if (fromEnv) return fromEnv;
    const base = (this.config.get<string>('BANK_LOAN_API_BASE_URL') ?? '')
      .replace(/^https?:\/\//i, '')
      .split('/')[0]
      ?.trim();
    return base || 'configured-bank';
  }

  private serialize(row: BankLoanApplication, admin = false) {
    const base = {
      id: row.id,
      requestedAmountIrr: row.requestedAmountIrr.toString(),
      bankStatus: row.bankStatus,
      displayStatus: mapBankStatusToDisplay(row.bankStatus),
      bankReferenceId: row.bankReferenceId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
    };
    if (!admin) return base;
    return {
      ...base,
      userId: row.userId,
      customer: row.user
        ? {
            id: row.user.id,
            fullName: row.user.fullName,
            phone: row.user.phone,
          }
        : null,
      statusSummary: row.statusSummary,
      walletCreditReference: row.walletCreditReference,
    };
  }

  private initiationLeaseMs(): number {
    const raw = this.config.get<string>('BANK_LOAN_TIMEOUT_MS') ?? '5000';
    const timeout = Number(raw);
    const base = Number.isFinite(timeout) && timeout >= 500 ? timeout : 5000;
    return Math.max(base * 3, 15_000);
  }

  private leaseTimestamps(): { startedAt: Date; leaseUntil: Date } {
    const startedAt = new Date();
    return {
      startedAt,
      leaseUntil: new Date(startedAt.getTime() + this.initiationLeaseMs()),
    };
  }

  private assertAmountMatches(
    row: BankLoanApplication,
    requestedAmountIrr: string,
  ) {
    if (row.requestedAmountIrr !== BigInt(requestedAmountIrr)) {
      throw new ConflictException({
        code: ErrorCode.IDEMPOTENCY_PAYLOAD_MISMATCH,
        message: 'کلید تکراری با مبلغ متفاوت است.',
      });
    }
  }

  private hasActiveLease(row: BankLoanApplication, now = new Date()): boolean {
    if (row.bankReferenceId) return false;
    if (!row.initiationLeaseUntil) return false;
    return row.initiationLeaseUntil.getTime() > now.getTime();
  }

  private isReclaimable(row: BankLoanApplication, now = new Date()): boolean {
    if (row.bankReferenceId) return false;
    if (row.userId == null) return false;
    if (row.bankStatus === 'FAILED') return true;
    if (row.bankStatus === 'INITIATING' || row.bankStatus === 'SUBMITTED') {
      return !this.hasActiveLease(row, now);
    }
    return !row.bankReferenceId && !this.hasActiveLease(row, now);
  }

  /**
   * Atomically reserve (userId, idempotencyKey) in INITIATING with a lease
   * before any bank call.
   */
  private async reserveInitiatingSlot(
    userId: string,
    idempotencyKey: string,
    requestedAmountIrr: string,
  ): Promise<string | null> {
    const id = randomUUID();
    const { startedAt, leaseUntil } = this.leaseTimestamps();
    const rows: Array<{ id: string }> = await this.dataSource.query(
      `
      INSERT INTO "bank_loan_applications"
        ("id", "userId", "idempotencyKey", "requestedAmountIrr", "bankStatus",
         "initiationStartedAt", "initiationLeaseUntil", "createdAt", "updatedAt")
      VALUES ($1, $2, $3, $4, 'INITIATING', $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT ("userId", "idempotencyKey") DO NOTHING
      RETURNING "id"
      `,
      [id, userId, idempotencyKey, requestedAmountIrr, startedAt, leaseUntil],
    );
    return rows[0]?.id ?? null;
  }

  /** Reclaim a stale/failed initiation so we can retry with the same bank key. */
  private async reclaimInitiationLease(
    id: string,
    userId: string,
  ): Promise<boolean> {
    const { startedAt, leaseUntil } = this.leaseTimestamps();
    const rows: Array<{ id: string }> = await this.dataSource.query(
      `
      UPDATE "bank_loan_applications"
      SET "bankStatus" = 'INITIATING',
          "initiationStartedAt" = $3,
          "initiationLeaseUntil" = $4,
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = $1
        AND "userId" = $2
        AND "bankReferenceId" IS NULL
        AND (
          "bankStatus" = 'FAILED'
          OR "initiationLeaseUntil" IS NULL
          OR "initiationLeaseUntil" <= CURRENT_TIMESTAMP
        )
      RETURNING "id"
      `,
      [id, userId, startedAt, leaseUntil],
    );
    return rows.length > 0;
  }

  private async expireInitiationLease(id: string, userId: string) {
    await this.dataSource.query(
      `
      UPDATE "bank_loan_applications"
      SET "initiationLeaseUntil" = CURRENT_TIMESTAMP,
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = $1 AND "userId" = $2 AND "bankReferenceId" IS NULL
      `,
      [id, userId],
    );
  }

  /**
   * Wait for an in-flight initiation. Never returns a "ready" row without
   * bankReferenceId — times out as processing (202) instead.
   */
  private async waitForBankResult(
    userId: string,
    idempotencyKey: string,
    requestedAmountIrr: string,
  ): Promise<
    | { kind: 'ready'; row: BankLoanApplication }
    | { kind: 'processing'; row: BankLoanApplication }
    | { kind: 'stale'; row: BankLoanApplication }
  > {
    const configuredWait = Number(
      this.config.get<string>('BANK_LOAN_INIT_WAIT_MS') ?? '',
    );
    const maxWait =
      Number.isFinite(configuredWait) && configuredWait >= 200
        ? configuredWait
        : Math.min(this.initiationLeaseMs(), 2_000);
    const deadline = Date.now() + maxWait;
    while (Date.now() < deadline) {
      const row = await this.loanRepo.findOne({
        where: { userId, idempotencyKey },
      });
      if (!row || row.userId !== userId) {
        throw new NotFoundException({
          code: ErrorCode.NOT_FOUND,
          message: 'درخواست یافت نشد.',
        });
      }
      this.assertAmountMatches(row, requestedAmountIrr);
      if (row.bankReferenceId) {
        return { kind: 'ready', row };
      }
      if (this.isReclaimable(row)) {
        return { kind: 'stale', row };
      }
      await sleep(40);
    }
    const late = await this.loanRepo.findOne({
      where: { userId, idempotencyKey },
    });
    if (!late || late.userId !== userId) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'درخواست یافت نشد.',
      });
    }
    this.assertAmountMatches(late, requestedAmountIrr);
    if (late.bankReferenceId) {
      return { kind: 'ready', row: late };
    }
    if (this.isReclaimable(late)) {
      return { kind: 'stale', row: late };
    }
    return { kind: 'processing', row: late };
  }

  private async completeBankInitiation(
    reservedId: string,
    actor: AuthenticatedUser,
    dto: { requestedAmountIrr: string; idempotencyKey: string },
    bankKey: string,
    customerNumber: string,
  ): Promise<LoanCreateResult> {
    const correlationId = randomUUID();
    let bankRes: Awaited<ReturnType<BankLoanProvider['createApplication']>>;
    try {
      bankRes = await this.bank.createApplication({
        correlationId,
        idempotencyKey: bankKey,
        requestedAmountIrr: dto.requestedAmountIrr,
        customerExternalId: actor.id,
        customerNumber,
      });
    } catch (err) {
      // Keep INITIATING + expired lease so the same bankScoped key can retry.
      await this.expireInitiationLease(reservedId, actor.id);
      if (
        err instanceof ServiceUnavailableException ||
        (typeof err === 'object' &&
          err != null &&
          'name' in err &&
          (err as { name?: string }).name === 'AbortError')
      ) {
        throw new ServiceUnavailableException({
          code: ErrorCode.LOAN_BANK_RETRYABLE,
          message: 'ارتباط با بانک کامل نشد؛ با همان کلید دوباره تلاش کنید.',
        });
      }
      throw err;
    }

    const saved = await this.dataSource.transaction(async (manager) => {
      const locked = await manager.findOne(BankLoanApplication, {
        where: { id: reservedId, userId: actor.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!locked || locked.userId !== actor.id) {
        throw new NotFoundException({
          code: ErrorCode.NOT_FOUND,
          message: 'درخواست یافت نشد.',
        });
      }
      locked.bankReferenceId = bankRes.bankReferenceId;
      locked.bankStatus = bankRes.bankStatus;
      locked.statusSummary = asJsonSummary(bankRes.summary);
      locked.lastSyncedAt = new Date();
      locked.initiationLeaseUntil = null;
      await manager.save(locked);

      await this.maybeCreditWallet(
        manager,
        locked,
        bankRes.bankStatus,
        bankRes.walletCreditIrr,
        bankRes.walletCreditReference,
      );
      return locked;
    });

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'FINANCE',
      action: 'ارسال درخواست وام به بانک',
      detail: 'درخواست وام باشگاه مشتریان به بانک ارسال شد.',
      entityType: 'BankLoanApplication',
      entityId: saved.id,
      metadata: {
        bankReferenceId: saved.bankReferenceId,
        bankStatus: saved.bankStatus,
        correlationId,
      },
    });

    return { statusCode: HttpStatus.CREATED, data: this.serialize(saved) };
  }

  async create(
    actor: AuthenticatedUser,
    dto: {
      requestedAmountIrr: string;
      idempotencyKey: string;
    },
  ): Promise<LoanCreateResult> {
    if (
      !/^\d+$/.test(dto.requestedAmountIrr) ||
      BigInt(dto.requestedAmountIrr) <= 0n
    ) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'مبلغ درخواستی نامعتبر است.',
      });
    }

    const bankKey = bankScopedIdempotencyKey(actor.id, dto.idempotencyKey);
    const profile = await this.eligibleProfile(
      actor.id,
      dto.requestedAmountIrr,
    );

    for (let attempt = 0; attempt < 4; attempt++) {
      const existing = await this.loanRepo.findOne({
        where: { userId: actor.id, idempotencyKey: dto.idempotencyKey },
      });

      if (existing) {
        this.assertAmountMatches(existing, dto.requestedAmountIrr);

        if (existing.bankReferenceId) {
          return {
            statusCode: HttpStatus.CREATED,
            data: this.serialize(existing),
          };
        }

        if (this.hasActiveLease(existing)) {
          const waited = await this.waitForBankResult(
            actor.id,
            dto.idempotencyKey,
            dto.requestedAmountIrr,
          );
          if (waited.kind === 'ready') {
            return {
              statusCode: HttpStatus.CREATED,
              data: this.serialize(waited.row),
            };
          }
          if (waited.kind === 'processing') {
            return {
              statusCode: HttpStatus.ACCEPTED,
              data: this.serialize(waited.row),
            };
          }
          // stale — fall through to reclaim
        }

        if (this.isReclaimable(existing)) {
          const claimed = await this.reclaimInitiationLease(
            existing.id,
            actor.id,
          );
          if (claimed) {
            return this.completeBankInitiation(
              existing.id,
              actor,
              dto,
              bankKey,
              profile.customerNumber,
            );
          }
          continue;
        }

        return {
          statusCode: HttpStatus.ACCEPTED,
          data: this.serialize(existing),
        };
      }

      const reservedId = await this.reserveInitiatingSlot(
        actor.id,
        dto.idempotencyKey,
        dto.requestedAmountIrr,
      );
      if (!reservedId) {
        continue;
      }
      return this.completeBankInitiation(
        reservedId,
        actor,
        dto,
        bankKey,
        profile.customerNumber,
      );
    }

    throw new ServiceUnavailableException({
      code: ErrorCode.LOAN_BANK_RETRYABLE,
      message: 'درخواست وام در حال پردازش است؛ لطفاً کمی بعد دوباره تلاش کنید.',
    });
  }

  async listMine(actor: AuthenticatedUser, page = 1, pageSize = 20) {
    const [rows, total] = await this.loanRepo.findAndCount({
      where: { userId: actor.id },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return {
      items: rows.map((r) => this.serialize(r)),
      page,
      pageSize,
      total,
    };
  }

  async getMine(actor: AuthenticatedUser, id: string) {
    const row = await this.loanRepo.findOne({ where: { id } });
    if (!row || row.userId !== actor.id) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'درخواست یافت نشد.',
      });
    }
    return this.serialize(row);
  }

  async syncMine(actor: AuthenticatedUser, id: string) {
    const row = await this.loanRepo.findOne({ where: { id } });
    if (!row || row.userId !== actor.id) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'درخواست یافت نشد.',
      });
    }
    if (!row.bankReferenceId) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'شناسه بانک برای این درخواست موجود نیست.',
      });
    }
    const correlationId = randomUUID();
    const status = await this.bank.getStatus(
      row.bankReferenceId,
      correlationId,
    );
    await this.applyBankUpdate(row, status.bankStatus, status.summary, {
      walletCreditIrr: status.walletCreditIrr,
      walletCreditReference: status.walletCreditReference,
      eventId: `poll:${correlationId}`,
      occurredAt: new Date(),
      sourcePayload: {
        bankReferenceId: status.bankReferenceId,
        status: status.bankStatus,
        walletCreditIrr: status.walletCreditIrr ?? null,
        walletCreditReference: status.walletCreditReference ?? null,
      },
    });
    const fresh = await this.loanRepo
      .createQueryBuilder('l')
      .where('l.id = :id', { id })
      .getOneOrFail();
    return this.serialize(fresh);
  }

  async listAdmin(page = 1, pageSize = 20) {
    const [rows, total] = await this.loanRepo.findAndCount({
      relations: { user: true },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return {
      items: rows.map((r) => this.serialize(r, true)),
      page,
      pageSize,
      total,
    };
  }

  async getAdmin(id: string) {
    const row = await this.loanRepo.findOne({
      where: { id },
      relations: { user: true },
    });
    if (!row) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'درخواست یافت نشد.',
      });
    }
    return this.serialize(row, true);
  }

  verifyWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined) {
    const secret = this.config.get<string>('BANK_LOAN_WEBHOOK_SECRET') ?? '';
    if (!secret) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'وب‌هوک پیکربندی نشده است.',
      });
    }
    if (!signatureHeader) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'امضای وب‌هوک نامعتبر است.',
      });
    }
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const provided = signatureHeader.replace(/^sha256=/i, '').trim();
    const a = Buffer.from(expected);
    const b = Buffer.from(provided);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'امضای وب‌هوک نامعتبر است.',
      });
    }
  }

  async handleWebhook(payload: {
    eventId: string;
    bankReferenceId: string;
    status: string;
    walletCreditIrr?: string;
    walletCreditReference?: string;
    occurredAt?: string;
    summary?: Record<string, unknown>;
  }) {
    if (!payload.eventId || !payload.bankReferenceId) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'بدنه وب‌هوک نامعتبر است.',
      });
    }

    const row = await this.loanRepo.findOne({
      where: { bankReferenceId: payload.bankReferenceId },
    });
    if (!row) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'درخواست یافت نشد.',
      });
    }

    const occurredAt = payload.occurredAt
      ? new Date(payload.occurredAt)
      : new Date();
    if (Number.isNaN(occurredAt.getTime())) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'زمان رویداد نامعتبر است.',
      });
    }

    const result = await this.applyBankUpdate(
      row,
      parseBankStatus(payload.status),
      payload.summary ?? { status: payload.status },
      {
        walletCreditIrr: payload.walletCreditIrr,
        walletCreditReference: payload.walletCreditReference,
        eventId: payload.eventId,
        occurredAt,
        sourcePayload: {
          eventId: payload.eventId,
          bankReferenceId: payload.bankReferenceId,
          status: payload.status,
          walletCreditIrr: payload.walletCreditIrr ?? null,
          walletCreditReference: payload.walletCreditReference ?? null,
          occurredAt: payload.occurredAt ?? null,
        },
      },
    );

    return {
      ok: true,
      duplicate: result === 'DUPLICATE',
      ignored: result.startsWith('IGNORED'),
      result,
    };
  }

  private async claimWebhookEvent(
    manager: EntityManager,
    args: {
      provider: string;
      eventId: string;
      bankReferenceId: string | null;
      loanApplicationId: string | null;
      bankStatus: string | null;
      occurredAt: Date | null;
      payload: Record<string, unknown>;
    },
  ): Promise<string | null> {
    const id = randomUUID();
    const redacted = redactWebhookPayload(args.payload);
    const rows: Array<{ id: string }> = await manager.query(
      `
      INSERT INTO "bank_loan_webhook_events"
        ("id", "provider", "eventId", "bankReferenceId", "loanApplicationId",
         "bankStatus", "occurredAt", "payloadRedacted", "processingResult", "createdAt")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, 'CLAIMED', CURRENT_TIMESTAMP)
      ON CONFLICT ("provider", "eventId") DO NOTHING
      RETURNING "id"
      `,
      [
        id,
        args.provider,
        args.eventId,
        args.bankReferenceId,
        args.loanApplicationId,
        args.bankStatus,
        args.occurredAt,
        redacted == null ? null : JSON.stringify(redacted),
      ],
    );
    return rows[0]?.id ?? null;
  }

  private async finalizeWebhookEvent(
    manager: EntityManager,
    eventRowId: string,
    processingResult: string,
  ) {
    await manager.query(
      `
      UPDATE "bank_loan_webhook_events"
      SET "processingResult" = $2
      WHERE "id" = $1
      `,
      [eventRowId, processingResult],
    );
  }

  private async applyBankUpdate(
    row: BankLoanApplication,
    bankStatus: BankLoanStatus,
    summary: Record<string, unknown> | null | undefined,
    opts: {
      walletCreditIrr?: string | null;
      walletCreditReference?: string | null;
      eventId: string;
      occurredAt: Date;
      sourcePayload: Record<string, unknown>;
    },
  ): Promise<string> {
    return this.dataSource.transaction(async (manager) => {
      const provider = this.providerKey();
      const eventRowId = await this.claimWebhookEvent(manager, {
        provider,
        eventId: opts.eventId,
        bankReferenceId: row.bankReferenceId,
        loanApplicationId: row.id,
        bankStatus,
        occurredAt: opts.occurredAt,
        payload: opts.sourcePayload,
      });
      if (!eventRowId) {
        return 'DUPLICATE';
      }

      const locked = await manager.findOne(BankLoanApplication, {
        where: { id: row.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!locked) {
        await this.finalizeWebhookEvent(
          manager,
          eventRowId,
          'IGNORED_MISSING_LOAN',
        );
        return 'IGNORED_MISSING_LOAN';
      }

      if (
        locked.lastWebhookOccurredAt &&
        opts.occurredAt.getTime() < locked.lastWebhookOccurredAt.getTime() &&
        bankStatus !== locked.bankStatus
      ) {
        await this.finalizeWebhookEvent(manager, eventRowId, 'IGNORED_STALE');
        return 'IGNORED_STALE';
      }

      if (!canTransitionBankStatus(locked.bankStatus, bankStatus)) {
        await this.finalizeWebhookEvent(
          manager,
          eventRowId,
          'IGNORED_TRANSITION',
        );
        return 'IGNORED_TRANSITION';
      }

      locked.bankStatus = bankStatus;
      locked.statusSummary = asJsonSummary(summary) ?? locked.statusSummary;
      locked.lastSyncedAt = new Date();
      locked.lastWebhookEventId = opts.eventId;
      locked.lastWebhookOccurredAt = opts.occurredAt;
      await manager.save(locked);

      await this.maybeCreditWallet(
        manager,
        locked,
        bankStatus,
        opts.walletCreditIrr,
        opts.walletCreditReference,
      );

      await this.finalizeWebhookEvent(manager, eventRowId, 'APPLIED');
      return 'APPLIED';
    });
  }

  /**
   * Credits wallet only on exact DISBURSED with matching amount/ref.
   * Claims creditReference via INSERT ON CONFLICT DO NOTHING — never catches 23505.
   */
  private async maybeCreditWallet(
    manager: EntityManager,
    row: BankLoanApplication,
    bankStatus: BankLoanStatus,
    amountIrr: string | null | undefined,
    creditRef: string | null | undefined,
  ) {
    if (bankStatus !== 'DISBURSED') {
      return;
    }
    if (!amountIrr || !creditRef) return;
    if (!/^\d+$/.test(amountIrr) || BigInt(amountIrr) <= 0n) return;
    if (BigInt(amountIrr) !== row.requestedAmountIrr) return;
    if (row.walletCreditReference) return;

    const priorClaim = await manager.findOne(BankLoanWalletCredit, {
      where: { loanApplicationId: row.id },
    });
    if (priorClaim) {
      row.walletCreditReference = priorClaim.creditReference;
      return;
    }

    const claimed: Array<{ creditReference: string }> = await manager.query(
      `
      INSERT INTO "bank_loan_wallet_credits"
        ("creditReference", "loanApplicationId", "userId", "amountIrr", "createdAt")
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
      ON CONFLICT ("creditReference") DO NOTHING
      RETURNING "creditReference"
      `,
      [creditRef, row.id, row.userId, amountIrr],
    );

    if (!claimed[0]) {
      // Another loan already claimed this bank credit reference.
      return;
    }

    const entry = await manager.save(
      manager.create(WalletEntry, {
        userId: row.userId,
        type: 'TOPUP',
        signedAmountIrr: BigInt(amountIrr),
      }),
    );

    await manager.query(
      `
      UPDATE "bank_loan_wallet_credits"
      SET "walletEntryId" = $2
      WHERE "creditReference" = $1
      `,
      [creditRef, entry.id],
    );

    await manager.query(
      `
      UPDATE "bank_loan_applications"
      SET "walletCreditReference" = $2, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = $1 AND "walletCreditReference" IS NULL
      `,
      [row.id, creditRef],
    );
    row.walletCreditReference = creditRef;
  }
}
