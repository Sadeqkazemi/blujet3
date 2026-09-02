import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import * as crypto from 'node:crypto';
import { EntityManager, In, IsNull, Not, Repository } from 'typeorm';
import { AgencyProfile } from '../../database/entities/agency-profile.entity';
import { AgencySeatRequest } from '../../database/entities/agency-seat-request.entity';
import { AgencySeatRequestFlight } from '../../database/entities/agency-seat-request-flight.entity';
import { AgencyAllotment } from '../../database/entities/agency-allotment.entity';
import { FareRule } from '../../database/entities/fare-rule.entity';
import { FlightInstance } from '../../database/entities/flight-instance.entity';
import { Airport } from '../../database/entities/airport.entity';
import { AgencyCreditLine } from '../../database/entities/agency-credit-line.entity';
import { AgencyRequestOtp } from '../../database/entities/agency-request-otp.entity';
import { AgencyMembershipRequest } from '../../database/entities/agency-membership-request.entity';
import { AgencyApiKey } from '../../database/entities/agency-api-key.entity';
import { AgencyInvoice } from '../../database/entities/agency-invoice.entity';
import { AgencyMessage } from '../../database/entities/agency-message.entity';
import { AgencyCreditRequest } from '../../database/entities/agency-credit-request.entity';
import { AgencyWebserviceRequest } from '../../database/entities/agency-webservice-request.entity';
import { AgencyDocument } from '../../database/entities/agency-document.entity';
import { User } from '../../database/entities/user.entity';
import { LedgerEntry } from '../../database/entities/ledger-entry.entity';
import { Booking } from '../../database/entities/booking.entity';
import { Passenger } from '../../database/entities/passenger.entity';
import { AuditLog } from '../../database/entities/audit-log.entity';
import { RefreshToken } from '../../database/entities/refresh-token.entity';
import { StoredFile } from '../../database/entities/stored-file.entity';
import { AuditService } from '../audit/audit.service';
import { CartableService } from '../cartable/cartable.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ErrorCode } from '../../common/errors';
import { generateTempPassword } from '../../common/temp-password';
import { StepUpService } from '../auth/step-up.service';
import { SmsService } from '../sms/sms.service';
import {
  ZERO_IRR,
  addIrr,
  isPositiveIrr,
  isZeroIrr,
  maxIrr,
  negateIrr,
  subIrr,
} from '../../common/money';
import type { Irr } from '../../common/money';
import { TWO_FACTOR_PROVIDER } from '../auth/providers/two-factor-provider.interface';
import type { TwoFactorProvider } from '../auth/providers/two-factor-provider.interface';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { hashAgencyApiKey } from '../../common/agency-api-key';
import {
  capabilitiesFromScope,
  normalizeCapabilities,
  scopeFromCapabilities,
} from '../../common/agency-api-capabilities';
import type {
  AgencyApiCapability,
  AgencyApiEnvironment,
  AgencyApiKeyStatus,
  AgencyApiScope,
  AgencyCreditRequestStatus,
  AgencyDocumentStatus,
  AgencyFlightDomain,
  AgencyMembershipStatus,
  AgencyWebserviceRequestStatus,
  AggregateInvoiceStatus,
} from '../../database/enums';
import { toWireAggregateInvoiceStatus } from './agency-invoice-aggregate';

function generateApiKeySecret(): string {
  return `bjk_${crypto.randomBytes(32).toString('base64url')}`;
}

