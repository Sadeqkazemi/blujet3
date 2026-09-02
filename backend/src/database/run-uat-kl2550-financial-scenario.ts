import 'dotenv/config';
import 'reflect-metadata';
import * as argon2 from 'argon2';
import { writeFile } from 'node:fs/promises';
import { NestFactory } from '@nestjs/core';
import { DataSource, In, IsNull } from 'typeorm';
import {
  getSandboxOtpCode,
  isSandboxAuthEnabled,
} from '../common/sandbox-auth';
import { resolveUatSharedPassword } from '../common/uat-shared-password';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { AircraftSeatMap } from './entities/aircraft-seat-map.entity';
import { AuditLog } from './entities/audit-log.entity';
import { Booking } from './entities/booking.entity';
import { FlightInstance } from './entities/flight-instance.entity';
import { LedgerEntry } from './entities/ledger-entry.entity';
import { Passenger } from './entities/passenger.entity';
import { RefundRequest } from './entities/refund-request.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { User } from './entities/user.entity';
import { WalletEntry } from './entities/wallet-entry.entity';
import { WalletEntryType } from './enums';
import { getTemporaryPanelAccessState } from './temporary-panel-accounts';
import { BookingService } from '../modules/booking-engine/booking.service';
import { SearchService } from '../modules/booking-engine/search.service';
import { FinanceReportsService } from '../modules/finance-reports/finance-reports.service';
import { FinanceExportFormat } from '../modules/finance-reports/dto/finance-report-query.dto';
import { resolveAircraftType } from '../modules/flights/aircraft-type.util';
import { RefundsService } from '../modules/refunds/refunds.service';
import {
  enumerateSeats,
  type SeatCell,
} from '../modules/reservation/seat-layout';
import { StepUpService } from '../modules/auth/step-up.service';
import { AuditService } from '../modules/audit/audit.service';
import {
  selectRefundSeatCodes,
  UAT_KL2550_BOOKING_KEY_PREFIX as BOOKING_KEY_PREFIX,
  UAT_KL2550_CABIN_CAPACITY as EXPECTED_CABIN_CAPACITY,
  UAT_KL2550_CAPACITY as TARGET_CAPACITY,
  UAT_KL2550_CONFIRMATION as CONFIRMATION,
  UAT_KL2550_DEPARTURE as TARGET_DEPARTURE,
  UAT_KL2550_DESTINATION as TARGET_DESTINATION,
  UAT_KL2550_EXPORT_FILENAME as EXPORT_FILENAME,
  UAT_KL2550_FLIGHT_NO as TARGET_FLIGHT_NO,
  UAT_KL2550_ORIGIN as TARGET_ORIGIN,
  validateScenarioTarget,
} from './uat-kl2550-financial-scenario.contract';

const SYNTHETIC_IBAN = 'IR820170000000332211009900';

type ScenarioBookingDetail = Awaited<
  ReturnType<BookingService['createBooking']>
>;

function scenarioKeyForSeat(seatCode: string, attempt: number): string {
  return `${BOOKING_KEY_PREFIX}-${seatCode.toLowerCase()}-attempt-${attempt}`;
}

function actorFor(user: User): AuthenticatedUser {
  return { id: user.id, role: user.role, fullName: user.fullName };
}

async function walletBalance(dataSource: DataSource, userId: string) {
  const row = await dataSource
    .createQueryBuilder(WalletEntry, 'w')
    .select('COALESCE(SUM(w."signedAmountIrr"), 0)', 'sum')
    .where('w."userId" = :userId', { userId })
    .getRawOne<{ sum: string }>();
  return BigInt(row?.sum ?? '0');
}

