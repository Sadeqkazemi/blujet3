import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, MoreThan, Repository, SelectQueryBuilder } from 'typeorm';
import { Airport } from '../../database/entities/airport.entity';
import { FlightInstance } from '../../database/entities/flight-instance.entity';
import { AircraftSeatMap } from '../../database/entities/aircraft-seat-map.entity';
import { Passenger } from '../../database/entities/passenger.entity';
import { SeatLock } from '../../database/entities/seat-lock.entity';
import { RedisService } from '../../redis/redis.service';
import { ErrorCode } from '../../common/errors';
import { getCabinPrice } from './pricing';
import type { Irr } from '../../common/money';
import { enumerateSeats } from '../reservation/seat-layout';
import { resolveAircraftType } from '../flights/aircraft-type.util';
import { serializeCabinCapacities } from '../flights/flight-definition.util';
import { sumActiveCommittedSeats } from '../flights/commitment-capacity.util';
import {
  applySellableDefinitionFilter,
  isSellableDefinitionStatus,
  toPublishStatus,
  type PublishStatus,
} from '../flights/definition-sellability';
import type { CabinClass } from '../../database/enums';
import {
  resolveCommercialCabinCapacity,
  resolveSiteCabinAvailability,
} from './commercial-cabin-capacity';

const ACTIVE_BOOKING_STATUSES = ['DRAFT', 'HELD', 'PAID', 'TICKETED'] as const;
const SEARCH_CABINS: readonly CabinClass[] = [
  'ECONOMY',
  'COMFORT',
  'BUSINESS',
  'FIRST',
];

// CLAUDE.md: search-result cache TTL 5-10 min; Redis is never the source of
// truth for seats/bookings — availability is still re-checked (takenSeatCodes
// queries Postgres directly) at seat-map/booking time, never from this cache.
const AIRPORTS_TTL_SECONDS = 600;
const SEARCH_TTL_SECONDS = 300;
const CABINS_TTL_SECONDS = 300;

@Injectable()
export class SearchService {
  constructor(
    @InjectRepository(Airport)
    private readonly airportRepo: Repository<Airport>,
    @InjectRepository(FlightInstance)
    private readonly flightInstanceRepo: Repository<FlightInstance>,
    @InjectRepository(AircraftSeatMap)
    private readonly seatMapRepo: Repository<AircraftSeatMap>,
    @InjectRepository(Passenger)
    private readonly passengerRepo: Repository<Passenger>,
    @InjectRepository(SeatLock)
    private readonly seatLockRepo: Repository<SeatLock>,
    private readonly redis: RedisService,
  ) {}

  async airports() {
    // v4 excludes UAT test fixtures in both the database query and cache.
    const cacheKey = 'search:airports:v5';
    const cached = await this.redis.get<unknown>(cacheKey);
    if (cached) return cached;

    const airports = await this.airportRepo
      .createQueryBuilder('airport')
      .where('airport.active = true')
      .andWhere(`trim(airport.cityFa) !~ :testCityPattern`, {
        testCityPattern: '^شهر[[:space:]]*(تست|آزمایش)',
      })
      .orderBy('airport.cityFa', 'ASC')
      .getMany();
    await this.redis.set(cacheKey, airports, AIRPORTS_TTL_SECONDS);
    return airports;
  }

  async cabins(): Promise<CabinClass[]> {
    const cacheKey = 'search:cabins:v3';
    const cached = await this.redis.get<CabinClass[]>(cacheKey);
    if (cached) return cached;

    const now = new Date();
    const qb = this.flightInstanceRepo
      .createQueryBuilder('fi')
      .where('fi.status = :status', { status: 'SCHEDULED' })
      .andWhere('fi.publicSaleEnabled = true')
      .andWhere('fi.departureAt >= :now', { now });
    this.applySaleWindowOpen(qb, 'fi', now);
    applySellableDefinitionFilter(qb, 'fi');
    const instances = await qb.getMany();
    const found = new Set<CabinClass>();
    for (const instance of instances) {
      for (const row of serializeCabinCapacities(instance.cabinCapacities)) {
        if (row.seats <= 0) continue;
        const siteAvailability = await resolveSiteCabinAvailability(
          this.flightInstanceRepo.manager,
          instance.id,
          row.cabin,
          row.seats,
        );
        if (siteAvailability.releasedSeats > 0) found.add(row.cabin);
      }
    }
    const ordered = SEARCH_CABINS.filter((cabin) => found.has(cabin));
    const result: CabinClass[] = ordered.length > 0 ? ordered : ['ECONOMY'];
    await this.redis.set(cacheKey, result, CABINS_TTL_SECONDS);
    return result;
  }

