import 'dotenv/config';
import 'reflect-metadata';
import * as fs from 'node:fs';
import * as path from 'node:path';
import argon2 from 'argon2';
import {
  DataSource,
  DeepPartial,
  FindOptionsWhere,
  In,
  IsNull,
  MoreThan,
  Repository,
} from 'typeorm';
import { dataSourceOptions } from './data-source.options';
import { encryptPii, hashPii } from '../common/pii-crypto';
import {
  enumerateSeats,
  countSeatsByCabin,
} from '../modules/reservation/seat-layout';
import {
  EXTERNAL_SERVICE_SEED,
  INTERNAL_SERVICE_SEED,
  PERMISSION_CATALOG,
  catalogDeptFor,
} from '../modules/it-manager/permission-catalog';
import {
  AgencyApiKeyStatus,
  AgencyApiScope,
  AgencyInvoiceStatus,
  AgencyMembershipStatus,
  AgencyTier,
  AuditCategory,
  BlogCategory,
  BlogPostStatus,
  BookingChannel,
  BookingStatus,
  CartableCategory,
  ClubCardAssignee,
  ClubCardRequestStatus,
  ClubCardStatus,
  ClubPointsEntryType,
  ClubTier,
  CustomerIdentityStatus,
  CustomerReferralStatus,
  FlightInstanceStatus,
  JobType,
  LedgerEntryType,
  LockApprovalStatus,
  LockClassification,
  PricingProposalStatus,
  ReferralPriority,
  ReferralStatus,
  RefundStatus,
  Role,
  SiteContentBlockKey,
  WalletEntryType,
} from './enums';
import { AgencyApiKey } from './entities/agency-api-key.entity';
import { AgencyCreditLine } from './entities/agency-credit-line.entity';
import { AgencyInvoice } from './entities/agency-invoice.entity';
import { AncillaryService } from './entities/ancillary-service.entity';
import { TravelExtraSetting } from './entities/travel-extra-setting.entity';
import { AgencyMembershipRequest } from './entities/agency-membership-request.entity';
import { AgencyMessage } from './entities/agency-message.entity';
import { AgencyProfile } from './entities/agency-profile.entity';
import { AircraftSeatMap } from './entities/aircraft-seat-map.entity';
import { AircraftDefinition } from './entities/aircraft-definition.entity';
import { AircraftCabin } from './entities/aircraft-cabin.entity';
import { AircraftSeat } from './entities/aircraft-seat.entity';
import { Airport } from './entities/airport.entity';
import { AuditLog } from './entities/audit-log.entity';
import { BlogPost } from './entities/blog-post.entity';
import { Booking } from './entities/booking.entity';
import { CareersSettings } from './entities/careers-settings.entity';
import { CartableTask } from './entities/cartable-task.entity';
import { ClubCardRequest } from './entities/club-card-request.entity';
import { ClubMember } from './entities/club-member.entity';
import { ClubPointsEntry } from './entities/club-points-entry.entity';
import { ClubTierRule } from './entities/club-tier-rule.entity';
import { CustomerIdentityVerification } from './entities/customer-identity-verification.entity';
import { CustomerReferral } from './entities/customer-referral.entity';
import { EmployeePermission } from './entities/employee-permission.entity';
import { ExternalServiceConfig } from './entities/external-service-config.entity';
import { FarePricingProposal } from './entities/fare-pricing-proposal.entity';
import { Flight } from './entities/flight.entity';
import { FlightInstance } from './entities/flight-instance.entity';
import { InternalService } from './entities/internal-service.entity';
import { JobPosting } from './entities/job-posting.entity';
import { LedgerEntry } from './entities/ledger-entry.entity';
import { ManagerReferral } from './entities/manager-referral.entity';
import { ManagerReferralRecipient } from './entities/manager-referral-recipient.entity';
import { ManagerReferralReport } from './entities/manager-referral-report.entity';
import { Passenger } from './entities/passenger.entity';
import { Permission } from './entities/permission.entity';
import { RefundPenaltyRule } from './entities/refund-penalty-rule.entity';
import { RefundRequest } from './entities/refund-request.entity';
import { Route } from './entities/route.entity';
import { SavedBankAccount } from './entities/saved-bank-account.entity';
import { SavedPassenger } from './entities/saved-passenger.entity';
import { SeatLock } from './entities/seat-lock.entity';
import { SecurityPolicy } from './entities/security-policy.entity';
import { SiteContentBlock } from './entities/site-content-block.entity';
import { SiteDestinationHighlight } from './entities/site-destination-highlight.entity';
import { SiteRouteHighlight } from './entities/site-route-highlight.entity';
import { StoredFile } from './entities/stored-file.entity';
import { SurveyQuestion } from './entities/survey-question.entity';
import { SurveySettings } from './entities/survey-settings.entity';
import { User } from './entities/user.entity';
import { WalletEntry } from './entities/wallet-entry.entity';
import type { JsonValue } from './json-types';
import { ANCILLARY_BUILT_IN_SERVICES } from '../modules/ancillary-services/ancillary-services.catalog';
import { standardClassCode } from '../modules/flights/aircraft-class-code';

const dataSource = new DataSource(dataSourceOptions);

/** Known dev password for every seeded staff account — dev/test only, never production. */
const STAFF_PASSWORD = 'Blujet@1404';

/** Prisma-`upsert`-shaped get-or-create-or-update, translated to TypeORM's
 * find-then-create-or-save idiom (TypeORM's own `.upsert()` has different
 * ON-CONFLICT semantics and doesn't return the resulting entity the way
 * this script's call sites need). */
async function upsertBy<T extends object>(
  repo: Repository<T>,
  where: FindOptionsWhere<T>,
  create: DeepPartial<T>,
  update?: DeepPartial<T>,
): Promise<T> {
  const existing = await repo.findOneBy(where);
  if (existing) {
    if (update && Object.keys(update).length > 0) {
      repo.merge(existing, update);
      return repo.save(existing);
    }
    return existing;
  }
  return repo.save(repo.create(create));
}

/** Backfills AircraftDefinition/AircraftCabin/AircraftSeat from an
 * already-seeded AircraftSeatMap row's own band description — mirrors
 * migration 1786521600000's production backfill, needed here too because
 * migrations run once (before this seed ever creates the A320/MD-80 rows
 * on a fresh DB), so the new catalog would otherwise stay empty in dev. */