async function recoverExactUatStaffAccess(
  dataSource: DataSource,
  backupRef: string,
): Promise<{ siteAdmin: User; finance: User }> {
  const sharedPassword = resolveUatSharedPassword();
  const usernames = ['uat.siteadmin', 'uat.finance'];
  return dataSource.transaction(async (manager) => {
    const userRepo = manager.getRepository(User);
    const users = await userRepo.find({ where: { username: In(usernames) } });
    const byUsername = new Map(users.map((user) => [user.username, user]));
    const siteAdmin = byUsername.get('uat.siteadmin');
    const finance = byUsername.get('uat.finance');
    if (
      !siteAdmin ||
      siteAdmin.role !== 'SITE_ADMIN' ||
      !finance ||
      finance.role !== 'FINANCE_MANAGER'
    ) {
      throw new Error(
        'Scenario refused: exact UAT finance actors are missing.',
      );
    }
    const now = new Date();
    for (const user of [siteAdmin, finance]) {
      if (
        !user.isActive ||
        user.deletedAt !== null ||
        getTemporaryPanelAccessState(user, now) !== 'ACTIVE'
      ) {
        throw new Error(
          `Scenario refused: ${user.username} is not an active, unexpired temporary account.`,
        );
      }
      user.passwordHash = await argon2.hash(sharedPassword);
      user.mustChangePassword = false;
      user.updatedAt = now;
      await userRepo.save(user);
      await manager.getRepository(AuditLog).save(
        manager.getRepository(AuditLog).create({
          actorId: user.id,
          actorRole: user.role,
          category: 'SECURITY',
          action: 'UAT KL2550 finance access recovery',
          detail: `Exact temporary access recovered for ${user.username}; password material was not logged.`,
          entityType: 'User',
          entityId: user.id,
          metadata: { source: BOOKING_KEY_PREFIX, backupRef },
          requestId: null,
        }),
      );
    }
    await manager
      .getRepository(RefreshToken)
      .update(
        { userId: In([siteAdmin.id, finance.id]), revokedAt: IsNull() },
        { revokedAt: now },
      );
    return { siteAdmin, finance };
  });
}

async function scenarioBookingsForSeat(
  dataSource: DataSource,
  flightInstanceId: string,
  seatCode: string,
): Promise<Booking[]> {
  return dataSource
    .getRepository(Booking)
    .createQueryBuilder('b')
    .innerJoin(Passenger, 'p', 'p."bookingId" = b.id')
    .where('b."flightInstanceId" = :flightInstanceId', { flightInstanceId })
    .andWhere('p."seatCode" = :seatCode', { seatCode })
    .andWhere('b."idempotencyKey" LIKE :prefix', {
      prefix: `${BOOKING_KEY_PREFIX}-%`,
    })
    .orderBy('b."createdAt"', 'DESC')
    .getMany();
}

async function reverseUnusedExpiredFunding(
  dataSource: DataSource,
  booking: Booking,
): Promise<void> {
  const walletRepo = dataSource.getRepository(WalletEntry);
  const fundingId = `${BOOKING_KEY_PREFIX}-fund-${booking.id}`;
  const reversalId = `${BOOKING_KEY_PREFIX}-fund-reversal-${booking.id}`;
  const [funding, purchase, reversal] = await Promise.all([
    walletRepo.findOneBy({ id: fundingId }),
    walletRepo.findOneBy({ bookingId: booking.id, type: 'PURCHASE' }),
    walletRepo.findOneBy({ id: reversalId }),
  ]);
  if (funding && !purchase && !reversal) {
    await walletRepo.save(
      walletRepo.create({
        id: reversalId,
        userId: funding.userId,
        type: WalletEntryType.ADJUST,
        signedAmountIrr: -funding.signedAmountIrr,
        bookingId: booking.id,
      }),
    );
  }
}

async function fundExactBookingPrice(
  dataSource: DataSource,
  customerId: string,
  bookingId: string,
  priceIrr: bigint,
): Promise<void> {
  const repo = dataSource.getRepository(WalletEntry);
  const id = `${BOOKING_KEY_PREFIX}-fund-${bookingId}`;
  if (await repo.exist({ where: { id } })) return;
  await repo.save(
    repo.create({
      id,
      userId: customerId,
      type: WalletEntryType.ADJUST,
      signedAmountIrr: priceIrr,
      bookingId,
    }),
  );
}