  /** Public flight search — same SCHEDULED/day-window semantics as the
   * staff reservation search, but unauthenticated and cabin/price-aware
   * (design's نتایج پرواز needs both cabins' price + seatsLeft per card).
   * Cached briefly (SEARCH_TTL_SECONDS): a cache hit can serve a slightly
   * stale seatsLeft count, which is fine since the buy flow always
   * re-validates the seat map / re-prices against Postgres directly. */
  async search(origin: string, dest: string, date: string, cabin?: CabinClass) {
    const cacheKey = `search:flights:${origin.toUpperCase()}:${dest.toUpperCase()}:${date}:${cabin ?? 'ALL'}`;
    const cached = await this.redis.get<unknown[]>(cacheKey);
    if (cached) return cached;

    const results = await this.searchUncached(origin, dest, date, cabin);
    await this.redis.set(cacheKey, results, SEARCH_TTL_SECONDS);
    return results;
  }

  private searchCacheKey(
    originCode: string,
    destCode: string,
    departureAt: Date,
    cabin?: CabinClass,
  ): string {
    const date = departureAt.toISOString().slice(0, 10);
    return `search:flights:${originCode.toUpperCase()}:${destCode.toUpperCase()}:${date}:${cabin ?? 'ALL'}`;
  }

  /** Called right after a booking mutates seat availability/pricing for an
   * instance, so a customer never sees a stale seatsLeft/price for the rest
   * of the TTL window after someone else just booked the seat they're
   * looking at. */
  async invalidateForInstance(flightInstanceId: string): Promise<void> {
    const instance = await this.flightInstanceRepo
      .createQueryBuilder('fi')
      .leftJoinAndSelect('fi.flight', 'flight')
      .leftJoinAndSelect('flight.route', 'route')
      .where('fi.id = :id', { id: flightInstanceId })
      .getOne();
    if (!instance) return;
    await Promise.all(
      [undefined, ...SEARCH_CABINS].map((cabin) =>
        this.redis.del(
          this.searchCacheKey(
            instance.flight.route.originCode,
            instance.flight.route.destCode,
            instance.departureAt,
            cabin,
          ),
        ),
      ),
    );
  }

  /** Busts one specific origin/dest/date cache entry directly, without an
   * instance lookup. Needed when a CEO-approved revision moves a flight to
   * a new route/date: invalidateForInstance only ever busts the *current*
   * (post-approval) key — by the time it runs, the row already reflects
   * the new state — so the *previous* route/date's cached search results
   * would otherwise keep showing the (now-moved) flight until TTL expiry. */
  async invalidateForRouteDate(
    originCode: string,
    destCode: string,
    departureAt: Date,
  ): Promise<void> {
    await Promise.all(
      [undefined, ...SEARCH_CABINS].map((cabin) =>
        this.redis.del(
          this.searchCacheKey(originCode, destCode, departureAt, cabin),
        ),
      ),
    );
  }

  /** Phase 13: an instance with a sale window is excluded from search once
   * outside it; NULL on either end means "no restriction" (existing
   * instances keep working unchanged). Reused by createBooking's own
   * re-check so a stale search result can't be booked past the window. */
  private applySaleWindowOpen(
    qb: SelectQueryBuilder<FlightInstance>,
    alias: string,
    now: Date,
  ): SelectQueryBuilder<FlightInstance> {
    qb.andWhere(
      `("${alias}"."saleStartsAt" IS NULL OR "${alias}"."saleStartsAt" <= :now)`,
      { now },
    );
    qb.andWhere(
      `("${alias}"."saleEndsAt" IS NULL OR "${alias}"."saleEndsAt" >= :now)`,
      { now },
    );
    qb.andWhere(
      `COALESCE((${alias}."commercialPanelSettings"->>'siteVisible')::boolean, true) = true`,
    );
    return qb;
  }

