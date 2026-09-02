import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThanOrEqual, Not, IsNull, Repository } from 'typeorm';
import { AgencyProfile } from '../../database/entities/agency-profile.entity';
import { AgencyDocument } from '../../database/entities/agency-document.entity';
import { AgencyCreditRequest } from '../../database/entities/agency-credit-request.entity';
import { AgencyWebserviceRequest } from '../../database/entities/agency-webservice-request.entity';
import { AgencyAllotment } from '../../database/entities/agency-allotment.entity';
import { LedgerEntry } from '../../database/entities/ledger-entry.entity';
import { Booking } from '../../database/entities/booking.entity';
import { Passenger } from '../../database/entities/passenger.entity';
import { User } from '../../database/entities/user.entity';
import { FlightInstance } from '../../database/entities/flight-instance.entity';
import { AgencySeatCommitment } from '../../database/entities/agency-seat-commitment.entity';
import { CharterCommitment } from '../../database/entities/charter-commitment.entity';
import { FlightInstanceStatus } from '../../database/enums';
import { randomUUID } from 'node:crypto';
import { isActiveUatSandboxAgency } from '../../database/temporary-panel-accounts';
import { AuditService } from '../audit/audit.service';
import { CartableService } from '../cartable/cartable.service';
import { AgenciesService } from '../agencies/agencies.service';
import { FilesService } from '../files/files.service';
import { WebservicePricingService } from '../webservice-pricing/webservice-pricing.service';
import { SearchService } from '../booking-engine/search.service';
import { isSellableDefinitionStatus } from '../flights/definition-sellability';
import { ErrorCode } from '../../common/errors';
import { AgencySeatRequest } from '../../database/entities/agency-seat-request.entity';
import { AgencySeatRequestFlight } from '../../database/entities/agency-seat-request-flight.entity';
import { FareRule } from '../../database/entities/fare-rule.entity';
import { ZERO_IRR, addIrr, divRoundBigInt, toIrr } from '../../common/money';
import type { Irr } from '../../common/money';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import type {
  AgencySeatInquiryDto,
  RequestWebserviceDto,
  UploadDocumentDto,
} from './dto/agency-portal.dtos';

const CREDIT_REVIEW_ROLES = [
  'SENIOR_MANAGER',
  'FINANCE_MANAGER',
  'COMMERCIAL_MANAGER',
] as const;

const SOLD_STATUSES = ['PAID', 'TICKETED'] as const;

export function agencySeatSuggestion(
  requestedSeats: number,
  availableSeats: number,
) {
  const normalizedRequested = Math.max(0, Math.trunc(requestedSeats));
  const suggestedSeats = Math.min(
    normalizedRequested,
    Math.max(0, Math.trunc(availableSeats)),
  );
  return {
    suggestedSeats,
    canFulfillRequested: suggestedSeats === normalizedRequested,
  };
}

/**
 * Agency sale is independent from public sale: a class is requestable only
 * after Commercial Management explicitly opens an agency ceiling and price.
 * The live reservation inventory is applied separately by the option/inquiry
 * flows, so this ceiling never promises seats already consumed by the site.
 */
export function agencySeatRequestClassOffer(
  rule: Pick<
    FareRule,
    | 'seatsAllocated'
    | 'agencySeatsReleased'
    | 'agencyReleasePriceIrr'
    | 'sitePriceIrr'
    | 'priceIrr'
  >,
  allocatedSeats: number,
) {
  const classCapacity = Math.max(0, Math.trunc(rule.seatsAllocated));
  const releasedSeats = Math.min(
    classCapacity,
    Math.max(0, Math.trunc(rule.agencySeatsReleased)),
  );
  const hasDedicatedAgencyRelease =
    releasedSeats > 0 && rule.agencyReleasePriceIrr != null;
  const requestCeiling = hasDedicatedAgencyRelease ? releasedSeats : 0;
  return {
    hasDedicatedAgencyRelease,
    availableToRequest: Math.max(
      requestCeiling - Math.max(0, Math.trunc(allocatedSeats)),
      0,
    ),
    pricePerSeatIrr:
      rule.agencyReleasePriceIrr ?? rule.sitePriceIrr ?? rule.priceIrr,
  };
}

export function isAgencySeatRequestOccurrence(
  instance: Pick<
    FlightInstance,
    | 'status'
    | 'definitionStatus'
    | 'approvedSnapshot'
    | 'departureAt'
    | 'saleStartsAt'
    | 'saleEndsAt'
    | 'agencySaleEnabled'
  >,
  now = new Date(),
): boolean {
  return (
    instance.agencySaleEnabled &&
    instance.status === FlightInstanceStatus.SCHEDULED &&
    instance.departureAt >= now &&
    isSellableDefinitionStatus(
      instance.definitionStatus,
      instance.approvedSnapshot != null,
    ) &&
    (!instance.saleStartsAt || instance.saleStartsAt <= now) &&
    (!instance.saleEndsAt || instance.saleEndsAt >= now)
  );
}

// Phase 23: server-computed prices from the commercial-manager plan catalog
// (stored in SystemSetting, editable via PATCH /webservice/pricing).
// Never accept a client-supplied price.

@Injectable()
export class AgencyPortalService {
  constructor(
    @InjectRepository(AgencyProfile)
    private readonly profileRepo: Repository<AgencyProfile>,
    @InjectRepository(AgencyDocument)
    private readonly documentRepo: Repository<AgencyDocument>,
    @InjectRepository(AgencyCreditRequest)
    private readonly creditRequestRepo: Repository<AgencyCreditRequest>,
    @InjectRepository(AgencyWebserviceRequest)
    private readonly webserviceRequestRepo: Repository<AgencyWebserviceRequest>,
    @InjectRepository(AgencyAllotment)
    private readonly allotmentRepo: Repository<AgencyAllotment>,
    @InjectRepository(LedgerEntry)
    private readonly ledgerRepo: Repository<LedgerEntry>,
    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,
    @InjectRepository(Passenger)
    private readonly passengerRepo: Repository<Passenger>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(FlightInstance)
    private readonly flightInstanceRepo: Repository<FlightInstance>,
    @InjectRepository(AgencySeatCommitment)
    private readonly agencySeatCommitmentRepo: Repository<AgencySeatCommitment>,
    @InjectRepository(CharterCommitment)
    private readonly charterCommitmentRepo: Repository<CharterCommitment>,
    @InjectRepository(AgencySeatRequest)
    private readonly seatRequestRepo: Repository<AgencySeatRequest>,
    @InjectRepository(AgencySeatRequestFlight)
    private readonly seatRequestFlightRepo: Repository<AgencySeatRequestFlight>,
    @InjectRepository(FareRule)
    private readonly fareRuleRepo: Repository<FareRule>,
    private readonly audit: AuditService,
    private readonly cartable: CartableService,
    private readonly agencies: AgenciesService,
    private readonly files: FilesService,
    private readonly webservicePricing: WebservicePricingService,
    private readonly search: SearchService,
  ) {}