async function seedAircraftCatalog(
  repos: {
    aircraftSeatMapRepo: Repository<AircraftSeatMap>;
    aircraftDefinitionRepo: Repository<AircraftDefinition>;
    aircraftCabinRepo: Repository<AircraftCabin>;
    aircraftSeatRepo: Repository<AircraftSeat>;
  },
  seatMap: AircraftSeatMap,
): Promise<void> {
  const seats = enumerateSeats(seatMap);
  if (seats.length === 0) return;
  const counts = countSeatsByCabin(seatMap);
  const totalCapacity = seats.length;
  const now = new Date();

  const aircraft = await upsertBy(
    repos.aircraftDefinitionRepo,
    { code: seatMap.aircraftType },
    {
      code: seatMap.aircraftType,
      model: seatMap.aircraftType,
      title: seatMap.aircraftType,
      totalCapacity,
      version: 1,
      createdAt: now,
      updatedAt: now,
    },
    { totalCapacity, updatedAt: now },
  );

  await repos.aircraftCabinRepo.delete({ aircraftDefinitionId: aircraft.id });
  const cabinEntries = (
    Object.entries(counts) as [keyof typeof counts, number][]
  ).filter(([, count]) => count > 0);
  await repos.aircraftCabinRepo.save(
    cabinEntries.map(([cabinType, capacity]) =>
      repos.aircraftCabinRepo.create({
        aircraftDefinitionId: aircraft.id,
        cabinType,
        capacity,
        defaultClassCode: standardClassCode(cabinType),
        createdAt: now,
        updatedAt: now,
      }),
    ),
  );

  await repos.aircraftSeatRepo.delete({ aircraftDefinitionId: aircraft.id });
  await repos.aircraftSeatRepo.save(
    seats.map((seat) => {
      const column = seat.seatCode.slice(String(seat.row).length);
      const colsLeft =
        seat.cabin === 'FIRST'
          ? seatMap.firstColsLeft
          : seat.cabin === 'BUSINESS'
            ? seatMap.businessColsLeft
            : seat.cabin === 'COMFORT'
              ? seatMap.comfortColsLeft
              : seatMap.economyColsLeft;
      return repos.aircraftSeatRepo.create({
        aircraftDefinitionId: aircraft.id,
        row: seat.row,
        column,
        label: seat.seatCode,
        cabinType: seat.cabin,
        side: (colsLeft ?? []).includes(column) ? 'LEFT' : 'RIGHT',
        isBlocked: false,
        createdAt: now,
        updatedAt: now,
      });
    }),
  );

  await repos.aircraftSeatMapRepo.update(
    { id: seatMap.id },
    { aircraftDefinitionId: aircraft.id },
  );
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Demo seed is forbidden when NODE_ENV=production. Use audited production bootstrap data instead.',
    );
  }
  const userRepo = dataSource.getRepository(User);
  const routeRepo = dataSource.getRepository(Route);
  const flightRepo = dataSource.getRepository(Flight);
  const flightInstanceRepo = dataSource.getRepository(FlightInstance);
  const bookingRepo = dataSource.getRepository(Booking);
  const ledgerEntryRepo = dataSource.getRepository(LedgerEntry);
  const agencyProfileRepo = dataSource.getRepository(AgencyProfile);
  const agencyCreditLineRepo = dataSource.getRepository(AgencyCreditLine);
  const agencyApiKeyRepo = dataSource.getRepository(AgencyApiKey);
  const agencyInvoiceRepo = dataSource.getRepository(AgencyInvoice);
  const ancillaryRepo = dataSource.getRepository(AncillaryService);
  const travelExtraRepo = dataSource.getRepository(TravelExtraSetting);
  const agencyMessageRepo = dataSource.getRepository(AgencyMessage);
  const agencyMembershipRequestRepo = dataSource.getRepository(
    AgencyMembershipRequest,
  );
  const cartableTaskRepo = dataSource.getRepository(CartableTask);
  const auditLogRepo = dataSource.getRepository(AuditLog);
  const managerReferralRepo = dataSource.getRepository(ManagerReferral);
  const managerReferralRecipientRepo = dataSource.getRepository(
    ManagerReferralRecipient,
  );
  const managerReferralReportRepo = dataSource.getRepository(
    ManagerReferralReport,
  );
  const clubMemberRepo = dataSource.getRepository(ClubMember);
  const clubCardRequestRepo = dataSource.getRepository(ClubCardRequest);
  const clubTierRuleRepo = dataSource.getRepository(ClubTierRule);
  const clubPointsEntryRepo = dataSource.getRepository(ClubPointsEntry);
  const savedPassengerRepo = dataSource.getRepository(SavedPassenger);
  const savedBankAccountRepo = dataSource.getRepository(SavedBankAccount);
  const customerReferralRepo = dataSource.getRepository(CustomerReferral);
  const customerIdentityVerificationRepo = dataSource.getRepository(
    CustomerIdentityVerification,
  );
  const walletEntryRepo = dataSource.getRepository(WalletEntry);
  const storedFileRepo = dataSource.getRepository(StoredFile);
  const surveySettingsRepo = dataSource.getRepository(SurveySettings);
  const surveyQuestionRepo = dataSource.getRepository(SurveyQuestion);
  const careersSettingsRepo = dataSource.getRepository(CareersSettings);
  const jobPostingRepo = dataSource.getRepository(JobPosting);
  const blogPostRepo = dataSource.getRepository(BlogPost);
  const siteContentBlockRepo = dataSource.getRepository(SiteContentBlock);
  const siteRouteHighlightRepo = dataSource.getRepository(SiteRouteHighlight);
  const siteDestinationHighlightRepo = dataSource.getRepository(
    SiteDestinationHighlight,
  );
  const farePricingProposalRepo = dataSource.getRepository(FarePricingProposal);
  const refundPenaltyRuleRepo = dataSource.getRepository(RefundPenaltyRule);
  const refundRequestRepo = dataSource.getRepository(RefundRequest);
  const aircraftSeatMapRepo = dataSource.getRepository(AircraftSeatMap);
  const aircraftDefinitionRepo = dataSource.getRepository(AircraftDefinition);
  const aircraftCabinRepo = dataSource.getRepository(AircraftCabin);
  const aircraftSeatRepo = dataSource.getRepository(AircraftSeat);
  const passengerRepo = dataSource.getRepository(Passenger);
  const seatLockRepo = dataSource.getRepository(SeatLock);
  const permissionRepo = dataSource.getRepository(Permission);
  const internalServiceRepo = dataSource.getRepository(InternalService);
  const externalServiceConfigRepo = dataSource.getRepository(
    ExternalServiceConfig,
  );
  const securityPolicyRepo = dataSource.getRepository(SecurityPolicy);
  const employeePermissionRepo = dataSource.getRepository(EmployeePermission);
  const airportRepo = dataSource.getRepository(Airport);

  const passwordHash = await argon2.hash(STAFF_PASSWORD);

  // Rename legacy seed usernames so re-seed on existing DBs picks up short logins.
  await userRepo.update(
    { username: 'finance.karimi' },
    { username: 'finance' },
  );
  await userRepo.update({ username: 'comm.abbasi' }, { username: 'comm' });
  await userRepo.update({ username: 'senior.rahimi' }, { username: 'senior' });

  const staff: {
    username: string;
    fullName: string;
    role: (typeof Role)[keyof typeof Role];
  }[] = [
    { username: 'com.ahmadi', fullName: 'سمیرا احمدی', role: Role.EMPLOYEE },
    { username: 'itadmin', fullName: 'مهندس علی صدر', role: Role.IT_MANAGER },
    {
      username: 'comm',
      fullName: 'رضا مرادی',
      role: Role.COMMERCIAL_MANAGER,
    },
    {
      username: 'ops',
      fullName: 'نیلوفر اکبری',
      role: Role.OPERATIONS_MANAGER,
    },
    {
      username: 'finance',
      fullName: 'سحر کاظمی',
      role: Role.FINANCE_MANAGER,
    },
    {
      username: 'senior',
      fullName: 'محمد رحیمی',
      role: Role.SENIOR_MANAGER,
    },
    { username: 'ceo', fullName: 'محمد رحیمی', role: Role.CEO },
    { username: 'chair', fullName: 'رئیس هیئت مدیره', role: Role.BOARD_CHAIR },
    { username: 'site.admin', fullName: 'ادمین سایت', role: Role.SITE_ADMIN },
  ];

  const staffByUsername = new Map<string, User>();
  for (const s of staff) {
    const seededStaff = {
      role: s.role,
      username: s.username,
      passwordHash,
      fullName: s.fullName,
      twoFactorEnabled: true,
      // Re-seeding the deterministic dev/test identities must also undo a
      // previous first-login test mutation; otherwise later finance suites
      // receive a token that PanelAccessGuard correctly refuses.
      mustChangePassword: false,
      isActive: true,
      updatedAt: new Date(),
    };
    const user = await upsertBy(
      userRepo,
      { username: s.username },
      seededStaff,
      process.env.NODE_ENV === 'production' ? undefined : seededStaff,
    );
    staffByUsername.set(s.username, user);
  }
  const seniorManager = staffByUsername.get('senior')!;
  const commercialManager = staffByUsername.get('comm')!;
  const financeManager = staffByUsername.get('finance')!;

  const customerUser = await upsertBy(
    userRepo,
    { phone: '+989120000001' },
    {
      role: Role.USER,
      phone: '+989120000001',
      fullName: 'نگار رضایی',
      isActive: true,
      updatedAt: new Date(),
    },
  );

  const agencyUserGold = await upsertBy(
    userRepo,
    { phone: '+989120000002' },
    {
      role: Role.AGENCY,
      phone: '+989120000002',
      passwordHash,
      fullName: 'آژانس blujet',
      isActive: true,
      updatedAt: new Date(),
    },
  );

  const agencyUserSilver = await upsertBy(
    userRepo,
    { phone: '+989120000003' },
    {
      role: Role.AGENCY,
      phone: '+989120000003',
      passwordHash,
      fullName: 'آژانس پرواز آسیا',
      isActive: true,
      updatedAt: new Date(),
    },
  );

  // Sandbox purchase accounts start with a real, ledger-backed wallet grant
  // of 100,000,000 toman (1,000,000,000 rial). The deterministic ADJUST row
  // makes re-seeding idempotent and keeps checkout/refund flows usable without
  // inventing balances in the UI.
  const sandboxWalletGrantIrr = 1_000_000_000n;
  for (const walletUser of [customerUser, agencyUserGold, agencyUserSilver]) {
    const existingGrant = await walletEntryRepo.findOne({
      where: {
        userId: walletUser.id,
        type: WalletEntryType.ADJUST,
        signedAmountIrr: sandboxWalletGrantIrr,
      },
    });
    if (!existingGrant) {
      await walletEntryRepo.save(
        walletEntryRepo.create({
          userId: walletUser.id,
          type: WalletEntryType.ADJUST,
          signedAmountIrr: sandboxWalletGrantIrr,
          bookingId: null,
        }),
      );
    }
  }

  // ── Minimal flight/booking/ledger data so the reporting dashboards have
  // real, non-empty numbers to show across day/month/quarter granularities.
  const route = await upsertBy(
    routeRepo,
    { originCode: 'THR', destCode: 'DXB' },
    { originCode: 'THR', destCode: 'DXB' },
  );

  const flight = await upsertBy(
    flightRepo,
    { flightNo: 'EP-821' },
    { flightNo: 'EP-821', routeId: route.id, aircraftType: 'Airbus A320' },
  );

  const now = new Date();
  const channels: Array<(typeof BookingChannel)[keyof typeof BookingChannel]> =
    [BookingChannel.SYSTEM, BookingChannel.CHARTER, BookingChannel.AGENCY];

  // Sample bookings/ledger entries are only generated once — re-running the
  // seed (e.g. after a later phase adds more seed data) must stay idempotent.
  const existingBookingCount = await bookingRepo.count();
  for (
    let monthsAgo = 0;
    existingBookingCount === 0 && monthsAgo < 6;
    monthsAgo++
  ) {
    for (let day = 0; day < 4; day++) {
      const departureAt = new Date(now);
      departureAt.setMonth(departureAt.getMonth() - monthsAgo);
      departureAt.setDate(5 + day * 6);
      // A ticket sale cannot occur in the future merely because its flight
      // departs later in the current month. Keep the demo ledger historical
      // and deterministic so the newest real transaction is visible first.
      const saleOccurredAt =
        departureAt.getTime() <= now.getTime()
          ? departureAt
          : new Date(now.getTime() - (day + 1) * 60_000);

      const instance = await flightInstanceRepo.save(
        flightInstanceRepo.create({
          flightId: flight.id,
          departureAt,
          arrivalAt: new Date(departureAt.getTime() + 3 * 60 * 60 * 1000),
          capacity: 180,
          charterSeats: 60,
          status:
            monthsAgo === 0 && day === 0
              ? FlightInstanceStatus.SCHEDULED
              : FlightInstanceStatus.DEPARTED,
        }),
      );

      for (const channel of channels) {
        const seatCount =
          channel === 'SYSTEM' ? 60 : channel === 'CHARTER' ? 45 : 30;
        const priceIrr = 38_000_000;

        for (let i = 0; i < seatCount; i += 10) {
          // Bulk historical bookings stay agencyId-less — they exist to give
          // the SYSTEM/CHARTER/AGENCY sales-chart bars real totals, not to
          // represent any one agency's outstanding balance (see the small,
          // explicitly-sized agency bookings added in the Phase 3 block below).
          const booking = await bookingRepo.save(
            bookingRepo.create({
              pnr: `BJ${monthsAgo}${day}${channel[0]}${i}`,
              flightInstanceId: instance.id,
              channel,
              status: BookingStatus.TICKETED,
              priceIrr: BigInt(priceIrr * 10),
              createdAt: saleOccurredAt,
            }),
          );

          await ledgerEntryRepo.save(
            ledgerEntryRepo.create({
              bookingId: booking.id,
              type: LedgerEntryType.SALE,
              signedAmountIrr: BigInt(priceIrr * 10),
              occurredAt: saleOccurredAt,
            }),
          );
        }
      }
    }
  }

  // ── Phase 3: agency profiles, credit, membership requests, invoices ────
  await upsertBy(
    agencyProfileRepo,
    { userId: agencyUserGold.id },
    {
      userId: agencyUserGold.id,
      licenseNo: 'AG-10234',
      managerName: 'کامران یوسفی',
      phone: '+989120000002',
      email: 'info@blujet-agency.example',
      city: 'تهران',
      address: 'تهران، خیابان ولیعصر، پلاک ۱۲۰',
      tier: AgencyTier.GOLD,
      joinedAt: new Date('2023-04-10'),
    },
  );

  await upsertBy(
    agencyProfileRepo,
    { userId: agencyUserSilver.id },
    {
      userId: agencyUserSilver.id,
      licenseNo: 'AG-10891',
      managerName: 'سارا نجفی',
      phone: '+989120000003',
      email: 'info@asia-flight.example',
      city: 'مشهد',
      address: 'مشهد، بلوار وکیل‌آباد، پلاک ۴۵',
      tier: AgencyTier.SILVER,
      suspendedAt: new Date('2026-06-01'),
      suspendReason: 'عدم تسویه بدهی معوق بیش از ۳۰ روز',
      joinedAt: new Date('2024-01-15'),
    },
  );

  // NOTE: limitIrr/amountIrr/priceIrr/signedAmountIrr are Postgres `bigint`
  // — fine for dev seed data and single-ticket/invoice amounts, but a real
  // agency credit line or yearly-revenue aggregate could still need care in
  // the ledger-summation code paths. Tracked in PLAN.md.
  await upsertBy(
    agencyCreditLineRepo,
    { agencyId: agencyUserGold.id },
    {
      agencyId: agencyUserGold.id,
      limitIrr: 1_800_000_000n,
      updatedById: financeManager.id,
      updatedAt: new Date(),
    },
  );

  await upsertBy(
    agencyCreditLineRepo,
    { agencyId: agencyUserSilver.id },
    {
      agencyId: agencyUserSilver.id,
      limitIrr: 900_000_000n,
      updatedById: financeManager.id,
      updatedAt: new Date(),
    },
  );

  // A handful of agency-attributed bookings/sale entries, sized to give the
  // credit-used derivation real (but modest) numbers: gold stays under its
  // limit, silver goes over it (matches its "suspended for overdue debt"
  // seed narrative above).
  const anyInstance = await flightInstanceRepo
    .createQueryBuilder('fi')
    .getOne();
  if (anyInstance) {
    const agencyBookingSeeds: {
      agencyId: string;
      count: number;
      pricePerTicketIrr: bigint;
    }[] = [
      {
        agencyId: agencyUserGold.id,
        count: 4,
        pricePerTicketIrr: 190_000_000n,
      },
      {
        agencyId: agencyUserSilver.id,
        count: 7,
        pricePerTicketIrr: 190_000_000n,
      },
    ];
    for (const s of agencyBookingSeeds) {
      for (let i = 0; i < s.count; i++) {
        const existing = await bookingRepo
          .createQueryBuilder('b')
          .where('b.pnr = :pnr', {
            pnr: `BJAG${s.agencyId.slice(0, 4)}${i}`,
          })
          .getOne();
        if (existing) continue;

        const booking = await bookingRepo.save(
          bookingRepo.create({
            pnr: `BJAG${s.agencyId.slice(0, 4)}${i}`,
            flightInstanceId: anyInstance.id,
            channel: BookingChannel.AGENCY,
            agencyId: s.agencyId,
            status: BookingStatus.TICKETED,
            priceIrr: s.pricePerTicketIrr,
          }),
        );
        await ledgerEntryRepo.save(
          ledgerEntryRepo.create({
            bookingId: booking.id,
            agencyId: s.agencyId,
            type: LedgerEntryType.SALE,
            signedAmountIrr: s.pricePerTicketIrr,
          }),
        );
      }
    }
  }

  await upsertBy(
    agencyApiKeyRepo,
    { keyHash: 'seed-dev-only-key-hash-gold' },
    {
      agencyId: agencyUserGold.id,
      keyHash: 'seed-dev-only-key-hash-gold',
      scope: AgencyApiScope.FULL,
      status: AgencyApiKeyStatus.ACTIVE,
    },
  );

  const invoicePaid = await upsertBy(
    agencyInvoiceRepo,
    { invoiceNo: 'INV-1001' },
    {
      agencyId: agencyUserGold.id,
      invoiceNo: 'INV-1001',
      issuedById: commercialManager.id,
      issuedAt: new Date('2026-05-01'),
      dueAt: new Date('2026-05-15'),
      amountIrr: 450_000_000n,
      status: AgencyInvoiceStatus.PAID,
      paidAt: new Date('2026-05-10'),
    },
  );

  await upsertBy(
    ledgerEntryRepo,
    { id: 'seed-settlement-inv-1001' },
    {
      id: 'seed-settlement-inv-1001',
      agencyId: agencyUserGold.id,
      type: LedgerEntryType.SETTLEMENT,
      signedAmountIrr: -invoicePaid.amountIrr,
      occurredAt: invoicePaid.paidAt!,
      createdById: financeManager.id,
    },
  );

  await upsertBy(
    agencyInvoiceRepo,
    { invoiceNo: 'INV-1002' },
    {
      agencyId: agencyUserGold.id,
      invoiceNo: 'INV-1002',
      issuedById: commercialManager.id,
      issuedAt: new Date('2026-06-20'),
      dueAt: new Date('2026-07-05'),
      amountIrr: 800_000_000n,
      status: AgencyInvoiceStatus.UNPAID,
    },
  );

  await upsertBy(
    agencyInvoiceRepo,
    { invoiceNo: 'INV-1003' },
    {
      agencyId: agencyUserSilver.id,
      invoiceNo: 'INV-1003',
      issuedById: commercialManager.id,
      issuedAt: new Date('2026-05-20'),
      dueAt: new Date('2026-06-05'),
      amountIrr: 300_000_000n,
      status: AgencyInvoiceStatus.OVERDUE,
    },
  );

  for (const seed of ANCILLARY_BUILT_IN_SERVICES) {
    await upsertBy(
      ancillaryRepo,
      { key: seed.key },
      {
        key: seed.key,
        category: seed.category,
        titleFa: seed.titleFa,
        descriptionFa: seed.descriptionFa,
        priceIrr: seed.priceIrr,
        enabled: seed.enabled,
        isCustom: false,
      },
    );
    if (seed.travelExtra) {
      await upsertBy(
        travelExtraRepo,
        { code: seed.travelExtra.code },
        {
          code: seed.travelExtra.code,
          titleFa: seed.titleFa,
          descriptionFa: seed.descriptionFa,
          billingUnit: seed.travelExtra.billingUnit,
          priceIrr: seed.priceIrr,
          active: seed.enabled,
          purchaseEnabled: seed.enabled,
          sortOrder: 0,
        },
      );
    }
  }

  for (const m of [
    {
      agencyId: agencyUserGold.id,
      senderId: commercialManager.id,
      senderIsAgency: false,
      body: 'سلام، لطفاً فاکتور شماره INV-1002 را تا پایان هفته تسویه بفرمایید.',
      createdAt: new Date('2026-07-01'),
    },
    {
      agencyId: agencyUserGold.id,
      senderId: agencyUserGold.id,
      senderIsAgency: true,
      body: 'سلام، حتماً تا پنجشنبه پرداخت انجام می‌شود.',
      createdAt: new Date('2026-07-02'),
    },
  ]) {
    await agencyMessageRepo.save(agencyMessageRepo.create(m));
  }

  const membershipRequests: {
    applicantName: string;
    managerName: string;
    licenseNo: string;
    city: string;
    phone: string;
    email: string;
    status: (typeof AgencyMembershipStatus)[keyof typeof AgencyMembershipStatus];
    referredToId?: string;
    reviewNote?: string;
    reviewedById?: string;
    reviewedAt?: Date;
  }[] = [
    {
      applicantName: 'آژانس ستاره شرق',
      managerName: 'بهرام قاسمی',
      licenseNo: 'AG-20011',
      city: 'اصفهان',
      phone: '+989130000001',
      email: 'info@setareh-sharq.example',
      status: AgencyMembershipStatus.PENDING,
    },
    {
      applicantName: 'آژانس کیش پرواز',
      managerName: 'مریم اکبری',
      licenseNo: 'AG-20034',
      city: 'کیش',
      phone: '+989130000002',
      email: 'info@kish-parvaz.example',
      status: AgencyMembershipStatus.REFERRED,
      referredToId: financeManager.id,
      reviewNote: 'لطفاً وضعیت اعتباری متقاضی بررسی شود.',
      reviewedById: seniorManager.id,
      reviewedAt: new Date('2026-07-05'),
    },
    {
      applicantName: 'آژانس پیام سفر',
      managerName: 'حسین طاهری',
      licenseNo: 'AG-19987',
      city: 'شیراز',
      phone: '+989130000003',
      email: 'info@payam-safar.example',
      status: AgencyMembershipStatus.REJECTED,
      reviewNote: 'مدارک مجوز فعالیت ناقص بود.',
      reviewedById: commercialManager.id,
      reviewedAt: new Date('2026-06-18'),
    },
  ];

  for (const r of membershipRequests) {
    const existing = await agencyMembershipRequestRepo
      .createQueryBuilder('r')
      .where('r."licenseNo" = :licenseNo', { licenseNo: r.licenseNo })
      .getOne();
    if (!existing) {
      await agencyMembershipRequestRepo.save(
        agencyMembershipRequestRepo.create(r),
      );
    }
  }

  // ── Phase 4: cartable demo items + a referral in each state ────────────
  // Mirrors the design mocks' taskDefs/referrals seeds so the panels open
  // with realistic content. Only generated once (idempotent re-runs).
  const ceo = staffByUsername.get('ceo')!;
  const chair = staffByUsername.get('chair')!;

  const existingCartableCount = await cartableTaskRepo.count();
  if (existingCartableCount === 0) {
    const cartableSeeds: {
      assigneeId: string;
      category: (typeof CartableCategory)[keyof typeof CartableCategory];
      title: string;
      description: string;
      senderId?: string;
      senderLabelFa: string;
      createdAt: Date;
    }[] = [
      {
        assigneeId: ceo.id,
        category: CartableCategory.ADMIN,
        title: 'درخواست مرخصی تیم پشتیبانی',
        description:
          'درخواست هماهنگی مرخصی سه‌نفره تیم پشتیبانی برای هفته آینده.',
        senderLabelFa: 'علی حسینی · پشتیبانی',
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      },
      {
        assigneeId: ceo.id,
        category: CartableCategory.AGENCY,
        title: 'درخواست افزایش سقف اعتبار آژانس blujet',
        description:
          'آژانس blujet درخواست افزایش سقف اعتبار برای فصل پیک سفر دارد.',
        senderId: commercialManager.id,
        senderLabelFa: 'رضا مرادی · مدیر بازرگانی',
        createdAt: new Date(Date.now() - 26 * 60 * 60 * 1000),
      },
      {
        assigneeId: ceo.id,
        category: CartableCategory.MANAGER,
        title: 'گزارش انحراف بودجه تبلیغات',
        description:
          'انحراف ۱۲٪ نسبت به بودجه مصوب تبلیغات — نیازمند تصمیم مدیریت.',
        senderId: financeManager.id,
        senderLabelFa: 'سحر کاظمی · مدیر مالی',
        createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      },
      {
        assigneeId: chair.id,
        category: CartableCategory.MANAGER,
        title: 'گزارش عملکرد فصلی هیئت مدیره',
        description: 'پیش‌نویس گزارش عملکرد فصل برای بازبینی و تأیید نهایی.',
        senderId: ceo.id,
        senderLabelFa: 'محمد رحیمی · مدیر عامل',
        createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
      },
      {
        assigneeId: financeManager.id,
        category: CartableCategory.AGENCY,
        title: 'بررسی تسویه معوق آژانس پرواز آسیا',
        description:
          'بدهی معوق بیش از ۳۰ روز — نیازمند تصمیم درباره ادامه همکاری.',
        senderId: commercialManager.id,
        senderLabelFa: 'رضا مرادی · مدیر بازرگانی',
        createdAt: new Date(Date.now() - 8 * 60 * 60 * 1000),
      },
      {
        assigneeId: commercialManager.id,
        category: CartableCategory.ADMIN,
        title: 'به‌روزرسانی قرارداد همکاری آژانس‌ها',
        description: 'نسخه جدید قرارداد استاندارد همکاری آماده بازبینی است.',
        senderLabelFa: 'ادمین سایت',
        createdAt: new Date(Date.now() - 30 * 60 * 60 * 1000),
      },
      {
        assigneeId: seniorManager.id,
        category: CartableCategory.MANAGER,
        title: 'درخواست بازنگری دسترسی پنل مالی',
        description: 'درخواست بازبینی سطوح دسترسی پنل مالی پس از تغییرات اخیر.',
        senderId: financeManager.id,
        senderLabelFa: 'سحر کاظمی · مدیر مالی',
        createdAt: new Date(Date.now() - 20 * 60 * 60 * 1000),
      },
    ];
    for (const t of cartableSeeds) {
      await cartableTaskRepo.save(cartableTaskRepo.create(t));
    }

    // One referral per status so the Senior Manager tab shows all 4 KPI states.
    const referralSeeds: {
      title: string;
      body: string;
      priority: (typeof ReferralPriority)[keyof typeof ReferralPriority];
      status: (typeof ReferralStatus)[keyof typeof ReferralStatus];
      recipientIds: string[];
      dueAt?: Date;
      report?: { fromId: string; body: string };
    }[] = [
      {
        title: 'درخواست گزارش فروش سه‌ماهه',
        body: 'گزارش تفکیکی فروش سه‌ماهه اخیر به تفکیک کانال فروش ارسال شود.',
        priority: ReferralPriority.HIGH,
        status: ReferralStatus.SENT,
        recipientIds: [financeManager.id],
        dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
      {
        title: 'بازنگری نرخ کمیسیون آژانس‌ها',
        body: 'پیشنهاد نرخ کمیسیون جدید برای آژانس‌های سطح طلایی تهیه شود.',
        priority: ReferralPriority.MEDIUM,
        status: ReferralStatus.REVIEWING,
        recipientIds: [commercialManager.id],
        dueAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      },
      {
        title: 'گزارش وضعیت مطالبات معوق',
        body: 'فهرست کامل مطالبات معوق آژانس‌ها به همراه پیشنهاد اقدام ارائه شود.',
        priority: ReferralPriority.HIGH,
        status: ReferralStatus.REPORTED,
        recipientIds: [financeManager.id],
        report: {
          fromId: financeManager.id,
          body: 'گزارش مطالبات معوق پیوست شد؛ دو آژانس نیازمند پیگیری حقوقی هستند.',
        },
      },
      {
        title: 'جمع‌بندی کمپین تخفیف تابستان',
        body: 'نتایج کمپین تخفیف تابستان جمع‌بندی و ارسال شود.',
        priority: ReferralPriority.LOW,
        status: ReferralStatus.CLOSED,
        recipientIds: [commercialManager.id],
        report: {
          fromId: commercialManager.id,
          body: 'گزارش کمپین پیوست است؛ نرخ تبدیل ۱۸٪ بالاتر از هدف بود.',
        },
      },
    ];
    for (const r of referralSeeds) {
      const referral = await managerReferralRepo.save(
        managerReferralRepo.create({
          fromId: seniorManager.id,
          title: r.title,
          body: r.body,
          priority: r.priority,
          status: r.status,
          dueAt: r.dueAt,
        }),
      );
      for (const recipientId of r.recipientIds) {
        await managerReferralRecipientRepo.save(
          managerReferralRecipientRepo.create({
            referralId: referral.id,
            recipientId,
          }),
        );
      }
      if (r.report) {
        await managerReferralReportRepo.save(
          managerReferralReportRepo.create({
            referralId: referral.id,
            fromId: r.report.fromId,
            body: r.report.body,
          }),
        );
      }
      // Delivery wiring (⚑): each recipient gets a cartable task, except for
      // CLOSED seeds whose loop is already finished.
      if (r.status !== 'CLOSED') {
        for (const recipientId of r.recipientIds) {
          await cartableTaskRepo.save(
            cartableTaskRepo.create({
              assigneeId: recipientId,
              category: CartableCategory.MANAGER,
              title: r.title,
              description: r.body,
              senderId: seniorManager.id,
              senderLabelFa: 'محمد رحیمی · مدیر ارشد',
              sourceType: 'MANAGER_REFERRAL',
              sourceId: referral.id,
              status: r.status === 'REPORTED' ? 'APPROVED' : 'OPEN',
              resolutionNote:
                r.status === 'REPORTED' ? 'گزارش ثبت و ارسال شد.' : undefined,
              resolvedAt: r.status === 'REPORTED' ? new Date() : undefined,
            }),
          );
        }
      }
    }
  }

  // ── Phase 5: club members (one per tier/card state) + card requests ────
  // National IDs below are valid per the official checksum but synthetic.
  const existingClubCount = await clubMemberRepo.count();
  if (existingClubCount === 0) {
    const memberSeeds = [
      {
        fullName: 'نگار رضایی',
        email: 'negar@email.example',
        nationalId: '0012345679',
        birthDate: new Date('1993-08-05'),
        joinDate: new Date('2025-05-31'),
        points: 12450,
        level: ClubTier.GOLD,
        cardStatus: ClubCardStatus.ISSUED,
        cardNo: 'GOLD-8842',
        issuedByLabelFa: 'رئیس هیئت مدیره (تأیید درخواست)',
      },
      {
        fullName: 'محمد کریمی',
        email: 'mkarimi@email.example',
        nationalId: '0023456787',
        birthDate: new Date('1988-02-11'),
        joinDate: new Date('2025-09-10'),
        points: 6200,
        level: ClubTier.GOLD,
        cardStatus: ClubCardStatus.REVIEW,
      },
      {
        fullName: 'سارا احمدی',
        email: 'sahmadi@email.example',
        nationalId: '0034567895',
        birthDate: new Date('1996-12-01'),
        joinDate: new Date('2026-01-20'),
        points: 2100,
        level: ClubTier.SILVER,
        cardStatus: ClubCardStatus.NONE,
      },
      {
        fullName: 'علی مرادی',
        email: 'amoradi@email.example',
        nationalId: '0045678901',
        birthDate: new Date('1985-06-25'),
        joinDate: new Date('2024-11-02'),
        points: 18800,
        level: ClubTier.PLATINUM,
        cardStatus: ClubCardStatus.ISSUED,
        cardNo: 'PLAT-1290',
        issuedByLabelFa: 'مدیر ارشد (صدور مستقیم)',
      },
    ];

    const members: Record<string, string> = {};
    for (const m of memberSeeds) {
      const { nationalId, ...rest } = m;
      const created = await clubMemberRepo.save(
        clubMemberRepo.create({
          ...rest,
          nationalIdEnc: encryptPii(nationalId),
          nationalIdHash: hashPii(nationalId),
        }),
      );
      members[m.fullName] = created.id;
    }

    await clubCardRequestRepo.save(
      clubCardRequestRepo.create({
        memberId: members['محمد کریمی'],
        level: ClubTier.GOLD,
        points: 6200,
        status: ClubCardRequestStatus.REFERRED,
        assignedTo: ClubCardAssignee.SENIOR,
        history: [
          {
            step: 'submitted',
            labelFa: 'رسیدن به حد امتیاز و ثبت درخواست صدور کارت',
            at: '۱۴۰۵/۰۴/۰۲ - ۱۰:۱۲',
          },
          {
            step: 'referred',
            labelFa: 'ارجاع به مدیر ارشد توسط ادمین سایت',
            at: '۱۴۰۵/۰۴/۰۲ - ۱۱:۳۰',
          },
        ] as JsonValue,
      }),
    );
    await clubCardRequestRepo.save(
      clubCardRequestRepo.create({
        memberId: members['سارا احمدی'],
        level: ClubTier.SILVER,
        points: 5100,
        status: ClubCardRequestStatus.REFERRED,
        assignedTo: ClubCardAssignee.CHAIR,
        history: [
          {
            step: 'submitted',
            labelFa: 'رسیدن به حد امتیاز و ثبت درخواست صدور کارت',
            at: '۱۴۰۵/۰۴/۱۰ - ۰۹:۰۵',
          },
          {
            step: 'referred',
            labelFa: 'ارجاع به رئیس هیئت مدیره توسط ادمین سایت',
            at: '۱۴۰۵/۰۴/۱۰ - ۱۰:۴۵',
          },
        ] as JsonValue,
      }),
    );
    await clubCardRequestRepo.save(
      clubCardRequestRepo.create({
        memberId: members['نگار رضایی'],
        level: ClubTier.GOLD,
        points: 12450,
        status: ClubCardRequestStatus.APPROVED,
        assignedTo: ClubCardAssignee.CHAIR,
        cardNo: 'GOLD-8842',
        history: [
          {
            step: 'submitted',
            labelFa: 'رسیدن به حد امتیاز و ثبت درخواست صدور کارت',
            at: '۱۴۰۴/۰۳/۱۲ - ۰۸:۲۰',
          },
          {
            step: 'referred',
            labelFa: 'ارجاع به رئیس هیئت مدیره توسط ادمین سایت',
            at: '۱۴۰۴/۰۳/۱۲ - ۰۹:۱۵',
          },
          {
            step: 'approved',
            labelFa: 'تأیید و صدور کارت طلایی',
            at: '۱۴۰۴/۰۳/۱۳ - ۱۲:۴۰',
          },
        ] as JsonValue,
      }),
    );
  }

  // ── Phase 65: club tier rules (singleton row, seeded once) ─────────────
  const existingTierRuleCount = await clubTierRuleRepo.count();
  if (existingTierRuleCount === 0) {
    await clubTierRuleRepo.save(
      clubTierRuleRepo.create({ updatedAt: new Date() }),
    );
  }

  // Link the test USER to the seeded club member + backfill ledger so
  // GET /my/club/membership works for manual testing after seed.
  const testUser = await userRepo.findOneBy({ phone: '+989120000001' });
  const negarMember = await clubMemberRepo.findOneBy({
    fullName: 'نگار رضایی',
  });
  if (testUser && negarMember) {
    if (!negarMember.userId) {
      await clubMemberRepo.update(
        { id: negarMember.id },
        { userId: testUser.id },
      );
    }
    // SITE_ADMIN «مشتریان» design shows نگار as کامل with national ID + email.
    if (!testUser.nationalIdEnc || !testUser.email) {
      await userRepo.update(
        { id: testUser.id },
        {
          email: testUser.email ?? 'negar@email.example',
          nationalIdEnc: testUser.nationalIdEnc ?? encryptPii('0012345679'),
          nationalIdHash: testUser.nationalIdHash ?? hashPii('0012345679'),
          birthDate: testUser.birthDate ?? new Date('1993-08-05'),
          updatedAt: new Date(),
        },
      );
    }
    const entryCount = await clubPointsEntryRepo.count({
      where: { clubMemberId: negarMember.id },
    });
    if (entryCount === 0 && negarMember.points > 0) {
      await clubPointsEntryRepo.save(
        clubPointsEntryRepo.create({
          clubMemberId: negarMember.id,
          type: ClubPointsEntryType.EARN,
          signedPoints: negarMember.points,
        }),
      );
    }
  }

  // Sample saved passengers for the test USER (پنل کاربر → مسافران)
  if (testUser) {
    const savedPaxCount = await savedPassengerRepo.count({
      where: { userId: testUser.id },
    });
    if (savedPaxCount === 0) {
      for (const p of [
        {
          userId: testUser.id,
          fullName: 'نگار رضایی',
          latinName: 'NEGAR REZAEI',
          gender: 'female' as const,
          birthDate: '1992-04-12',
          nationalIdEnc: encryptPii('0074185969'),
          nationalIdHash: hashPii('0074185969'),
        },
        {
          userId: testUser.id,
          fullName: 'صادق کاظمی',
          latinName: 'SADEQ KAZEMI',
          gender: 'male' as const,
          birthDate: '1988-11-03',
          nationalIdEnc: encryptPii('0060326786'),
          nationalIdHash: hashPii('0060326786'),
        },
        {
          userId: testUser.id,
          fullName: 'محمد رضایی',
          latinName: 'MOHAMMAD REZAEI',
          gender: 'male' as const,
          birthDate: '1995-07-21',
          nationalIdEnc: encryptPii('0012345679'),
          nationalIdHash: hashPii('0012345679'),
        },
      ]) {
        await savedPassengerRepo.save(
          savedPassengerRepo.create({ ...p, updatedAt: new Date() }),
        );
      }
    }

    const savedBankCount = await savedBankAccountRepo.count({
      where: { userId: testUser.id },
    });
    if (savedBankCount === 0) {
      await savedBankAccountRepo.save(
        savedBankAccountRepo.create({
          userId: testUser.id,
          bankName: 'بانک ملت',
          bankShort: 'ملت',
          brandColor: '#d6336c',
          cardPanEnc: encryptPii('6104337112344521'),
          cardLast4: '4521',
          shebaEnc: encryptPii('IR820540102680020817909002'),
          shebaHash: hashPii('IR820540102680020817909002'),
          isDefault: true,
          updatedAt: new Date(),
        }),
      );
    }

    await userRepo.update(
      { id: testUser.id, referralCode: IsNull() },
      { referralCode: 'NEGAR-4152', updatedAt: new Date() },
    );

    const referralCount = await customerReferralRepo.count({
      where: { referrerUserId: testUser.id },
    });
    if (referralCount === 0) {
      const friendPhones: {
        phone: string;
        fullName: string;
        status: (typeof CustomerReferralStatus)[keyof typeof CustomerReferralStatus];
        points: number;
      }[] = [
        {
          phone: '09180000091',
          fullName: 'رضا مرادی',
          status: CustomerReferralStatus.REWARDED,
          points: 500,
        },
        {
          phone: '09180000092',
          fullName: 'سمیرا کریمی',
          status: CustomerReferralStatus.REWARDED,
          points: 500,
        },
        {
          phone: '09180000093',
          fullName: 'آرش هاشمی',
          status: CustomerReferralStatus.SIGNED_UP,
          points: 0,
        },
      ];
      for (const f of friendPhones) {
        const referred = await upsertBy(
          userRepo,
          { phone: f.phone },
          {
            role: Role.USER,
            phone: f.phone,
            fullName: f.fullName,
            updatedAt: new Date(),
          },
          { fullName: f.fullName, updatedAt: new Date() },
        );
        await customerReferralRepo.save(
          customerReferralRepo.create({
            referrerUserId: testUser.id,
            referredUserId: referred.id,
            status: f.status,
            pointsAwarded: f.points,
            rewardedAt: f.status === 'REWARDED' ? new Date() : undefined,
            updatedAt: new Date(),
          }),
        );
      }
    }

    // Seed one reviewable KYC request with a real tiny PNG so /panel/kyc
    // and its protected file download work immediately after setup.
    const kycUser = await userRepo.findOneBy({ phone: '09180000091' });
    if (kycUser) {
      const existingKyc = await customerIdentityVerificationRepo.count({
        where: { userId: kycUser.id },
      });
      if (existingKyc === 0) {
        await userRepo.update(
          { id: kycUser.id },
          {
            nationalIdEnc: encryptPii('0499370899'),
            nationalIdHash: hashPii('0499370899'),
            birthDate: new Date('1992-05-14'),
            updatedAt: new Date(),
          },
        );
        const uploadDir =
          process.env.UPLOAD_DIR ?? path.join(process.cwd(), 'uploads');
        fs.mkdirSync(uploadDir, { recursive: true });
        const idCardPath = path.join(uploadDir, 'seed-id-card.png');
        fs.writeFileSync(
          idCardPath,
          Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
            'base64',
          ),
        );
        const idCardFile = await storedFileRepo.save(
          storedFileRepo.create({
            ownerId: kycUser.id,
            fileName: 'کارت-ملی.png',
            mimeType: 'image/png',
            sizeBytes: fs.statSync(idCardPath).size,
            path: idCardPath,
          }),
        );
        await customerIdentityVerificationRepo.save(
          customerIdentityVerificationRepo.create({
            userId: kycUser.id,
            status: CustomerIdentityStatus.SUBMITTED,
            idCardFileId: idCardFile.id,
            submittedAt: new Date(),
            updatedAt: new Date(),
          }),
        );
      }
    }
  }

  // ── Phase 66: passenger survey settings + default question list ────────
  const existingSurveySettingsCount = await surveySettingsRepo.count();
  if (existingSurveySettingsCount === 0) {
    await surveySettingsRepo.save(
      surveySettingsRepo.create({ updatedAt: new Date() }),
    );
  }
  const existingSurveyQuestionCount = await surveyQuestionRepo.count();
  if (existingSurveyQuestionCount === 0) {
    const defaultQuestions = [
      'رضایت کلی از سفر',
      'برخورد و کیفیت خدمه پروازی',
      'دقت در زمان پرواز',
      'راحتی صندلی و کابین',
      'سرعت پذیرش و چک‌این',
    ];
    for (const [order, label] of defaultQuestions.entries()) {
      await surveyQuestionRepo.save(
        surveyQuestionRepo.create({ label, order }),
      );
    }
  }

  // ── Phase 67: careers settings + default job postings ──────────────────
  const existingCareersSettingsCount = await careersSettingsRepo.count();
  if (existingCareersSettingsCount === 0) {
    await careersSettingsRepo.save(
      careersSettingsRepo.create({ updatedAt: new Date() }),
    );
  }
  const existingJobPostingCount = await jobPostingRepo.count();
  if (existingJobPostingCount === 0) {
    for (const p of [
      {
        title: 'کارشناس پشتیبانی مسافران',
        dept: 'پشتیبانی',
        city: 'تهران',
        type: JobType.FULL_TIME,
        generalReqs: [
          'حداقل مدرک کارشناسی',
          'روابط عمومی قوی',
          'آشنایی با نرم‌افزارهای اداری',
        ],
        specialReqs: [
          'سابقه کار در صنعت گردشگری یا هوانوردی',
          'آمادگی کار شیفتی',
        ],
      },
      {
        title: 'توسعه‌دهنده فرانت‌اند',
        dept: 'فناوری اطلاعات',
        city: 'تهران',
        type: JobType.REMOTE,
        generalReqs: [
          'تسلط به JavaScript و React',
          'آشنایی با طراحی واکنش‌گرا',
          'حداقل ۲ سال سابقه کار',
        ],
        specialReqs: ['آشنایی با سامانه‌های رزرواسیون مزیت محسوب می‌شود'],
      },
      {
        title: 'کارشناس فروش و بازرگانی',
        dept: 'بازرگانی',
        city: 'مشهد',
        type: JobType.PART_TIME,
        generalReqs: ['مهارت مذاکره و فروش', 'آشنایی با اکسل و گزارش‌گیری'],
        specialReqs: ['آشنایی با قراردادهای آژانسی'],
      },
    ]) {
      await jobPostingRepo.save(
        jobPostingRepo.create({ ...p, updatedAt: new Date() }),
      );
    }
  }

  // ── Phase D: sample blog posts ─────────────────────────────────────────
  const siteAdmin = staffByUsername.get('site.admin')!;
  const existingBlogCount = await blogPostRepo.count();
  if (existingBlogCount === 0) {
    const publishedAt = new Date(Date.now() - 5 * 24 * 3_600_000);
    for (const p of [
      {
        title: 'راهنمای کامل چک‌این آنلاین پروازهای داخلی',
        slug: 'online-checkin-guide',
        body: 'برای چک‌این آنلاین، کافی است از ۲۴ ساعت قبل از پرواز وارد سامانه blujet شوید و کد رزرو خود را وارد کنید…',
        category: BlogCategory.GUIDE,
        status: BlogPostStatus.PUBLISHED,
        authorId: siteAdmin.id,
        viewCount: 4210,
        publishedAt,
      },
      {
        title: '۱۰ مقصد بی‌نظیر تابستانی که باید ببینید',
        slug: 'summer-destinations',
        body: 'تابستان فرصت طلایی برای سفر به مقاصد ساحلی و کوهستانی است. در این مقاله ده مقصد محبوب را معرفی می‌کنیم…',
        category: BlogCategory.DEST,
        status: BlogPostStatus.PUBLISHED,
        authorId: siteAdmin.id,
        viewCount: 8740,
        publishedAt: new Date(Date.now() - 3 * 24 * 3_600_000),
      },
      {
        title: 'قوانین جدید بار همراه در پروازهای بین‌المللی',
        slug: 'intl-baggage-rules',
        body: 'از ابتدای مرداد، محدودیت‌های جدیدی برای بار همراه در پروازهای بین‌المللی اعمال می‌شود…',
        category: BlogCategory.NEWS,
        status: BlogPostStatus.PUBLISHED,
        authorId: siteAdmin.id,
        viewCount: 3105,
        publishedAt: new Date(Date.now() - 7 * 24 * 3_600_000),
      },
      {
        title: 'چطور با امتیاز باشگاه بلیط رایگان بگیریم؟',
        slug: 'club-free-ticket-draft',
        body: 'اعضای باشگاه مشتریان blujet می‌توانند با جمع‌آوری امتیاز، بلیط رایگان دریافت کنند…',
        category: BlogCategory.GUIDE,
        status: BlogPostStatus.DRAFT,
        authorId: siteAdmin.id,
        viewCount: 0,
      },
      {
        title: 'تخفیف ویژهٔ پروازهای استانبول تا پایان مرداد',
        slug: 'istanbul-offer-scheduled',
        body: 'تا پایان مرداد ۱۴۰۵، ۱۵٪ تخفیف روی پروازهای مستقیم تهران–استانبول اعمال می‌شود…',
        category: BlogCategory.OFFERS,
        status: BlogPostStatus.SCHEDULED,
        authorId: siteAdmin.id,
        viewCount: 0,
        scheduledAt: new Date(Date.now() + 14 * 24 * 3_600_000),
      },
    ]) {
      await blogPostRepo.save(
        blogPostRepo.create({ ...p, updatedAt: new Date() }),
      );
    }
  }

  // ── Phase E: site content CMS (home banners, routes, destinations) ───
  const existingRouteHighlights = await siteRouteHighlightRepo.count();
  if (existingRouteHighlights === 0) {
    for (const b of [
      {
        key: SiteContentBlockKey.HERO_BANNER,
        enabled: true,
        title: 'پرواز بعدی‌ات را با blujet رزرو کن',
        subtitle:
          'بیش از ۲۰۰ مقصد داخلی و بین‌المللی، با بهترین قیمت، پشتیبانی شبانه‌روزی و امتیاز در هر سفر.',
        buttonText: 'مشاهده پیشنهادهای ویژه',
        badgeText: 'در هر پرواز تا ۵٪ کش‌بک بگیرید',
        updatedById: siteAdmin.id,
      },
      {
        key: SiteContentBlockKey.ANNOUNCEMENT_BAR,
        enabled: true,
        title:
          'اطلاعیه مهم: برخی پروازهای امروز به‌دلیل شرایط جوی با تأخیر انجام می‌شوند — آخرین وضعیت پروازها را بررسی کنید',
        subtitle: '',
        buttonText: 'مشاهده',
        badgeText: '',
        updatedById: siteAdmin.id,
      },
      {
        key: SiteContentBlockKey.PROMO_BANNER,
        enabled: true,
        title: 'تا ۴۰٪ تخفیف روی پروازهای خارجی',
        subtitle:
          'رزرو تا پایان مرداد برای سفرهای تابستان — صندلی‌ها محدودند، فرصت را از دست نده.',
        buttonText: 'مشاهده پروازها',
        badgeText: 'حراج تابستانه blujet',
        updatedById: siteAdmin.id,
      },
    ]) {
      await siteContentBlockRepo.save(
        siteContentBlockRepo.create({ ...b, updatedAt: new Date() }),
      );
    }
    for (const h of [
      {
        fromAirportCode: 'THR',
        toAirportCode: 'MHD',
        priceIrr: 16_000_000n,
        sortOrder: 0,
      },
      {
        fromAirportCode: 'THR',
        toAirportCode: 'IST',
        priceIrr: 42_000_000n,
        sortOrder: 1,
      },
      {
        fromAirportCode: 'THR',
        toAirportCode: 'DXB',
        priceIrr: 38_000_000n,
        sortOrder: 2,
      },
      {
        fromAirportCode: 'MHD',
        toAirportCode: 'KIH',
        priceIrr: 21_000_000n,
        sortOrder: 3,
      },
      {
        fromAirportCode: 'SYZ',
        toAirportCode: 'THR',
        priceIrr: 14_500_000n,
        sortOrder: 4,
      },
    ]) {
      await siteRouteHighlightRepo.save(
        siteRouteHighlightRepo.create({ ...h, updatedAt: new Date() }),
      );
    }
    for (const d of [
      { airportCode: 'IST', priceIrr: 42_000_000n, sortOrder: 0 },
      { airportCode: 'DXB', priceIrr: 38_000_000n, sortOrder: 1 },
      { airportCode: 'MHD', priceIrr: 16_000_000n, sortOrder: 2 },
      { airportCode: 'KIH', priceIrr: 21_000_000n, sortOrder: 3 },
    ]) {
      await siteDestinationHighlightRepo.save(
        siteDestinationHighlightRepo.create({ ...d, updatedAt: new Date() }),
      );
    }
  }

  // ── Phase 6: pricing proposals (one pending, one registered) ───────────
  const existingProposalCount = await farePricingProposalRepo.count();
  if (existingProposalCount === 0) {
    // Two future SCHEDULED instances so the pricing list has fresh rows.
    for (const daysAhead of [10, 20]) {
      const departureAt = new Date(
        now.getTime() + daysAhead * 24 * 60 * 60 * 1000,
      );
      await flightInstanceRepo.save(
        flightInstanceRepo.create({
          flightId: flight.id,
          departureAt,
          arrivalAt: new Date(departureAt.getTime() + 3 * 60 * 60 * 1000),
          capacity: 180,
          charterSeats: 60,
          status: FlightInstanceStatus.SCHEDULED,
        }),
      );
    }
    const scheduled = await flightInstanceRepo
      .createQueryBuilder('fi')
      .leftJoin(FarePricingProposal, 'p', 'p."flightInstanceId" = fi.id')
      .where('fi.status = :status', { status: FlightInstanceStatus.SCHEDULED })
      .andWhere('p.id IS NULL')
      .orderBy('fi.departureAt', 'DESC')
      .take(2)
      .getMany();
    const ceoUser = staffByUsername.get('ceo')!;
    if (scheduled[0]) {
      await farePricingProposalRepo.save(
        farePricingProposalRepo.create({
          flightInstanceId: scheduled[0].id,
          basePriceIrr: 38_000_000n,
          competitorPriceIrr: 39_000_000n,
          proposedPriceIrr: 38_500_000n,
          legalRateIrr: 42_000_000n,
          note: 'قیمت کمی پایین‌تر از رقبا برای پرکردن صندلی‌های آزاد.',
          proposedById: commercialManager.id,
          status: PricingProposalStatus.PENDING,
          updatedAt: new Date(),
        }),
      );
    }
    if (scheduled[1]) {
      await farePricingProposalRepo.save(
        farePricingProposalRepo.create({
          flightInstanceId: scheduled[1].id,
          basePriceIrr: 40_000_000n,
          competitorPriceIrr: 42_000_000n,
          proposedPriceIrr: 41_000_000n,
          legalRateIrr: 45_000_000n,
          note: 'تعهد چارتری بالا؛ قیمت متعادل پیشنهاد شد.',
          proposedById: commercialManager.id,
          status: PricingProposalStatus.REGISTERED,
          registeredPriceIrr: 41_000_000n,
          approvedById: ceoUser.id,
          approvedAt: new Date(),
          updatedAt: new Date(),
        }),
      );
    }
  }

  // ── Phase 7: penalty rules (design's 4-bracket engine) + refund seeds ──
  if ((await refundPenaltyRuleRepo.count()) === 0) {
    for (const rule of [
      {
        minHoursBeforeDeparture: 72,
        penaltyPct: 30,
        labelFa: 'بیش از ۷۲ ساعت مانده به پرواز',
      },
      {
        minHoursBeforeDeparture: 24,
        penaltyPct: 50,
        labelFa: 'بین ۲۴ تا ۷۲ ساعت مانده',
      },
      {
        minHoursBeforeDeparture: 3,
        penaltyPct: 70,
        labelFa: 'بین ۳ تا ۲۴ ساعت مانده',
      },
      {
        minHoursBeforeDeparture: 0,
        penaltyPct: 100,
        labelFa: 'کمتر از ۳ ساعت / پس از پرواز',
      },
    ]) {
      await refundPenaltyRuleRepo.save(refundPenaltyRuleRepo.create(rule));
    }
  }

  if ((await refundRequestRepo.count()) === 0) {
    const someBooking = await bookingRepo
      .createQueryBuilder('b')
      .where('b.status = :status', { status: BookingStatus.TICKETED })
      .getOne();
    if (someBooking) {
      const financeStaffName = 'مریم کاظمی';
      const refundSeeds: {
        passengerName: string;
        status: (typeof RefundStatus)[keyof typeof RefundStatus];
        totalPaidIrr: number;
        penaltyPct: number;
        assigneeLabel?: string;
        history: JsonValue;
      }[] = [
        {
          passengerName: 'رضا کریمی',
          status: RefundStatus.SUBMITTED,
          totalPaidIrr: 25_000_000,
          penaltyPct: 30,
          history: [
            {
              step: 'submitted',
              labelFa: 'ثبت درخواست کنسلی توسط مشتری — جریمه ٪۳۰',
              at: 'امروز · ۰۹:۱۵',
            },
          ],
        },
        {
          passengerName: 'مهدی صادقی',
          status: RefundStatus.REVIEW,
          totalPaidIrr: 31_000_000,
          penaltyPct: 30,
          history: [
            {
              step: 'submitted',
              labelFa: 'ثبت درخواست کنسلی توسط مشتری — جریمه ٪۳۰',
              at: 'دیروز · ۱۶:۰۲',
            },
            {
              step: 'review',
              labelFa: 'بررسی توسط ادمین سایت',
              at: 'امروز · ۰۸:۴۰',
            },
          ],
        },
        {
          passengerName: 'سارا محمدی',
          status: RefundStatus.FINANCE,
          totalPaidIrr: 42_000_000,
          penaltyPct: 50,
          assigneeLabel: financeStaffName,
          history: [
            {
              step: 'submitted',
              labelFa: 'ثبت درخواست کنسلی توسط مشتری — جریمه ٪۵۰',
              at: '۲ روز پیش · ۱۱:۲۰',
            },
            {
              step: 'review',
              labelFa: 'بررسی توسط ادمین سایت',
              at: '۲ روز پیش · ۱۴:۰۵',
            },
            {
              step: 'finance',
              labelFa: `ارجاع به ${financeStaffName} (کارشناس مالی) توسط ادمین سایت`,
              at: 'دیروز · ۰۹:۳۰',
            },
          ],
        },
        {
          passengerName: 'نگار رضایی',
          status: RefundStatus.PAID,
          totalPaidIrr: 41_000_000,
          penaltyPct: 30,
          history: [
            {
              step: 'submitted',
              labelFa: 'ثبت درخواست کنسلی توسط مشتری — جریمه ٪۳۰',
              at: 'هفته پیش',
            },
            {
              step: 'review',
              labelFa: 'بررسی توسط ادمین سایت',
              at: 'هفته پیش',
            },
            {
              step: 'finance',
              labelFa: 'ارجاع به مدیر مالی توسط ادمین سایت',
              at: '۶ روز پیش',
            },
            {
              step: 'paid',
              labelFa: 'تأیید، واریز وجه و بستن پرونده توسط مدیر مالی',
              at: '۵ روز پیش',
            },
          ],
        },
        // Extra rows so the finance refunds list can exercise 5-per-page pagination.
        {
          passengerName: 'علی نوری',
          status: RefundStatus.FINANCE,
          totalPaidIrr: 28_000_000,
          penaltyPct: 30,
          assigneeLabel: financeStaffName,
          history: [
            {
              step: 'submitted',
              labelFa: 'ثبت درخواست کنسلی توسط مشتری — جریمه ٪۳۰',
              at: '۳ روز پیش · ۱۰:۰۰',
            },
            {
              step: 'review',
              labelFa: 'بررسی توسط ادمین سایت',
              at: '۳ روز پیش · ۱۲:۲۰',
            },
            {
              step: 'finance',
              labelFa: `ارجاع به ${financeStaffName} (کارشناس مالی) توسط ادمین سایت`,
              at: '۲ روز پیش · ۰۹:۱۰',
            },
          ],
        },
        {
          passengerName: 'فاطمه حسینی',
          status: RefundStatus.REVIEW,
          totalPaidIrr: 35_000_000,
          penaltyPct: 50,
          history: [
            {
              step: 'submitted',
              labelFa: 'ثبت درخواست کنسلی توسط مشتری — جریمه ٪۵۰',
              at: '۴ روز پیش · ۱۵:۴۵',
            },
            {
              step: 'review',
              labelFa: 'بررسی توسط ادمین سایت',
              at: 'دیروز · ۱۱:۰۰',
            },
          ],
        },
      ];
      for (const [index, r] of refundSeeds.entries()) {
        const penaltyAmountIrr = Math.round(
          (r.totalPaidIrr * r.penaltyPct) / 100,
        );
        const refundBooking = await bookingRepo.save(
          bookingRepo.create({
            pnr: `RFSEED${String(index + 1).padStart(2, '0')}`,
            flightInstanceId: someBooking.flightInstanceId,
            channel: someBooking.channel,
            status:
              r.status === 'PAID'
                ? BookingStatus.REFUNDED
                : BookingStatus.TICKETED,
            priceIrr: BigInt(r.totalPaidIrr),
            taxIrr: someBooking.taxIrr,
            userId: someBooking.userId,
            contactPhone: someBooking.contactPhone,
            cabin: someBooking.cabin,
            fareClassCode: someBooking.fareClassCode,
          }),
        );
        const created = await refundRequestRepo.save(
          refundRequestRepo.create({
            trackingCode: `RF-${String(index + 1).padStart(8, '0')}`,
            bookingId: refundBooking.id,
            passengerName: r.passengerName,
            nidEnc: encryptPii('0012345679'),
            mobileEnc: encryptPii('09121112233'),
            ibanEnc: encryptPii('IR820170000000332211009900'),
            totalPaidIrr: BigInt(r.totalPaidIrr),
            penaltyPct: r.penaltyPct,
            penaltyAmountIrr: BigInt(penaltyAmountIrr),
            refundableIrr: BigInt(r.totalPaidIrr - penaltyAmountIrr),
            status: r.status === 'PAID' ? RefundStatus.FINANCE : r.status,
            paidAt: r.status === 'PAID' ? new Date() : undefined,
            processedById: r.status === 'PAID' ? financeManager.id : undefined,
            history: r.history,
          }),
        );
        // The PAID seed keeps the ledger consistent with its state.
        if (r.status === 'PAID') {
          await ledgerEntryRepo.save(
            ledgerEntryRepo.create({
              bookingId: refundBooking.id,
              type: LedgerEntryType.REFUND,
              signedAmountIrr: -created.refundableIrr,
              createdById: financeManager.id,
            }),
          );
        }
      }
    }
  }

  // ─── Phase 9: Reservation system (seat lock / PNR) ─────────────────────
  const chairUser = staffByUsername.get('chair')!;

  const a320SeatMap = await upsertBy(
    aircraftSeatMapRepo,
    { aircraftType: 'Airbus A320' },
    {
      aircraftType: 'Airbus A320',
      // rows 3-6 business 2-2 (16), 7-10 comfort 2-3 (20), 11-32 economy 2-3 (110).
      businessRowStart: 3,
      businessRowEnd: 6,
      businessColsLeft: ['A', 'B'],
      businessColsRight: ['C', 'D'],
      comfortRowStart: 7,
      comfortRowEnd: 10,
      comfortColsLeft: ['A', 'B'],
      comfortColsRight: ['C', 'D', 'E'],
      economyRowStart: 11,
      economyRowEnd: 32,
      economyColsLeft: ['A', 'B'],
      economyColsRight: ['C', 'D', 'E'],
      exitRows: [],
      updatedAt: new Date(),
    },
  );

  // Public checkout seat map — design-reference-v2/MD-80-seatmap.pdf
  // First 3–6: A B | E F; Business 7–11 and Economy 12–32: A B | D E F;
  // rear exit/galley omits 28A/B, 29A/B, 30A/B → 140 seats.
  const md80SeatMap = await upsertBy(
    aircraftSeatMapRepo,
    { aircraftType: 'MD-80' },
    {
      aircraftType: 'MD-80',
      firstRowStart: 3,
      firstRowEnd: 6,
      firstColsLeft: ['A', 'B'],
      firstColsRight: ['E', 'F'],
      businessRowStart: 7,
      businessRowEnd: 11,
      businessColsLeft: ['A', 'B'],
      businessColsRight: ['D', 'E', 'F'],
      economyRowStart: 12,
      economyRowEnd: 32,
      economyColsLeft: ['A', 'B'],
      economyColsRight: ['D', 'E', 'F'],
      excludedSeatCodes: ['28A', '28B', '29A', '29B', '30A', '30B'],
      exitRows: [19, 20],
      updatedAt: new Date(),
    },
    {
      firstRowStart: 3,
      firstRowEnd: 6,
      firstColsLeft: ['A', 'B'],
      firstColsRight: ['E', 'F'],
      businessRowStart: 7,
      businessRowEnd: 11,
      businessColsLeft: ['A', 'B'],
      businessColsRight: ['D', 'E', 'F'],
      economyRowStart: 12,
      economyRowEnd: 32,
      economyColsLeft: ['A', 'B'],
      economyColsRight: ['D', 'E', 'F'],
      excludedSeatCodes: ['28A', '28B', '29A', '29B', '30A', '30B'],
      exitRows: [19, 20],
      updatedAt: new Date(),
    },
  );

  // Phase: normalized aircraft catalog (AircraftDefinition/Cabin/Seat),
  // backfilled from the two seat maps above — same derivation the
  // production migration performs for pre-existing rows.
  const aircraftCatalogRepos = {
    aircraftSeatMapRepo,
    aircraftDefinitionRepo,
    aircraftCabinRepo,
    aircraftSeatRepo,
  };
  await seedAircraftCatalog(aircraftCatalogRepos, a320SeatMap);
  await seedAircraftCatalog(aircraftCatalogRepos, md80SeatMap);

  const demoInstance = await flightInstanceRepo.findOne({
    where: { flightId: flight.id, status: FlightInstanceStatus.SCHEDULED },
    order: { departureAt: 'ASC' },
  });
  if (demoInstance) {
    const existingPax = await passengerRepo
      .createQueryBuilder('p')
      .innerJoin('p.booking', 'b')
      .where('b."flightInstanceId" = :flightInstanceId', {
        flightInstanceId: demoInstance.id,
      })
      .getCount();
    if (existingPax === 0) {
      const demoPassengers: { name: string; seat: string }[] = [
        { name: 'نگار رضایی', seat: '3A' },
        { name: 'سارا احمدی', seat: '3E' },
        { name: 'کیوان حسینی', seat: '9A' },
        { name: 'یاسمن مرادی', seat: '9D' },
        { name: 'رضا احمدی', seat: '12B' },
      ];
      for (const p of demoPassengers) {
        const booking = await upsertBy(
          bookingRepo,
          { pnr: `BJDEMO${p.seat}` },
          {
            pnr: `BJDEMO${p.seat}`,
            flightInstanceId: demoInstance.id,
            channel: BookingChannel.SYSTEM,
            status: BookingStatus.TICKETED,
            priceIrr: 38_000_000n,
          },
          {
            flightInstanceId: demoInstance.id,
            channel: BookingChannel.SYSTEM,
            status: BookingStatus.TICKETED,
            priceIrr: 38_000_000n,
          },
        );
        const passenger = await passengerRepo.findOneBy({
          bookingId: booking.id,
          seatCode: p.seat,
        });
        if (!passenger) {
          await passengerRepo.save(
            passengerRepo.create({
              bookingId: booking.id,
              fullName: p.name,
              seatCode: p.seat,
            }),
          );
        }
        const sale = await ledgerEntryRepo.findOneBy({
          bookingId: booking.id,
          type: LedgerEntryType.SALE,
        });
        if (!sale) {
          await ledgerEntryRepo.save(
            ledgerEntryRepo.create({
              bookingId: booking.id,
              type: LedgerEntryType.SALE,
              signedAmountIrr: 38_000_000n,
            }),
          );
        }
      }
      // One demo managerial lock so the seat map/lock UI has real data —
      // already APPROVED (Phase 13D) with a real future hold-to-ticket
      // deadline, not the schema's placeholder migration defaults.
      // Idempotent: partial unique index blocks a second active lock on 4A.
      const activeDemoLock = await seatLockRepo
        .createQueryBuilder('l')
        .where('l.flightInstanceId = :fid', { fid: demoInstance.id })
        .andWhere('l.seatCode = :code', { code: '4A' })
        .andWhere('l.releasedAt IS NULL')
        .getOne();
      if (!activeDemoLock) {
        await seatLockRepo.save(
          seatLockRepo.create({
            flightInstanceId: demoInstance.id,
            seatCode: '4A',
            lockedById: chairUser.id,
            passengerName: 'رزرو مدیریتی — رئیس هیئت مدیره',
            reason: 'بازدید رسمی هیئت مدیره',
            classification: LockClassification.PAYABLE,
            requesterRank: Role.BOARD_CHAIR,
            approvalStatus: LockApprovalStatus.APPROVED,
            approvedById: staffByUsername.get('ceo')!.id,
            approvedAt: new Date(),
            expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
          }),
        );
      }
    }
  }

  // ─── Phase 8: Employee management (IT Manager) ────────────────────────
  const itManager = staffByUsername.get('itadmin')!;

  for (const p of PERMISSION_CATALOG) {
    await upsertBy(permissionRepo, { dept: p.dept, key: p.key }, p, {
      sectionLabelFa: p.sectionLabelFa,
      labelFa: p.labelFa,
    });
  }

  for (const s of INTERNAL_SERVICE_SEED) {
    await upsertBy(
      internalServiceRepo,
      { key: s.key },
      {
        key: s.key,
        nameFa: s.nameFa,
        uptimePct: s.uptimePct,
        enabled: true,
        updatedAt: new Date(),
      },
    );
  }
  // "استرداد آنلاین" starts disabled — matches the design mock's svcDefs.
  await internalServiceRepo.update(
    { key: 'refund' },
    { enabled: false, updatedAt: new Date() },
  );

  for (const s of EXTERNAL_SERVICE_SEED) {
    await upsertBy(
      externalServiceConfigRepo,
      { key: s.key },
      {
        key: s.key,
        nameFa: s.nameFa,
        provider: s.provider,
        endpoint: s.endpoint,
        enabled: true,
        updatedAt: new Date(),
      },
    );
  }
  // "نقشه و مسیریابی نشان" starts disabled — matches the design mock's extDefs.
  await externalServiceConfigRepo.update(
    { key: 'ext_neshan' },
    { enabled: false, updatedAt: new Date() },
  );

  await upsertBy(
    securityPolicyRepo,
    { id: 1 },
    { id: 1, updatedAt: new Date() },
  );

  const commercialEmployee = await upsertBy(
    userRepo,
    { username: 'sales.moradi' },
    {
      role: Role.EMPLOYEE,
      username: 'sales.moradi',
      passwordHash,
      fullName: 'یاسمن مرادی',
      dept: 'commercial',
      rank: 'کارشناس',
      referralScope: 'MANAGERS_ONLY',
      createdById: itManager.id,
      twoFactorEnabled: true,
      isActive: true,
      updatedAt: new Date(),
    },
    {
      dept: 'commercial',
      rank: 'کارشناس',
      isActive: true,
      updatedAt: new Date(),
    },
  );
  // Design-reference demo employee (screenshots: سمیرا احمدی / واحد بازرگانی).
  const designDemoEmployee = await upsertBy(
    userRepo,
    { username: 'com.ahmadi' },
    {
      role: Role.EMPLOYEE,
      username: 'com.ahmadi',
      passwordHash,
      fullName: 'سمیرا احمدی',
      dept: 'commercial',
      rank: 'کارشناس',
      referralScope: 'MANAGERS_ONLY',
      createdById: itManager.id,
      twoFactorEnabled: true,
      isActive: true,
      updatedAt: new Date(),
    },
    {
      role: Role.EMPLOYEE,
      fullName: 'سمیرا احمدی',
      dept: 'commercial',
      rank: 'کارشناس',
      twoFactorEnabled: true,
      isActive: true,
      updatedAt: new Date(),
    },
  );
  // Zero-permission employee — used by panels.e2e «no granted permissions» case.
  const emptyEmployee = await upsertBy(
    userRepo,
    { username: 'emp.none' },
    {
      role: Role.EMPLOYEE,
      username: 'emp.none',
      passwordHash,
      fullName: 'بدون دسترسی',
      dept: 'commercial',
      rank: 'کارشناس',
      referralScope: 'MANAGERS_ONLY',
      createdById: itManager.id,
      twoFactorEnabled: true,
      isActive: true,
      updatedAt: new Date(),
    },
    {
      role: Role.EMPLOYEE,
      dept: 'commercial',
      rank: 'کارشناس',
      twoFactorEnabled: true,
      isActive: true,
      updatedAt: new Date(),
    },
  );
  const financeEmployee = await upsertBy(
    userRepo,
    { username: 'fin.hosseini' },
    {
      role: Role.EMPLOYEE,
      username: 'fin.hosseini',
      passwordHash,
      fullName: 'کیوان حسینی',
      dept: 'finance',
      rank: 'کارشناس ارشد',
      referralScope: 'MANAGERS_ONLY',
      createdById: itManager.id,
      isActive: false,
      updatedAt: new Date(),
    },
  );
  for (const [employee, keys] of [
    // No fl_view — employee sidebar has no مدیریت پروازها (product).
    [commercialEmployee, ['ag_list', 'ct_list', 'ct_process']],
    // Design demo: agencies + reports + cartable (screenshot sidebar).
    [designDemoEmployee, ['ag_list', 'rp_sales', 'ct_list', 'ct_process']],
    [financeEmployee, ['rf_list']],
  ] as const) {
    const catalogDept = catalogDeptFor(employee.dept ?? '');
    const perms = await permissionRepo.find({
      where: {
        dept: catalogDept,
        key: In(keys as unknown as string[]),
      },
    });
    for (const perm of perms) {
      await upsertBy(
        employeePermissionRepo,
        { employeeId: employee.id, permissionId: perm.id },
        {
          employeeId: employee.id,
          permissionId: perm.id,
          grantedById: itManager.id,
        },
      );
    }
  }
  // Drop legacy fl_* grants from commercial demo (tab removed from employee nav).
  const flightPerms = await permissionRepo.find({
    where: { key: In(['fl_view', 'fl_manage']) },
    select: { id: true },
  });
  if (flightPerms.length > 0) {
    await employeePermissionRepo.delete({
      employeeId: In([commercialEmployee.id, designDemoEmployee.id]),
      permissionId: In(flightPerms.map((p) => p.id)),
    });
  }
  // Ensure emp.none stays permission-free even on re-seed.
  await employeePermissionRepo.delete({ employeeId: emptyEmployee.id });

  // Design-demo cartable + referral + activity feed for سمیرا احمدی screenshots.
  const designCartableCount = await cartableTaskRepo.count({
    where: { assigneeId: designDemoEmployee.id },
  });
  if (designCartableCount === 0) {
    for (const t of [
      {
        assigneeId: designDemoEmployee.id,
        category: CartableCategory.AGENCY,
        title: 'پیگیری درخواست عضویت آژانس نگین‌پرواز',
        description: 'کنترل مدارک و اطلاعات آژانس متقاضی.',
        senderId: commercialManager.id,
        senderLabelFa: 'رضا مرادی · مدیر بازرگانی',
        createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
      },
      {
        assigneeId: designDemoEmployee.id,
        category: CartableCategory.ADMIN,
        title: 'هماهنگی تسویه دوره‌ای آژانس‌ها',
        description: 'پیگیری افزایش اعتبار و تسویه ماه جاری.',
        senderLabelFa: 'مدیر بازرگانی',
        createdAt: new Date(Date.now() - 28 * 60 * 60 * 1000),
      },
      {
        assigneeId: designDemoEmployee.id,
        category: CartableCategory.MANAGER,
        title: 'صدور بلیط گروهی تهران–کیش',
        description: 'رزرو گروهی ۸ نفره برای مسیر تهران–کیش.',
        senderId: commercialManager.id,
        senderLabelFa: 'رضا مرادی · مدیر بازرگانی',
        createdAt: new Date(Date.now() - 40 * 60 * 60 * 1000),
      },
    ]) {
      await cartableTaskRepo.save(cartableTaskRepo.create(t));
    }
  }

  const designReferralCount = await managerReferralRecipientRepo.count({
    where: { recipientId: designDemoEmployee.id },
  });
  if (designReferralCount === 0) {
    const designReferral = await managerReferralRepo.save(
      managerReferralRepo.create({
        fromId: commercialManager.id,
        title: 'بررسی درخواست همکاری آژانس نگین پرواز',
        body: 'اولویت با بررسی مجوز بند «ب» است.',
        priority: ReferralPriority.HIGH,
        status: ReferralStatus.SENT,
      }),
    );
    await managerReferralRecipientRepo.save(
      managerReferralRecipientRepo.create({
        referralId: designReferral.id,
        recipientId: designDemoEmployee.id,
      }),
    );
    await cartableTaskRepo.save(
      cartableTaskRepo.create({
        assigneeId: designDemoEmployee.id,
        category: CartableCategory.MANAGER,
        title: designReferral.title,
        description: 'کنترل مدارک و اطلاعات آژانس متقاضی و ثبت گزارش',
        senderId: commercialManager.id,
        senderLabelFa: 'رضا مرادی · مدیر بازرگانی',
        sourceType: 'MANAGER_REFERRAL',
        sourceId: designReferral.id,
      }),
    );
  }

  const designActivityCount = await auditLogRepo
    .createQueryBuilder('a')
    .where('a.actorId = :actorId', { actorId: designDemoEmployee.id })
    .getCount();
  if (designActivityCount === 0) {
    for (const a of [
      {
        actorId: designDemoEmployee.id,
        actorRole: Role.EMPLOYEE,
        category: AuditCategory.AGENCY,
        action: 'تماس با آژانس پارسیان‌گشت',
        detail: 'پیگیری تسویه دوره‌ای و درخواست افزایش اعتبار.',
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      },
      {
        actorId: designDemoEmployee.id,
        actorRole: Role.EMPLOYEE,
        category: AuditCategory.RESERVATION,
        action: 'صدور ۸ بلیط گروهی',
        detail: 'رزرو گروهی مسیر تهران–کیش برای ۸ مسافر.',
        createdAt: new Date(Date.now() - 26 * 60 * 60 * 1000),
      },
    ]) {
      await auditLogRepo.save(auditLogRepo.create(a));
    }
  }

  const employeeCartableCount = await cartableTaskRepo.count({
    where: { assigneeId: commercialEmployee.id },
  });
  if (employeeCartableCount === 0) {
    for (const t of [
      {
        assigneeId: commercialEmployee.id,
        category: CartableCategory.ADMIN,
        title: 'بررسی قرارداد همکاری آژانس جدید',
        description:
          'نسخه پیش‌نویس قرارداد همکاری آژانس «پرواز آسیا» برای بازبینی واحد بازرگانی.',
        senderId: commercialManager.id,
        senderLabelFa: 'رضا مرادی · مدیر بازرگانی',
        createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
      },
      {
        assigneeId: commercialEmployee.id,
        category: CartableCategory.AGENCY,
        title: 'پیگیری درخواست عضویت آژانس کیان‌سیر',
        description:
          'مدارک آژانس کیان‌سیر تکمیل شده — لطفاً صحت مجوز را بررسی کنید.',
        senderLabelFa: 'ادمین سایت',
        createdAt: new Date(Date.now() - 20 * 60 * 60 * 1000),
      },
    ]) {
      await cartableTaskRepo.save(cartableTaskRepo.create(t));
    }
  }

  // ── Phase 10: airport catalog + flight-management seed ────────────────
  const AIRPORTS: Array<[string, string, string]> = [
    ['THR', 'تهران', 'Asia/Tehran'],
    ['MHD', 'مشهد', 'Asia/Tehran'],
    ['SYZ', 'شیراز', 'Asia/Tehran'],
    ['IFN', 'اصفهان', 'Asia/Tehran'],
    ['TBZ', 'تبریز', 'Asia/Tehran'],
    ['KIH', 'کیش', 'Asia/Tehran'],
    ['GSM', 'قشم', 'Asia/Tehran'],
    ['BND', 'بندرعباس', 'Asia/Tehran'],
    ['AWZ', 'اهواز', 'Asia/Tehran'],
    ['RAS', 'رشت', 'Asia/Tehran'],
    ['SRY', 'ساری', 'Asia/Tehran'],
    ['GBT', 'گرگان', 'Asia/Tehran'],
    ['KER', 'کرمان', 'Asia/Tehran'],
    ['KSH', 'کرمانشاه', 'Asia/Tehran'],
    ['OMH', 'ارومیه', 'Asia/Tehran'],
    ['ADU', 'اردبیل', 'Asia/Tehran'],
    ['ZAH', 'زاهدان', 'Asia/Tehran'],
    ['BUZ', 'بوشهر', 'Asia/Tehran'],
    ['AZD', 'یزد', 'Asia/Tehran'],
    ['PGU', 'عسلویه', 'Asia/Tehran'],
    ['DXB', 'دبی', 'Asia/Dubai'],
    ['IST', 'استانبول', 'Europe/Istanbul'],
    ['NJF', 'نجف', 'Asia/Baghdad'],
  ];
  for (const [code, cityFa, tz] of AIRPORTS) {
    const isInternational = code === 'DXB' || code === 'IST' || code === 'NJF';
    await upsertBy(
      airportRepo,
      { code },
      { code, cityFa, tz, isInternational },
      { cityFa, tz, isInternational },
    );
  }

  // Seeded per-route durations (the add-flight form has no arrival input).
  await routeRepo.update(
    { originCode: 'THR', destCode: 'DXB' },
    { durationMin: 180 },
  );

  // Base prices for existing instances so the active/completed tables have
  // the design's «قیمت پایه/نرخ اصلی» figures without fabricating margins.
  await flightInstanceRepo.update(
    { basePriceIrr: IsNull() },
    { basePriceIrr: 38_000_000n },
  );

  // A couple of future SCHEDULED instances for the پروازهای آینده sub-tab
  // (charter commitment set, plan/AI left empty for the E2E to exercise).
  const futureCount = await flightInstanceRepo.count({
    where: { departureAt: MoreThan(new Date(Date.now() + 8 * 24 * 3_600_000)) },
  });
  if (futureCount === 0) {
    for (const daysAhead of [12, 16]) {
      const dep = new Date(Date.now() + daysAhead * 24 * 3_600_000);
      await flightInstanceRepo.save(
        flightInstanceRepo.create({
          flightId: flight.id,
          departureAt: dep,
          arrivalAt: new Date(dep.getTime() + 3 * 3_600_000),
          capacity: 180,
          charterSeats: 60,
          status: FlightInstanceStatus.SCHEDULED,
          basePriceIrr: 38_000_000n,
        }),
      );
    }
  }

  // THR→MHD is the design's primary public search route (home popular routes,
  // نتایج پرواز.dc.html). Seed a few weeks of SCHEDULED inventory so search
  // returns real rows even before the frontend demo fallback kicks in.
  const thrMhdRoute = await upsertBy(
    routeRepo,
    { originCode: 'THR', destCode: 'MHD' },
    { originCode: 'THR', destCode: 'MHD', durationMin: 90 },
  );
  const thrMhdFlight = await upsertBy(
    flightRepo,
    { flightNo: 'BJ-100' },
    { flightNo: 'BJ-100', routeId: thrMhdRoute.id, aircraftType: 'MD-80' },
    { routeId: thrMhdRoute.id, aircraftType: 'MD-80' },
  );
  const thrMhdScheduled = await flightInstanceRepo.count({
    where: {
      flightId: thrMhdFlight.id,
      status: FlightInstanceStatus.SCHEDULED,
      departureAt: MoreThan(new Date()),
    },
  });
  if (thrMhdScheduled === 0) {
    for (let d = 1; d <= 21; d++) {
      for (const [hour, minute] of [
        [5, 30],
        [9, 0],
        [13, 10],
        [20, 0],
      ] as const) {
        const departureAt = new Date();
        departureAt.setUTCDate(departureAt.getUTCDate() + d);
        departureAt.setUTCHours(hour, minute, 0, 0);
        await flightInstanceRepo.save(
          flightInstanceRepo.create({
            flightId: thrMhdFlight.id,
            departureAt,
            arrivalAt: new Date(departureAt.getTime() + 90 * 60_000),
            capacity: 180,
            charterSeats: 60,
            status: FlightInstanceStatus.SCHEDULED,
            basePriceIrr: 16_000_000n,
          }),
        );
      }
    }
  }

  console.log('Seed complete.');
  console.log(`Staff dev password (all roles): ${STAFF_PASSWORD}`);
}

dataSource
  .initialize()
  .then(main)
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await dataSource.destroy();
  });