  private physicalCabinCapacity(
    instance: FlightInstance,
    cabin: CabinClass,
    seats: { seatCode: string; cabin: CabinClass }[],
  ): number | null {
    const cabinSeats = seats.filter((seat) => seat.cabin === cabin);
    if (cabinSeats.length === 0) return null;
    const configured = serializeCabinCapacities(instance.cabinCapacities).find(
      (row) => row.cabin === cabin,
    )?.seats;
    const capacity =
      configured == null
        ? cabinSeats.length
        : Math.min(configured, cabinSeats.length);
    return capacity > 0 ? capacity : null;
  }

  /** seatsLeft uses the Commercial Manager's fare allocations when present,
   * while the aircraft/configured cabin remains the physical ceiling.
   * Active charter and agency commitments are removed from the same pool. */
  private seatsLeftForCabin(
    capacity: number,
    cabin: CabinClass,
    seats: { seatCode: string; cabin: CabinClass }[],
    taken: Set<string>,
    committed: number,
  ): number {
    const cabinSeats = seats.filter((s) => s.cabin === cabin);
    const cabinSeatCodes = new Set(cabinSeats.map((s) => s.seatCode));
    const takenInCabin = [...taken].filter((code) =>
      cabinSeatCodes.has(code),
    ).length;
    return Math.max(0, capacity - takenInCabin - committed);
  }

  /**
   * Authoritative cabin availability for internal consumers such as the
   * agency seat-inquiry flow.  Keep this on the reservation engine so every
   * caller uses the same physical seat map, active bookings/locks and agency
   * commitments as public search and booking creation.
   */
  async cabinAvailability(
    instance: FlightInstance,
    cabin: CabinClass,
  ): Promise<{ capacity: number; seatsLeft: number } | null> {
    const map = await this.seatMapRepo.findOneBy({
      aircraftType: resolveAircraftType(instance),
    });
    if (!map) return null;

    const seats = enumerateSeats(map);
    const physicalCapacity = this.physicalCabinCapacity(instance, cabin, seats);
    if (physicalCapacity === null) return null;
    const capacity = await resolveCommercialCabinCapacity(
      this.flightInstanceRepo.manager,
      instance.id,
      cabin,
      physicalCapacity,
    );
    if (capacity <= 0) return null;

    const [taken, committed] = await Promise.all([
      this.takenSeatCodes(instance.id),
      sumActiveCommittedSeats(
        this.flightInstanceRepo.manager,
        instance.id,
        cabin,
      ),
    ]);
    const seatsLeft = this.seatsLeftForCabin(
      capacity,
      cabin,
      seats,
      taken,
      committed,
    );
    return { capacity, seatsLeft };
  }

