import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { DataSource } from 'typeorm';
import { dataSourceOptions } from '../src/database/data-source.options';
import { runSandboxActiveFlightPurge } from '../src/database/sandbox-active-flight-purge';
import { Route } from '../src/database/entities/route.entity';
import { Flight } from '../src/database/entities/flight.entity';
import { FlightInstance } from '../src/database/entities/flight-instance.entity';
import { FlightReview } from '../src/database/entities/flight-review.entity';
import { Booking } from '../src/database/entities/booking.entity';
import { Passenger } from '../src/database/entities/passenger.entity';
import { SeatLock } from '../src/database/entities/seat-lock.entity';
import { CabinFare } from '../src/database/entities/cabin-fare.entity';
import { CharterCommitment } from '../src/database/entities/charter-commitment.entity';
import { AuditLog } from '../src/database/entities/audit-log.entity';
import { User } from '../src/database/entities/user.entity';
import {
  FlightReviewDecision,
  FlightReviewStage,
} from '../src/database/enums';

/**
 * Task #33 — this suite calls runSandboxActiveFlightPurge() directly
 * against a standalone DataSource (never the CLI, never a child process,
 * never `--all-flights`). Every fixture is a uniquely-named flight this
 * suite creates itself; nothing seeded or created by another test file is
 * ever targeted, so this can never alter or delete the real dev/UAT/
 * production environment — same posture as every other e2e suite in this
 * repo writing to the disposable blujet_test database.
 */
