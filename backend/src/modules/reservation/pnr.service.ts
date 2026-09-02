import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import * as crypto from 'node:crypto';
import {
  DataSource,
  EntityManager,
  In,
  IsNull,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import { Booking } from '../../database/entities/booking.entity';
import { Passenger } from '../../database/entities/passenger.entity';
import { FlightInstance } from '../../database/entities/flight-instance.entity';
import { Flight } from '../../database/entities/flight.entity';
import { Airport } from '../../database/entities/airport.entity';
import { SeatLock } from '../../database/entities/seat-lock.entity';
import { AircraftSeatMap } from '../../database/entities/aircraft-seat-map.entity';
import { FarePricingProposal } from '../../database/entities/fare-pricing-proposal.entity';
import { LedgerEntry } from '../../database/entities/ledger-entry.entity';
import { InternalService } from '../../database/entities/internal-service.entity';
import { AgencyApiKey } from '../../database/entities/agency-api-key.entity';
import { AuditService } from '../audit/audit.service';
import { ErrorCode } from '../../common/errors';
import {
  encryptPii,
  hashPii,
  isValidIranianNationalId,
  normalizeNationalId,
} from '../../common/pii-crypto';
import { enumerateSeats, isKnownSeat } from './seat-layout';
import { resolveAircraftType } from '../flights/aircraft-type.util';
import { materializeFlownBookings } from '../flights/flight-lifecycle.util';
import { SearchService } from '../booking-engine/search.service';
import { ZERO_IRR, pctOfIrr, subIrr } from '../../common/money';
import type { Irr } from '../../common/money';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import type {
  FinalizeLockDto,
  IssuePnrDto,
  ListPnrQueryDto,
  ListReservationFlightsQueryDto,
  SearchFlightsQueryDto,
} from './dto/reservation.dtos';

/** No canonical public-site fare table exists yet — a documented flat
 * fallback (never invented dynamic pricing) when a flight instance has no
 * Phase 6 registered price. */
const FALLBACK_PRICE_IRR: Irr = 38_000_000n;

function generatePnr(): string {
  return `BJ${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

type BookingDetail = Omit<Booking, 'generateId' | 'defaultTaxIrr'> & {
  passengers: Passenger[];
};

@Injectable()
export class PnrService {
  constructor(
    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,
    @InjectRepository(Passenger)
    private readonly passengerRepo: Repository<Passenger>,
    @InjectRepository(FlightInstance)
    private readonly flightInstanceRepo: Repository<FlightInstance>,
    @InjectRepository(Flight)
    private readonly flightRepo: Repository<Flight>,
    @InjectRepository(Airport)
    private readonly airportRepo: Repository<Airport>,
    @InjectRepository(SeatLock)
    private readonly seatLockRepo: Repository<SeatLock>,
    @InjectRepository(AircraftSeatMap)
    private readonly seatMapRepo: Repository<AircraftSeatMap>,
    @InjectRepository(FarePricingProposal)
    private readonly pricingRepo: Repository<FarePricingProposal>,
    @InjectRepository(LedgerEntry)
    private readonly ledgerRepo: Repository<LedgerEntry>,
    @InjectRepository(InternalService)
    private readonly internalServiceRepo: Repository<InternalService>,
    @InjectRepository(AgencyApiKey)
    private readonly agencyApiKeyRepo: Repository<AgencyApiKey>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
    private readonly searchService: SearchService,
  ) {}

  private async findSoldConflict(
    flightInstanceId: string,
    seatCode: string,
    excludeBookingId?: string,
    manager: EntityManager = this.passengerRepo.manager,
  ) {
    const qb = manager
      .createQueryBuilder(Passenger, 'p')
      .innerJoin('p.booking', 'b')
      .where('(p.seatCode = :seatCode OR p.extraSeatCode = :seatCode)', {
        seatCode,
      })
      .andWhere('b.flightInstanceId = :flightInstanceId', { flightInstanceId })
      .andWhere('b.status != :cancelled', { cancelled: 'CANCELLED' });
    if (excludeBookingId) {
      qb.andWhere('p.bookingId != :excludeBookingId', { excludeBookingId });
    }
    return qb.getOne();
  }

  /** `onlyActive: false` mirrors `issue()`'s original in-transaction check,
   * which (unlike every other seat-conflict check in this file) omits the
   * `expiresAt` filter — an expired-but-not-yet-released lock still blocks
   * booking creation inside that specific atomic section. */
  private async findLockConflict(
    flightInstanceId: string,
    seatCode: string,
    options: { onlyActive: boolean },
    manager: EntityManager = this.seatLockRepo.manager,
  ) {
    const qb = manager
      .createQueryBuilder(SeatLock, 'sl')
      .where('sl.flightInstanceId = :flightInstanceId', { flightInstanceId })
      .andWhere('sl.seatCode = :seatCode', { seatCode })
      .andWhere('sl.releasedAt IS NULL');
    if (options.onlyActive) {
      qb.andWhere('sl.expiresAt > :now', { now: new Date() });
    }
    return qb.getOne();
  }

  private async getBookingOrThrow(pnr: string): Promise<BookingDetail> {
    const booking = await this.bookingRepo
      .createQueryBuilder('b')
      .leftJoinAndSelect('b.flightInstance', 'flightInstance')
      .leftJoinAndSelect('flightInstance.flight', 'flight')
      .leftJoinAndSelect('flight.route', 'route')
      .where('b.pnr = :pnr', { pnr })
      .getOne();
    if (!booking) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'رزرو با این کد PNR یافت نشد.',
      });
    }
    const passengers = await this.passengerRepo.find({
      where: { bookingId: booking.id },
    });
    return { ...booking, passengers };
  }

  async list(query: ListPnrQueryDto) {
    await materializeFlownBookings(this.dataSource);
    const qb = this.bookingRepo
      .createQueryBuilder('b')
      .leftJoinAndSelect('b.flightInstance', 'flightInstance')
      .leftJoinAndSelect('flightInstance.flight', 'flight')
      .leftJoinAndSelect('flight.route', 'route')
      .orderBy('b.createdAt', 'DESC')
      .take(200);
    if (query.q) {
      qb.andWhere(
        `(b.pnr ILIKE :q OR EXISTS (SELECT 1 FROM passengers p WHERE p."bookingId" = b.id AND p."fullName" ILIKE :q))`,
        { q: `%${query.q}%` },
      );
    }
    if (query.status) {
      qb.andWhere('b.status = :status', { status: query.status });
    }
    const bookings = await qb.getMany();

    const bookingIds = bookings.map((b) => b.id);
    const passengers = bookingIds.length
      ? await this.passengerRepo.find({ where: { bookingId: In(bookingIds) } })
      : [];
    const firstPassengerByBooking = new Map<string, Passenger>();
    for (const p of passengers) {
      if (!firstPassengerByBooking.has(p.bookingId)) {
        firstPassengerByBooking.set(p.bookingId, p);
      }
    }

    const groups = new Map<
      string,
      {
        flightInstanceId: string;
        flightNo: string;
        route: string;
        departureAt: Date;
        rows: unknown[];
      }
    >();
    for (const b of bookings) {
      const key = b.flightInstanceId;
      if (!groups.has(key)) {
        groups.set(key, {
          flightInstanceId: key,
          flightNo: b.flightInstance.flight.flightNo,
          route: `${b.flightInstance.flight.route.originCode} → ${b.flightInstance.flight.route.destCode}`,
          departureAt: b.flightInstance.departureAt,
          rows: [],
        });
      }
      groups.get(key)!.rows.push({
        pnr: b.pnr,
        passenger: firstPassengerByBooking.get(b.id)?.fullName ?? '—',
        channel: b.channel,
        status: b.status,
      });
    }

    return Array.from(groups.values()).sort(
      (a, b) => b.departureAt.getTime() - a.departureAt.getTime(),
    );
  }

  async detail(pnr: string) {
    await materializeFlownBookings(this.dataSource);
    const b = await this.getBookingOrThrow(pnr);
    const passenger = b.passengers[0];
    return {
      pnr: b.pnr,
      status: b.status,
      channel: b.channel,
      priceIrr: b.priceIrr,
      flightNo: b.flightInstance.flight.flightNo,
      originCode: b.flightInstance.flight.route.originCode,
      destCode: b.flightInstance.flight.route.destCode,
      departureAt: b.flightInstance.departureAt,
      arrivalAt: b.flightInstance.arrivalAt,
      flightInstanceId: b.flightInstanceId,
      passenger: passenger
        ? { fullName: passenger.fullName, seatCode: passenger.seatCode }
        : null,
    };
  }

  async changeSeat(actor: AuthenticatedUser, pnr: string, seatCode: string) {
    const booking = await this.getBookingOrThrow(pnr);
    if (booking.status === 'CANCELLED') {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'این رزرو لغو شده است و قابل تغییر نیست.',
      });
    }
    const map = await this.seatMapRepo.findOneBy({
      aircraftType: resolveAircraftType(booking.flightInstance),
    });
    if (!map || !isKnownSeat(map, seatCode)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'این شماره صندلی در این هواپیما معتبر نیست.',
      });
    }

    await this.bookingRepo.manager.transaction(async (tx) => {
      // Lock this flight instance's row so two concurrent changeSeat calls
      // targeting it can't both pass the conflict check before either
      // commits — mirrors the same pattern used in issue().
      await tx
        .createQueryBuilder(FlightInstance, 'fi')
        .setLock('pessimistic_write')
        .where('fi.id = :id', { id: booking.flightInstanceId })
        .getOne();

      const [soldConflict, lockConflict] = await Promise.all([
        this.findSoldConflict(
          booking.flightInstanceId,
          seatCode,
          booking.id,
          tx,
        ),
        this.findLockConflict(
          booking.flightInstanceId,
          seatCode,
          { onlyActive: true },
          tx,
        ),
      ]);
      if (soldConflict || lockConflict) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message: 'این صندلی در حال حاضر در دسترس نیست.',
        });
      }

      await tx.update(Passenger, { bookingId: booking.id }, { seatCode });
    });

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'RESERVATION',
      action: 'تغییر صندلی رزرو',
      detail: `صندلی رزرو ${pnr} توسط ${actor.fullName} به ${seatCode} تغییر کرد.`,
      entityType: 'Booking',
      entityId: booking.id,
    });

    return this.detail(pnr);
  }

  async cancel(actor: AuthenticatedUser, pnr: string) {
    const booking = await this.getBookingOrThrow(pnr);
    if (booking.status === 'CANCELLED') {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'این رزرو قبلاً لغو شده است.',
      });
    }

    await this.bookingRepo.update({ id: booking.id }, { status: 'CANCELLED' });

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'RESERVATION',
      action: 'لغو رزرو',
      detail: `رزرو ${pnr} توسط ${actor.fullName} لغو شد.`,
      entityType: 'Booking',
      entityId: booking.id,
    });

    return this.detail(pnr);
  }

  /** Phase 13 Part E — manual no-show override. Only legal once the
   * flight has actually departed (materialized here, not assumed); a
   * TICKETED booking that hasn't been lazily flipped to FLOWN yet is
   * still handled correctly since we flip it first. */
  async markNoShow(actor: AuthenticatedUser, pnr: string) {
    const booking = await this.getBookingOrThrow(pnr);
    await materializeFlownBookings(this.dataSource);
    const refreshed = await this.getBookingOrThrow(pnr);

    if (refreshed.flightInstance.status !== 'DEPARTED') {
      throw new ConflictException({
        code: ErrorCode.FLIGHT_NOT_DEPARTED,
        message: 'این پرواز هنوز انجام نشده است.',
      });
    }
    if (!['TICKETED', 'FLOWN'].includes(refreshed.status)) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'این رزرو در وضعیتی نیست که بتوان آن را «عدم حضور» ثبت کرد.',
      });
    }

    await this.bookingRepo.update({ id: booking.id }, { status: 'NO_SHOW' });

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'RESERVATION',
      action: 'ثبت عدم حضور مسافر',
      detail: `رزرو ${pnr} توسط ${actor.fullName} «عدم حضور» ثبت شد.`,
      entityType: 'Booking',
      entityId: booking.id,
    });

    return this.detail(pnr);
  }

  async search(query: SearchFlightsQueryDto) {
    const dayStart = new Date(query.date);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    const instances = await this.flightInstanceRepo
      .createQueryBuilder('fi')
      .leftJoinAndSelect('fi.flight', 'flight')
      .leftJoinAndSelect('flight.route', 'route')
      .where('fi.status = :status', { status: 'SCHEDULED' })
      .andWhere('fi.departureAt >= :dayStart', { dayStart })
      .andWhere('fi.departureAt < :dayEnd', { dayEnd })
      .andWhere('route.originCode ILIKE :origin', {
        origin: `%${query.origin}%`,
      })
      .andWhere('route.destCode ILIKE :dest', { dest: `%${query.dest}%` })
      .getMany();

    const results: {
      flightInstanceId: string;
      flightNo: string;
      aircraftType: string;
      originCode: string;
      destCode: string;
      departureAt: Date;
      arrivalAt: Date;
      priceIrr: Irr;
      seatsLeft: number;
    }[] = [];
    for (const instance of instances) {
      const [soldCount, map, pricing] = await Promise.all([
        this.passengerRepo
          .createQueryBuilder('p')
          .innerJoin('p.booking', 'b')
          .where('p.seatCode IS NOT NULL')
          .andWhere('b.flightInstanceId = :id', { id: instance.id })
          .andWhere('b.status != :cancelled', { cancelled: 'CANCELLED' })
          .getCount(),
        this.seatMapRepo.findOneBy({
          aircraftType: resolveAircraftType(instance),
        }),
        this.pricingRepo
          .createQueryBuilder('pr')
          .where('pr.flightInstanceId = :id', { id: instance.id })
          .getOne(),
      ]);
      const capacity = map ? enumerateSeats(map).length : instance.capacity;
      results.push({
        flightInstanceId: instance.id,
        flightNo: instance.flight.flightNo,
        aircraftType: resolveAircraftType(instance),
        originCode: instance.flight.route.originCode,
        destCode: instance.flight.route.destCode,
        departureAt: instance.departureAt,
        arrivalAt: instance.arrivalAt,
        priceIrr:
          pricing?.status === 'REGISTERED'
            ? (pricing.registeredPriceIrr as Irr)
            : FALLBACK_PRICE_IRR,
        seatsLeft: Math.max(0, capacity - soldCount),
      });
    }
    return results;
  }

  async issue(actor: AuthenticatedUser, dto: IssuePnrDto) {
    const instance = await this.flightInstanceRepo
      .createQueryBuilder('fi')
      .leftJoinAndSelect('fi.flight', 'flight')
      .where('fi.id = :id', { id: dto.flightInstanceId })
      .getOne();
    if (!instance) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'پرواز یافت نشد.',
      });
    }
    const now = new Date();
    if (
      (instance.saleStartsAt && instance.saleStartsAt > now) ||
      (instance.saleEndsAt && instance.saleEndsAt < now)
    ) {
      throw new ConflictException({
        code: ErrorCode.SALE_WINDOW_CLOSED,
        message: 'مهلت فروش این پرواز به پایان رسیده یا هنوز آغاز نشده است.',
      });
    }
    const map = await this.seatMapRepo.findOneBy({
      aircraftType: resolveAircraftType(instance),
    });
    if (!map || !isKnownSeat(map, dto.seatCode)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'این شماره صندلی در این هواپیما معتبر نیست.',
      });
    }

    const [sold, lock, pricing] = await Promise.all([
      this.findSoldConflict(dto.flightInstanceId, dto.seatCode),
      this.findLockConflict(dto.flightInstanceId, dto.seatCode, {
        onlyActive: true,
      }),
      this.pricingRepo
        .createQueryBuilder('pr')
        .where('pr.flightInstanceId = :id', { id: dto.flightInstanceId })
        .getOne(),
    ]);
    if (sold || lock) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'این صندلی در دسترس نیست.',
      });
    }

    // Staff-issued PNRs are channel SYSTEM, same public pool as the online
    // booking engine — must not oversell past what's reserved for agencies/
    // charter (Phase 13).
    const counts = await this.searchService.takenCountsByChannel(
      dto.flightInstanceId,
    );
    const publicPoolLimit =
      instance.capacity -
      instance.charterSeats -
      (instance.agencySeatsAllocated ?? 0);
    if (counts.SYSTEM + counts.MANAGERIAL + 1 > publicPoolLimit) {
      throw new ConflictException({
        code: ErrorCode.POOL_EXHAUSTED,
        message: 'ظرفیت فروش عمومی این پرواز تکمیل شده است.',
      });
    }

    const priceIrr: Irr =
      pricing?.status === 'REGISTERED'
        ? (pricing.registeredPriceIrr as Irr)
        : FALLBACK_PRICE_IRR;
    const nationalId = dto.passengerNationalId
      ? normalizeNationalId(dto.passengerNationalId)
      : undefined;
    if (nationalId && !isValidIranianNationalId(nationalId)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'کد ملی واردشده معتبر نیست.',
      });
    }

    const booking = await this.bookingRepo.manager.transaction(async (tx) => {
      // Lock this flight instance's row so two concurrent seat-issuance
      // requests for it can't both pass the sold/lock check below before
      // either has committed — the check + insert must be atomic per seat.
      await tx
        .createQueryBuilder(FlightInstance, 'fi')
        .setLock('pessimistic_write')
        .where('fi.id = :id', { id: dto.flightInstanceId })
        .getOne();

      const [sold2, lock2] = await Promise.all([
        this.findSoldConflict(
          dto.flightInstanceId,
          dto.seatCode,
          undefined,
          tx,
        ),
        this.findLockConflict(
          dto.flightInstanceId,
          dto.seatCode,
          { onlyActive: false },
          tx,
        ),
      ]);
      if (sold2 || lock2) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message: 'این صندلی در دسترس نیست.',
        });
      }

      const created = await tx.save(
        tx.create(Booking, {
          pnr: generatePnr(),
          flightInstanceId: dto.flightInstanceId,
          channel: 'SYSTEM',
          status: 'TICKETED',
          priceIrr,
        }),
      );
      await tx.save(
        tx.create(Passenger, {
          bookingId: created.id,
          fullName: dto.passengerName,
          seatCode: dto.seatCode,
          nationalIdEnc: nationalId ? encryptPii(nationalId) : null,
          nationalIdHash: nationalId ? hashPii(nationalId) : null,
          mobileEnc: dto.passengerMobile
            ? encryptPii(dto.passengerMobile)
            : null,
        }),
      );
      await tx.save(
        tx.create(LedgerEntry, {
          bookingId: created.id,
          type: 'SALE',
          signedAmountIrr: priceIrr,
        }),
      );
      return created;
    });

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'RESERVATION',
      action: 'صدور دستی PNR',
      detail: `رزرو ${booking.pnr} برای «${dto.passengerName}» توسط ${actor.fullName} صادر شد.`,
      entityType: 'Booking',
      entityId: booking.id,
    });

    return this.detail(booking.pnr);
  }

  /** Phase 13 Part D — turns an APPROVED, not-yet-expired managerial
   * SeatLock into a real TICKETED booking, priced per the lock's
   * classification (FREE/DISCOUNTED/PAYABLE). Reuses this service's own
   * manual-issuance pricing fallback and PII handling; taxIrr is left at
   * 0 like every other manual-issuance path (see docs/DB_SCHEMA.md). */
  async finalizeLock(
    actor: AuthenticatedUser,
    lockId: string,
    dto: FinalizeLockDto,
  ) {
    const lock = await this.seatLockRepo.findOneBy({ id: lockId });
    if (!lock) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'لاک صندلی یافت نشد.',
      });
    }
    if (lock.releasedAt || lock.expiresAt <= new Date()) {
      // Self-heal an expired-but-not-yet-released lock, same as the
      // seatmap request path — see docs/DB_SCHEMA.md Phase 13 Part D.
      await this.seatLockRepo.update(
        {
          id: lockId,
          releasedAt: IsNull(),
          expiresAt: LessThanOrEqual(new Date()),
        },
        { releasedAt: new Date() },
      );
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'این لاک آزاد شده یا منقضی شده و قابل صدور بلیط نیست.',
      });
    }
    if (lock.approvalStatus !== 'APPROVED') {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'این درخواست هنوز تأیید نشده است.',
      });
    }

    const sold = await this.findSoldConflict(
      lock.flightInstanceId,
      lock.seatCode,
    );
    if (sold) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'این صندلی در دسترس نیست.',
      });
    }

    const pricing = await this.pricingRepo
      .createQueryBuilder('pr')
      .where('pr.flightInstanceId = :id', { id: lock.flightInstanceId })
      .getOne();
    const basePriceIrr: Irr =
      pricing?.status === 'REGISTERED'
        ? (pricing.registeredPriceIrr as Irr)
        : FALLBACK_PRICE_IRR;
    const priceIrr: Irr =
      lock.classification === 'FREE'
        ? ZERO_IRR
        : lock.classification === 'DISCOUNTED'
          ? subIrr(basePriceIrr, pctOfIrr(basePriceIrr, lock.discountPct ?? 0))
          : basePriceIrr;

    const nationalId = dto.passengerNationalId
      ? normalizeNationalId(dto.passengerNationalId)
      : undefined;
    if (nationalId && !isValidIranianNationalId(nationalId)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'کد ملی واردشده معتبر نیست.',
      });
    }

    const booking = await this.bookingRepo.manager.transaction(async (tx) => {
      const created = await tx.save(
        tx.create(Booking, {
          pnr: generatePnr(),
          flightInstanceId: lock.flightInstanceId,
          channel: 'SYSTEM',
          status: 'TICKETED',
          priceIrr,
        }),
      );
      await tx.save(
        tx.create(Passenger, {
          bookingId: created.id,
          fullName: dto.passengerName,
          seatCode: lock.seatCode,
          nationalIdEnc: nationalId ? encryptPii(nationalId) : null,
          nationalIdHash: nationalId ? hashPii(nationalId) : null,
          mobileEnc: dto.passengerMobile
            ? encryptPii(dto.passengerMobile)
            : null,
        }),
      );
      await tx.save(
        tx.create(LedgerEntry, {
          bookingId: created.id,
          type: 'SALE',
          signedAmountIrr: priceIrr,
        }),
      );
      await tx.update(
        SeatLock,
        { id: lockId },
        { releasedAt: new Date(), bookingId: created.id },
      );
      return created;
    });

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'RESERVATION',
      action: 'صدور بلیط از لاک مدیریتی',
      detail: `رزرو ${booking.pnr} از لاک صندلی ${lock.seatCode} توسط ${actor.fullName} صادر شد.`,
      entityType: 'Booking',
      entityId: booking.id,
    });

    return this.detail(booking.pnr);
  }

  /**
   * «پروازها» sub-tab of سامانه رزرواسیون/هواپیما — SCHEDULED instances
   * with sold/locked/free counts so staff can open a seat map.
   * Returns one shape covering CEO/Senior/IT/Board Chair tables:
   * Persian `route`, city fields, and IT occupancy/status keys.
   */
  async listFlights(query: ListReservationFlightsQueryDto | string = {}) {
    const q = (typeof query === 'string' ? query : query.q)?.trim();
    await materializeFlownBookings(this.dataSource);
    const airports = await this.airportRepo.find({
      select: { code: true, cityFa: true },
    });
    const cityByCode = new Map(airports.map((a) => [a.code, a.cityFa]));

    // Include past-dated SCHEDULED rows too — the seed (and some E2E
    // fixtures) keep deliberately-past "SCHEDULED" instances for demos;
    // staff still need to open their seat maps. Prefer soonest first.
    const instances = await this.flightInstanceRepo
      .createQueryBuilder('fi')
      .leftJoinAndSelect('fi.flight', 'flight')
      .leftJoinAndSelect('flight.route', 'route')
      .where('fi.status = :status', { status: 'SCHEDULED' })
      .orderBy('fi.departureAt', 'ASC')
      .take(120)
      .getMany();

    const qLower = q?.toLowerCase();
    const filtered = qLower
      ? instances.filter((instance) => {
          const originCode = instance.flight.route.originCode;
          const destCode = instance.flight.route.destCode;
          const origin = cityByCode.get(originCode) ?? originCode;
          const dest = cityByCode.get(destCode) ?? destCode;
          const hay =
            `${instance.flight.flightNo} ${originCode} ${destCode} ${origin} ${dest} ${instance.aircraftTypeOverride ?? instance.flight.aircraftType}`.toLowerCase();
          return hay.includes(qLower);
        })
      : instances;
    const limited = filtered.slice(0, 60);

    const now = new Date();
    const rows = await Promise.all(
      limited.map(async (instance) => {
        const aircraftType = resolveAircraftType(instance);
        const map = await this.seatMapRepo.findOneBy({ aircraftType });
        const capacity = map ? enumerateSeats(map).length : instance.capacity;
        const [soldCount, lockedCount] = await Promise.all([
          this.passengerRepo
            .createQueryBuilder('p')
            .innerJoin('p.booking', 'b')
            .where('p.seatCode IS NOT NULL')
            .andWhere('b.flightInstanceId = :id', { id: instance.id })
            .andWhere('b.status != :cancelled', { cancelled: 'CANCELLED' })
            .getCount(),
          this.seatLockRepo
            .createQueryBuilder('sl')
            .where('sl.flightInstanceId = :id', { id: instance.id })
            .andWhere('sl.releasedAt IS NULL')
            .andWhere('sl.expiresAt > :now', { now })
            .getCount(),
        ]);
        const originCode = instance.flight.route.originCode;
        const destCode = instance.flight.route.destCode;
        const originCityFa = cityByCode.get(originCode) ?? originCode;
        const destCityFa = cityByCode.get(destCode) ?? destCode;
        const occupancyPct =
          capacity > 0 ? Math.round((soldCount / capacity) * 100) : 0;
        const statusKey =
          occupancyPct >= 100
            ? 'FULL'
            : occupancyPct >= 90
              ? 'NEAR_FULL'
              : 'SELLING';
        return {
          flightInstanceId: instance.id,
          flightNo: instance.flight.flightNo,
          aircraftType,
          originCode,
          destCode,
          originCityFa,
          destCityFa,
          route: `${originCityFa} ← ${destCityFa}`,
          departureAt: instance.departureAt,
          capacity,
          sold: soldCount,
          soldCount,
          lockedCount,
          freeCount: Math.max(0, capacity - soldCount - lockedCount),
          basePriceIrr: instance.basePriceIrr?.toString() ?? null,
          occupancyPct,
          statusKey,
        };
      }),
    );
    return rows;
  }

  async dashboardStats() {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);

    const pnrStoreStarted = Date.now();
    const [
      todayCount,
      activePnrCount,
      soldSeats,
      revenueRow,
      channelGroups,
      toggles,
    ] = await Promise.all([
      this.bookingRepo.count({
        where: { createdAt: MoreThanOrEqual(dayStart) },
      }),
      this.bookingRepo.count({
        where: { status: In(['HELD', 'PAID', 'TICKETED']) },
      }),
      this.passengerRepo
        .createQueryBuilder('p')
        .innerJoin('p.booking', 'b')
        .where('p.seatCode IS NOT NULL')
        .andWhere('b.status != :cancelled', { cancelled: 'CANCELLED' })
        .getCount(),
      this.ledgerRepo
        .createQueryBuilder('l')
        .select('SUM(l."signedAmountIrr")', 'sum')
        .where('l.type = :type', { type: 'SALE' })
        .andWhere('l."bookingId" IS NOT NULL')
        .getRawOne<{ sum: string | null }>(),
      this.bookingRepo
        .createQueryBuilder('b')
        .select('b.channel', 'channel')
        .addSelect('COUNT(*)', 'count')
        .where('b.status NOT IN (:...statuses)', {
          statuses: ['CANCELLED', 'EXPIRED'],
        })
        .groupBy('b.channel')
        .getRawMany<{ channel: string; count: string }>(),
      this.internalServiceRepo.find({
        where: { key: In(['payment', 'api', 'sms', 'search']) },
        select: { key: true, enabled: true },
      }),
    ]);
    const pnrStoreLatencyMs = Date.now() - pnrStoreStarted;

    const seatInvStarted = Date.now();
    await this.passengerRepo
      .createQueryBuilder('p')
      .where('p.seatCode IS NOT NULL')
      .getCount();
    const seatInventoryLatencyMs = Date.now() - seatInvStarted;

    const toggleByKey = new Map(toggles.map((t) => [t.key, t.enabled]));
    const channelLabel: Record<string, string> = {
      SYSTEM: 'فروش مستقیم سایت',
      AGENCY: 'API آژانس‌های همکار',
      CHARTER: 'فروش چارتر',
    };
    const channelColor: Record<string, string> = {
      SYSTEM: '#3b82f6',
      AGENCY: '#34d399',
      CHARTER: '#a855f7',
    };
    const channelCounts = channelGroups.map((g) => ({
      channel: g.channel,
      count: Number(g.count),
    }));
    const channelTotal = channelCounts.reduce((a, g) => a + g.count, 0);
    const channels =
      channelTotal === 0
        ? []
        : channelCounts
            .map((g) => ({
              key: g.channel,
              label: channelLabel[g.channel] ?? g.channel,
              color: channelColor[g.channel] ?? '#6b7b94',
              count: g.count,
              pct: Math.round((g.count / channelTotal) * 1000) / 10,
            }))
            .sort((a, b) => b.count - a.count);

    const svc = (
      name: string,
      fa: string,
      ok: boolean,
      latencyMs: number | null,
    ) => ({
      name,
      fa,
      ok,
      latencyMs,
      statusLabel: ok ? 'سالم' : 'قطع',
    });

    const services = [
      svc('reservation-api', 'سرویس رزرواسیون مرکزی', true, pnrStoreLatencyMs),
      svc('pnr-store', 'پایگاه ذخیره PNR', true, pnrStoreLatencyMs),
      svc(
        'payment-gateway',
        'درگاه پرداخت',
        toggleByKey.get('payment') !== false,
        null,
      ),
      svc(
        'agency-api',
        'پلتفرم API آژانس‌ها',
        toggleByKey.get('api') !== false,
        null,
      ),
      svc('seat-inventory', 'موجودی صندلی', true, seatInventoryLatencyMs),
      svc(
        'notification-svc',
        'سرویس اعلان و پیامک',
        toggleByKey.get('sms') !== false,
        null,
      ),
    ];

    return {
      todayBookings: todayCount,
      activePnrs: activePnrCount,
      seatsSold: soldSeats,
      revenueIrr: revenueRow?.sum ? BigInt(revenueRow.sum) : ZERO_IRR,
      channels,
      services,
      servicesStable: services.every((s) => s.ok),
    };
  }

  /** Agencies that already hold an API key — design «دسترسی آژانس‌ها». */
  async agencyApiAccess() {
    const keys = await this.agencyApiKeyRepo
      .createQueryBuilder('k')
      .leftJoin('k.agency', 'agency')
      .leftJoin('agency.user', 'user')
      .addSelect(['agency.userId', 'user.fullName'])
      .orderBy('k.activatedAt', 'DESC')
      .getMany();
    return keys.map((k) => {
      const name = k.agency.user.fullName;
      const initials = name.replace(/\s+/g, '').slice(0, 2) || '؟';
      return {
        id: k.id,
        agencyId: k.agencyId,
        name,
        initials,
        // Raw key is never stored — only an opaque hint from the key id.
        keyHint: `bjk_••••${k.id.replace(/-/g, '').slice(0, 4)}`,
        callCount: k.callCount,
        lastUsedAt: k.lastUsedAt,
        status: k.status,
      };
    });
  }

  /**
   * Non-production only: a fresh, unambiguous SCHEDULED instance for E2E
   * runs to search/lock/issue against, so tests never depend on which of
   * the seed's historical/demo instances happens to sort first. Always
   * 404s in production (enforced here AND by the controller).
   */
  async createTestInstance() {
    if (process.env.NODE_ENV === 'production') {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'یافت نشد.',
      });
    }
    // Persistent E2E databases also contain synthetic AAA/BBB-style routes
    // from lower-level tests. Pick a route whose codes exist in the public
    // airport selector or the browser journey cannot select the fresh
    // instance even though it was created successfully.
    const airports = await this.airportRepo.find({ select: { code: true } });
    const airportCodes = airports.map((a) => a.code);
    const seatMaps = await this.seatMapRepo.find({
      select: { aircraftType: true },
    });
    const aircraftTypes = seatMaps.map((s) => s.aircraftType);

    const flight = await this.flightRepo
      .createQueryBuilder('f')
      .innerJoinAndSelect('f.route', 'route')
      .where('f.aircraftType IN (:...aircraftTypes)', { aircraftTypes })
      .andWhere('route.originCode IN (:...airportCodes)', { airportCodes })
      .andWhere('route.destCode IN (:...airportCodes)', { airportCodes })
      .getOne();
    if (!flight) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'یافت نشد.',
      });
    }
    // Wide random jitter (25-125 days out) so repeated E2E runs practically
    // never collide on the same calendar day and confuse the date search.
    const daysAhead = 25 + Math.floor(Math.random() * 100);
    const departureAt = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
    const instance = await this.flightInstanceRepo.save(
      this.flightInstanceRepo.create({
        flightId: flight.id,
        departureAt,
        arrivalAt: new Date(departureAt.getTime() + 3 * 60 * 60 * 1000),
        capacity: 180,
        charterSeats: 60,
        status: 'SCHEDULED',
      }),
    );
    instance.flight = flight;
    return instance;
  }
}