  private async searchUncached(
    origin: string,
    dest: string,
    date: string,
    requestedCabin?: CabinClass,
  ) {
    const dayStart = new Date(date);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
    const now = new Date();

    const qb = this.flightInstanceRepo
      .createQueryBuilder('fi')
      .leftJoinAndSelect('fi.flight', 'flight')
      .leftJoinAndSelect('flight.route', 'route')
      .where('fi.status = :status', { status: 'SCHEDULED' })
      .andWhere('fi.publicSaleEnabled = true')
      .andWhere('fi.departureAt >= :dayStart', { dayStart })
      .andWhere('fi.departureAt < :dayEnd', { dayEnd })
      .andWhere('LOWER(route.originCode) = LOWER(:origin)', { origin })
      .andWhere('LOWER(route.destCode) = LOWER(:dest)', { dest })
      .orderBy('fi.departureAt', 'ASC');
    this.applySaleWindowOpen(qb, 'fi', now);
    applySellableDefinitionFilter(qb, 'fi');
    const instances = await qb.getMany();

    const results: {
      flightInstanceId: string;
      flightNo: string;
      aircraftType: string;
      originCode: string;
      destCode: string;
      departureAt: Date;
      arrivalAt: Date;
      definitionStatus: string;
      publishStatus: PublishStatus;
      cabins: { cabin: CabinClass; priceIrr: Irr; seatsLeft: number }[];
    }[] = [];
    for (const instance of instances) {
      const map = await this.seatMapRepo.findOneBy({
        aircraftType: resolveAircraftType(instance),
      });
      const seats = map ? enumerateSeats(map) : [];
      const taken = await this.takenSeatCodes(instance.id);

      const cabins: {
        cabin: CabinClass;
        priceIrr: Irr;
        seatsLeft: number;
      }[] = [];
      for (const cabin of requestedCabin ? [requestedCabin] : SEARCH_CABINS) {
        const physicalCapacity = this.physicalCabinCapacity(
          instance,
          cabin,
          seats,
        );
        if (physicalCapacity === null) continue;
        const capacity = await resolveCommercialCabinCapacity(
          this.flightInstanceRepo.manager,
          instance.id,
          cabin,
          physicalCapacity,
        );
        if (capacity <= 0) continue;
        const committed = await sumActiveCommittedSeats(
          this.flightInstanceRepo.manager,
          instance.id,
          cabin,
        );
        const physicalSeatsLeft = this.seatsLeftForCabin(
          capacity,
          cabin,
          seats,
          taken,
          committed,
        );
        const siteAvailability = await resolveSiteCabinAvailability(
          this.flightInstanceRepo.manager,
          instance.id,
          cabin,
          physicalSeatsLeft,
        );
        if (siteAvailability.seatsLeft <= 0) continue;
        cabins.push({
          cabin,
          priceIrr: await getCabinPrice(
            this.flightInstanceRepo.manager,
            instance.id,
            cabin,
          ),
          seatsLeft: siteAvailability.seatsLeft,
        });
      }

      if (cabins.length === 0) continue;

      results.push({
        flightInstanceId: instance.id,
        flightNo: instance.flight.flightNo,
        aircraftType: resolveAircraftType(instance),
        originCode: instance.flight.route.originCode,
        destCode: instance.flight.route.destCode,
        departureAt: instance.departureAt,
        arrivalAt: instance.arrivalAt,
        definitionStatus: instance.definitionStatus,
        publishStatus: toPublishStatus(
          instance.definitionStatus,
          instance.approvedSnapshot != null,
        ),
        cabins,
      });
    }
    // ── 1-stop connection builder (CLAUDE.md search rules) ──
    // Only when the route has few/no direct flights; legs must respect the
    // transfer airport's minimum connection time and stay ≤2 connections
    // (i.e. up to 2 legs here; deeper chains are out of scope until a GDS
    // integration needs them).
    const connections =
      results.length > 0
        ? []
        : await this.findConnections(origin, dest, dayStart, dayEnd, requestedCabin);

    return [...results, ...connections];
  }