  private async getOwnProfileOrThrow(actor: AuthenticatedUser) {
    const profile = await this.profileRepo.findOne({
      where: { userId: actor.id },
      relations: { user: true },
    });
    if (!profile) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'پروفایل آژانس یافت نشد.',
      });
    }
    return profile;
  }

  // `uat.agency` is identity/access infrastructure only — no AgencyProfile
  // or AgencyCreditLine is ever created for it (see docs/features/
  // temporary-panel-password-access.md). These two guards let every read
  // endpoint below return a real, honest empty state instead of the normal
  // 404, and every mutating endpoint refuse instead of writing a business
  // row for an account with no real agency behind it.

  private async loadUatSandboxAgencyUser(
    actor: AuthenticatedUser,
  ): Promise<User | null> {
    const user = await this.userRepo.findOneBy({ id: actor.id });
    return user && isActiveUatSandboxAgency(user) ? user : null;
  }

  private async isUatSandboxAgencyActor(
    actor: AuthenticatedUser,
  ): Promise<boolean> {
    const sandboxUser = await this.loadUatSandboxAgencyUser(actor);
    if (!sandboxUser) return false;
    // A freshly bootstrapped identity remains an honest read-only empty
    // shell. Once the audited UAT commerce provisioner creates its profile,
    // it follows the normal agency purchase/finance rules.
    return !(await this.profileRepo.exist({ where: { userId: actor.id } }));
  }

  private async assertAgencyPortalWritable(
    actor: AuthenticatedUser,
  ): Promise<void> {
    if (await this.isUatSandboxAgencyActor(actor)) {
      throw new ForbiddenException({
        code: ErrorCode.UAT_TEMPORARY_ACCOUNT_READ_ONLY,
        message:
          'این حساب آزمایشی UAT فقط برای مشاهده است و امکان ثبت تغییر ندارد.',
      });
    }
  }

  async assertAgencyWritable(actor: AuthenticatedUser): Promise<void> {
    await this.assertAgencyPortalWritable(actor);
    await this.getOwnProfileOrThrow(actor);
  }

  // ── Dashboard ──────────────────────────────────────────────────────

  async dashboard(actor: AuthenticatedUser) {
    if (await this.isUatSandboxAgencyActor(actor)) {
      return {
        credit: {
          limitIrr: ZERO_IRR,
          usedIrr: ZERO_IRR,
          remainingIrr: ZERO_IRR,
        },
        kpis: {
          salesThisMonthIrr: ZERO_IRR,
          ticketsIssuedTotal: 0,
          seatsSoldThisMonth: 0,
        },
        monthlySales: [],
      };
    }
    await this.getOwnProfileOrThrow(actor);
    const id = actor.id;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    const [
      credit,
      salesThisMonthRow,
      ticketsIssuedTotal,
      seatsSoldThisMonth,
      salesRows,
    ] = await Promise.all([
      this.agencies.getCredit(id),
      this.ledgerRepo
        .createQueryBuilder('l')
        .select('SUM(l."signedAmountIrr")', 'sum')
        .where('l."agencyId" = :id', { id })
        .andWhere('l.type = :type', { type: 'SALE' })
        .andWhere('l."bookingId" IS NOT NULL')
        .andWhere('l."occurredAt" >= :startOfMonth', { startOfMonth })
        .getRawOne<{ sum: string | null }>(),
      this.bookingRepo.count({
        where: { agencyId: id, status: In([...SOLD_STATUSES]) },
      }),
      this.passengerRepo
        .createQueryBuilder('p')
        .innerJoin('p.booking', 'b')
        .where('b."agencyId" = :id', { id })
        .andWhere('b.status IN (:...statuses)', {
          statuses: [...SOLD_STATUSES],
        })
        .andWhere('b."createdAt" >= :startOfMonth', { startOfMonth })
        .getCount(),
      this.ledgerRepo.find({
        where: {
          agencyId: id,
          type: 'SALE' as never,
          bookingId: Not(IsNull()),
          occurredAt: MoreThanOrEqual(sixMonthsAgo),
        },
        select: { signedAmountIrr: true, occurredAt: true },
      }),
    ]);

    const monthBuckets = new Map<string, Irr>();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthBuckets.set(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        ZERO_IRR,
      );
    }
    for (const row of salesRows) {
      const key = `${row.occurredAt.getFullYear()}-${String(row.occurredAt.getMonth() + 1).padStart(2, '0')}`;
      if (monthBuckets.has(key)) {
        monthBuckets.set(
          key,
          addIrr(monthBuckets.get(key) ?? ZERO_IRR, row.signedAmountIrr),
        );
      }
    }

    return {
      credit,
      kpis: {
        salesThisMonthIrr: salesThisMonthRow?.sum
          ? BigInt(salesThisMonthRow.sum)
          : ZERO_IRR,
        ticketsIssuedTotal,
        seatsSoldThisMonth,
      },
      monthlySales: Array.from(monthBuckets.entries()).map(
        ([month, salesIrr]) => ({
          month,
          salesIrr,
        }),
      ),
    };
  }

  async ledger(actor: AuthenticatedUser) {
    if (await this.isUatSandboxAgencyActor(actor)) return [];
    await this.getOwnProfileOrThrow(actor);
    return this.ledgerRepo.find({
      where: { agencyId: actor.id },
      order: { occurredAt: 'DESC' },
      take: 20,
    });
  }

  async financialEvents(actor: AuthenticatedUser) {
    if (await this.isUatSandboxAgencyActor(actor)) return [];
    await this.getOwnProfileOrThrow(actor);
    const [ledger, invoices, creditRequests] = await Promise.all([
      this.ledgerRepo.find({
        where: { agencyId: actor.id },
        order: { occurredAt: 'DESC' },
        take: 100,
      }),
      this.agencies.listInvoices(actor.id),
      this.creditRequestRepo.find({
        where: { agencyId: actor.id },
        order: { createdAt: 'DESC' },
        take: 100,
      }),
    ]);

    const events: Array<{
      id: string;
      type: string;
      amountIrr: bigint | null;
      direction: 'DEBIT' | 'CREDIT' | 'INFO';
      reference: string | null;
      status: string | null;
      occurredAt: Date;
    }> = [];

    for (const entry of ledger) {
      events.push({
        id: `ledger:${entry.id}`,
        type: entry.type,
        amountIrr:
          entry.signedAmountIrr < ZERO_IRR
            ? -entry.signedAmountIrr
            : entry.signedAmountIrr,
        direction: entry.signedAmountIrr < ZERO_IRR ? 'CREDIT' : 'DEBIT',
        reference: entry.bookingId,
        status: null,
        occurredAt: entry.occurredAt,
      });
    }
    for (const invoice of invoices) {
      events.push({
        id: `invoice:${invoice.id}:issued`,
        type: 'INVOICE_ISSUED',
        amountIrr: invoice.amountIrr,
        direction: 'DEBIT',
        reference: invoice.invoiceNo,
        status: invoice.status,
        occurredAt: invoice.issuedAt,
      });
      if (invoice.paidAt) {
        events.push({
          id: `invoice:${invoice.id}:paid`,
          type: 'INVOICE_PAID',
          amountIrr: invoice.amountIrr,
          direction: 'INFO',
          reference: invoice.invoiceNo,
          status: invoice.status,
          occurredAt: invoice.paidAt,
        });
      }
    }
    for (const request of creditRequests) {
      events.push({
        id: `credit:${request.id}:requested`,
        type: 'CREDIT_REQUESTED',
        amountIrr: request.requestedLimitIrr,
        direction: 'INFO',
        reference: request.id,
        status: request.status,
        occurredAt: request.createdAt,
      });
      if (request.decidedAt) {
        events.push({
          id: `credit:${request.id}:decided`,
          type:
            request.status === 'APPROVED'
              ? 'CREDIT_APPROVED'
              : 'CREDIT_REJECTED',
          amountIrr: request.requestedLimitIrr,
          direction: 'INFO',
          reference: request.id,
          status: request.status,
          occurredAt: request.decidedAt,
        });
      }
    }

    return events
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .slice(0, 100);
  }

  // ── Credit & invoices ────────────────────────────────────────────────

  async credit(actor: AuthenticatedUser) {
    if (await this.isUatSandboxAgencyActor(actor)) {
      return { limitIrr: ZERO_IRR, usedIrr: ZERO_IRR, remainingIrr: ZERO_IRR };
    }
    await this.getOwnProfileOrThrow(actor);
    return this.agencies.getCredit(actor.id);
  }

  async invoices(actor: AuthenticatedUser) {
    if (await this.isUatSandboxAgencyActor(actor)) return [];
    await this.getOwnProfileOrThrow(actor);
    return this.agencies.listInvoices(actor.id);
  }

  async payInvoice(actor: AuthenticatedUser, invoiceId: string) {
    await this.assertAgencyPortalWritable(actor);
    await this.getOwnProfileOrThrow(actor);
    return this.agencies.payInvoice(actor, actor.id, invoiceId);
  }

  async requestCreditIncrease(
    actor: AuthenticatedUser,
    dto: { requestedLimitIrr: Irr; note?: string },
  ) {
    await this.assertAgencyPortalWritable(actor);
    await this.getOwnProfileOrThrow(actor);
    const current = await this.agencies.getCredit(actor.id);
    if (dto.requestedLimitIrr <= current.limitIrr) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'سقف درخواستی باید بیشتر از سقف فعلی باشد.',
      });
    }

    const request = await this.creditRequestRepo.save(
      this.creditRequestRepo.create({
        agencyId: actor.id,
        requestedLimitIrr: dto.requestedLimitIrr,
        note: dto.note ?? null,
      }),
    );

    await this.cartable.createTasksForRoles([...CREDIT_REVIEW_ROLES], {
      category: 'AGENCY',
      title: `درخواست افزایش اعتبار: ${actor.fullName}`,
      description: `آژانس «${actor.fullName}» درخواست افزایش سقف اعتبار به ${dto.requestedLimitIrr} ریال داده است.${dto.note ? ` یادداشت: ${dto.note}` : ''}`,
      senderId: actor.id,
    });

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'AGENCY',
      action: 'درخواست افزایش اعتبار آژانس',
      detail: `آژانس «${actor.fullName}» درخواست افزایش سقف اعتبار به ${dto.requestedLimitIrr} ریال ثبت کرد.`,
      entityType: 'AgencyCreditRequest',
      entityId: request.id,
    });

    return request;
  }

  async myCreditRequests(actor: AuthenticatedUser) {
    if (await this.isUatSandboxAgencyActor(actor)) return [];
    await this.getOwnProfileOrThrow(actor);
    return this.creditRequestRepo.find({
      where: { agencyId: actor.id },
      order: { createdAt: 'DESC' },
    });
  }

  // ── Sales & report ───────────────────────────────────────────────────

  async sales(actor: AuthenticatedUser) {
    if (await this.isUatSandboxAgencyActor(actor)) {
      return {
        tickets: [],
        perFlight: [],
        summary: {
          totalSalesIrr: ZERO_IRR,
          ticketsIssued: 0,
          avgFareIrr: ZERO_IRR,
          refundRatePct: 0,
        },
      };
    }
    await this.getOwnProfileOrThrow(actor);
    const id = actor.id;

    const bookings = await this.bookingRepo.find({
      where: { agencyId: id },
      relations: {
        flightInstance: { flight: { route: true } },
      },
      order: { createdAt: 'DESC' },
    });

    const passengerRows = bookings.length
      ? await this.passengerRepo
          .createQueryBuilder('p')
          .select([
            'p.id',
            'p.bookingId',
            'p.ticketNo',
            'p.ticketIssuedAt',
            'p.fareIrr',
            'p.taxIrr',
            'p.extraSeatFareIrr',
          ])
          .where('p."bookingId" IN (:...ids)', {
            ids: bookings.map((b) => b.id),
          })
          .andWhere('p."deletedAt" IS NULL')
          .andWhere('p."ticketNo" IS NOT NULL')
          .orderBy('p."ticketIssuedAt"', 'ASC')
          .addOrderBy('p.id', 'ASC')
          .getMany()
      : [];
    const passengersByBooking = new Map<string, Passenger[]>();
    for (const passenger of passengerRows) {
      const rows = passengersByBooking.get(passenger.bookingId) ?? [];
      rows.push(passenger);
      passengersByBooking.set(passenger.bookingId, rows);
    }

    const tickets = bookings.flatMap((b) =>
      (passengersByBooking.get(b.id) ?? []).map((passenger) => ({
        passengerId: passenger.id,
        ticketNo: passenger.ticketNo,
        ticketIssuedAt: passenger.ticketIssuedAt,
        pnr: b.pnr,
        status: b.status,
        cabin: b.cabin,
        fareClassCode: b.fareClassCode,
        flightNo: b.flightInstance.flight.flightNo,
        route: `${b.flightInstance.flight.route.originCode} → ${b.flightInstance.flight.route.destCode}`,
        departureAt: b.flightInstance.departureAt,
        priceIrr:
          passenger.fareIrr + passenger.taxIrr + passenger.extraSeatFareIrr,
        passengerCount: 1,
      })),
    );

    const perFlightMap = new Map<
      string,
      {
        flightNo: string;
        route: string;
        ticketsCount: number;
        salesIrr: Irr;
      }
    >();
    const soldBookings = bookings.filter((b) =>
      (SOLD_STATUSES as readonly string[]).includes(b.status),
    );
    for (const b of soldBookings) {
      const key = b.flightInstance.flight.flightNo;
      const existing = perFlightMap.get(key) ?? {
        flightNo: key,
        route: `${b.flightInstance.flight.route.originCode} → ${b.flightInstance.flight.route.destCode}`,
        ticketsCount: 0,
        salesIrr: ZERO_IRR,
      };
      existing.ticketsCount += (passengersByBooking.get(b.id) ?? []).length;
      existing.salesIrr = addIrr(existing.salesIrr, b.priceIrr);
      perFlightMap.set(key, existing);
    }

    const totalSalesIrr = soldBookings.reduce(
      (s, b) => addIrr(s, b.priceIrr),
      ZERO_IRR,
    );
    const ticketsIssued = soldBookings.reduce(
      (count, booking) =>
        count + (passengersByBooking.get(booking.id) ?? []).length,
      0,
    );
    const refundedCount = bookings.filter(
      (b) => b.status === 'REFUNDED',
    ).length;
    const avgFareIrr: Irr =
      ticketsIssued > 0
        ? divRoundBigInt(totalSalesIrr, BigInt(ticketsIssued))
        : ZERO_IRR;
    const refundRatePct =
      bookings.length > 0
        ? Math.round((refundedCount / bookings.length) * 1000) / 10
        : 0;

    return {
      tickets,
      perFlight: Array.from(perFlightMap.values()),
      summary: { totalSalesIrr, ticketsIssued, avgFareIrr, refundRatePct },
    };
  }

  /** CSV export for agency sales — UTF-8 BOM for Excel Persian compatibility. */
  async salesCsv(actor: AuthenticatedUser): Promise<string> {
    const report = await this.sales(actor);
    const header =
      'TicketNo,PNR,Flight,Route,Departure,Cabin,FareClass,Status,Passengers,AmountIRR';
    const rows = report.tickets.map((t) =>
      [
        t.ticketNo ?? '',
        t.pnr,
        t.flightNo,
        `"${t.route}"`,
        t.departureAt.toISOString(),
        t.cabin,
        t.fareClassCode ?? '',
        t.status,
        t.passengerCount,
        String(t.priceIrr),
      ].join(','),
    );
    return `\uFEFF${header}\n${rows.join('\n')}\n`;
  }

  // ── Inbox ────────────────────────────────────────────────────────────

  async inbox(actor: AuthenticatedUser) {
    if (await this.isUatSandboxAgencyActor(actor)) return [];
    await this.getOwnProfileOrThrow(actor);
    return this.agencies.listMessages(actor.id);
  }

  async postInboxMessage(
    actor: AuthenticatedUser,
    body: string,
    attachmentIds?: string[],
  ) {
    await this.assertAgencyPortalWritable(actor);
    await this.getOwnProfileOrThrow(actor);
    return this.agencies.postMessage(
      actor,
      actor.id,
      body,
      true,
      attachmentIds,
    );
  }

  // ── Profile & documents ──────────────────────────────────────────────

  async profile(actor: AuthenticatedUser) {
    const uatUser = await this.loadUatSandboxAgencyUser(actor);
    if (uatUser) {
      return {
        fullName: uatUser.fullName,
        managerName: null,
        licenseNo: null,
        phone: uatUser.phone,
        email: uatUser.email,
        city: null,
        address: null,
        tier: null,
        isActive: true,
        suspendedAt: null,
        suspendReason: null,
        joinedAt: uatUser.createdAt,
        isTemporaryReadOnly: true,
      };
    }
    const profile = await this.getOwnProfileOrThrow(actor);
    return {
      fullName: profile.user.fullName,
      managerName: profile.managerName,
      licenseNo: profile.licenseNo,
      phone: profile.phone,
      email: profile.email,
      city: profile.city,
      address: profile.address,
      tier: profile.tier,
      isActive: !profile.suspendedAt,
      suspendedAt: profile.suspendedAt,
      suspendReason: profile.suspendReason,
      joinedAt: profile.joinedAt,
      isTemporaryReadOnly: false,
    };
  }

  async documents(actor: AuthenticatedUser) {
    const isUatAgency = await this.isUatSandboxAgencyActor(actor);
    if (!isUatAgency) await this.getOwnProfileOrThrow(actor);
    const docs = await this.documentRepo.find({
      where: { agencyId: actor.id },
      relations: { file: true },
      order: { createdAt: 'DESC' },
    });
    return docs.map((d) => ({
      ...d,
      file: {
        fileName: d.file.fileName,
        sizeBytes: d.file.sizeBytes,
        mimeType: d.file.mimeType,
      },
    }));
  }

  async uploadDocument(
    actor: AuthenticatedUser,
    file: Express.Multer.File,
    dto: UploadDocumentDto,
  ) {
    const isUatAgency = await this.isUatSandboxAgencyActor(actor);
    if (!isUatAgency) {
      await this.assertAgencyPortalWritable(actor);
      await this.getOwnProfileOrThrow(actor);
    }
    const stored = await this.files.store(actor, file);
    const saved = await this.documentRepo.save(
      this.documentRepo.create({
        agencyId: actor.id,
        fileId: stored.id,
        docType: dto.docType,
      }),
    );
    const doc = await this.documentRepo.findOne({
      where: { id: saved.id },
      relations: { file: true },
    });
    if (!doc) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'مدرک یافت نشد.',
      });
    }
    return {
      ...doc,
      file: {
        fileName: doc.file.fileName,
        sizeBytes: doc.file.sizeBytes,
        mimeType: doc.file.mimeType,
      },
    };
  }

  // ── Phase 16: real seat allotments (replaces AgencySeatsPage mock) ─────

  async allotments(actor: AuthenticatedUser) {
    if (await this.isUatSandboxAgencyActor(actor)) return [];
    await this.getOwnProfileOrThrow(actor);
    const id = actor.id;

    const rows = await this.allotmentRepo.find({
      where: { agencyId: id },
      relations: { flightInstance: { flight: { route: true } } },
      order: { createdAt: 'DESC' },
    });

    const now = new Date();
    return Promise.all(
      rows.map(async (r) => {
        const usedSeats = await this.passengerRepo
          .createQueryBuilder('passenger')
          .innerJoin('passenger.booking', 'booking')
          .where('booking.allotmentId = :allotmentId', { allotmentId: r.id })
          .andWhere('booking.status IN (:...statuses)', {
            statuses: [...SOLD_STATUSES],
          })
          .getCount();
        return {
          id: r.id,
          flightInstanceId: r.flightInstanceId,
          flightNo: r.flightInstance.flight.flightNo,
          route: `${r.flightInstance.flight.route.originCode} → ${r.flightInstance.flight.route.destCode}`,
          originCode: r.flightInstance.flight.route.originCode,
          destinationCode: r.flightInstance.flight.route.destCode,
          departureAt: r.flightInstance.departureAt,
          aircraftType: r.flightInstance.flight.aircraftType,
          cabin: r.cabin,
          fareClassCode: r.fareClassCode,
          seatsAllocated: r.seatsAllocated,
          seatsUsed: usedSeats,
          type: r.type,
          releaseAt: r.releaseAt,
          contractPriceIrr: r.contractPriceIrr,
          active: r.type === 'HARD' || !r.releaseAt || r.releaseAt > now,
        };
      }),
    );
  }

  async seatRequestOptions(actor: AuthenticatedUser) {
    // The shared UAT agency has no business profile by design, but it still
    // needs the real published route/flight catalogue in order to exercise
    // the sandbox seat-request flow. Other agency accounts keep the normal
    // profile requirement.
    if (!(await this.isUatSandboxAgencyActor(actor))) {
      await this.getOwnProfileOrThrow(actor);
    }
    const now = new Date();
    const instances = (
      await this.flightInstanceRepo.find({
        where: {
          departureAt: MoreThanOrEqual(now),
          status: FlightInstanceStatus.SCHEDULED,
        },
        relations: { flight: { route: true } },
        order: { departureAt: 'ASC' },
      })
    ).filter((instance) => isAgencySeatRequestOccurrence(instance, now));

    const instanceIds = instances.map((instance) => instance.id);
    if (instanceIds.length === 0) return [];

    const [fareRules, allotmentRows] = await Promise.all([
      this.fareRuleRepo
        .createQueryBuilder('rule')
        .where('rule."flightInstanceId" IN (:...instanceIds)', { instanceIds })
        .orderBy('rule.cabin', 'ASC')
        .addOrderBy('rule."classCode"', 'ASC')
        .getMany(),
      this.allotmentRepo
        .createQueryBuilder('allotment')
        .select('allotment."flightInstanceId"', 'flightInstanceId')
        .addSelect('allotment.cabin', 'cabin')
        .addSelect('allotment."fareClassCode"', 'fareClassCode')
        .addSelect('COALESCE(SUM(allotment."seatsAllocated"), 0)', 'total')
        .addSelect(
          'COALESCE(SUM(CASE WHEN allotment."agencyId" = :agencyId THEN allotment."seatsAllocated" ELSE 0 END), 0)',
          'own',
        )
        .where('allotment."flightInstanceId" IN (:...instanceIds)', {
          instanceIds,
        })
        .andWhere('allotment.cabin IS NOT NULL')
        .andWhere('allotment."fareClassCode" IS NOT NULL')
        .andWhere(
          '(allotment.type = :hard OR allotment."releaseAt" IS NULL OR allotment."releaseAt" > :now)',
          { hard: 'HARD', now: new Date(), agencyId: actor.id },
        )
        .groupBy('allotment."flightInstanceId"')
        .addGroupBy('allotment.cabin')
        .addGroupBy('allotment."fareClassCode"')
        .getRawMany<{
          flightInstanceId: string;
          cabin: string;
          fareClassCode: string;
          total: string;
          own: string;
        }>(),
    ]);

    const instanceById = new Map(
      instances.map((instance) => [instance.id, instance]),
    );
    const allotmentByClass = new Map(
      allotmentRows.map((row) => [
        `${row.flightInstanceId}:${row.cabin}:${row.fareClassCode}`,
        row,
      ]),
    );

    const offers = await Promise.all(
      fareRules.map(async (rule) => {
        const instance = instanceById.get(rule.flightInstanceId);
        if (!instance || rule.seatsAllocated < 1) return null;
        const key = `${instance.id}:${rule.cabin}:${rule.classCode}`;
        const allotment = allotmentByClass.get(key);
        const allocated = Number(allotment?.total ?? 0);
        const ownAllocated = Number(allotment?.own ?? 0);
        const offer = agencySeatRequestClassOffer(rule, allocated);
        const liveInventory = await this.search.cabinAvailability(
          instance,
          rule.cabin,
        );
        const availableToRequest = Math.max(
          0,
          Math.min(offer.availableToRequest, liveInventory?.seatsLeft ?? 0),
        );
        return {
          flightInstanceId: instance.id,
          flightNo: instance.flight.flightNo,
          originCode: instance.flight.route.originCode,
          destCode: instance.flight.route.destCode,
          departureAt: instance.departureAt,
          aircraftType:
            instance.aircraftTypeOverride ?? instance.flight.aircraftType,
          cabin: rule.cabin,
          fareClassCode: rule.classCode,
          capacity: rule.seatsAllocated,
          agencySeatsReleased: rule.agencySeatsReleased,
          agencyAllocated: allocated,
          ownAllocated,
          sellableSeats: liveInventory?.seatsLeft ?? 0,
          availableToRequest,
          pricePerSeatIrr: offer.pricePerSeatIrr,
          specialOffer: rule.agencySpecialOffer,
          // Every returned row has already passed the same CEO-approved active
          // inventory gate used above; the portal does not expose revision
          // workflow internals to an agency.
          definitionStatus: 'PUBLISHED' as const,
        };
      }),
    );
    return offers.filter((row) => row !== null);
  }

  /**
   * Returns a server-computed capacity/demand snapshot for an agency before
   * it submits a seat request. All values come from current bookings,
   * allotments, requests and the route's last-year sales history.
   */
  async seatInquiry(actor: AuthenticatedUser, dto: AgencySeatInquiryDto) {
    if (!(await this.isUatSandboxAgencyActor(actor))) {
      await this.getOwnProfileOrThrow(actor);
    }

    const now = new Date();
    const candidateInstance = await this.flightInstanceRepo.findOne({
      where: {
        id: dto.flightInstanceId,
        departureAt: MoreThanOrEqual(now),
        status: FlightInstanceStatus.SCHEDULED,
      },
      relations: { flight: { route: true } },
    });
    const instance =
      candidateInstance && isAgencySeatRequestOccurrence(candidateInstance, now)
        ? candidateInstance
        : null;
    const rule = instance
      ? await this.fareRuleRepo.findOne({
          where: {
            flightInstanceId: instance.id,
            cabin: dto.cabin,
            classCode: dto.fareClassCode,
          },
        })
      : null;
    if (!instance || !rule) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'پرواز یا کلاس کرایه قابل استعلام یافت نشد.',
      });
    }

    // The reservation engine is the only source of truth for free seats.
    // It reads the aircraft map and subtracts active bookings, locks and
    // commitments. Do not answer an inquiry from FareRule.seatsAllocated or
    // re-derive availability here, otherwise the agency panel can promise a
    // seat that the public booking engine has already consumed.
    const availability = await this.search.cabinAvailability(
      instance,
      dto.cabin,
    );
    if (!availability) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'نقشه صندلی این کلاس برای استعلام موجود نیست.',
      });
    }

    const [
      soldSeats,
      heldSeats,
      agencySoldSeats,
      allotmentRaw,
      demandRaw,
      historyRaw,
      totalAgencies,
    ] = await Promise.all([
      this.passengerRepo
        .createQueryBuilder('passenger')
        .innerJoin('passenger.booking', 'booking')
        .where('booking.flightInstanceId = :flightInstanceId', {
          flightInstanceId: instance.id,
        })
        .andWhere('booking.cabin = :cabin', { cabin: dto.cabin })
        .andWhere('booking.fareClassCode = :fareClassCode', {
          fareClassCode: dto.fareClassCode,
        })
        .andWhere('booking.status IN (:...statuses)', {
          statuses: [...SOLD_STATUSES],
        })
        .andWhere('passenger.occupiesSeat = true')
        .andWhere('passenger.deletedAt IS NULL')
        .andWhere('booking.deletedAt IS NULL')
        .getCount(),
      this.passengerRepo
        .createQueryBuilder('passenger')
        .innerJoin('passenger.booking', 'booking')
        .where('booking.flightInstanceId = :flightInstanceId', {
          flightInstanceId: instance.id,
        })
        .andWhere('booking.cabin = :cabin', { cabin: dto.cabin })
        .andWhere('booking.fareClassCode = :fareClassCode', {
          fareClassCode: dto.fareClassCode,
        })
        .andWhere('booking.status = :status', { status: 'HELD' })
        .andWhere('booking.holdExpiresAt > :now', { now })
        .andWhere('passenger.occupiesSeat = true')
        .andWhere('passenger.deletedAt IS NULL')
        .andWhere('booking.deletedAt IS NULL')
        .getCount(),
      this.passengerRepo
        .createQueryBuilder('passenger')
        .innerJoin('passenger.booking', 'booking')
        .where('booking.flightInstanceId = :flightInstanceId', {
          flightInstanceId: instance.id,
        })
        .andWhere('booking.cabin = :cabin', { cabin: dto.cabin })
        .andWhere('booking.fareClassCode = :fareClassCode', {
          fareClassCode: dto.fareClassCode,
        })
        .andWhere('booking.status IN (:...statuses)', {
          statuses: [...SOLD_STATUSES],
        })
        .andWhere('booking.agencyId IS NOT NULL')
        .andWhere('passenger.occupiesSeat = true')
        .andWhere('passenger.deletedAt IS NULL')
        .andWhere('booking.deletedAt IS NULL')
        .getCount(),
      this.allotmentRepo
        .createQueryBuilder('allotment')
        .select('COALESCE(SUM(allotment.seatsAllocated), 0)', 'total')
        .addSelect('COUNT(DISTINCT allotment.agencyId)', 'agencyCount')
        .where('allotment.flightInstanceId = :flightInstanceId', {
          flightInstanceId: instance.id,
        })
        .andWhere('allotment.cabin = :cabin', { cabin: dto.cabin })
        .andWhere('allotment.fareClassCode = :fareClassCode', {
          fareClassCode: dto.fareClassCode,
        })
        .andWhere(
          '(allotment.type = :hard OR allotment.releaseAt IS NULL OR allotment.releaseAt > :now)',
          { hard: 'HARD', now },
        )
        .getRawOne<{ total: string; agencyCount: string }>(),
      this.seatRequestFlightRepo
        .createQueryBuilder('link')
        .innerJoin('link.seatRequest', 'request')
        .select('COALESCE(SUM(request.seats), 0)', 'seats')
        .addSelect('COUNT(DISTINCT request.agencyId)', 'agencyCount')
        .where('link.flightInstanceId = :flightInstanceId', {
          flightInstanceId: instance.id,
        })
        .andWhere('request.cabin = :cabin', { cabin: dto.cabin })
        .andWhere('request.fareClassCode = :fareClassCode', {
          fareClassCode: dto.fareClassCode,
        })
        .andWhere('request.status IN (:...statuses)', {
          statuses: ['PENDING', 'PENDING_FINANCE', 'APPROVED'],
        })
        .getRawOne<{ seats: string; agencyCount: string }>(),
      this.passengerRepo
        .createQueryBuilder('passenger')
        .innerJoin('passenger.booking', 'booking')
        .innerJoin('booking.flightInstance', 'historyInstance')
        .innerJoin('historyInstance.flight', 'historyFlight')
        .select('COUNT(DISTINCT booking.id)', 'bookings')
        .addSelect('COUNT(passenger.id)', 'seats')
        .where('historyFlight.routeId = :routeId', {
          routeId: instance.flight.routeId,
        })
        .andWhere('booking.agencyId IS NOT NULL')
        .andWhere('booking.status IN (:...statuses)', {
          statuses: [...SOLD_STATUSES],
        })
        .andWhere('booking.createdAt >= :since', {
          since: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000),
        })
        .andWhere('passenger.occupiesSeat = true')
        .andWhere('passenger.deletedAt IS NULL')
        .andWhere('booking.deletedAt IS NULL')
        .getRawOne<{ bookings: string; seats: string }>(),
      this.profileRepo.count(),
    ]);

    const capacity = availability.capacity;
    const sold = Number(soldSeats ?? 0);
    const held = Number(heldSeats ?? 0);
    const agencyAllocated = Number(allotmentRaw?.total ?? 0);
    const agencySold = Number(agencySoldSeats ?? 0);
    const reservedAgencySeats = Math.max(agencyAllocated - agencySold, 0);
    // SearchService already subtracts active bookings, seat locks and
    // commitments. Re-applying allotments here would double-count agency
    // capacity and under-report the seats the reservation engine can sell.
    const availableSeats = availability.seatsLeft;
    const offer = agencySeatRequestClassOffer(rule, agencyAllocated);
    const availableToRequest = Math.max(
      Math.min(offer.availableToRequest, availableSeats),
      0,
    );
    const activeRequestSeats = Number(demandRaw?.seats ?? 0);
    const agenciesWithDemand = Number(demandRaw?.agencyCount ?? 0);
    const historicalAgencyBookings = Number(historyRaw?.bookings ?? 0);
    const historicalAgencySeatsSold = Number(historyRaw?.seats ?? 0);
    const demandRatio =
      capacity > 0 ? (sold + held + activeRequestSeats) / capacity : 0;
    const demandLevel =
      demandRatio >= 0.8 ? 'HIGH' : demandRatio >= 0.5 ? 'MEDIUM' : 'LOW';
    const month = instance.departureAt.getUTCMonth() + 1;
    const day = instance.departureAt.getUTCDate();
    const season =
      month <= 3
        ? 'بهار'
        : month <= 6
          ? 'تابستان'
          : month <= 9
            ? 'پاییز'
            : 'زمستان';
    const occasion =
      (month === 3 && day >= 20) || (month === 4 && day <= 4)
        ? 'بازه نوروز'
        : month === 12 && day >= 20
          ? 'پایان سال'
          : null;
    const recommendation =
      demandLevel === 'HIGH'
        ? 'تقاضای این کلاس بالا است؛ ظرفیت آزادشده فعلی را با احتیاط افزایش دهید.'
        : demandLevel === 'MEDIUM'
          ? 'تقاضا متوسط است؛ ظرفیت آزادشده را بر اساس فروش واقعی تنظیم کنید.'
          : 'ظرفیت کافی است؛ برای این پرواز فعلاً آزادسازی بیشتری لازم نیست.';
    const unitPrice = offer.pricePerSeatIrr;
    const { suggestedSeats, canFulfillRequested } = agencySeatSuggestion(
      dto.seats,
      availableToRequest,
    );

    return {
      flightInstanceId: instance.id,
      cabin: dto.cabin,
      fareClassCode: dto.fareClassCode,
      requestedSeats: dto.seats,
      suggestedSeats,
      canFulfillRequested,
      capacity,
      soldSeats: sold,
      heldSeats: held,
      agencyAllocated,
      agencySoldSeats: agencySold,
      reservedAgencySeats,
      availableSeats,
      availableToRequest,
      totalAgencies,
      agenciesWithDemand,
      historicalAgencyBookings,
      historicalAgencySeatsSold,
      season,
      occasion,
      demandLevel,
      recommendation: canFulfillRequested
        ? recommendation
        : `${availableToRequest} صندلی در حال حاضر قابل ارائه است.`,
      pricePerSeatIrr: offer.pricePerSeatIrr.toString(),
      totalPriceIrr: (unitPrice * BigInt(suggestedSeats)).toString(),
    };
  }

  async mySeatRequests(actor: AuthenticatedUser) {
    if (!(await this.isUatSandboxAgencyActor(actor))) {
      await this.getOwnProfileOrThrow(actor);
    }
    const rows = await this.seatRequestRepo.find({
      where: { agencyId: actor.id },
      relations: {
        route: true,
        invoice: true,
        flights: { flightInstance: { flight: true } },
      },
      order: { createdAt: 'DESC' },
    });
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      route: row.route
        ? `${row.route.originCode} → ${row.route.destCode}`
        : null,
      aircraftType: row.aircraftType,
      cabin: row.cabin,
      fareClassCode: row.fareClassCode,
      seats: row.seats,
      termMonths: row.termMonths,
      unitPriceIrr: row.unitPriceIrr,
      totalPriceIrr:
        row.unitPriceIrr *
        BigInt(row.seats) *
        BigInt(Math.max(row.flights.length, 1)),
      payMethod: row.payMethod,
      invoice: row.invoice
        ? {
            id: row.invoice.id,
            invoiceNo: row.invoice.invoiceNo,
            status: row.invoice.status,
            amountIrr: row.invoice.amountIrr,
            dueAt: row.invoice.dueAt,
          }
        : null,
      flights: row.flights.map((flight) => ({
        flightInstanceId: flight.flightInstanceId,
        flightNo: flight.flightInstance.flight.flightNo,
        departureAt: flight.flightInstance.departureAt,
      })),
      decidedAt: row.decidedAt,
      createdAt: row.createdAt,
    }));
  }

  async requestSeats(
    actor: AuthenticatedUser,
    dto: {
      flightInstanceId: string;
      cabin: 'ECONOMY' | 'COMFORT' | 'BUSINESS' | 'FIRST';
      fareClassCode: string;
      seats: number;
      selectedFlightInstanceIds?: string[];
      preferredWeekdays?: number[];
      termMonths?: 0 | 1 | 3 | 6 | 12;
      payMethod?: 'INVOICE' | 'CREDIT';
    },
  ) {
    const uatUser = await this.loadUatSandboxAgencyUser(actor);
    const profile = uatUser ? null : await this.getOwnProfileOrThrow(actor);
    const options = await this.seatRequestOptions(actor);
    const option = options.find(
      (row) =>
        row.flightInstanceId === dto.flightInstanceId &&
        row.cabin === dto.cabin &&
        row.fareClassCode === dto.fareClassCode,
    );
    if (!option) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'مسیر یا پرواز فعال و قابل درخواست یافت نشد.',
      });
    }
    if (dto.seats < 1 || !Number.isInteger(dto.seats)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'تعداد صندلی باید عدد صحیح مثبت باشد.',
      });
    }
    if (dto.seats > option.availableToRequest) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'تعداد صندلی درخواستی بیشتر از ظرفیت آزاد این پرواز است.',
      });
    }

    const sameSeries = options.filter(
      (candidate) =>
        candidate.originCode === option.originCode &&
        candidate.destCode === option.destCode &&
        candidate.flightNo === option.flightNo &&
        candidate.aircraftType === option.aircraftType &&
        candidate.cabin === option.cabin &&
        candidate.fareClassCode === option.fareClassCode,
    );
    const selectedIds = new Set(dto.selectedFlightInstanceIds ?? []);
    if (
      selectedIds.size > 0 &&
      [...selectedIds].some(
        (id) =>
          !sameSeries.some((candidate) => candidate.flightInstanceId === id),
      )
    ) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message:
          'یکی از تاریخ‌های انتخاب‌شده متعلق به این مسیر و کلاس پروازی نیست.',
      });
    }

    const selectedDeparture = new Date(option.departureAt);
    const periodEnd = new Date(selectedDeparture);
    if (dto.termMonths === 0) {
      periodEnd.setUTCDate(periodEnd.getUTCDate() + 7);
    } else if (dto.termMonths) {
      periodEnd.setUTCMonth(periodEnd.getUTCMonth() + dto.termMonths);
    }
    const requestedWeekdays = new Set(dto.preferredWeekdays ?? []);
    const eligibleOptions =
      selectedIds.size > 0
        ? sameSeries.filter((candidate) =>
            selectedIds.has(candidate.flightInstanceId),
          )
        : dto.termMonths == null
          ? [option]
          : options.filter((candidate) => {
              const departure = new Date(candidate.departureAt);
              return (
                candidate.originCode === option.originCode &&
                candidate.destCode === option.destCode &&
                candidate.flightNo === option.flightNo &&
                candidate.aircraftType === option.aircraftType &&
                candidate.cabin === option.cabin &&
                candidate.fareClassCode === option.fareClassCode &&
                departure >= selectedDeparture &&
                departure <= periodEnd &&
                (requestedWeekdays.size === 0 ||
                  requestedWeekdays.has(departure.getUTCDay()))
              );
            });
    const requestOptions =
      eligibleOptions.length > 0 ? eligibleOptions : [option];
    const unavailableOccurrence = requestOptions.find(
      (candidate) => dto.seats > candidate.availableToRequest,
    );
    if (unavailableOccurrence) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: `ظرفیت آزاد پرواز ${unavailableOccurrence.flightNo} در یکی از تاریخ‌های دوره کمتر از تعداد درخواستی است.`,
      });
    }
    for (const candidate of requestOptions) {
      const candidateInstance = await this.flightInstanceRepo.findOne({
        where: { id: candidate.flightInstanceId },
        relations: { flight: { route: true } },
      });
      const liveAvailability = candidateInstance
        ? await this.search.cabinAvailability(candidateInstance, dto.cabin)
        : null;
      if (!liveAvailability || liveAvailability.seatsLeft < dto.seats) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_FAILED,
          message: `ظرفیت واقعی رزرواسیون برای پرواز ${candidate.flightNo} در یکی از تاریخ‌های انتخاب‌شده کافی نیست.`,
        });
      }
    }

    const instance = await this.flightInstanceRepo.findOne({
      where: { id: dto.flightInstanceId },
      relations: { flight: { route: true } },
    });
    if (!instance?.flight.routeId) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'مسیر یا پرواز فعال و قابل درخواست یافت نشد.',
      });
    }

    const unitPriceIrr = toIrr(option.pricePerSeatIrr ?? 0n);
    if (unitPriceIrr < ZERO_IRR) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'قیمت صندلی نامعتبر است.',
      });
    }
    const totalPriceIrr =
      unitPriceIrr * BigInt(dto.seats) * BigInt(requestOptions.length);
    if ((dto.payMethod ?? 'INVOICE') === 'CREDIT') {
      const availableCredit = await this.credit(actor);
      if (availableCredit.remainingIrr < totalPriceIrr) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_FAILED,
          message: 'اعتبار فعال آژانس برای پرداخت این سفارش کافی نیست.',
        });
      }
    }

    const requestId = randomUUID();
    await this.seatRequestRepo.manager.transaction(async (tx) => {
      await tx.save(
        tx.create(AgencySeatRequest, {
          id: requestId,
          agencyId: actor.id,
          routeId: instance.flight.routeId,
          aircraftType: option.aircraftType,
          cabin: option.cabin,
          fareClassCode: option.fareClassCode,
          seats: dto.seats,
          termMonths: dto.termMonths ?? null,
          unitPriceIrr,
          payMethod: dto.payMethod ?? 'INVOICE',
          status: 'PENDING',
        }),
      );
      await tx.save(
        requestOptions.map((candidate) =>
          tx.create(AgencySeatRequestFlight, {
            seatRequestId: requestId,
            flightInstanceId: candidate.flightInstanceId,
          }),
        ),
      );
    });

    const weekdays = dto.selectedFlightInstanceIds?.length
      ? 'تاریخ‌های انتخاب‌شده آژانس'
      : dto.preferredWeekdays?.join(', ') || 'بدون محدودیت';
    const term =
      dto.termMonths === 0
        ? 'یک هفته'
        : dto.termMonths
          ? `${dto.termMonths} ماه`
          : 'تک‌پرواز';
    const senderLabel =
      profile?.managerName ?? uatUser?.fullName ?? actor.fullName;
    const description = `آژانس «${senderLabel}» برای ${requestOptions.length} پرواز ${option.flightNo} در مسیر ${option.originCode} ← ${option.destCode} درخواست ${dto.seats} صندلی ثبت کرد. روزهای ترجیحی: ${weekdays}. دوره: ${term}.`;

    const recipientCount = await this.cartable.createTasksForRoles(
      ['COMMERCIAL_MANAGER'],
      {
        category: 'AGENCY',
        title: `درخواست خرید ${dto.seats} صندلی · ${option.flightNo}`,
        description,
        senderId: actor.id,
        senderLabelFa: senderLabel,
        sourceType: 'AGENCY_REQUEST',
        sourceId: requestId,
      },
    );
    if (recipientCount === 0) {
      await this.seatRequestRepo.delete({ id: requestId });
      throw new BadRequestException({
        code: ErrorCode.NOT_FOUND,
        message: 'مدیر بازرگانی فعالی برای دریافت درخواست یافت نشد.',
      });
    }
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'AGENCY',
      action: 'ثبت درخواست خرید صندلی آژانس',
      detail: description,
      entityType: 'AgencySeatRequest',
      entityId: requestId,
      metadata: { ...dto, flightNo: option.flightNo },
    });
    return { id: requestId, status: 'SUBMITTED', recipientCount, ...dto };
  }

  // ── Phase 23: real webservice (B2B API) purchase requests ──────────────
  // (replaces AgencyWebservicePage mock's local-only "requested"/"keyShown")

  async assertAgency(actor: AuthenticatedUser) {
    if (await this.isUatSandboxAgencyActor(actor)) return;
    await this.getOwnProfileOrThrow(actor);
  }

  async webservicePlans() {
    const prices = await this.webservicePricing.getPlanPrices();
    return {
      plans: ([1, 3, 12] as const).map((months) => ({
        months,
        // Wire format consistency: every *Irr field is a decimal string in
        // responses (see docs/API.md) — this one is JSON-stored (not a
        // Prisma BigInt column) but still IRR money, so it goes through the
        // same Irr/bigint-string path as every other price field.
        priceIrr: toIrr(prices[months]),
      })),
    };
  }

  async requestWebservice(actor: AuthenticatedUser, dto: RequestWebserviceDto) {
    await this.assertAgencyPortalWritable(actor);
    await this.getOwnProfileOrThrow(actor);
    const planPrices = await this.webservicePricing.getPlanPrices();
    const planPriceIrr = planPrices[dto.months];
    if (!planPriceIrr) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'مدت اشتراک نامعتبر است.',
      });
    }

    const request = await this.webserviceRequestRepo.save(
      this.webserviceRequestRepo.create({
        agencyId: actor.id,
        scope: dto.scope,
        months: dto.months,
        priceIrr: toIrr(planPriceIrr),
        note: dto.note ?? null,
      }),
    );

    const scopeFa =
      dto.scope === 'FULL' ? 'فروش کامل (صدور بلیط)' : 'جستجو و رزرو';
    await this.cartable.createTasksForRoles([...CREDIT_REVIEW_ROLES], {
      category: 'AGENCY',
      title: `درخواست خرید وب‌سرویس: ${actor.fullName}`,
      description: `آژانس «${actor.fullName}» درخواست خرید وب‌سرویس (${scopeFa}، ${dto.months} ماهه) داده است.${dto.note ? ` یادداشت: ${dto.note}` : ''}`,
      senderId: actor.id,
    });

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'AGENCY',
      action: 'درخواست خرید وب‌سرویس آژانس',
      detail: `آژانس «${actor.fullName}» درخواست وب‌سرویس با دامنه ${dto.scope} به مدت ${dto.months} ماه به مبلغ ${planPriceIrr} ریال ثبت کرد.`,
      entityType: 'AgencyWebserviceRequest',
      entityId: request.id,
    });

    return request;
  }

  async myWebserviceRequests(actor: AuthenticatedUser) {
    if (await this.isUatSandboxAgencyActor(actor)) return [];
    await this.getOwnProfileOrThrow(actor);
    return this.webserviceRequestRepo.find({
      where: { agencyId: actor.id },
      order: { createdAt: 'DESC' },
    });
  }

  async apiKeys(actor: AuthenticatedUser) {
    if (await this.isUatSandboxAgencyActor(actor)) return [];
    await this.getOwnProfileOrThrow(actor);
    const keys = await this.agencies.listApiKeys(actor.id);
    // The raw key is retrievable exactly once, at approval time, and is
    // delivered via the agency's own message thread (see
    // AgenciesService.decideWebserviceRequest) — never re-exposed here.
    return keys.map((k) => ({
      id: k.id,
      scope: k.scope,
      status: k.status,
      activatedAt: k.activatedAt,
      expiresAt: k.expiresAt,
      lastUsedAt: k.lastUsedAt,
      callCount: k.callCount,
    }));
  }
}