async function ensureSeatTicketed(input: {
  dataSource: DataSource;
  bookingService: BookingService;
  searchService: SearchService;
  actor: AuthenticatedUser;
  flightInstanceId: string;
  seat: SeatCell;
}): Promise<ScenarioBookingDetail> {
  const prior = await scenarioBookingsForSeat(
    input.dataSource,
    input.flightInstanceId,
    input.seat.seatCode,
  );
  const completed = prior.find((booking) =>
    ['TICKETED', 'REFUNDED'].includes(booking.status),
  );
  if (completed) return input.bookingService.getById(completed.id, input.actor);

  const held = prior.find(
    (booking) =>
      booking.status === 'HELD' &&
      booking.holdExpiresAt !== null &&
      booking.holdExpiresAt > new Date(),
  );
  for (const booking of prior.filter(
    (candidate) =>
      candidate.status === 'EXPIRED' ||
      (candidate.status === 'HELD' &&
        candidate.holdExpiresAt !== null &&
        candidate.holdExpiresAt <= new Date()),
  )) {
    await reverseUnusedExpiredFunding(input.dataSource, booking);
  }

  let detail: ScenarioBookingDetail;
  if (held) {
    detail = await input.bookingService.getById(held.id, input.actor);
  } else {
    const attempt = prior.length + 1;
    detail = await input.bookingService.createBooking(
      input.actor,
      {
        flightInstanceId: input.flightInstanceId,
        cabin: input.seat.cabin,
        passengers: [
          {
            fullName: `UAT KL2550 ${input.seat.cabin} ${input.seat.seatCode}`,
            passengerType: 'ADULT',
            birthDate: '1990-01-01',
            seatCode: input.seat.seatCode,
          },
        ],
      },
      scenarioKeyForSeat(input.seat.seatCode, attempt),
    );
  }
  if (detail.status !== 'HELD') {
    throw new Error(
      `Scenario refused: seat ${input.seat.seatCode} did not enter HELD state.`,
    );
  }
  const locked = await input.searchService.takenSeatCodes(
    input.flightInstanceId,
  );
  if (!locked.has(input.seat.seatCode)) {
    throw new Error(
      `Scenario refused: HELD seat ${input.seat.seatCode} was not locked.`,
    );
  }

  await fundExactBookingPrice(
    input.dataSource,
    input.actor.id,
    detail.id,
    detail.priceIrr,
  );
  const payment = await input.bookingService.pay(
    detail.id,
    input.actor,
    { confirmedPriceIrr: detail.priceIrr, paymentMethod: 'WALLET' },
    `${BOOKING_KEY_PREFIX}-pay-${detail.id}`,
  );
  if (payment.priceChanged) {
    throw new Error(
      `Scenario refused: price changed while paying seat ${input.seat.seatCode}.`,
    );
  }
  if (payment.booking.status !== 'TICKETED') {
    throw new Error(
      `Scenario refused: seat ${input.seat.seatCode} was not ticketed.`,
    );
  }
  return payment.booking;
}

async function refundBooking(input: {
  dataSource: DataSource;
  refunds: RefundsService;
  stepUp: StepUpService;
  customer: AuthenticatedUser;
  siteAdmin: AuthenticatedUser;
  finance: AuthenticatedUser;
  bookingId: string;
}) {
  const refundRepo = input.dataSource.getRepository(RefundRequest);
  let request = await refundRepo
    .createQueryBuilder('r')
    .where('r."bookingId" = :bookingId', { bookingId: input.bookingId })
    .getOne();
  if (!request) {
    await input.refunds.submitFromCustomer(input.customer, {
      bookingId: input.bookingId,
      iban: SYNTHETIC_IBAN,
    });
    request = await refundRepo
      .createQueryBuilder('r')
      .where('r."bookingId" = :bookingId', { bookingId: input.bookingId })
      .getOneOrFail();
  }
  if (request.status === 'SUBMITTED' || request.status === 'REVIEW') {
    await input.refunds.refer(input.siteAdmin, request.id, input.finance.id);
    request = await refundRepo
      .createQueryBuilder('r')
      .where('r.id = :id', { id: request.id })
      .getOneOrFail();
  }
  if (request.status === 'FINANCE') {
    const challenge = await input.stepUp.request(
      input.finance,
      'REFUND_PAYOUT',
    );
    await input.refunds.pay(
      input.finance,
      request.id,
      challenge.challengeId,
      getSandboxOtpCode(),
    );
    request = await refundRepo
      .createQueryBuilder('r')
      .where('r.id = :id', { id: request.id })
      .getOneOrFail();
  }
  if (request.status !== 'PAID') {
    throw new Error(
      `Scenario refused: refund ${request.id} did not reach PAID.`,
    );
  }
  return request;
}