  /** A→X→B same-window pairs where leg2 departs at least the transfer
   * airport's minConnectMin after leg1 arrives. Priced as the SUM of both
   * legs (each leg re-uses getCabinPrice, so connection pricing can never
   * disagree with the legs' own pages); seatsLeft is the min of the legs. */
  private async findConnections(
    origin: string,
    dest: string,
    dayStart: Date,
    dayEnd: Date,
    requestedCabin?: CabinClass,
  ) {
    const now = new Date();
    const firstLegsQb = this.flightInstanceRepo
      .createQueryBuilder('fi')
      .leftJoinAndSelect('fi.flight', 'flight')
      .leftJoinAndSelect('flight.route', 'route')
      .where('fi.status = :status', { status: 'SCHEDULED' })
      .andWhere('fi.publicSaleEnabled = true')
      .andWhere('fi.departureAt >= :dayStart', { dayStart })
      .andWhere('fi.departureAt < :dayEnd', { dayEnd })
      .andWhere('LOWER(route.originCode) = LOWER(:origin)', { origin });
    this.applySaleWindowOpen(firstLegsQb, 'fi', now);
    applySellableDefinitionFilter(firstLegsQb, 'fi');

    const secondLegsQb = this.flightInstanceRepo
      .createQueryBuilder('fi')
      .leftJoinAndSelect('fi.flight', 'flight')
      .leftJoinAndSelect('flight.route', 'route')
      .where('fi.status = :status', { status: 'SCHEDULED' })
      .andWhere('fi.publicSaleEnabled = true')
      .andWhere('fi.departureAt >= :dayStart', { dayStart })
      .andWhere('LOWER(route.destCode) = LOWER(:dest)', { dest });
    this.applySaleWindowOpen(secondLegsQb, 'fi', now);
    applySellableDefinitionFilter(secondLegsQb, 'fi');

    const [firstLegs, secondLegs] = await Promise.all([
      firstLegsQb.getMany(),
      secondLegsQb.getMany(),
    ]);

    const transferCodes = new Set(
      firstLegs.map((l) => l.flight.route.destCode),
    );
    const airports = transferCodes.size
      ? await this.airportRepo.find({
          where: { code: In([...transferCodes]) },
        })
      : [];
    const minConnect = new Map(
      airports.map((a) => [a.code, a.minConnectMin * 60_000]),
    );

    const pairs: {
      a: (typeof firstLegs)[number];
      b: (typeof firstLegs)[number];
    }[] = [];
    for (const a of firstLegs) {
      const via = a.flight.route.destCode;
      if (via.toUpperCase() === dest.toUpperCase()) continue;
      const gap = minConnect.get(via) ?? 60 * 60_000;
      for (const b of secondLegs) {
        if (b.flight.route.originCode !== via) continue;
        if (b.departureAt.getTime() < a.arrivalAt.getTime() + gap) continue;
        // keep connections same-day-ish: leg2 departs within 24h of leg1 arrival
        if (b.departureAt.getTime() > a.arrivalAt.getTime() + 24 * 60 * 60_000)
          continue;
        pairs.push({ a, b });
        break; // earliest feasible second leg per first leg
      }
    }

    const out: {
      flightInstanceId: string;
      flightNo: string;
      aircraftType: string;
      originCode: string;
      destCode: string;
      departureAt: Date;
      arrivalAt: Date;
      definitionStatus: string;
      publishStatus: PublishStatus;
      cabins: { cabin: CabinClass; priceIrr: Irr; seatsLeft: number }[];
      connection: {
        via: string;
        legs: {
          flightInstanceId: string;
          flightNo: string;
          originCode: string;
          destCode: string;
          departureAt: Date;
          arrivalAt: Date;
        }[];
      };
    }[] = [];
    for (const { a, b } of pairs.slice(0, 5)) {
      const legs = [a, b];
      const cabins: {
        cabin: CabinClass;
        priceIrr: Irr;
        seatsLeft: number;
      }[] = [];
      for (const cabin of requestedCabin ? [requestedCabin] : SEARCH_CABINS) {
        let priceSum: Irr = 0n;
        let seatsLeft = Number.MAX_SAFE_INTEGER;
        let ok = true;
        for (const leg of legs) {
          const map = await this.seatMapRepo.findOneBy({
            aircraftType: resolveAircraftType(leg),
          });
          const legSeats = map ? enumerateSeats(map) : [];
          const physicalCapacity = this.physicalCabinCapacity(
            leg,
            cabin,
            legSeats,
          );
          if (physicalCapacity === null) {
            ok = false;
            break;
          }
          const capacity = await resolveCommercialCabinCapacity(
            this.flightInstanceRepo.manager,
            leg.id,
            cabin,
            physicalCapacity,
          );
          if (capacity <= 0) {
            ok = false;
            break;
          }
          const legCommitted = await sumActiveCommittedSeats(
            this.flightInstanceRepo.manager,
            leg.id,
            cabin,
          );
          const physicalLeft = this.seatsLeftForCabin(
            capacity,
            cabin,
            legSeats,
            await this.takenSeatCodes(leg.id),
            legCommitted,
          );
          const siteAvailability = await resolveSiteCabinAvailability(
            this.flightInstanceRepo.manager,
            leg.id,
            cabin,
            physicalLeft,
          );
          if (siteAvailability.seatsLeft <= 0) {
            ok = false;
            break;
          }
          seatsLeft = Math.min(seatsLeft, siteAvailability.seatsLeft);
          priceSum += await getCabinPrice(
            this.flightInstanceRepo.manager,
            leg.id,
            cabin,
          );
        }
        if (ok) cabins.push({ cabin, priceIrr: priceSum, seatsLeft });
      }
      if (cabins.length === 0) continue;
      out.push({
        flightInstanceId: a.id,
        flightNo: `${a.flight.flightNo}+${b.flight.flightNo}`,
        aircraftType: resolveAircraftType(a),
        originCode: a.flight.route.originCode,
        destCode: b.flight.route.destCode,
        departureAt: a.departureAt,
        arrivalAt: b.arrivalAt,
        definitionStatus: a.definitionStatus,
        publishStatus: toPublishStatus(
          a.definitionStatus,
          a.approvedSnapshot != null,
        ),
        cabins,
        connection: {
          via: a.flight.route.destCode,
          legs: legs.map((l) => ({
            flightInstanceId: l.id,
            flightNo: l.flight.flightNo,
            originCode: l.flight.route.originCode,
            destCode: l.flight.route.destCode,
            departureAt: l.departureAt,
            arrivalAt: l.arrivalAt,
          })),
        },
      });
    }
    return out;
  }