describe('Sandbox active-flight purge — direct DataSource, task #33 (e2e)', () => {
  let dataSource: DataSource;
  let actorId: string;
  const sentinelDir = path.join(
    process.cwd(),
    `sandbox-purge-logs-test-${crypto.randomUUID().slice(0, 8)}`,
  );

  // FlightInstance.findOneBy(...) hits the known TS2589 "excessively deep"
  // compiler issue (self-referential JsonValue on its jsonb columns) —
  // createQueryBuilder() is the established workaround in this codebase.
  async function flightInstanceExists(id: string): Promise<boolean> {
    const row = await dataSource
      .getRepository(FlightInstance)
      .createQueryBuilder('fi')
      .where('fi.id = :id', { id })
      .getOne();
    return row !== null;
  }

  // Same TS2589 workaround — Booking also carries jsonb columns.
  async function bookingExists(id: string): Promise<boolean> {
    const row = await dataSource
      .getRepository(Booking)
      .createQueryBuilder('b')
      .where('b.id = :id', { id })
      .getOne();
    return row !== null;
  }

  beforeAll(async () => {
    // Additive only — never delete/unset (that's the pre-existing landmine
    // some older test files unsafely trip; this suite never touches it if
    // it's already 'true', which it is under the standard e2e bootstrap).
    process.env.AUTH_SANDBOX_ENABLED ??= 'true';

    dataSource = new DataSource(dataSourceOptions);
    await dataSource.initialize();
    const itAdmin = await dataSource
      .getRepository(User)
      .findOneByOrFail({ username: 'itadmin' });
    actorId = itAdmin.id;
  });

  afterAll(async () => {
    fs.rmSync(sentinelDir, { recursive: true, force: true });
    await dataSource.destroy();
  });

  async function buildFixtureFlight() {
    const suffix = crypto.randomUUID().slice(0, 8);
    const routeRepo = dataSource.getRepository(Route);
    const route = await routeRepo.save(
      routeRepo.create({
        originCode: 'THR',
        destCode: suffix.slice(0, 3).toUpperCase(),
        durationMin: 60,
      }),
    );
    const flightRepo = dataSource.getRepository(Flight);
    const flight = await flightRepo.save(
      flightRepo.create({
        flightNo: `SBX-${suffix}`,
        routeId: route.id,
        aircraftType: 'SandboxPurgeTestJet',
      }),
    );
    const instanceRepo = dataSource.getRepository(FlightInstance);
    const departureAt = new Date(Date.now() + 40 * 24 * 60 * 60 * 1000);
    const instance = await instanceRepo.save(
      instanceRepo.create({
        flightId: flight.id,
        departureAt,
        arrivalAt: new Date(departureAt.getTime() + 60 * 60 * 1000),
        capacity: 6,
        status: 'SCHEDULED',
        cabinCapacities: [{ cabin: 'ECONOMY', seats: 6 }],
      }),
    );
    const bookingRepo = dataSource.getRepository(Booking);
    const booking = await bookingRepo.save(
      bookingRepo.create({
        pnr: `SBX${suffix.slice(0, 6).toUpperCase()}`,
        flightInstanceId: instance.id,
        channel: 'SYSTEM',
        status: 'PAID',
        priceIrr: 1_000_000n,
        cabin: 'ECONOMY',
      }),
    );
    await dataSource.getRepository(Passenger).save(
      dataSource.getRepository(Passenger).create({
        bookingId: booking.id,
        fullName: 'مسافر تست پاکسازی sandbox',
      }),
    );
    await dataSource.getRepository(SeatLock).save(
      dataSource.getRepository(SeatLock).create({
        flightInstanceId: instance.id,
        seatCode: '2A',
        lockedById: actorId,
        bookingId: booking.id,
      }),
    );
    await dataSource.getRepository(CabinFare).save(
      dataSource.getRepository(CabinFare).create({
        flightInstanceId: instance.id,
        cabin: 'ECONOMY',
        priceIrr: 1_000_000n,
        updatedAt: new Date(),
      }),
    );
    await dataSource.getRepository(CharterCommitment).save(
      dataSource.getRepository(CharterCommitment).create({
        flightInstanceId: instance.id,
        cabin: 'ECONOMY',
        seats: 1,
        contractPriceIrr: 500_000n,
        createdById: actorId,
        createdAt: new Date(),
      }),
    );
    await dataSource.getRepository(FlightReview).save(
      dataSource.getRepository(FlightReview).create({
        flightInstanceId: instance.id,
        stage: FlightReviewStage.OPERATIONS,
        decision: FlightReviewDecision.APPROVED,
        comment: 'تأیید آزمایشی پیش از پاک‌سازی',
        reviewedByUserId: actorId,
        reviewedAt: new Date(),
        expectedVersion: null,
      }),
    );
    return { route, flight, instance, booking };
  }

  it('dry run reports accurate counts across flights/instances/reservations/inventory/seatLocks/commitments and deletes nothing', async () => {
    const { flight, instance, booking } = await buildFixtureFlight();

    const report = await runSandboxActiveFlightPurge(dataSource, {
      flightNos: [flight.flightNo],
      all: false,
      execute: false,
    });

    expect(report.mode).toBe('DRY_RUN');
    expect(report.counts).toEqual({
      flights: 1,
      instances: 1,
      reservations: 1,
      inventory: 1,
      seatLocks: 1,
      commitments: 1,
    });

    expect(
      await dataSource.getRepository(Flight).findOneBy({ id: flight.id }),
    ).not.toBeNull();
    expect(await flightInstanceExists(instance.id)).toBe(true);
    expect(await bookingExists(booking.id)).toBe(true);
  });

  it('execute deletes the full dependency chain in the correct order, preserves the shared route, and writes an audit log + a sentinel file', async () => {
    const { route, flight, instance, booking } = await buildFixtureFlight();

    const report = await runSandboxActiveFlightPurge(dataSource, {
      flightNos: [flight.flightNo],
      all: false,
      execute: true,
      actorId,
      sentinelDir,
    });

    expect(report.mode).toBe('SANDBOX_PURGE_EXECUTED');
    expect(report.counts.flights).toBe(1);
    expect(report.counts.reservations).toBe(1);

    expect(
      await dataSource.getRepository(Flight).findOneBy({ id: flight.id }),
    ).toBeNull();
    expect(await flightInstanceExists(instance.id)).toBe(false);
    expect(await bookingExists(booking.id)).toBe(false);
    expect(
      await dataSource
        .getRepository(Passenger)
        .findOneBy({ bookingId: booking.id }),
    ).toBeNull();
    expect(
      await dataSource
        .getRepository(SeatLock)
        .findOneBy({ flightInstanceId: instance.id }),
    ).toBeNull();
    expect(
      await dataSource
        .getRepository(CabinFare)
        .findOneBy({ flightInstanceId: instance.id }),
    ).toBeNull();
    expect(
      await dataSource
        .getRepository(CharterCommitment)
        .findOneBy({ flightInstanceId: instance.id }),
    ).toBeNull();
    expect(
      await dataSource
        .getRepository(FlightReview)
        .findOneBy({ flightInstanceId: instance.id }),
    ).toBeNull();

    // Reference data shared across flights is never touched.
    expect(
      await dataSource.getRepository(Route).findOneBy({ id: route.id }),
    ).not.toBeNull();

    const auditRow = await dataSource
      .getRepository(AuditLog)
      .createQueryBuilder('a')
      .where('a.entityType = :t', { t: 'Flight' })
      .andWhere('a.entityId = :id', { id: flight.id })
      .getOne();
    expect(auditRow).not.toBeNull();
    expect(auditRow!.actorId).toBe(actorId);
    expect(auditRow!.category).toBe('SYSTEM');

    expect(report.sentinelPath).toBeTruthy();
    expect(fs.existsSync(report.sentinelPath!)).toBe(true);
    const sentinel = JSON.parse(fs.readFileSync(report.sentinelPath!, 'utf8'));
    expect(sentinel.counts.flights).toBe(1);
    expect(sentinel.actorId).toBe(actorId);
    expect(sentinel.completedAt).toBeTruthy();
  });

  it('purging an already-purged / never-existing flightNo is a safe idempotent no-op: zero counts, no crash, no audit row, no actorId required', async () => {
    const unknownFlightNo = `SBX-NEVER-${crypto.randomUUID().slice(0, 8)}`;

    const dryRun = await runSandboxActiveFlightPurge(dataSource, {
      flightNos: [unknownFlightNo],
      all: false,
      execute: false,
    });
    expect(dryRun.counts).toEqual({
      flights: 0,
      instances: 0,
      reservations: 0,
      inventory: 0,
      seatLocks: 0,
      commitments: 0,
    });

    // execute:true with no actorId at all must not throw — there is
    // nothing to delete, so the actor requirement never triggers.
    const executed = await runSandboxActiveFlightPurge(dataSource, {
      flightNos: [unknownFlightNo],
      all: false,
      execute: true,
    });
    expect(executed.mode).toBe('SANDBOX_PURGE_EXECUTED');
    expect(executed.counts.flights).toBe(0);
    expect(executed.sentinelPath).toBeUndefined();

    // Running it again is identical — true idempotency, not just "doesn't
    // crash once".
    const executedAgain = await runSandboxActiveFlightPurge(dataSource, {
      flightNos: [unknownFlightNo],
      all: false,
      execute: true,
    });
    expect(executedAgain).toEqual(executed);
  });

  it('refuses to execute — even with a valid actor and matching flights — when NODE_ENV=production', async () => {
    const { flight } = await buildFixtureFlight();
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      await expect(
        runSandboxActiveFlightPurge(dataSource, {
          flightNos: [flight.flightNo],
          all: false,
          execute: true,
          actorId,
        }),
      ).rejects.toThrow(/NODE_ENV must NOT equal production/);
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }

    expect(
      await dataSource.getRepository(Flight).findOneBy({ id: flight.id }),
    ).not.toBeNull();

    // Clean up this fixture through a real, legitimate purge call.
    await runSandboxActiveFlightPurge(dataSource, {
      flightNos: [flight.flightNo],
      all: false,
      execute: true,
      actorId,
      sentinelDir,
    });
  });

  it('refuses to execute without a real actorId, and without an actorId that resolves to a real user', async () => {
    const { flight } = await buildFixtureFlight();

    await expect(
      runSandboxActiveFlightPurge(dataSource, {
        flightNos: [flight.flightNo],
        all: false,
        execute: true,
      }),
    ).rejects.toThrow(/actorId is required/);

    await expect(
      runSandboxActiveFlightPurge(dataSource, {
        flightNos: [flight.flightNo],
        all: false,
        execute: true,
        actorId: '00000000-0000-0000-0000-000000000000',
      }),
    ).rejects.toThrow(/does not match a real user/);

    expect(
      await dataSource.getRepository(Flight).findOneBy({ id: flight.id }),
    ).not.toBeNull();

    await runSandboxActiveFlightPurge(dataSource, {
      flightNos: [flight.flightNo],
      all: false,
      execute: true,
      actorId,
      sentinelDir,
    });
  });
});
