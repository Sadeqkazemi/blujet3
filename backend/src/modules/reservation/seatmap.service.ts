import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, LessThanOrEqual, MoreThan, Repository } from 'typeorm';
import { SeatLock } from '../../database/entities/seat-lock.entity';
import { FlightInstance } from '../../database/entities/flight-instance.entity';
import { AircraftSeatMap } from '../../database/entities/aircraft-seat-map.entity';
import { Passenger } from '../../database/entities/passenger.entity';
import { Airport } from '../../database/entities/airport.entity';
import { AgencyProfile } from '../../database/entities/agency-profile.entity';
import { AuditService } from '../audit/audit.service';
import { ErrorCode } from '../../common/errors';
import {
  decryptPii,
  encryptPii,
  hashPii,
  isValidIranianNationalId,
  normalizeNationalId,
} from '../../common/pii-crypto';
import { enumerateSeats, isKnownSeat } from './seat-layout';
import { resolveAircraftType } from '../flights/aircraft-type.util';
import { isUniqueViolation } from '../../database/utils/pg-errors';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import type { LockSeatDto, RejectLockDto } from './dto/reservation.dtos';

/** Phase 13 Part D — request-decision deadline (createdAt+this) and
 * hold-to-ticket deadline (approvedAt+this), see docs/DB_SCHEMA.md. Fixed
 * code constants, not configurable settings — no design/spec value exists
 * for either. */
const LOCK_REQUEST_TTL_HOURS = 24;
const LOCK_HOLD_TTL_HOURS = 48;
/** Fixed cap on how many seats a single requester may hold locked at once,
 * across every flight instance (⚑ global, not per-flight — see docs). */
const MAX_ACTIVE_MANAGERIAL_LOCKS_PER_REQUESTER = 5;

export type ManagerSeatStatus = 'FREE' | 'HELD' | 'SOLD' | 'LOCKED' | 'BLOCKED';

export function classifySeatProjection(
  bookingStatus: string | null | undefined,
  lockClassification: string | null | undefined,
): ManagerSeatStatus {
  if (bookingStatus === 'HELD') return 'HELD';
  if (bookingStatus) return 'SOLD';
  if (lockClassification === 'FREE') return 'BLOCKED';
  if (lockClassification) return 'LOCKED';
  return 'FREE';
}

function hoursFromNow(hours: number): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

@Injectable()
export class SeatmapService {
  constructor(
    @InjectRepository(SeatLock)
    private readonly seatLockRepo: Repository<SeatLock>,
    @InjectRepository(FlightInstance)
    private readonly flightInstanceRepo: Repository<FlightInstance>,
    @InjectRepository(AircraftSeatMap)
    private readonly seatMapRepo: Repository<AircraftSeatMap>,
    @InjectRepository(Passenger)
    private readonly passengerRepo: Repository<Passenger>,
    @InjectRepository(Airport)
    private readonly airportRepo: Repository<Airport>,
    @InjectRepository(AgencyProfile)
    private readonly agencyRepo: Repository<AgencyProfile>,
    private readonly audit: AuditService,
  ) {}

  /** "Currently active" for a managerial lock — mirrors the Booking
   * HELD/holdExpiresAt lazy-exclusion pattern: still un-released AND not
   * past its request-decision/hold-to-ticket deadline. */
  private activeLockWhere() {
    return { releasedAt: IsNull(), expiresAt: MoreThan(new Date()) };
  }

  async listLockAgencies() {
    const agencies = await this.agencyRepo.find({
      where: { suspendedAt: IsNull() },
      relations: { user: true },
      order: { joinedAt: 'DESC' },
    });
    return agencies.map((agency) => ({
      id: agency.userId,
      name: agency.user.fullName,
      licenseNo: agency.licenseNo,
    }));
  }

  private async findSoldConflict(flightInstanceId: string, seatCode: string) {
    return this.passengerRepo
      .createQueryBuilder('p')
      .innerJoin('p.booking', 'b')
      .where('(p.seatCode = :seatCode OR p.extraSeatCode = :seatCode)', {
        seatCode,
      })
      .andWhere('b.flightInstanceId = :flightInstanceId', { flightInstanceId })
      .andWhere(
        `(b.status IN ('PAID', 'TICKETED', 'FLOWN', 'NO_SHOW') OR (b.status = 'HELD' AND b."holdExpiresAt" > :now))`,
        { now: new Date() },
      )
      .getOne();
  }