  async seatMap(flightInstanceId: string) {
    const instance = await this.flightInstanceRepo
      .createQueryBuilder('fi')
      .leftJoinAndSelect('fi.flight', 'flight')
      .where('fi.id = :id', { id: flightInstanceId })
      .getOne();
    if (
      !instance ||
      instance.status !== 'SCHEDULED' ||
      !isSellableDefinitionStatus(
        instance.definitionStatus,
        instance.approvedSnapshot != null,
      )
    ) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'پرواز یافت نشد یا دیگر قابل رزرو نیست.',
      });
    }
    const map = await this.seatMapRepo.findOneByOrFail({
      aircraftType: resolveAircraftType(instance),
    });
    const seats = enumerateSeats(map);
    const taken = await this.takenSeatCodes(flightInstanceId);

    return {
      flightInstanceId,
      aircraftType: resolveAircraftType(instance),
      cabinLayout: {
        FIRST: {
          colsLeft: map.firstColsLeft,
          colsRight: map.firstColsRight,
          aisleAfterIndex: map.firstColsLeft?.length ?? 0,
        },
        BUSINESS: {
          colsLeft: map.businessColsLeft,
          colsRight: map.businessColsRight,
          aisleAfterIndex: map.businessColsLeft?.length ?? 0,
        },
        COMFORT: {
          colsLeft: map.comfortColsLeft,
          colsRight: map.comfortColsRight,
          aisleAfterIndex: map.comfortColsLeft?.length ?? 0,
        },
        ECONOMY: {
          colsLeft: map.economyColsLeft,
          colsRight: map.economyColsRight,
          aisleAfterIndex: map.economyColsLeft?.length ?? 0,
        },
      },
      excludedSeatCodes: map.excludedSeatCodes ?? [],
      exitRows: map.exitRows ?? [],
      seats: seats.map((s) => ({
        ...s,
        status: taken.has(s.seatCode) ? 'TAKEN' : 'FREE',
      })),
    };
  }

  /** Sold + actively-held + managerially-locked seat codes for a flight
   * instance — the single availability check reused by search, the seat
   * map, and booking creation so they can never disagree. Excludes
   * expired HELD bookings (materializeExpiry keeps holdExpiresAt honest;
   * a booking already past its TTL frees the seat immediately here even
   * before the lazy-expiry sweep runs on that row). */
  async takenSeatCodes(flightInstanceId: string): Promise<Set<string>> {
    const now = new Date();
    const [passengers, locks] = await Promise.all([
      this.passengerRepo
        .createQueryBuilder('p')
        .innerJoin('p.booking', 'b')
        .select(['p.seatCode', 'p.extraSeatCode'])
        .where('(p.seatCode IS NOT NULL OR p.extraSeatCode IS NOT NULL)')
        .andWhere('b.flightInstanceId = :flightInstanceId', {
          flightInstanceId,
        })
        .andWhere('b.status IN (:...statuses)', {
          statuses: [...ACTIVE_BOOKING_STATUSES],
        })
        .andWhere('(b.status != :held OR b."holdExpiresAt" > :now)', {
          held: 'HELD',
          now,
        })
        .getMany(),
      this.seatLockRepo.find({
        where: {
          flightInstanceId,
          releasedAt: IsNull(),
          expiresAt: MoreThan(now),
        },
        select: { seatCode: true },
      }),
    ]);
    return new Set([
      ...passengers.flatMap((p) =>
        [p.seatCode, p.extraSeatCode].filter((code): code is string => !!code),
      ),
      ...locks.map((l) => l.seatCode),
    ]);
  }

  /** Seven-day (±3) min ECONOMY price strip for the results price calendar. */
  async priceCalendar(
    origin: string,
    dest: string,
    centerDate: string,
    radiusDays = 3,
    cabin: CabinClass = 'ECONOMY',
  ): Promise<
    {
      date: string;
      minPriceIrr: string;
      dateLabelFa: string;
      isCenter: boolean;
    }[]
  > {
    const center = new Date(centerDate);
    center.setUTCHours(0, 0, 0, 0);
    const rows: {
      date: string;
      minPriceIrr: string;
      dateLabelFa: string;
      isCenter: boolean;
    }[] = [];

    for (let offset = -radiusDays; offset <= radiusDays; offset++) {
      const day = new Date(center);
      day.setUTCDate(day.getUTCDate() + offset);
      const iso = day.toISOString().slice(0, 10);
      const flights = (await this.search(origin, dest, iso, cabin)) as {
        cabins: { cabin: CabinClass; priceIrr: Irr; seatsLeft: number }[];
      }[];
      let min: bigint | null = null;
      for (const f of flights) {
        const selected = f.cabins.find((c) => c.cabin === cabin);
        const price = BigInt(selected?.priceIrr ?? '0');
        if (price > 0n && (min === null || price < min)) min = price;
      }
      rows.push({
        date: iso,
        minPriceIrr: min !== null ? String(min) : '0',
        dateLabelFa: iso,
        isCenter: offset === 0,
      });
    }
    return rows;
  }

  /** Phase 13: per-channel taken-seat counts for the real inventory pools
   * (agency quota / charter allotment / public). A managerial `SeatLock`
   * physically occupies a seat but isn't a `Booking`, so it's tallied
   * under a virtual `MANAGERIAL` bucket rather than `SYSTEM` — it still
   * counts against the public pool's remaining count at the call site
   * (see `BookingService.createBooking`), just not conflated with genuine
   * public-channel sales. */
  async takenCountsByChannel(flightInstanceId: string): Promise<{
    SYSTEM: number;
    CHARTER: number;
    AGENCY: number;
    MANAGERIAL: number;
  }> {
    const now = new Date();
    const [channelRows, lockCount] = await Promise.all([
      this.passengerRepo
        .createQueryBuilder('p')
        .innerJoin('p.booking', 'b')
        .select('b.channel', 'channel')
        .addSelect(
          'SUM(CASE WHEN p."extraSeatCode" IS NULL THEN 1 ELSE 2 END)',
          'count',
        )
        .where('(p.seatCode IS NOT NULL OR p.extraSeatCode IS NOT NULL)')
        .andWhere('b.flightInstanceId = :flightInstanceId', {
          flightInstanceId,
        })
        .andWhere('b.status IN (:...statuses)', {
          statuses: [...ACTIVE_BOOKING_STATUSES],
        })
        .andWhere('(b.status != :held OR b."holdExpiresAt" > :now)', {
          held: 'HELD',
          now,
        })
        .groupBy('b.channel')
        .getRawMany<{
          channel: 'SYSTEM' | 'CHARTER' | 'AGENCY';
          count: string;
        }>(),
      this.seatLockRepo.count({
        where: {
          flightInstanceId,
          releasedAt: IsNull(),
          expiresAt: MoreThan(now),
        },
      }),
    ]);
    const counts = { SYSTEM: 0, CHARTER: 0, AGENCY: 0, MANAGERIAL: lockCount };
    for (const row of channelRows) counts[row.channel] = Number(row.count);
    return counts;
  }
}