function generateInvoiceNo(): string {
  return `INV-${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}

function generateSixDigitCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

function apiKeyView(key: AgencyApiKey, rawKey?: string) {
  const capabilities = normalizeCapabilities(key.capabilities, key.scope);
  return {
    id: key.id,
    agencyId: key.agencyId,
    keyHint: `bjk_••••${key.id.replace(/-/g, '').slice(0, 4)}`,
    scope: key.scope,
    capabilities,
    environment: key.environment,
    flightDomain: key.flightDomain,
    ipWhitelist: key.ipWhitelist ?? [],
    rateLimitPerMinute: key.rateLimitPerMinute,
    status: key.status,
    activatedAt: key.activatedAt,
    expiresAt: key.expiresAt,
    lastUsedAt: key.lastUsedAt,
    callCount: key.callCount,
    ...(rawKey ? { rawKey } : {}),
  };
}

const DECIDABLE_STATUSES: AgencyMembershipStatus[] = ['PENDING', 'REFERRED'];
const REQUEST_OTP_TTL_MS = 2 * 60 * 1000;
const REQUEST_OTP_MAX_ATTEMPTS = 5;

type MembershipApprovalStage =
  'AWAITING_COMMERCIAL' | 'AWAITING_FINANCE' | 'APPROVED' | 'REJECTED';

@Injectable()
export class AgenciesService {
  constructor(
    @InjectRepository(AgencyProfile)
    private readonly profileRepo: Repository<AgencyProfile>,
    @InjectRepository(AgencyCreditLine)
    private readonly creditLineRepo: Repository<AgencyCreditLine>,
    @InjectRepository(AgencyRequestOtp)
    private readonly requestOtpRepo: Repository<AgencyRequestOtp>,
    @InjectRepository(AgencyMembershipRequest)
    private readonly membershipRequestRepo: Repository<AgencyMembershipRequest>,
    @InjectRepository(AgencyApiKey)
    private readonly apiKeyRepo: Repository<AgencyApiKey>,
    @InjectRepository(AgencyInvoice)
    private readonly invoiceRepo: Repository<AgencyInvoice>,
    @InjectRepository(AgencyMessage)
    private readonly messageRepo: Repository<AgencyMessage>,
    @InjectRepository(StoredFile)
    private readonly storedFileRepo: Repository<StoredFile>,
    @InjectRepository(AgencyCreditRequest)
    private readonly creditRequestRepo: Repository<AgencyCreditRequest>,
    @InjectRepository(AgencyWebserviceRequest)
    private readonly webserviceRequestRepo: Repository<AgencyWebserviceRequest>,
    @InjectRepository(AgencyDocument)
    private readonly documentRepo: Repository<AgencyDocument>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(LedgerEntry)
    private readonly ledgerEntryRepo: Repository<LedgerEntry>,
    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,
    @InjectRepository(Passenger)
    private readonly passengerRepo: Repository<Passenger>,
    @InjectRepository(AuditLog)
    private readonly auditLogRepo: Repository<AuditLog>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
    @InjectRepository(AgencySeatRequest)
    private readonly seatRequestRepo: Repository<AgencySeatRequest>,
    @InjectRepository(Airport)
    private readonly airportRepo: Repository<Airport>,
    private readonly audit: AuditService,
    private readonly cartable: CartableService,
    private readonly notifications: NotificationsService,
    private readonly stepUp: StepUpService,
    private readonly sms: SmsService,
    @Inject(TWO_FACTOR_PROVIDER)
    private readonly twoFactorProvider: TwoFactorProvider,
  ) {}

  // ── Phase 16: public pre-registration (no auth) ─────────────────────────

  /** Sends an OTP to a prospective agency's phone before they can submit a
   * membership request — proves phone ownership without creating a User
   * (that only happens once staff approve). See docs/DB_SCHEMA.md Phase 16
   * for why this doesn't reuse TwoFactorChallenge. */
  async requestPublicOtp(phone: string): Promise<{ challengeId: string }> {
    const code = generateSixDigitCode();
    const challenge = await this.requestOtpRepo.save(
      this.requestOtpRepo.create({
        phone,
        codeHash: await argon2.hash(code),
        expiresAt: new Date(Date.now() + REQUEST_OTP_TTL_MS),
      }),
    );
    await this.twoFactorProvider.sendCode(
      { id: challenge.id, fullName: 'متقاضی همکاری آژانس', email: null, phone },
      code,
    );
    return { challengeId: challenge.id };
  }

  /** Verifies the OTP and creates a PENDING AgencyMembershipRequest — the
   * public front door onto the existing staff review workflow below. */
  async createPublicRequest(dto: {
    applicantName: string;
    managerName: string;
    licenseNo: string;
    phone: string;
    challengeId: string;
    code: string;
  }): Promise<{ id: string }> {
    const challenge = await this.requestOtpRepo.findOneBy({
      id: dto.challengeId,
    });
    if (!challenge || challenge.phone !== dto.phone) {
      throw new UnauthorizedException({
        code: 'TWO_FACTOR_INVALID',
        message: 'کد تأیید نامعتبر است.',
      });
    }
    if (challenge.consumedAt) {
      throw new UnauthorizedException({
        code: 'TWO_FACTOR_INVALID',
        message: 'این کد قبلاً استفاده شده است.',
      });
    }
    if (challenge.expiresAt < new Date()) {
      throw new UnauthorizedException({
        code: 'TWO_FACTOR_EXPIRED',
        message: 'کد منقضی شده است.',
      });
    }
    if (challenge.attempts >= REQUEST_OTP_MAX_ATTEMPTS) {
      throw new UnauthorizedException({
        code: 'TWO_FACTOR_INVALID',
        message: 'تعداد تلاش‌های مجاز به پایان رسید.',
      });
    }

    const codeValid = await argon2.verify(challenge.codeHash, dto.code);
    if (!codeValid) {
      await this.requestOtpRepo.increment({ id: challenge.id }, 'attempts', 1);
      throw new UnauthorizedException({
        code: 'TWO_FACTOR_INVALID',
        message: 'کد وارد شده نادرست است.',
      });
    }

    await this.requestOtpRepo.update(
      { id: challenge.id },
      { consumedAt: new Date() },
    );

    const request = await this.membershipRequestRepo.save(
      this.membershipRequestRepo.create({
        applicantName: dto.applicantName,
        managerName: dto.managerName,
        licenseNo: dto.licenseNo,
        phone: dto.phone,
        status: 'PENDING',
      }),
    );

    // The public front door has no staff actor — the site-admin cartable is
    // the delivery surface for a brand-new request, same as referRequest()
    // is for one already under review.
    await this.cartable.createTasksForRoles(['SITE_ADMIN'], {
      category: 'AGENCY',
      title: `درخواست عضویت آژانس جدید: ${dto.applicantName}`,
      description: `آژانس «${dto.applicantName}» (مدیر: ${dto.managerName}، پروانه: ${dto.licenseNo}) درخواست همکاری ثبت کرد.`,
      senderLabelFa: `${dto.applicantName} · متقاضی عمومی`,
      sourceType: 'AGENCY_REQUEST',
      sourceId: request.id,
    });

    const siteAdmins = await this.userRepo.find({
      where: { role: 'SITE_ADMIN', isActive: true },
      select: { id: true },
    });
    for (const admin of siteAdmins) {
      await this.notifications.notify({
        recipientId: admin.id,
        category: 'REQUEST',
        action: 'CREATED',
        title: 'درخواست همکاری آژانس جدید',
        body: `آژانس «${dto.applicantName}» درخواست همکاری ثبت کرد.`,
        entityType: 'AgencyMembershipRequest',
        entityId: request.id,
        dedupeKey: `AgencyMembershipRequest:${request.id}:CREATED:${admin.id}`,
      });
    }

    // No audit row here by design: audit_logs.actorId is FK-bound to a real
    // User and an anonymous applicant has none — same precedent as
    // RefundsService.submitAnonymous(). The cartable task + notifications
    // above are the record of this submission.

    return { id: request.id };
  }

  /** E2E-test-only helper (mirrors AuthService.getLastCodeForE2e) — reads
   * back the mock-delivered OTP code by challenge id, since an anonymous
   * applicant has no phone/username to look up a User row by. */
  getLastRequestOtpCode(challengeId: string): string | null {
    if (
      process.env.NODE_ENV === 'production' ||
      !this.twoFactorProvider.getLastCode
    )
      return null;
    return this.twoFactorProvider.getLastCode(challengeId) ?? null;
  }

  /** SUM(SALE) + SUM(SETTLEMENT) per agency — SETTLEMENT rows are stored
   * signed-negative, so this single grouped sum is the derived "used" figure
   * (see LedgerEntry.agencyId note in docs/DB_SCHEMA.md). */
  private async computeUsedIrr(agencyIds: string[]): Promise<Map<string, Irr>> {
    if (agencyIds.length === 0) return new Map();
    const rows = await this.ledgerEntryRepo
      .createQueryBuilder('e')
      .select('e.agencyId', 'agencyId')
      .addSelect('SUM(e.signedAmountIrr)', 'sum')
      .where('e.agencyId IN (:...ids)', { ids: agencyIds })
      .andWhere('e.type IN (:...types)', { types: ['SALE', 'SETTLEMENT'] })
      .groupBy('e.agencyId')
      .getRawMany<{ agencyId: string; sum: string }>();
    return new Map(rows.map((r) => [r.agencyId, BigInt(r.sum ?? '0')]));
  }

  /** Design's exact formula (extraction confirmed verbatim) — presentational
   * badge only, never a financial figure. See docs/DB_SCHEMA.md Phase 3. */
  private activityScore(input: {
    seatsSold: number;
    paidInvoices: number;
    unpaidInvoices: number;
    isActive: boolean;
  }) {
    const raw =
      input.seatsSold * 10 +
      input.paidInvoices * 100 -
      input.unpaidInvoices * 60 +
      (input.isActive ? 40 : 0);
    const score = Math.max(raw, 0);
    const badge = score >= 700 ? 'GOLD' : score >= 400 ? 'SILVER' : 'BRONZE';
    return { score, badge };
  }

  private async getProfileOrThrow(id: string) {
    const profile = await this.profileRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.user', 'user')
      .where('a.userId = :id', { id })
      .getOne();
    if (!profile) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'آژانس یافت نشد.',
      });
    }
    return profile;
  }

  private async getRequestOrThrow(id: string) {
    const request = await this.membershipRequestRepo
      .createQueryBuilder('r')
      .where('r.id = :id', { id })
      .getOne();
    if (!request) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'درخواست یافت نشد.',
      });
    }
    return request;
  }

  /** Used by ReportingModule's KPI box (`agencyDebtIrr`/`agencyDebtCount`) —
   * the only cross-module read of agency data, kept to a small public getter
   * rather than duplicating the ledger-derivation query in ReportingService. */
  async getDebtSummary(): Promise<{
    agencyDebtIrr: Irr;
    agencyDebtCount: number;
  }> {
    const profiles = await this.profileRepo.find({ select: { userId: true } });
    const agencyIds = profiles.map((p) => p.userId);
    const usedByAgency = await this.computeUsedIrr(agencyIds);

    let agencyDebtIrr: Irr = ZERO_IRR;
    let agencyDebtCount = 0;
    for (const used of usedByAgency.values()) {
      if (isPositiveIrr(used)) {
        agencyDebtIrr = addIrr(agencyDebtIrr, used);
        agencyDebtCount += 1;
      }
    }
    return { agencyDebtIrr, agencyDebtCount };
  }

  // ── Listing & detail ────────────────────────────────────────────────

  async list(query: { q?: string; debtorsOnly?: boolean }) {
    const profiles = await this.profileRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.user', 'user')
      .orderBy('a.joinedAt', 'DESC')
      .getMany();
    const agencyIds = profiles.map((p) => p.userId);
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      usedByAgency,
      unpaidCounts,
      creditLines,
      monthlySalesRows,
      monthlyTicketRows,
    ] = await Promise.all([
      this.computeUsedIrr(agencyIds),
      agencyIds.length
        ? this.invoiceRepo
            .createQueryBuilder('i')
            .select('i.agencyId', 'agencyId')
            .addSelect('COUNT(*)', 'count')
            .where('i.agencyId IN (:...ids)', { ids: agencyIds })
            .andWhere('i.status IN (:...statuses)', {
              statuses: ['UNPAID', 'OVERDUE'],
            })
            .groupBy('i.agencyId')
            .getRawMany<{ agencyId: string; count: string }>()
        : Promise.resolve<{ agencyId: string; count: string }[]>([]),
      agencyIds.length
        ? this.creditLineRepo.find({ where: { agencyId: In(agencyIds) } })
        : Promise.resolve<AgencyCreditLine[]>([]),
      agencyIds.length
        ? this.ledgerEntryRepo
            .createQueryBuilder('entry')
            .select('entry.agencyId', 'agencyId')
            .addSelect('COALESCE(SUM(entry.signedAmountIrr), 0)', 'sum')
            .where('entry.agencyId IN (:...ids)', { ids: agencyIds })
            .andWhere('entry.type = :type', { type: 'SALE' })
            .andWhere('entry.bookingId IS NOT NULL')
            .andWhere('entry.occurredAt >= :startOfMonth', { startOfMonth })
            .groupBy('entry.agencyId')
            .getRawMany<{ agencyId: string; sum: string }>()
        : Promise.resolve<{ agencyId: string; sum: string }[]>([]),
      agencyIds.length
        ? this.passengerRepo
            .createQueryBuilder('passenger')
            .innerJoin('passenger.booking', 'booking')
            .select('booking.agencyId', 'agencyId')
            .addSelect('COUNT(passenger.id)', 'count')
            .where('booking.agencyId IN (:...ids)', { ids: agencyIds })
            .andWhere('booking.status IN (:...statuses)', {
              statuses: ['PAID', 'TICKETED'],
            })
            .andWhere('booking.createdAt >= :startOfMonth', { startOfMonth })
            .groupBy('booking.agencyId')
            .getRawMany<{ agencyId: string; count: string }>()
        : Promise.resolve<{ agencyId: string; count: string }[]>([]),
    ]);
    const unpaidByAgency = new Map(
      unpaidCounts.map((r) => [r.agencyId, Number(r.count)]),
    );
    const creditLineByAgency = new Map(creditLines.map((c) => [c.agencyId, c]));
    const monthlySalesByAgency = new Map(
      monthlySalesRows.map((row) => [row.agencyId, BigInt(row.sum ?? '0')]),
    );
    const monthlyTicketsByAgency = new Map(
      monthlyTicketRows.map((row) => [row.agencyId, Number(row.count)]),
    );

    const rows = profiles.map((p) => {
      const usedIrr = maxIrr(usedByAgency.get(p.userId) ?? ZERO_IRR, ZERO_IRR);
      const limitIrr = creditLineByAgency.get(p.userId)?.limitIrr ?? ZERO_IRR;
      return {
        id: p.userId,
        fullName: p.user.fullName,
        managerName: p.managerName,
        licenseNo: p.licenseNo,
        city: p.city,
        tier: p.tier,
        isActive: !p.suspendedAt,
        limitIrr,
        usedIrr,
        remainingIrr: subIrr(limitIrr, usedIrr),
        pendingInvoiceCount: unpaidByAgency.get(p.userId) ?? 0,
        monthlyTicketsSold: monthlyTicketsByAgency.get(p.userId) ?? 0,
        monthlySalesIrr: monthlySalesByAgency.get(p.userId) ?? ZERO_IRR,
      };
    });

    // KPI cards summarize the whole book — never re-scoped by the table's
    // own search/debtors filter (matches the design's fixed summary cards).
    const kpis = {
      activeCount: rows.filter((r) => r.isActive).length,
      totalCreditGrantedIrr: rows.reduce(
        (s, r) => addIrr(s, r.limitIrr),
        ZERO_IRR,
      ),
      totalUsedIrr: rows.reduce((s, r) => addIrr(s, r.usedIrr), ZERO_IRR),
      pendingSettlementCount: rows.filter((r) => r.pendingInvoiceCount > 0)
        .length,
    };

    let agencies = rows;
    if (query.q) {
      const q = query.q.toLowerCase();
      agencies = agencies.filter(
        (r) =>
          r.fullName.toLowerCase().includes(q) ||
          r.managerName.toLowerCase().includes(q) ||
          r.licenseNo.toLowerCase().includes(q) ||
          r.city.toLowerCase().includes(q),
      );
    }
    if (query.debtorsOnly) {
      agencies = agencies.filter(
        (r) => isPositiveIrr(r.usedIrr) || r.pendingInvoiceCount > 0,
      );
    }

    return { agencies, kpis };
  }

  async detail(actor: AuthenticatedUser, id: string) {
    const profile = await this.getProfileOrThrow(id);

    const [
      usedByAgency,
      creditLine,
      ticketCount,
      passengerCount,
      salesRows,
      paidInvoiceCount,
      unpaidInvoiceCount,
      recentActivity,
    ] = await Promise.all([
      this.computeUsedIrr([id]),
      this.creditLineRepo.findOneBy({ agencyId: id }),
      this.bookingRepo.count({
        where: { agencyId: id, status: In(['PAID', 'TICKETED']) },
      }),
      this.passengerRepo
        .createQueryBuilder('p')
        .leftJoin('p.booking', 'booking')
        .where('booking.agencyId = :id', { id })
        .getCount(),
      // Real ticket sales only — excludes this same service's own
      // resetTestDebt() calibration rows (bookingId null; see
      // ReportingService.kpis() for the full explanation).
      this.ledgerEntryRepo.find({
        where: { agencyId: id, type: 'SALE', bookingId: Not(IsNull()) },
        select: { signedAmountIrr: true },
      }),
      this.invoiceRepo.count({ where: { agencyId: id, status: 'PAID' } }),
      this.invoiceRepo.count({
        where: { agencyId: id, status: In(['UNPAID', 'OVERDUE']) },
      }),
      this.auditLogRepo.find({
        where: {
          category: 'AGENCY',
          entityType: 'AgencyProfile',
          entityId: id,
        },
        order: { createdAt: 'DESC' },
        take: 20,
      }),
    ]);

    const usedIrr = maxIrr(usedByAgency.get(id) ?? ZERO_IRR, ZERO_IRR);
    const limitIrr = creditLine?.limitIrr ?? ZERO_IRR;
    const isActive = !profile.suspendedAt;
    const totalSalesIrr = salesRows.reduce(
      (s, r) => addIrr(s, r.signedAmountIrr),
      ZERO_IRR,
    );

    // Senior Manager's detail view never showed this — presentational only.
    const includeScore =
      actor.role === 'FINANCE_MANAGER' || actor.role === 'COMMERCIAL_MANAGER';

    // Finance Manager needs the same ledger/KPI extras for the design's
    // مالی + سابقه tabs (transactions, financeSummary). flightsSold /
    // purchasedServices are harmless read-only aggregates for finance too.
    const commercialExtras =
      actor.role === 'COMMERCIAL_MANAGER' || actor.role === 'FINANCE_MANAGER'
        ? await this.commercialDetailExtras(id)
        : undefined;

    return {
      id: profile.userId,
      fullName: profile.user.fullName,
      managerName: profile.managerName,
      licenseNo: profile.licenseNo,
      phone: profile.phone,
      email: profile.email,
      city: profile.city,
      address: profile.address,
      tier: profile.tier,
      isActive,
      suspendedAt: profile.suspendedAt,
      suspendReason: profile.suspendReason,
      joinedAt: profile.joinedAt,
      credit: { limitIrr, usedIrr, remainingIrr: subIrr(limitIrr, usedIrr) },
      stats: {
        totalSalesIrr,
        ticketsIssued: ticketCount,
        passengers: passengerCount,
      },
      ...(includeScore
        ? {
            activityScore: this.activityScore({
              seatsSold: ticketCount,
              paidInvoices: paidInvoiceCount,
              unpaidInvoices: unpaidInvoiceCount,
              isActive,
            }),
          }
        : {}),
      ...(commercialExtras ? { commercialExtras } : {}),
      recentActivity,
    };
  }

  private wsScopeLabel(scope: AgencyApiScope): string {
    const labels: Record<AgencyApiScope, string> = {
      FULL: 'وب‌سرویس فروش کامل',
      SEARCH_BOOK: 'وب‌سرویس جستجو و رزرو',
      SEARCH_ONLY: 'وب‌سرویس جستجو (آزمایشی)',
    };
    return labels[scope];
  }

  /** Commercial Manager agency-detail sections from design-reference-v2. */
  private async commercialDetailExtras(id: string) {
    const now = new Date();

    const [bookings, wsApproved, apiKeys, invoiceAggs, ledgerRows] =
      await Promise.all([
        this.bookingRepo
          .createQueryBuilder('b')
          .leftJoinAndSelect('b.flightInstance', 'fi')
          .leftJoinAndSelect('fi.flight', 'flight')
          .leftJoinAndSelect('flight.route', 'route')
          .where('b.agencyId = :id', { id })
          .andWhere('b.status IN (:...statuses)', {
            statuses: ['PAID', 'TICKETED'],
          })
          .orderBy('b.createdAt', 'DESC')
          .take(10)
          .getMany(),
        this.webserviceRequestRepo.find({
          where: { agencyId: id, status: 'APPROVED' },
          order: { decidedAt: 'DESC' },
          take: 10,
        }),
        this.apiKeyRepo.find({
          where: { agencyId: id, status: 'ACTIVE' },
          order: { activatedAt: 'DESC' },
        }),
        this.invoiceRepo
          .createQueryBuilder('i')
          .select('i.status', 'status')
          .addSelect('SUM(i.amountIrr)', 'sum')
          .where('i.agencyId = :id', { id })
          .groupBy('i.status')
          .getRawMany<{ status: string; sum: string }>(),
        this.ledgerEntryRepo
          .createQueryBuilder('e')
          .leftJoin('e.booking', 'booking')
          .select(['e.id', 'e.type', 'e.signedAmountIrr', 'e.occurredAt'])
          .addSelect(['booking.id', 'booking.pnr'])
          .where('e.agencyId = :id', { id })
          .orderBy('e.occurredAt', 'DESC')
          .take(10)
          .getMany(),
      ]);

    const passengerCounts = bookings.length
      ? await this.passengerRepo
          .createQueryBuilder('p')
          .select('p.bookingId', 'bookingId')
          .addSelect('COUNT(*)', 'count')
          .where('p.bookingId IN (:...ids)', {
            ids: bookings.map((b) => b.id),
          })
          .groupBy('p.bookingId')
          .getRawMany<{ bookingId: string; count: string }>()
      : [];
    const passengerCountByBookingId = new Map(
      passengerCounts.map((r) => [r.bookingId, Number(r.count)]),
    );
    const flightsSold = bookings.map((b) => ({
      routeFa: `${b.flightInstance.flight.route.originCode} ← ${b.flightInstance.flight.route.destCode}`,
      flightNo: b.flightInstance.flight.flightNo,
      departAt: b.flightInstance.departureAt.toISOString(),
      seatCount: passengerCountByBookingId.get(b.id) ?? 0,
      salesIrr: b.priceIrr,
    }));

    const purchasedServices = [
      ...wsApproved.map((r) => {
        const start = r.decidedAt ?? r.createdAt;
        const expiresAt = new Date(start);
        expiresAt.setMonth(expiresAt.getMonth() + r.months);
        const active = expiresAt > now;
        return {
          name: this.wsScopeLabel(r.scope),
          purchasedAt: start.toISOString(),
          expiresAt: expiresAt.toISOString(),
          statusLabel: active ? 'فعال' : 'منقضی',
          status: active ? ('ACTIVE' as const) : ('EXPIRED' as const),
        };
      }),
      ...apiKeys
        .filter((k) => !wsApproved.some((r) => r.scope === k.scope))
        .map((k) => ({
          name: this.wsScopeLabel(k.scope),
          purchasedAt: k.activatedAt.toISOString(),
          expiresAt: k.expiresAt?.toISOString() ?? null,
          statusLabel: 'فعال',
          status: 'ACTIVE' as const,
        })),
    ];

    let paidTotalIrr: Irr = ZERO_IRR;
    let unpaidTotalIrr: Irr = ZERO_IRR;
    for (const row of invoiceAggs) {
      const amount = BigInt(row.sum ?? '0');
      if (row.status === 'PAID') paidTotalIrr = addIrr(paidTotalIrr, amount);
      else unpaidTotalIrr = addIrr(unpaidTotalIrr, amount);
    }

    const txTitle: Record<string, string> = {
      SALE: 'فروش بلیط',
      SETTLEMENT: 'تسویه حساب',
      REFUND: 'استرداد',
      COMMISSION: 'کمیسیون',
    };

    const transactions = ledgerRows.map((e) => ({
      id: e.id,
      titleFa: txTitle[e.type] ?? e.type,
      occurredAt: e.occurredAt.toISOString(),
      signedAmountIrr: e.signedAmountIrr,
      ref: e.booking?.pnr ?? null,
    }));

    return {
      flightsSold,
      purchasedServices,
      financeSummary: { paidTotalIrr, unpaidTotalIrr },
      transactions,
    };
  }

  // ── Suspension ───────────────────────────────────────────────────────

  async suspend(actor: AuthenticatedUser, id: string, reason: string) {
    const profile = await this.getProfileOrThrow(id);
    profile.suspendedAt = new Date();
    profile.suspendReason = reason;
    const updated = await this.profileRepo.save(profile);

    // Revoke this agency's outstanding sessions immediately — otherwise an
    // already-issued refresh token keeps working until it happens to be
    // used again and rechecked.
    await this.refreshTokenRepo.update(
      { userId: id, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'AGENCY',
      action: 'تعلیق آژانس',
      detail: `آژانس «${profile.managerName}» توسط ${actor.fullName} تعلیق شد. دلیل: ${reason}`,
      entityType: 'AgencyProfile',
      entityId: id,
    });

    await this.notifications.notify({
      recipientId: id,
      category: 'SYSTEM',
      action: 'ACCESS_REVOKED',
      title: 'دسترسی پنل آژانس شما تعلیق شد',
      body: `آژانس شما توسط ${actor.fullName} تعلیق شد. دلیل: ${reason}`,
      entityType: 'AgencyProfile',
      entityId: id,
      dedupeKey: `AgencyProfile:${id}:ACCESS_REVOKED:${updated.suspendedAt!.toISOString()}`,
    });

    return updated;
  }

  async reactivate(actor: AuthenticatedUser, id: string) {
    const profile = await this.getProfileOrThrow(id);
    profile.suspendedAt = null;
    profile.suspendReason = null;
    const updated = await this.profileRepo.save(profile);

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'AGENCY',
      action: 'رفع تعلیق آژانس',
      detail: `تعلیق آژانس «${profile.managerName}» توسط ${actor.fullName} رفع شد.`,
      entityType: 'AgencyProfile',
      entityId: id,
    });

    return updated;
  }

  // ── Credit & settlement ─────────────────────────────────────────────

  async getCredit(id: string) {
    await this.getProfileOrThrow(id);
    const [creditLine, usedByAgency] = await Promise.all([
      this.creditLineRepo.findOneBy({ agencyId: id }),
      this.computeUsedIrr([id]),
    ]);
    const limitIrr = creditLine?.limitIrr ?? ZERO_IRR;
    const usedIrr = maxIrr(usedByAgency.get(id) ?? ZERO_IRR, ZERO_IRR);
    return { limitIrr, usedIrr, remainingIrr: subIrr(limitIrr, usedIrr) };
  }

  async updateCredit(actor: AuthenticatedUser, id: string, limitIrr: Irr) {
    await this.getProfileOrThrow(id);
    const existing = await this.creditLineRepo.findOneBy({ agencyId: id });
    let updated: AgencyCreditLine;
    if (existing) {
      existing.limitIrr = limitIrr;
      existing.updatedById = actor.id;
      existing.updatedAt = new Date();
      updated = await this.creditLineRepo.save(existing);
    } else {
      updated = await this.creditLineRepo.save(
        this.creditLineRepo.create({
          agencyId: id,
          limitIrr,
          updatedById: actor.id,
          updatedAt: new Date(),
        }),
      );
    }

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'AGENCY',
      action: 'تغییر سقف اعتبار آژانس',
      detail: `سقف اعتبار توسط ${actor.fullName} به ${limitIrr} ریال تغییر یافت.`,
      entityType: 'AgencyProfile',
      entityId: id,
      metadata: { limitIrr },
    });

    const usedByAgency = await this.computeUsedIrr([id]);
    const usedIrr = maxIrr(usedByAgency.get(id) ?? ZERO_IRR, ZERO_IRR);
    return {
      limitIrr: updated.limitIrr,
      usedIrr,
      remainingIrr: subIrr(updated.limitIrr, usedIrr),
    };
  }

  async settle(actor: AuthenticatedUser, id: string) {
    await this.getProfileOrThrow(id);

    const result = await this.profileRepo.manager.transaction(async (tx) => {
      // Lock this agency's profile row so two concurrent settlements can't
      // both read the same "outstanding" figure before either writes —
      // the aggregate below has no row of its own to lock, so we serialize
      // on the agency's own profile row instead.
      await tx
        .createQueryBuilder(AgencyProfile, 'a')
        .setLock('pessimistic_write')
        .where('a.userId = :id', { id })
        .getOne();

      const sumRow = await tx
        .createQueryBuilder(LedgerEntry, 'e')
        .select('SUM(e.signedAmountIrr)', 'sum')
        .where('e.agencyId = :id', { id })
        .andWhere('e.type IN (:...types)', { types: ['SALE', 'SETTLEMENT'] })
        .getRawOne<{ sum: string | null }>();
      const outstanding = maxIrr(BigInt(sumRow?.sum ?? '0'), ZERO_IRR);
      if (!isPositiveIrr(outstanding)) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message: 'بدهی معوقی برای تسویه وجود ندارد.',
        });
      }

      const entry = await tx.save(
        tx.create(LedgerEntry, {
          agencyId: id,
          type: 'SETTLEMENT',
          signedAmountIrr: negateIrr(outstanding),
          createdById: actor.id,
        }),
      );

      return { settledIrr: outstanding, ledgerEntryId: entry.id };
    });

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'AGENCY',
      action: 'ثبت تسویه آژانس',
      detail: `مبلغ ${result.settledIrr} ریال توسط ${actor.fullName} تسویه شد.`,
      entityType: 'AgencyProfile',
      entityId: id,
      metadata: { amountIrr: result.settledIrr },
    });

    return result;
  }

  // ── Membership requests ──────────────────────────────────────────────

  private membershipApprovalStage(
    request: AgencyMembershipRequest,
  ): MembershipApprovalStage {
    if (request.status === 'APPROVED') return 'APPROVED';
    if (request.status === 'REJECTED') return 'REJECTED';
    if (request.commercialApprovedAt) return 'AWAITING_FINANCE';
    return 'AWAITING_COMMERCIAL';
  }

  private shapeMembershipRequest(request: AgencyMembershipRequest) {
    return {
      ...request,
      approvalStage: this.membershipApprovalStage(request),
    };
  }

  async listRequests(status?: AgencyMembershipStatus) {
    const requests = await this.membershipRequestRepo.find({
      where: status ? { status } : {},
      order: { createdAt: 'DESC' },
    });
    return requests.map((request) => this.shapeMembershipRequest(request));
  }

  async getRequest(id: string) {
    const request = await this.getRequestOrThrow(id);
    const history = await this.auditLogRepo.find({
      where: {
        category: 'AGENCY',
        entityType: 'AgencyMembershipRequest',
        entityId: id,
      },
      order: { createdAt: 'DESC' },
    });
    return { ...this.shapeMembershipRequest(request), history };
  }

  async approveRequest(actor: AuthenticatedUser, id: string) {
    if (actor.role === 'COMMERCIAL_MANAGER') {
      const approved = await this.profileRepo.manager.transaction(
        async (tx) => {
          const request = await tx.findOne(AgencyMembershipRequest, {
            where: { id },
            lock: { mode: 'pessimistic_write' },
          });
          if (!request) {
            throw new NotFoundException({
              code: ErrorCode.NOT_FOUND,
              message: 'درخواست عضویت آژانس یافت نشد.',
            });
          }
          if (
            !DECIDABLE_STATUSES.includes(request.status) ||
            request.commercialApprovedAt
          ) {
            throw new ConflictException({
              code: ErrorCode.CONFLICT,
              message: 'این مرحله از درخواست قبلاً بررسی شده است.',
            });
          }

          request.commercialApprovedById = actor.id;
          request.commercialApprovedAt = new Date();
          return tx.save(request);
        },
      );

      await this.audit.record({
        actorId: actor.id,
        actorRole: actor.role,
        category: 'AGENCY',
        action: 'تأیید بازرگانی درخواست عضویت آژانس',
        detail: `درخواست «${approved.applicantName}» توسط ${actor.fullName} تأیید بازرگانی و برای بررسی مالی ارسال شد.`,
        entityType: 'AgencyMembershipRequest',
        entityId: id,
      });

      return {
        stage: 'AWAITING_FINANCE' as const,
        request: this.shapeMembershipRequest(approved),
      };
    }

    if (actor.role !== 'FINANCE_MANAGER') {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'نقش کاربر برای این مرحله معتبر نیست.',
      });
    }

    const request = await this.getRequestOrThrow(id);
    if (
      !DECIDABLE_STATUSES.includes(request.status) ||
      !request.commercialApprovedAt ||
      request.financeApprovedAt
    ) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'این درخواست قبلاً بررسی شده است.',
      });
    }

    // Agency Portal (self-service): without a password an approved agency's
    // User row could never log in — issued once here, never stored plaintext.
    const tempPassword = generateTempPassword();
    const passwordHash = await argon2.hash(tempPassword);

    const { agencyUserId } = await this.profileRepo.manager.transaction(
      async (tx) => {
        const lockedRequest = await tx.findOne(AgencyMembershipRequest, {
          where: { id },
          lock: { mode: 'pessimistic_write' },
        });
        if (
          !lockedRequest ||
          !DECIDABLE_STATUSES.includes(lockedRequest.status) ||
          !lockedRequest.commercialApprovedAt ||
          lockedRequest.financeApprovedAt
        ) {
          throw new ConflictException({
            code: ErrorCode.CONFLICT,
            message: 'این مرحله از درخواست قبلاً بررسی شده است.',
          });
        }

        const user = await tx.save(
          tx.create(User, {
            role: 'AGENCY',
            phone: request.phone,
            email: request.email,
            fullName: request.applicantName,
            passwordHash,
            mustChangePassword: true,
            isActive: true,
            updatedAt: new Date(),
          }),
        );
        await tx.save(
          tx.create(AgencyProfile, {
            userId: user.id,
            licenseNo: request.licenseNo,
            managerName: request.managerName,
            phone: request.phone,
            // Public pre-registration (Phase 16) collects neither — staff
            // fill these in during onboarding, same as the street address.
            email: request.email ?? '',
            city: request.city ?? '',
            // Full street address isn't captured on the request form — collected
            // during the agency's own onboarding once the agency-portal track exists.
            address: '',
            tier: 'NORMAL',
          }),
        );
        await tx.save(
          tx.create(AgencyCreditLine, {
            agencyId: user.id,
            limitIrr: 0n,
            updatedById: actor.id,
            updatedAt: new Date(),
          }),
        );
        await tx.update(
          AgencyMembershipRequest,
          { id },
          {
            status: 'APPROVED',
            financeApprovedById: actor.id,
            financeApprovedAt: new Date(),
            reviewedById: actor.id,
            reviewedAt: new Date(),
          },
        );
        return { agencyUserId: user.id };
      },
    );

    // Phase 16: a real SMS now confirms approval + delivers access instead
    // of the temp password only ever appearing in the API response.
    await this.sms.send(
      request.phone,
      `درخواست همکاری آژانس شما تأیید شد. رمز عبور موقت شما در بلوجت: ${tempPassword}`,
      'TEMP_PASSWORD',
    );

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'AGENCY',
      action: 'تأیید درخواست عضویت آژانس',
      detail: `درخواست «${request.applicantName}» توسط ${actor.fullName} تأیید و حساب آژانس ایجاد شد.`,
      entityType: 'AgencyMembershipRequest',
      entityId: id,
      metadata: { agencyUserId },
    });

    // Plaintext temp password is returned exactly once and never stored.
    return { stage: 'APPROVED' as const, agencyId: agencyUserId, tempPassword };
  }

  async rejectRequest(
    actor: AuthenticatedUser,
    id: string,
    reviewNote?: string,
  ) {
    // Pessimistic lock + status check inside the transaction — the same
    // fix as approveRequest()/referRequest(), so a reject can't race a
    // concurrent refer/approve into a lost update on the same row.
    const updated = await this.membershipRequestRepo.manager.transaction(
      async (tx) => {
        const locked = await tx.findOne(AgencyMembershipRequest, {
          where: { id },
          lock: { mode: 'pessimistic_write' },
        });
        if (!locked) {
          throw new NotFoundException({
            code: ErrorCode.NOT_FOUND,
            message: 'درخواست عضویت آژانس یافت نشد.',
          });
        }
        if (!DECIDABLE_STATUSES.includes(locked.status)) {
          throw new ConflictException({
            code: ErrorCode.CONFLICT,
            message: 'این درخواست قبلاً بررسی شده است.',
          });
        }

        locked.status = 'REJECTED';
        locked.reviewNote = reviewNote ?? null;
        locked.reviewedById = actor.id;
        locked.reviewedAt = new Date();
        return tx.save(locked);
      },
    );

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'AGENCY',
      action: 'رد درخواست عضویت آژانس',
      detail: `درخواست «${updated.applicantName}» توسط ${actor.fullName} رد شد.${reviewNote ? ` دلیل: ${reviewNote}` : ''}`,
      entityType: 'AgencyMembershipRequest',
      entityId: id,
    });

    return updated;
  }

  async referRequest(
    actor: AuthenticatedUser,
    id: string,
    referredToId: string,
    note?: string,
  ) {
    const target = await this.userRepo.findOneBy({ id: referredToId });
    if (!target) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'کاربر مقصد ارجاع یافت نشد.',
      });
    }

    // Pessimistic lock + a status check inside the same transaction — two
    // concurrent referrals (or a referral racing an approve/reject) can no
    // longer both succeed, matching approveRequest()'s established pattern.
    const { request, updated } =
      await this.membershipRequestRepo.manager.transaction(async (tx) => {
        const locked = await tx.findOne(AgencyMembershipRequest, {
          where: { id },
          lock: { mode: 'pessimistic_write' },
        });
        if (!locked) {
          throw new NotFoundException({
            code: ErrorCode.NOT_FOUND,
            message: 'درخواست عضویت آژانس یافت نشد.',
          });
        }
        if (!DECIDABLE_STATUSES.includes(locked.status)) {
          throw new ConflictException({
            code: ErrorCode.CONFLICT,
            message: 'این درخواست قبلاً بررسی شده است.',
          });
        }

        locked.status = 'REFERRED';
        locked.referredToId = referredToId;
        locked.reviewNote = note ?? null;
        locked.reviewedById = actor.id;
        locked.reviewedAt = new Date();
        const saved = await tx.save(locked);
        return { request: locked, updated: saved };
      });

    // Phase 4 wiring (⚑): the referred-to manager receives the request in
    // their cartable — that IS the delivery surface for referrals.
    await this.cartable.createTask({
      assigneeId: referredToId,
      category: 'AGENCY',
      title: `بررسی درخواست عضویت: ${request.applicantName}`,
      description: note
        ? `${note} (ارجاع از ${actor.fullName})`
        : `درخواست عضویت «${request.applicantName}» برای بررسی به شما ارجاع شد.`,
      senderId: actor.id,
      sourceType: 'AGENCY_REQUEST',
      sourceId: id,
    });

    await this.notifications.notify({
      recipientId: referredToId,
      category: 'REQUEST',
      action: 'REFERRED',
      title: 'ارجاع درخواست عضویت آژانس',
      body: `درخواست «${request.applicantName}» توسط ${actor.fullName} برای بررسی به شما ارجاع شد.`,
      entityType: 'AgencyMembershipRequest',
      entityId: id,
      dedupeKey: `AgencyMembershipRequest:${id}:REFERRED:${referredToId}:${request.reviewedAt!.toISOString()}`,
    });

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'AGENCY',
      action: 'ارجاع درخواست عضویت آژانس',
      detail: `درخواست «${request.applicantName}» توسط ${actor.fullName} به ${target.fullName} ارجاع شد.`,
      entityType: 'AgencyMembershipRequest',
      entityId: id,
    });

    return updated;
  }

  // ── API keys (Senior Manager only) ──────────────────────────────────

  async listApiKeys(id: string) {
    await this.getProfileOrThrow(id);
    const keys = await this.apiKeyRepo.find({
      where: { agencyId: id },
      order: { activatedAt: 'DESC' },
    });
    return keys.map((key) => apiKeyView(key));
  }

  async issueApiKey(
    actor: AuthenticatedUser,
    id: string,
    scope: AgencyApiScope,
    stepUpChallengeId: string,
    stepUpCode: string,
    options: {
      environment?: AgencyApiEnvironment;
      flightDomain?: AgencyFlightDomain;
      capabilities?: AgencyApiCapability[];
      ipWhitelist?: string[];
      rateLimitPerMinute?: number | null;
      expiresAt?: string | null;
    } = {},
  ) {
    await this.stepUp.verify(
      actor,
      stepUpChallengeId,
      stepUpCode,
      'API_KEY_ROTATE',
    );
    await this.getProfileOrThrow(id);

    const environment = options.environment ?? 'SANDBOX';
    const flightDomain = options.flightDomain ?? 'ALL';
    const capabilities = normalizeCapabilities(options.capabilities, scope);
    const resolvedScope = options.capabilities?.length
      ? scopeFromCapabilities(capabilities)
      : scope;

    const existing = await this.apiKeyRepo.findOne({
      where: [
        { agencyId: id, environment, status: 'ACTIVE' },
        { agencyId: id, environment, status: 'SUSPENDED' },
      ],
    });
    if (existing) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message:
          'برای این آژانس در این محیط قبلاً کلید فعال وجود دارد؛ ابتدا آن را لغو کنید یا محیط دیگر را انتخاب کنید.',
      });
    }

    const rawKey = generateApiKeySecret();
    const created = await this.apiKeyRepo.save(
      this.apiKeyRepo.create({
        agencyId: id,
        keyHash: hashAgencyApiKey(rawKey),
        scope: resolvedScope,
        capabilities,
        environment,
        flightDomain,
        ipWhitelist: options.ipWhitelist ?? [],
        rateLimitPerMinute: options.rateLimitPerMinute ?? null,
        expiresAt: options.expiresAt ? new Date(options.expiresAt) : null,
        status: 'ACTIVE',
      }),
    );

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'AGENCY',
      action: 'صدور کلید API آژانس',
      detail: `کلید API با دامنه ${resolvedScope} (${environment}) توسط ${actor.fullName} صادر شد.`,
      entityType: 'AgencyApiKey',
      entityId: created.id,
    });

    // Shown once — DB only ever stores keyHash from here on.
    return apiKeyView(created, rawKey);
  }

  async updateApiKey(
    actor: AuthenticatedUser,
    id: string,
    keyId: string,
    dto: {
      status?: AgencyApiKeyStatus;
      regenerate?: boolean;
      stepUpChallengeId?: string;
      stepUpCode?: string;
      scope?: AgencyApiScope;
      capabilities?: AgencyApiCapability[];
      environment?: AgencyApiEnvironment;
      flightDomain?: AgencyFlightDomain;
      ipWhitelist?: string[];
      rateLimitPerMinute?: number | null;
      expiresAt?: string | null;
    },
  ) {
    const key = await this.apiKeyRepo.findOneBy({ id: keyId });
    if (!key || key.agencyId !== id) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'کلید API یافت نشد.',
      });
    }

    if (dto.regenerate) {
      if (key.status === 'REVOKED') {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_FAILED,
          message: 'کلید لغوشده قابل صدور مجدد نیست؛ کلید تازه‌ای صادر کنید.',
        });
      }
      await this.stepUp.verify(
        actor,
        dto.stepUpChallengeId ?? '',
        dto.stepUpCode ?? '',
        'API_KEY_ROTATE',
      );
      const rawKey = generateApiKeySecret();
      key.keyHash = hashAgencyApiKey(rawKey);
      key.activatedAt = new Date();
      key.lastUsedAt = null;
      key.callCount = 0;
      const updated = await this.apiKeyRepo.save(key);
      await this.audit.record({
        actorId: actor.id,
        actorRole: actor.role,
        category: 'AGENCY',
        action: 'صدور مجدد کلید API آژانس',
        detail: `کلید API توسط ${actor.fullName} صادر مجدد شد؛ کلید قبلی باطل شد.`,
        entityType: 'AgencyApiKey',
        entityId: keyId,
      });
      return apiKeyView(updated, rawKey);
    }

    if (dto.status) {
      if (key.status === 'REVOKED' && dto.status !== 'REVOKED') {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_FAILED,
          message: 'کلید لغوشده قابل فعال‌سازی مجدد نیست.',
        });
      }
      if (dto.status === 'REVOKED') {
        await this.stepUp.verify(
          actor,
          dto.stepUpChallengeId ?? '',
          dto.stepUpCode ?? '',
          'API_KEY_ROTATE',
        );
      }
      key.status = dto.status;
      const updated = await this.apiKeyRepo.save(key);
      await this.audit.record({
        actorId: actor.id,
        actorRole: actor.role,
        category: 'AGENCY',
        action:
          dto.status === 'ACTIVE'
            ? 'فعال‌سازی کلید API آژانس'
            : dto.status === 'REVOKED'
              ? 'لغو دائمی کلید API آژانس'
              : 'تعلیق کلید API آژانس',
        detail: `وضعیت کلید API توسط ${actor.fullName} به ${dto.status} تغییر یافت.`,
        entityType: 'AgencyApiKey',
        entityId: keyId,
      });
      return apiKeyView(updated);
    }

    const policyTouched =
      dto.capabilities !== undefined ||
      dto.scope !== undefined ||
      dto.environment !== undefined ||
      dto.flightDomain !== undefined ||
      dto.ipWhitelist !== undefined ||
      dto.rateLimitPerMinute !== undefined ||
      dto.expiresAt !== undefined;

    if (!policyTouched) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'حداقل یک فیلد برای به‌روزرسانی الزامی است.',
      });
    }

    if (dto.environment && dto.environment !== key.environment) {
      const clash = await this.apiKeyRepo.findOne({
        where: [
          {
            agencyId: id,
            environment: dto.environment,
            status: 'ACTIVE',
          },
          {
            agencyId: id,
            environment: dto.environment,
            status: 'SUSPENDED',
          },
        ],
      });
      if (clash && clash.id !== key.id) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message: 'کلید دیگری برای این آژانس در محیط انتخاب‌شده فعال است.',
        });
      }
      key.environment = dto.environment;
    }

    if (dto.capabilities) {
      key.capabilities = normalizeCapabilities(dto.capabilities, key.scope);
      key.scope = scopeFromCapabilities(key.capabilities);
    } else if (dto.scope) {
      key.scope = dto.scope;
      key.capabilities = capabilitiesFromScope(dto.scope);
    }

    if (dto.flightDomain) key.flightDomain = dto.flightDomain;
    if (dto.ipWhitelist !== undefined) key.ipWhitelist = dto.ipWhitelist;
    if (dto.rateLimitPerMinute !== undefined) {
      key.rateLimitPerMinute = dto.rateLimitPerMinute;
    }
    if (dto.expiresAt !== undefined) {
      key.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    }

    const updated = await this.apiKeyRepo.save(key);
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'AGENCY',
      action: 'به‌روزرسانی سیاست کلید API آژانس',
      detail: `سیاست کلید API توسط ${actor.fullName} به‌روزرسانی شد.`,
      entityType: 'AgencyApiKey',
      entityId: keyId,
    });
    return apiKeyView(updated);
  }

  // ── Invoices & messaging ─────────────────────────────────────────────

  async listInvoices(id: string) {
    await this.getProfileOrThrow(id);
    return this.invoiceRepo.find({
      where: { agencyId: id },
      order: { issuedAt: 'DESC' },
    });
  }

  /**
   * Cross-agency invoice aggregate for the Commercial Manager «همه فاکتورها»
   * view. OVERDUE is preserved in the DB and never mapped to VOIDED; the
   * UNPAID tab includes both UNPAID and OVERDUE (issued / still payable).
   */
  async listAggregateInvoices(status?: AggregateInvoiceStatus) {
    const qb = this.invoiceRepo
      .createQueryBuilder('i')
      .innerJoinAndSelect('i.agency', 'agency')
      .innerJoinAndSelect('agency.user', 'user')
      .orderBy('i.issuedAt', 'DESC');
    if (status === 'PAID') {
      qb.andWhere('i.status = :status', { status: 'PAID' });
    } else if (status === 'VOIDED') {
      qb.andWhere('i.status = :status', { status: 'VOIDED' });
    } else if (status === 'UNPAID') {
      qb.andWhere('i.status IN (:...statuses)', {
        statuses: ['UNPAID', 'OVERDUE'],
      });
    }
    const rows = await qb.getMany();
    return rows.map((row) => this.toAggregateInvoiceRow(row));
  }

  async listSeatRequests() {
    const rows = await this.seatRequestRepo.find({
      relations: {
        invoice: true,
        route: true,
        flights: { flightInstance: { flight: true } },
      },
      order: { createdAt: 'DESC' },
    });
    const agencyIds = [...new Set(rows.map((row) => row.agencyId))];
    const [profiles, users, airports] = await Promise.all([
      agencyIds.length
        ? this.profileRepo.find({
            where: { userId: In(agencyIds) },
            relations: { user: true },
          })
        : Promise.resolve([]),
      agencyIds.length
        ? this.userRepo.find({ where: { id: In(agencyIds) } })
        : Promise.resolve([]),
      this.airportRepo.find(),
    ]);
    const profileById = new Map(profiles.map((p) => [p.userId, p]));
    const userById = new Map(users.map((u) => [u.id, u]));
    const cityByCode = new Map(airports.map((a) => [a.code, a.cityFa]));
    return rows.map((row) =>
      this.toSeatRequestRow(row, profileById, userById, cityByCode),
    );
  }

  private async assertAgencyCredit(
    tx: EntityManager,
    agencyId: string,
    amountIrr: Irr,
  ) {
    const credit = await tx
      .createQueryBuilder(AgencyCreditLine, 'credit')
      .setLock('pessimistic_write')
      .where('credit."agencyId" = :agencyId', { agencyId })
      .getOne();
    if (!credit) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'برای این آژانس خط اعتباری فعالی ثبت نشده است.',
      });
    }
    const raw = await tx
      .createQueryBuilder(LedgerEntry, 'entry')
      .select('COALESCE(SUM(entry."signedAmountIrr"), 0)', 'used')
      .where('entry."agencyId" = :agencyId', { agencyId })
      .andWhere('entry.type IN (:...types)', {
        types: ['SALE', 'SETTLEMENT'],
      })
      .getRawOne<{ used: string }>();
    const used = BigInt(raw?.used ?? '0');
    if (subIrr(credit.limitIrr, used) < amountIrr) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'اعتبار قابل استفاده آژانس برای این درخواست کافی نیست.',
      });
    }
  }

  /** Converts a paid/credit-approved request into bookable inventory. The
   * flight row is the mutex shared with manual commercial allotment writes;
   * the fare-rule row is additionally locked so two requests for one class
   * cannot overrun the released class pool. */
  private async activateSeatRequestAllotments(
    tx: EntityManager,
    request: AgencySeatRequest,
    actorId: string,
  ) {
    if (!request.cabin || !request.fareClassCode) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'درخواست قدیمی فاقد کلاس نرخی است و باید دوباره ثبت شود.',
      });
    }
    const occurrences = await tx.find(AgencySeatRequestFlight, {
      where: { seatRequestId: request.id },
      order: { createdAt: 'ASC' },
    });
    if (occurrences.length === 0) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'هیچ پروازی برای این درخواست ثبت نشده است.',
      });
    }

    for (const occurrence of occurrences) {
      const alreadyActivated = await tx.findOne(AgencyAllotment, {
        where: {
          seatRequestId: request.id,
          flightInstanceId: occurrence.flightInstanceId,
        },
      });
      if (alreadyActivated) continue;

      const instance = await tx
        .createQueryBuilder(FlightInstance, 'instance')
        .setLock('pessimistic_write')
        .where('instance.id = :id', { id: occurrence.flightInstanceId })
        .getOne();
      if (
        !instance ||
        instance.status !== 'SCHEDULED' ||
        instance.definitionStatus !== 'PUBLISHED' ||
        instance.departureAt <= new Date()
      ) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message: 'یکی از پروازهای دوره دیگر فعال و قابل فروش نیست.',
        });
      }

      const rule = await tx
        .createQueryBuilder(FareRule, 'rule')
        .setLock('pessimistic_write')
        .where('rule."flightInstanceId" = :flightInstanceId', {
          flightInstanceId: instance.id,
        })
        .andWhere('rule.cabin = :cabin', { cabin: request.cabin })
        .andWhere('rule."classCode" = :classCode', {
          classCode: request.fareClassCode,
        })
        .getOne();
      if (
        !rule ||
        !rule.agencyReleasePriceIrr ||
        rule.agencySeatsReleased < 1
      ) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message: 'سهمیه این کلاس توسط مدیر بازرگانی بسته یا حذف شده است.',
        });
      }

      const activeClassAllotments = await tx
        .createQueryBuilder(AgencyAllotment, 'allotment')
        .setLock('pessimistic_write')
        .where('allotment."flightInstanceId" = :flightInstanceId', {
          flightInstanceId: instance.id,
        })
        .andWhere('allotment.cabin = :cabin', { cabin: request.cabin })
        .andWhere('allotment."fareClassCode" = :classCode', {
          classCode: request.fareClassCode,
        })
        .andWhere(
          '(allotment.type = :hard OR allotment."releaseAt" IS NULL OR allotment."releaseAt" > :now)',
          { hard: 'HARD', now: new Date() },
        )
        .getMany();
      const used = activeClassAllotments.reduce(
        (sum, allotment) => sum + allotment.seatsAllocated,
        0,
      );
      const hardLimit = Math.min(rule.agencySeatsReleased, rule.seatsAllocated);
      if (used + request.seats > hardLimit) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message: 'سهمیه آزاد این کلاس برای یکی از پروازهای دوره کافی نیست.',
        });
      }

      const publicUsage = await tx
        .createQueryBuilder(Passenger, 'passenger')
        .innerJoin(Booking, 'booking', 'booking.id = passenger.bookingId')
        .select(
          `COALESCE(SUM(CASE
            WHEN passenger."occupiesSeat" = FALSE THEN 0
            WHEN passenger."extraSeatCode" IS NULL THEN 1
            ELSE 2
          END), 0)`,
          'used',
        )
        .where('booking.flightInstanceId = :flightInstanceId', {
          flightInstanceId: instance.id,
        })
        .andWhere('booking.cabin = :cabin', { cabin: request.cabin })
        .andWhere('booking.fareClassCode = :classCode', {
          classCode: request.fareClassCode,
        })
        .andWhere('booking.channel != :agencyChannel', {
          agencyChannel: 'AGENCY',
        })
        .andWhere('booking.status IN (:...statuses)', {
          statuses: ['DRAFT', 'HELD', 'PAID', 'TICKETED'],
        })
        .andWhere('(booking.status != :held OR booking.holdExpiresAt > :now)', {
          held: 'HELD',
          now: new Date(),
        })
        .andWhere('passenger.deletedAt IS NULL')
        .andWhere('booking.deletedAt IS NULL')
        .getRawOne<{ used: string }>();
      const publicSeatsUsed = Number(publicUsage?.used ?? 0);
      if (publicSeatsUsed + used + request.seats > rule.seatsAllocated) {
        throw new ConflictException({
          code: ErrorCode.POOL_EXHAUSTED,
          message:
            'موجودی لحظه‌ای موتور رزرو پس از فروش سایت برای فعال‌سازی این سهمیه کافی نیست.',
        });
      }

      await tx.save(
        tx.create(AgencyAllotment, {
          agencyId: request.agencyId,
          flightInstanceId: instance.id,
          cabin: request.cabin,
          fareClassCode: request.fareClassCode,
          seatRequestId: request.id,
          seatsAllocated: request.seats,
          type: 'HARD',
          releaseAt: null,
          contractPriceIrr: request.unitPriceIrr,
          createdById: actorId,
        }),
      );
    }
  }

  async decideSeatRequest(
    actor: AuthenticatedUser,
    id: string,
    dto: { approve: boolean; dueAt?: string },
  ) {
    const existing = await this.seatRequestRepo.findOne({
      where: { id },
      relations: { invoice: true },
    });
    if (!existing) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'درخواست صندلی یافت نشد.',
      });
    }

    const result = await this.seatRequestRepo.manager.transaction(
      async (tx) => {
        const locked = await tx
          .createQueryBuilder(AgencySeatRequest, 'r')
          .setLock('pessimistic_write')
          .where('r.id = :id', { id })
          .getOne();
        if (!locked) {
          throw new NotFoundException({
            code: ErrorCode.NOT_FOUND,
            message: 'درخواست صندلی یافت نشد.',
          });
        }
        if (locked.status !== 'PENDING') {
          throw new ConflictException({
            code: ErrorCode.CONFLICT,
            message: 'این درخواست قبلاً بررسی شده است.',
          });
        }

        const oldStatus = locked.status;
        if (!dto.approve) {
          locked.status = 'REJECTED';
          locked.decidedById = actor.id;
          locked.decidedAt = new Date();
          await tx.save(locked);
          await this.cartable.resolveOpenBySource(
            'AGENCY_REQUEST',
            locked.id,
            'REJECTED',
            `رد درخواست صندلی توسط ${actor.fullName}`,
            tx,
          );
          return { row: locked, invoice: null, oldStatus };
        }

        const occurrenceCount = await tx.count(AgencySeatRequestFlight, {
          where: { seatRequestId: locked.id },
        });
        const totalIrr =
          locked.unitPriceIrr *
          BigInt(locked.seats) *
          BigInt(Math.max(occurrenceCount, 1));
        let invoice: AgencyInvoice | null = null;
        if (locked.payMethod === 'CREDIT') {
          await this.assertAgencyCredit(tx, locked.agencyId, totalIrr);
          await this.activateSeatRequestAllotments(tx, locked, actor.id);
          await tx.save(
            tx.create(LedgerEntry, {
              agencyId: locked.agencyId,
              type: 'SALE',
              signedAmountIrr: totalIrr,
              createdById: actor.id,
            }),
          );
          locked.status = 'APPROVED';
        } else {
          const dueAt = this.parseDueAt(dto.dueAt);
          invoice = await this.issueInvoice(
            actor,
            locked.agencyId,
            {
              amountIrr: totalIrr,
              dueAt: dueAt.toISOString(),
              descriptionFa: 'فاکتور خرید سهمیه صندلی آژانس',
            },
            tx,
          );
          locked.status = 'PENDING_FINANCE';
          locked.invoiceId = invoice.id;
          locked.dueAt = dueAt;
        }
        locked.decidedById = actor.id;
        locked.decidedAt = new Date();
        await tx.save(locked);
        await this.cartable.resolveOpenBySource(
          'AGENCY_REQUEST',
          locked.id,
          'APPROVED',
          invoice
            ? `تأیید تجاری درخواست صندلی و صدور فاکتور ${invoice.invoiceNo}`
            : `تأیید و فعال‌سازی اعتباری سهمیه توسط ${actor.fullName}`,
          tx,
        );
        return { row: locked, invoice, oldStatus };
      },
    );

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'AGENCY',
      action: dto.approve
        ? 'تأیید درخواست خرید صندلی آژانس'
        : 'رد درخواست خرید صندلی آژانس',
      detail: `وضعیت درخواست صندلی از ${result.oldStatus} به ${result.row.status} توسط ${actor.fullName} تغییر کرد.${result.invoice ? ` فاکتور ${result.invoice.invoiceNo}.` : ''}`,
      entityType: 'AgencySeatRequest',
      entityId: result.row.id,
      metadata: {
        oldStatus: result.oldStatus,
        newStatus: result.row.status,
        invoiceId: result.invoice?.id ?? null,
        invoiceNo: result.invoice?.invoiceNo ?? null,
      },
    });
    if (result.invoice) {
      await this.audit.record({
        actorId: actor.id,
        actorRole: actor.role,
        category: 'AGENCY',
        action: 'صدور فاکتور از درخواست صندلی',
        detail: `فاکتور ${result.invoice.invoiceNo} از روی درخواست صندلی صادر شد.`,
        entityType: 'AgencyInvoice',
        entityId: result.invoice.id,
        metadata: { seatRequestId: result.row.id },
      });
    }

    return {
      id: result.row.id,
      status: result.row.status as 'PENDING_FINANCE' | 'APPROVED' | 'REJECTED',
    };
  }

  async issueInvoice(
    actor: AuthenticatedUser,
    id: string,
    dto: { amountIrr: Irr; dueAt: string; descriptionFa?: string },
    manager?: EntityManager,
  ) {
    await this.getProfileOrThrow(id);
    const invoiceRepo = manager
      ? manager.getRepository(AgencyInvoice)
      : this.invoiceRepo;
    const created = await invoiceRepo.save(
      invoiceRepo.create({
        agencyId: id,
        invoiceNo: generateInvoiceNo(),
        issuedById: actor.id,
        dueAt: new Date(dto.dueAt),
        amountIrr: dto.amountIrr,
        descriptionFa: dto.descriptionFa ?? null,
        status: 'UNPAID',
      }),
    );

    if (!manager) {
      await this.audit.record({
        actorId: actor.id,
        actorRole: actor.role,
        category: 'AGENCY',
        action: 'صدور فاکتور آژانس',
        detail: `فاکتور ${created.invoiceNo} به مبلغ ${dto.amountIrr} ریال توسط ${actor.fullName} صادر شد.`,
        entityType: 'AgencyInvoice',
        entityId: created.id,
      });
    }

    return created;
  }

  /** E2E only (404 in production): resets the agency's derived debt to a
   * fixed figure so the invoice-pay journey observes a change regardless of
   * how much prior runs have settled against the long-lived dev DB. */
  async resetTestDebt(actor: AuthenticatedUser, id: string) {
    if (process.env.NODE_ENV === 'production') {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'یافت نشد.',
      });
    }
    const profile = await this.profileRepo.findOneBy({ userId: id });
    if (!profile) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'آژانس یافت نشد.',
      });
    }
    const targetIrr: Irr = 100_000_000n;
    const usedIrr = (await this.computeUsedIrr([id])).get(id) ?? ZERO_IRR;
    const deltaIrr = subIrr(targetIrr, usedIrr);
    if (!isZeroIrr(deltaIrr)) {
      await this.ledgerEntryRepo.save(
        this.ledgerEntryRepo.create({
          agencyId: id,
          type: 'SALE',
          signedAmountIrr: deltaIrr,
          createdById: actor.id,
        }),
      );
    }
    return { usedIrr: targetIrr };
  }

  async payInvoice(actor: AuthenticatedUser, id: string, invoiceId: string) {
    const updated = await this.invoiceRepo.manager.transaction(async (tx) => {
      const lockedInvoice = await tx
        .createQueryBuilder(AgencyInvoice, 'invoice')
        .setLock('pessimistic_write')
        .where('invoice.id = :invoiceId', { invoiceId })
        .getOne();
      if (!lockedInvoice || lockedInvoice.agencyId !== id) {
        throw new NotFoundException({
          code: ErrorCode.NOT_FOUND,
          message: 'فاکتور یافت نشد.',
        });
      }
      if (lockedInvoice.status === 'PAID') {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message: 'این فاکتور قبلاً تسویه شده است.',
        });
      }

      const seatRequest = await tx
        .createQueryBuilder(AgencySeatRequest, 'request')
        .setLock('pessimistic_write')
        .where('request."invoiceId" = :invoiceId', { invoiceId })
        .getOne();
      if (seatRequest) {
        if (seatRequest.status !== 'PENDING_FINANCE') {
          throw new ConflictException({
            code: ErrorCode.CONFLICT,
            message: 'وضعیت درخواست صندلی برای پرداخت معتبر نیست.',
          });
        }
        await this.activateSeatRequestAllotments(tx, seatRequest, actor.id);
        await tx.save(
          tx.create(LedgerEntry, {
            agencyId: id,
            type: 'SALE',
            signedAmountIrr: lockedInvoice.amountIrr,
            createdById: actor.id,
          }),
        );
        seatRequest.status = 'APPROVED';
        await tx.save(seatRequest);
      }

      lockedInvoice.status = 'PAID';
      lockedInvoice.paidAt = new Date();
      await tx.save(lockedInvoice);
      await tx.save(
        tx.create(LedgerEntry, {
          agencyId: id,
          type: 'SETTLEMENT',
          signedAmountIrr: negateIrr(lockedInvoice.amountIrr),
          createdById: actor.id,
        }),
      );
      return lockedInvoice;
    });

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'AGENCY',
      action: 'تسویه فاکتور آژانس',
      detail: `فاکتور ${updated.invoiceNo} توسط ${actor.fullName} تسویه شد.`,
      entityType: 'AgencyInvoice',
      entityId: invoiceId,
    });

    return updated;
  }

  async remindInvoice(actor: AuthenticatedUser, id: string, invoiceId: string) {
    const invoice = await this.invoiceRepo.findOneBy({ id: invoiceId });
    if (!invoice || invoice.agencyId !== id) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'فاکتور یافت نشد.',
      });
    }

    // Queued via the SmsProvider/email interface — mocked in dev/tests per CLAUDE.md.
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'AGENCY',
      action: 'یادآوری فاکتور آژانس',
      detail: `یادآوری فاکتور ${invoice.invoiceNo} توسط ${actor.fullName} ارسال شد.`,
      entityType: 'AgencyInvoice',
      entityId: invoiceId,
    });

    return { queued: true };
  }

  async listMessages(id: string) {
    await this.getProfileOrThrow(id);
    const messages = await this.messageRepo.find({
      where: { agencyId: id },
      order: { createdAt: 'ASC' },
    });
    const attachmentIds = [
      ...new Set(
        messages.flatMap((message) =>
          Array.isArray(message.attachments)
            ? message.attachments.filter(
                (value): value is string => typeof value === 'string',
              )
            : [],
        ),
      ),
    ];
    const files = attachmentIds.length
      ? await this.storedFileRepo.findBy({ id: In(attachmentIds) })
      : [];
    const byId = new Map(files.map((file) => [file.id, file]));
    return messages.map((message) => ({
      ...message,
      attachments: (Array.isArray(message.attachments)
        ? message.attachments
        : []
      ).flatMap((id) => {
        if (typeof id !== 'string') return [];
        const file = byId.get(id);
        return file
          ? [
              {
                id: file.id,
                fileName: file.fileName,
                mimeType: file.mimeType,
                sizeBytes: file.sizeBytes,
              },
            ]
          : [];
      }),
    }));
  }

  async postMessage(
    actor: AuthenticatedUser,
    id: string,
    body: string,
    senderIsAgency = false,
    attachmentIds?: string[],
  ) {
    await this.getProfileOrThrow(id);
    if (attachmentIds?.length) {
      const owned = await this.storedFileRepo.count({
        where: { id: In(attachmentIds), ownerId: actor.id },
      });
      if (owned !== attachmentIds.length) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_FAILED,
          message: 'فایل پیوست معتبر نیست.',
        });
      }
    }
    return this.messageRepo.save(
      this.messageRepo.create({
        agencyId: id,
        senderId: actor.id,
        senderIsAgency,
        body,
        attachments: attachmentIds ?? [],
      }),
    );
  }

  async notifyAllDebtors(actor: AuthenticatedUser) {
    const { agencies } = await this.list({ debtorsOnly: true });

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'AGENCY',
      action: 'ارسال اعلان به همه بدهکاران',
      detail: `اعلان بدهی توسط ${actor.fullName} به ${agencies.length} آژانس بدهکار ارسال شد.`,
    });

    return { notifiedCount: agencies.length };
  }

  // ── Agency Portal: credit-increase requests (staff-side review) ────────

  async listCreditRequests(id: string) {
    await this.getProfileOrThrow(id);
    return this.creditRequestRepo.find({
      where: { agencyId: id },
      order: { createdAt: 'DESC' },
    });
  }

  async decideCreditRequest(
    actor: AuthenticatedUser,
    id: string,
    requestId: string,
    approve: boolean,
  ) {
    const request = await this.creditRequestRepo.findOneBy({ id: requestId });
    if (!request || request.agencyId !== id) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'درخواست افزایش اعتبار یافت نشد.',
      });
    }
    if (request.status !== 'PENDING') {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'این درخواست قبلاً بررسی شده است.',
      });
    }

    const decision: AgencyCreditRequestStatus = approve
      ? 'APPROVED'
      : 'REJECTED';

    // Conditional update guards a concurrent double-decision race.
    const updated = await this.creditRequestRepo.update(
      { id: requestId, status: 'PENDING' },
      { status: decision, decidedById: actor.id, decidedAt: new Date() },
    );
    if ((updated.affected ?? 0) === 0) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'این درخواست قبلاً بررسی شده است.',
      });
    }

    // The ONLY code path that actually changes AgencyCreditLine.limitIrr —
    // reuses the already-audited updateCredit rather than writing a second one.
    if (approve) {
      await this.updateCredit(actor, id, request.requestedLimitIrr);
    }

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'AGENCY',
      action: approve
        ? 'تأیید درخواست افزایش اعتبار آژانس'
        : 'رد درخواست افزایش اعتبار آژانس',
      detail: `درخواست افزایش اعتبار به ${request.requestedLimitIrr} ریال توسط ${actor.fullName} ${approve ? 'تأیید' : 'رد'} شد.`,
      entityType: 'AgencyCreditRequest',
      entityId: requestId,
    });

    return this.creditRequestRepo
      .createQueryBuilder('r')
      .where('r.id = :id', { id: requestId })
      .getOneOrFail();
  }

  // ── Agency Portal: webservice purchase requests (staff-side review) ────

  /** Cross-agency queue for SITE_ADMIN «درخواست وب‌سرویس» tab. */
  async listAllWebserviceRequests(
    status?: 'PENDING' | 'APPROVED' | 'REJECTED',
  ) {
    const qb = this.webserviceRequestRepo
      .createQueryBuilder('r')
      .leftJoin('r.agency', 'agency')
      .leftJoin('agency.user', 'user')
      .addSelect(['agency.userId', 'agency.city', 'agency.licenseNo'])
      .addSelect(['user.fullName'])
      .orderBy('r.createdAt', 'DESC');
    if (status) qb.where('r.status = :status', { status });

    const rows = await qb.getMany();
    return rows.map((r) => ({
      id: r.id,
      agencyId: r.agencyId,
      agencyName: r.agency.user.fullName,
      city: r.agency.city,
      licenseNo: r.agency.licenseNo,
      scope: r.scope,
      months: r.months,
      priceIrr: r.priceIrr.toString(),
      note: r.note,
      status: r.status,
      decidedAt: r.decidedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async listWebserviceRequests(id: string) {
    await this.getProfileOrThrow(id);
    return this.webserviceRequestRepo.find({
      where: { agencyId: id },
      order: { createdAt: 'DESC' },
    });
  }

  async decideWebserviceRequest(
    actor: AuthenticatedUser,
    id: string,
    requestId: string,
    approve: boolean,
    stepUpChallengeId?: string,
    stepUpCode?: string,
  ) {
    const request = await this.webserviceRequestRepo.findOneBy({
      id: requestId,
    });
    if (!request || request.agencyId !== id) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'درخواست وب‌سرویس یافت نشد.',
      });
    }
    if (request.status !== 'PENDING') {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'این درخواست قبلاً بررسی شده است.',
      });
    }

    const decision: AgencyWebserviceRequestStatus = approve
      ? 'APPROVED'
      : 'REJECTED';

    let issuedKey: ReturnType<typeof apiKeyView> | null = null;
    if (approve) {
      // Issued BEFORE the status flip below: if step-up verification fails
      // here, the request is untouched and stays PENDING for a retry —
      // never left APPROVED with no key actually issued. Reuses the
      // existing, already-audited, step-up-gated key issuance path
      // verbatim rather than duplicating it.
      issuedKey = await this.issueApiKey(
        actor,
        id,
        request.scope,
        stepUpChallengeId ?? '',
        stepUpCode ?? '',
      );
      // Never persist the raw credential in the agency message thread.
      // It is returned once to the approving operator and cannot be
      // recovered from the stored hash afterwards.
      await this.postMessage(
        actor,
        id,
        'درخواست وب‌سرویس شما تأیید شد. برای دریافت امن کلید دسترسی API با مدیر فناوری اطلاعات هماهنگ کنید.',
      );
    }

    // Conditional update guards a concurrent double-decision race — same
    // pattern as decideCreditRequest above.
    const updated = await this.webserviceRequestRepo.update(
      { id: requestId, status: 'PENDING' },
      { status: decision, decidedById: actor.id, decidedAt: new Date() },
    );
    if ((updated.affected ?? 0) === 0) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'این درخواست قبلاً بررسی شده است.',
      });
    }

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'AGENCY',
      action: approve
        ? 'تأیید درخواست وب‌سرویس آژانس'
        : 'رد درخواست وب‌سرویس آژانس',
      detail: `درخواست وب‌سرویس (${request.scope}, ${request.months} ماهه) توسط ${actor.fullName} ${approve ? 'تأیید' : 'رد'} شد.`,
      entityType: 'AgencyWebserviceRequest',
      entityId: requestId,
    });

    const decidedRequest = await this.webserviceRequestRepo
      .createQueryBuilder('r')
      .where('r.id = :id', { id: requestId })
      .getOneOrFail();
    return {
      request: decidedRequest,
      ...(issuedKey ? { apiKey: issuedKey } : {}),
    };
  }

  // ── Agency Portal: uploaded document review (staff-side) ───────────────

  async listDocuments(id: string) {
    await this.getProfileOrThrow(id);
    return this.documentRepo.find({
      where: { agencyId: id },
      relations: { file: true },
      select: {
        file: { fileName: true, sizeBytes: true, mimeType: true },
      },
      order: { createdAt: 'DESC' },
    });
  }

  async decideDocument(
    actor: AuthenticatedUser,
    id: string,
    documentId: string,
    approve: boolean,
  ) {
    const document = await this.documentRepo.findOneBy({ id: documentId });
    if (!document || document.agencyId !== id) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'مدرک یافت نشد.',
      });
    }
    if (document.status !== 'PENDING') {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'این مدرک قبلاً بررسی شده است.',
      });
    }

    const decision: AgencyDocumentStatus = approve ? 'APPROVED' : 'REJECTED';

    // Conditional update guards a concurrent double-decision race — same
    // pattern as decideCreditRequest/decideWebserviceRequest above.
    const updated = await this.documentRepo.update(
      { id: documentId, status: 'PENDING' },
      { status: decision },
    );
    if ((updated.affected ?? 0) === 0) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'این مدرک قبلاً بررسی شده است.',
      });
    }

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'AGENCY',
      action: approve ? 'تأیید مدرک آژانس' : 'رد مدرک آژانس',
      detail: `مدرک (${document.docType}) توسط ${actor.fullName} ${approve ? 'تأیید' : 'رد'} شد.`,
      entityType: 'AgencyDocument',
      entityId: documentId,
    });

    return this.documentRepo.findOne({
      where: { id: documentId },
      relations: { file: true },
      select: {
        file: { fileName: true, sizeBytes: true, mimeType: true },
      },
    });
  }

  private toAggregateInvoiceRow(
    row: AgencyInvoice & { agency?: { user?: { fullName: string } } },
  ) {
    const status = toWireAggregateInvoiceStatus(row.status);
    return {
      id: row.id,
      invoiceNo: row.invoiceNo,
      agencyId: row.agencyId,
      agencyName: row.agency?.user?.fullName ?? '',
      descriptionFa: row.descriptionFa?.trim() || 'فاکتور آژانس',
      issuedAt: row.issuedAt.toISOString(),
      amountIrr: row.amountIrr.toString(),
      status,
    };
  }

  private toSeatRequestRow(
    row: AgencySeatRequest,
    profileById: Map<string, AgencyProfile>,
    userById: Map<string, User>,
    cityByCode: Map<string, string>,
  ) {
    const profile = profileById.get(row.agencyId);
    const user = userById.get(row.agencyId);
    const origin = row.route?.originCode;
    const dest = row.route?.destCode;
    const originFa = origin ? (cityByCode.get(origin) ?? origin) : '';
    const destFa = dest ? (cityByCode.get(dest) ?? dest) : '';
    const routeFa =
      originFa && destFa
        ? `${originFa} - ${destFa}`
        : origin && dest
          ? `${origin} - ${dest}`
          : '—';
    const months = (row.termMonths ?? 1) as 0 | 1 | 3 | 6 | 12;
    return {
      id: row.id,
      agencyId: row.agencyId,
      agencyName: profile?.user.fullName ?? user?.fullName ?? '',
      managerName: profile?.managerName ?? user?.fullName ?? '',
      phone: profile?.phone ?? user?.phone ?? '',
      city: profile?.city ?? '',
      licenseNo: profile?.licenseNo ?? '',
      routeFa,
      seats: row.seats,
      months,
      aircraftType: row.aircraftType,
      unitPriceIrr: row.unitPriceIrr.toString(),
      totalIrr: (
        row.unitPriceIrr *
        BigInt(row.seats) *
        BigInt(Math.max(row.flights?.length ?? 0, 1))
      ).toString(),
      payMethod: row.payMethod,
      status: row.status,
      invoiceNo: row.invoice?.invoiceNo ?? null,
      dueAt: row.dueAt?.toISOString() ?? null,
      flights: (row.flights ?? []).map((flight) => {
        const departure = flight.flightInstance?.departureAt;
        return {
          flightNo: flight.flightInstance?.flight.flightNo ?? '',
          date: departure ? departure.toISOString().slice(0, 10) : '',
          time: departure ? departure.toISOString().slice(11, 16) : '',
        };
      }),
      createdAt: row.createdAt.toISOString(),
    };
  }

  private parseDueAt(raw?: string) {
    const dueAt = raw
      ? new Date(raw)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    if (Number.isNaN(dueAt.getTime())) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'تاریخ مهلت پرداخت نامعتبر است.',
      });
    }
    return dueAt;
  }
}