  /** The DB's partial unique index only knows `releasedAt IS NULL`, not
   * `expiresAt` — it can't (a partial index predicate can't call now()).
   * So the write paths that actually contend for a seat (a new request,
   * finalizing one into a booking) must release an expired-but-not-yet-
   * released lock themselves before proceeding. A conditional update
   * guards a concurrent double-release. */
  private async releaseIfExpired(flightInstanceId: string, seatCode: string) {
    await this.seatLockRepo.update(
      {
        flightInstanceId,
        seatCode,
        releasedAt: IsNull(),
        expiresAt: LessThanOrEqual(new Date()),
      },
      { releasedAt: new Date() },
    );
  }

  private async getFlightInstanceOrThrow(id: string) {
    const instance = await this.flightInstanceRepo
      .createQueryBuilder('fi')
      .leftJoinAndSelect('fi.flight', 'flight')
      .leftJoinAndSelect('flight.route', 'route')
      .where('fi.id = :id', { id })
      .getOne();
    if (!instance) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'پرواز یافت نشد.',
      });
    }
    return instance;
  }

  private async getSeatMapConfigOrThrow(aircraftType: string) {
    const map = await this.seatMapRepo.findOneBy({ aircraftType });
    if (!map) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: `نقشهٔ صندلی برای «${aircraftType}» تعریف نشده است.`,
      });
    }
    return map;
  }

  async getSeatMap(flightInstanceId: string) {
    const instance = await this.getFlightInstanceOrThrow(flightInstanceId);
    const map = await this.getSeatMapConfigOrThrow(
      resolveAircraftType(instance),
    );
    const seats = enumerateSeats(map);

    const [soldPassengers, activeLocks, airports] = await Promise.all([
      this.passengerRepo
        .createQueryBuilder('p')
        .innerJoin('p.booking', 'b')
        .where('(p.seatCode IS NOT NULL OR p.extraSeatCode IS NOT NULL)')
        .andWhere('b.flightInstanceId = :flightInstanceId', {
          flightInstanceId,
        })
        .andWhere(
          `(b.status IN ('PAID', 'TICKETED', 'FLOWN', 'NO_SHOW') OR (b.status = 'HELD' AND b."holdExpiresAt" > :now))`,
          { now: new Date() },
        )
        .select([
          'p.seatCode',
          'p.extraSeatCode',
          'p.fullName',
          'p.nationalIdEnc',
        ])
        .addSelect(['b.pnr', 'b.status', 'b.priceIrr', 'b.holdExpiresAt'])
        .getMany(),
      this.seatLockRepo.find({
        where: { flightInstanceId, ...this.activeLockWhere() },
        relations: { agency: { user: true } },
      }),
      this.airportRepo.find({
        where: {
          code: In([
            instance.flight.route.originCode,
            instance.flight.route.destCode,
          ]),
        },
        select: { code: true, cityFa: true },
      }),
    ]);
    const cityByCode = new Map(airports.map((a) => [a.code, a.cityFa]));
    const soldByCode = new Map<string, Passenger>();
    for (const passenger of soldPassengers) {
      if (passenger.seatCode) soldByCode.set(passenger.seatCode, passenger);
      if (passenger.extraSeatCode) {
        soldByCode.set(passenger.extraSeatCode, passenger);
      }
    }
    const lockedByCode = new Map(activeLocks.map((l) => [l.seatCode, l]));

    const rowsMap = new Map<
      number,
      { row: number; cabin: string; seats: unknown[] }
    >();
    for (const seat of seats) {
      if (!rowsMap.has(seat.row)) {
        rowsMap.set(seat.row, { row: seat.row, cabin: seat.cabin, seats: [] });
      }
      const sold = soldByCode.get(seat.seatCode);
      const lock = lockedByCode.get(seat.seatCode);
      const status = classifySeatProjection(
        sold?.booking.status,
        lock?.classification,
      );
      rowsMap.get(seat.row)!.seats.push({
        seatCode: seat.seatCode,
        status,
        lockId: lock?.id ?? null,
        // Staff reservation panel only — name of the passenger who holds a
        // sold seat (IT/CEO/Board/Senior). Lock PII stays encrypted-only.
        passenger: sold
          ? {
              fullName: sold.fullName,
              pnr: sold.booking.pnr,
              bookingStatus: sold.booking.status,
              nationalId: sold.nationalIdEnc
                ? decryptPii(sold.nationalIdEnc)
                : null,
              priceIrr: sold.booking.priceIrr,
            }
          : null,
        // CEO/Board «هواپیما» tab reads the lighter occupant shape.
        occupant: sold
          ? {
              pnr: sold.booking.pnr,
              passengerName: sold.fullName,
              bookingStatus: sold.booking.status,
            }
          : null,
        lockExpiresAt: lock?.expiresAt ?? null,
        holdExpiresAt:
          sold?.booking.status === 'HELD' ? sold.booking.holdExpiresAt : null,
        lockClassification: lock?.classification ?? null,
        lockApprovalStatus: lock?.approvalStatus ?? null,
        lockPassengerName: lock?.passengerName ?? null,
        lockAgencyId: lock?.agencyId ?? null,
        lockAgencyName: lock?.agency?.user?.fullName ?? null,
      });
    }

    const originCode = instance.flight.route.originCode;
    const destCode = instance.flight.route.destCode;

    return {
      flightInstanceId,
      aircraftType: resolveAircraftType(instance),
      flightNo: instance.flight.flightNo,
      originCode,
      destCode,
      originCityFa: cityByCode.get(originCode) ?? originCode,
      destCityFa: cityByCode.get(destCode) ?? destCode,
      departureAt: instance.departureAt,
      rows: Array.from(rowsMap.values()).sort((a, b) => a.row - b.row),
      // CLAUDE.md: "seat map config lives per aircraft type in the DB, not
      // hardcoded" — the aisle gap position varies by cabin layout (e.g.
      // business 2-2 vs economy 2-3), so the frontend renders it from
      // this instead of assuming a fixed seat index.
      cabinLayout: {
        BUSINESS: { aisleAfterIndex: map.businessColsLeft?.length ?? 0 },
        ECONOMY: { aisleAfterIndex: map.economyColsLeft?.length ?? 0 },
      },
      capacity: seats.length,
      soldCount: soldPassengers.filter((p) => p.booking.status !== 'HELD')
        .length,
      heldCount: soldPassengers.filter((p) => p.booking.status === 'HELD')
        .length,
      managerLockedCount: activeLocks.filter(
        (lock) => lock.classification !== 'FREE',
      ).length,
      blockedCount: activeLocks.filter((lock) => lock.classification === 'FREE')
        .length,
      // Backwards-compatible total for older executive consumers.
      lockedCount: activeLocks.length,
      freeCount: Math.max(
        0,
        seats.length - soldByCode.size - activeLocks.length,
      ),
      occupancyPct:
        seats.length === 0
          ? 0
          : Math.round(
              ((soldByCode.size + activeLocks.length) / seats.length) * 1000,
            ) / 10,
    };
  }

  async lockSeat(
    actor: AuthenticatedUser,
    flightInstanceId: string,
    dto: LockSeatDto,
  ) {
    const instance = await this.getFlightInstanceOrThrow(flightInstanceId);
    const map = await this.getSeatMapConfigOrThrow(
      resolveAircraftType(instance),
    );
    if (!isKnownSeat(map, dto.seatCode)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'این شماره صندلی در این هواپیما معتبر نیست.',
      });
    }

    const sold = await this.findSoldConflict(flightInstanceId, dto.seatCode);
    if (sold) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'این صندلی قبلاً فروخته شده است.',
      });
    }

    if (dto.discountPct !== undefined && dto.classification !== 'DISCOUNTED') {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'درصد تخفیف فقط برای طبقه‌بندی «تخفیف‌دار» معتبر است.',
      });
    }

    const activeRequesterLocks = await this.seatLockRepo.count({
      where: { lockedById: actor.id, ...this.activeLockWhere() },
    });
    if (activeRequesterLocks >= MAX_ACTIVE_MANAGERIAL_LOCKS_PER_REQUESTER) {
      throw new ConflictException({
        code: ErrorCode.LOCK_CAP_EXCEEDED,
        message: `شما در حال حاضر به سقف ${MAX_ACTIVE_MANAGERIAL_LOCKS_PER_REQUESTER} صندلی لاک‌شدهٔ فعال رسیده‌اید.`,
      });
    }

    if (dto.agencyId) {
      const agency = await this.agencyRepo.findOneBy({ userId: dto.agencyId });
      if (!agency || agency.suspendedAt) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_FAILED,
          message: 'آژانس انتخاب‌شده فعال یا معتبر نیست.',
        });
      }
    }

    const nationalId = dto.passengerNationalId
      ? normalizeNationalId(dto.passengerNationalId)
      : undefined;
    if (nationalId && !isValidIranianNationalId(nationalId)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'کد ملی واردشده معتبر نیست.',
      });
    }

    await this.releaseIfExpired(flightInstanceId, dto.seatCode);

    try {
      const lock = await this.seatLockRepo.save(
        this.seatLockRepo.create({
          flightInstanceId,
          seatCode: dto.seatCode,
          lockedById: actor.id,
          reason: dto.reason,
          classification: dto.classification,
          discountPct: dto.discountPct ?? null,
          requesterRank: actor.role,
          agencyId: dto.agencyId ?? null,
          approvalStatus: dto.companyBlock ? 'APPROVED' : 'PENDING_APPROVAL',
          approvedById: dto.companyBlock ? actor.id : null,
          approvedAt: dto.companyBlock ? new Date() : null,
          expiresAt: hoursFromNow(
            dto.companyBlock ? LOCK_HOLD_TTL_HOURS : LOCK_REQUEST_TTL_HOURS,
          ),
          passengerName: dto.passengerName ?? null,
          passengerNationalIdEnc: nationalId ? encryptPii(nationalId) : null,
          passengerNationalIdHash: nationalId ? hashPii(nationalId) : null,
          passengerMobileEnc: dto.passengerMobile
            ? encryptPii(dto.passengerMobile)
            : null,
        }),
      );

      await this.audit.record({
        actorId: actor.id,
        actorRole: actor.role,
        category: 'RESERVATION',
        action: 'درخواست لاک مدیریتی صندلی',
        detail: `صندلی ${dto.seatCode} توسط ${actor.fullName} برای رزرو مدیریتی درخواست شد (${dto.reason}).`,
        entityType: 'SeatLock',
        entityId: lock.id,
      });

      return this.toLockView(lock);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message: 'این صندلی هم‌اکنون توسط شخص دیگری لاک شده است.',
        });
      }
      throw err;
    }
  }

  private async getPendingLockOrThrow(lockId: string) {
    const lock = await this.seatLockRepo.findOneBy({ id: lockId });
    if (!lock) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'لاک صندلی یافت نشد.',
      });
    }
    if (
      lock.approvalStatus !== 'PENDING_APPROVAL' ||
      lock.releasedAt ||
      lock.expiresAt <= new Date()
    ) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'این درخواست دیگر در وضعیت در انتظار تأیید نیست.',
      });
    }
    return lock;
  }

  /** Two-step approval: requesting and approving both stay within
   * CAN_SEAT_LOCK_ROLES, but a requester can never approve their own request —
   * a real control between the governance roles, not a rubber stamp. */
  async approveLock(actor: AuthenticatedUser, lockId: string) {
    const lock = await this.getPendingLockOrThrow(lockId);
    if (lock.lockedById === actor.id) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'شما نمی‌توانید درخواست خودتان را تأیید کنید.',
      });
    }

    lock.approvalStatus = 'APPROVED';
    lock.approvedById = actor.id;
    lock.approvedAt = new Date();
    lock.expiresAt = hoursFromNow(LOCK_HOLD_TTL_HOURS);
    const updated = await this.seatLockRepo.save(lock);

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'RESERVATION',
      action: 'تأیید درخواست لاک مدیریتی',
      detail: `درخواست لاک صندلی ${lock.seatCode} توسط ${actor.fullName} تأیید شد.`,
      entityType: 'SeatLock',
      entityId: lockId,
    });

    return this.toLockView(updated);
  }

  async rejectLock(
    actor: AuthenticatedUser,
    lockId: string,
    dto: RejectLockDto,
  ) {
    const lock = await this.getPendingLockOrThrow(lockId);

    lock.approvalStatus = 'REJECTED';
    lock.rejectedById = actor.id;
    lock.rejectedAt = new Date();
    lock.rejectionReason = dto.rejectionReason;
    lock.releasedAt = new Date();
    const updated = await this.seatLockRepo.save(lock);

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'RESERVATION',
      action: 'رد درخواست لاک مدیریتی',
      detail: `درخواست لاک صندلی ${lock.seatCode} توسط ${actor.fullName} رد شد (${dto.rejectionReason}).`,
      entityType: 'SeatLock',
      entityId: lockId,
    });

    return this.toLockView(updated);
  }

  async releaseLock(actor: AuthenticatedUser, lockId: string) {
    const lock = await this.seatLockRepo.findOneBy({ id: lockId });
    if (!lock) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'لاک صندلی یافت نشد.',
      });
    }
    if (lock.releasedAt) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'این لاک قبلاً آزاد شده است.',
      });
    }

    lock.releasedAt = new Date();
    lock.releasedById = actor.id;
    const updated = await this.seatLockRepo.save(lock);

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'RESERVATION',
      action: 'آزادسازی لاک صندلی',
      detail: `صندلی ${lock.seatCode} توسط ${actor.fullName} آزاد شد.`,
      entityType: 'SeatLock',
      entityId: lockId,
    });

    return this.toLockView(updated);
  }

  private toLockView(lock: SeatLock) {
    const {
      passengerNationalIdEnc,
      passengerNationalIdHash,
      passengerMobileEnc,
      ...rest
    } = lock;
    void passengerNationalIdEnc;
    void passengerNationalIdHash;
    void passengerMobileEnc;
    return {
      ...rest,
      active: rest.releasedAt === null && rest.expiresAt > new Date(),
    };
  }
}