async function main(): Promise<void> {
  const flightInstanceId = process.env.UAT_KL2550_INSTANCE_ID?.trim();
  if (!process.argv.includes('--execute')) {
    process.stdout.write(
      `${JSON.stringify({
        mode: 'DRY_RUN',
        flightNo: TARGET_FLIGHT_NO,
        flightInstanceId: flightInstanceId ?? null,
        passengers: TARGET_CAPACITY,
        refunds: 10,
        cabins: EXPECTED_CABIN_CAPACITY,
      })}\n`,
    );
    return;
  }
  if (process.env.NODE_ENV !== 'production') {
    throw new Error('Scenario refused: NODE_ENV must equal production.');
  }
  if (!isSandboxAuthEnabled()) {
    throw new Error(
      'Scenario refused: AUTH_SANDBOX_ENABLED must explicitly equal true.',
    );
  }
  if (process.env.UAT_KL2550_FINANCIAL_CONFIRM !== CONFIRMATION) {
    throw new Error(
      `Scenario refused: UAT_KL2550_FINANCIAL_CONFIRM must equal ${CONFIRMATION}.`,
    );
  }
  if (!flightInstanceId) {
    throw new Error('Scenario refused: UAT_KL2550_INSTANCE_ID is required.');
  }
  const backupRef = process.env.UAT_KL2550_BACKUP_REF?.trim();
  if (!backupRef?.startsWith('/root/blujet-uat-before-kl2550-')) {
    throw new Error(
      'Scenario refused: a verified UAT backup reference is required.',
    );
  }
  const exportPath =
    process.env.UAT_KL2550_EXPORT_PATH?.trim() ??
    `/app/backups/${EXPORT_FILENAME}`;
  if (exportPath !== `/app/backups/${EXPORT_FILENAME}`) {
    throw new Error(
      'Scenario refused: export path is not the approved target.',
    );
  }

  // Importing AppModule validates the full runtime environment, so defer it
  // until after dry-run output and every fail-closed execution guard.
  const { AppModule } = await import('../app.module.js');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  try {
    const dataSource = app.get(DataSource);
    const bookingService = app.get(BookingService);
    const searchService = app.get(SearchService);
    const refunds = app.get(RefundsService);
    const stepUp = app.get(StepUpService);
    const financeReports = app.get(FinanceReportsService);
    const audit = app.get(AuditService);

    const instance = await dataSource
      .getRepository(FlightInstance)
      .createQueryBuilder('fi')
      .leftJoinAndSelect('fi.flight', 'flight')
      .leftJoinAndSelect('flight.route', 'route')
      .where('fi.id = :id', { id: flightInstanceId })
      .getOne();
    if (!instance)
      throw new Error('Scenario refused: target flight is missing.');
    const seatMap = await dataSource.getRepository(AircraftSeatMap).findOneBy({
      aircraftType: resolveAircraftType(instance),
    });
    if (!seatMap)
      throw new Error('Scenario refused: target seat map is missing.');
    const seats = enumerateSeats(seatMap);
    validateScenarioTarget(instance, seats);

    const actors = await recoverExactUatStaffAccess(dataSource, backupRef);
    const customer = await dataSource.getRepository(User).findOneBy({
      username: 'uat.customer',
    });
    if (
      !customer ||
      customer.role !== 'USER' ||
      !customer.isActive ||
      customer.deletedAt !== null
    ) {
      throw new Error('Scenario refused: exact UAT customer is unavailable.');
    }
    const customerActor = actorFor(customer);
    const siteAdminActor = actorFor(actors.siteAdmin);
    const financeActor = actorFor(actors.finance);

    const unrelatedActiveBookings = await dataSource
      .getRepository(Booking)
      .createQueryBuilder('b')
      .where('b."flightInstanceId" = :flightInstanceId', { flightInstanceId })
      .andWhere(
        `(b.status IN ('PAID','TICKETED') OR (b.status = 'HELD' AND b."holdExpiresAt" > NOW()))`,
      )
      .andWhere(
        '(b."idempotencyKey" IS NULL OR b."idempotencyKey" NOT LIKE :prefix)',
        { prefix: `${BOOKING_KEY_PREFIX}-%` },
      )
      .getCount();
    if (unrelatedActiveBookings > 0) {
      throw new Error(
        `Scenario refused: ${unrelatedActiveBookings} unrelated active booking(s) exist on KL2550.`,
      );
    }

    const walletBefore = await walletBalance(dataSource, customer.id);
    const bookingBySeat = new Map<string, ScenarioBookingDetail>();
    for (const seat of seats) {
      const booking = await ensureSeatTicketed({
        dataSource,
        bookingService,
        searchService,
        actor: customerActor,
        flightInstanceId,
        seat,
      });
      bookingBySeat.set(seat.seatCode, booking);
    }

    const soldOutSeatCodes =
      await searchService.takenSeatCodes(flightInstanceId);
    const alreadyRefunded = [...bookingBySeat.values()].filter(
      (booking) => booking.status === 'REFUNDED',
    ).length;
    const expectedOccupiedBeforeRefundStep = TARGET_CAPACITY - alreadyRefunded;
    if (
      soldOutSeatCodes.size !== expectedOccupiedBeforeRefundStep ||
      seats.filter((seat) => !soldOutSeatCodes.has(seat.seatCode)).length !==
        alreadyRefunded
    ) {
      throw new Error(
        `Scenario refused: pre-refund inventory returned ${soldOutSeatCodes.size}/${expectedOccupiedBeforeRefundStep}.`,
      );
    }
    const walletAfterSales = await walletBalance(dataSource, customer.id);

    const refundSeats = selectRefundSeatCodes(seats);
    const refundRows: RefundRequest[] = [];
    for (const seatCode of refundSeats) {
      const booking = bookingBySeat.get(seatCode);
      if (!booking) {
        throw new Error(
          `Scenario refused: refund booking for ${seatCode} is missing.`,
        );
      }
      refundRows.push(
        await refundBooking({
          dataSource,
          refunds,
          stepUp,
          customer: customerActor,
          siteAdmin: siteAdminActor,
          finance: financeActor,
          bookingId: booking.id,
        }),
      );
    }

    const availableAfterRefunds =
      await searchService.takenSeatCodes(flightInstanceId);
    if (availableAfterRefunds.size !== TARGET_CAPACITY - 10) {
      throw new Error(
        `Scenario refused: post-refund inventory returned ${availableAfterRefunds.size}/${TARGET_CAPACITY - 10} occupied seats.`,
      );
    }

    const scenarioBookings = await dataSource
      .getRepository(Booking)
      .createQueryBuilder('b')
      .where('b."flightInstanceId" = :flightInstanceId', { flightInstanceId })
      .andWhere('b."idempotencyKey" LIKE :prefix', {
        prefix: `${BOOKING_KEY_PREFIX}-%`,
      })
      .andWhere("b.status IN ('TICKETED','REFUNDED')")
      .getMany();
    const saleEntries = await dataSource.getRepository(LedgerEntry).find({
      where: {
        bookingId: In(scenarioBookings.map((booking) => booking.id)),
        type: 'SALE',
      },
    });
    const refundEntries = await dataSource.getRepository(LedgerEntry).find({
      where: {
        bookingId: In(refundRows.map((request) => request.bookingId)),
        type: 'REFUND',
      },
    });
    const purchases = await dataSource.getRepository(WalletEntry).find({
      where: {
        bookingId: In(scenarioBookings.map((booking) => booking.id)),
        type: 'PURCHASE',
      },
    });
    const scenarioFunding = await dataSource
      .getRepository(WalletEntry)
      .createQueryBuilder('w')
      .where('w."userId" = :userId', { userId: customer.id })
      .andWhere('w.id LIKE :prefix', {
        prefix: `${BOOKING_KEY_PREFIX}-fund-%`,
      })
      .getMany();
    const saleTotalIrr = saleEntries.reduce(
      (sum, entry) => sum + entry.signedAmountIrr,
      0n,
    );
    const refundTotalIrr = refundEntries.reduce(
      (sum, entry) => sum + entry.signedAmountIrr,
      0n,
    );
    const purchaseTotalIrr = purchases.reduce(
      (sum, entry) => sum + entry.signedAmountIrr,
      0n,
    );
    const fundingTotalIrr = scenarioFunding.reduce(
      (sum, entry) => sum + entry.signedAmountIrr,
      0n,
    );
    const walletAfter = await walletBalance(dataSource, customer.id);
    const ticketed = scenarioBookings.filter(
      (booking) => booking.status === 'TICKETED',
    ).length;
    const refunded = scenarioBookings.filter(
      (booking) => booking.status === 'REFUNDED',
    ).length;
    if (
      scenarioBookings.length !== TARGET_CAPACITY ||
      saleEntries.length !== TARGET_CAPACITY ||
      purchases.length !== TARGET_CAPACITY ||
      refundEntries.length !== 10 ||
      ticketed !== TARGET_CAPACITY - 10 ||
      refunded !== 10 ||
      purchaseTotalIrr !== -saleTotalIrr ||
      fundingTotalIrr !== saleTotalIrr ||
      walletAfter !== walletAfterSales
    ) {
      throw new Error(
        'Scenario refused: final booking, wallet, or double-entry invariants failed.',
      );
    }

    const report = await financeReports.salesReport({
      flightInstanceId,
      limit: 250,
    });
    const csv = await financeReports.salesExport(
      { flightInstanceId },
      FinanceExportFormat.CSV,
    );
    if (typeof csv.body !== 'string') {
      throw new Error('Scenario refused: finance CSV was not generated.');
    }
    await writeFile(exportPath, csv.body, { encoding: 'utf8', mode: 0o600 });

    const cabinSummary = (
      Object.keys(EXPECTED_CABIN_CAPACITY) as SeatCell['cabin'][]
    )
      .filter((cabin) => EXPECTED_CABIN_CAPACITY[cabin] > 0)
      .map((cabin) => {
        const cabinBookings = scenarioBookings.filter(
          (booking) => booking.cabin === cabin,
        );
        return {
          cabin,
          sold: cabinBookings.length,
          refunded: cabinBookings.filter(
            (booking) => booking.status === 'REFUNDED',
          ).length,
          saleIrr: saleEntries
            .filter((entry) =>
              cabinBookings.some((booking) => booking.id === entry.bookingId),
            )
            .reduce((sum, entry) => sum + entry.signedAmountIrr, 0n)
            .toString(),
        };
      });
    const result = {
      success: true,
      scenario: BOOKING_KEY_PREFIX,
      backupRef,
      exportPath,
      flight: {
        flightInstanceId,
        flightNo: TARGET_FLIGHT_NO,
        route: `${TARGET_ORIGIN}-${TARGET_DESTINATION}`,
        departureAt: TARGET_DEPARTURE,
        capacity: TARGET_CAPACITY,
      },
      inventory: {
        soldOutBeforeRefunds: TARGET_CAPACITY,
        observedOccupiedBeforeRefundStep: soldOutSeatCodes.size,
        refundsAlreadyAppliedAtStart: alreadyRefunded,
        occupiedAfterRefunds: availableAfterRefunds.size,
        releasedByRefunds: 10,
      },
      bookings: {
        total: scenarioBookings.length,
        ticketed,
        refunded,
        byCabin: cabinSummary,
      },
      wallet: {
        beforeIrr: walletBefore.toString(),
        fundingEntries: scenarioFunding.length,
        fundingTotalIrr: fundingTotalIrr.toString(),
        purchaseEntries: purchases.length,
        purchaseTotalIrr: purchaseTotalIrr.toString(),
        afterIrr: walletAfter.toString(),
      },
      ledger: {
        saleEntries: saleEntries.length,
        grossSaleIrr: saleTotalIrr.toString(),
        refundEntries: refundEntries.length,
        refundIrr: refundTotalIrr.toString(),
        netLedgerIrr: (saleTotalIrr + refundTotalIrr).toString(),
      },
      refunds: refundRows.map((request) => ({
        trackingCode: request.trackingCode,
        bookingId: request.bookingId,
        penaltyPct: request.penaltyPct,
        refundableIrr: request.refundableIrr.toString(),
        status: request.status,
      })),
      financeReport: report.summary,
    };
    await audit.record({
      actorId: actors.finance.id,
      actorRole: actors.finance.role,
      category: 'FINANCE',
      action: 'UAT KL2550 financial scenario completed',
      detail:
        'All 140 KL2550 seats were wallet-paid, lock-verified, and ten synthetic tickets were refunded.',
      entityType: 'FlightInstance',
      entityId: flightInstanceId,
      metadata: result,
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
