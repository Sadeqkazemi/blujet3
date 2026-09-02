import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In, IsNull, MoreThan, Not, Repository } from 'typeorm';
import { RRule } from 'rrule';
import { FlightInstance } from '../../database/entities/flight-instance.entity';
import { Flight } from '../../database/entities/flight.entity';
import { Route } from '../../database/entities/route.entity';
import { Airport } from '../../database/entities/airport.entity';
import { AircraftSeatMap } from '../../database/entities/aircraft-seat-map.entity';
import { Schedule } from '../../database/entities/schedule.entity';
import { FareRule } from '../../database/entities/fare-rule.entity';
import { AgencyAllotment } from '../../database/entities/agency-allotment.entity';
import { AgencyProfile } from '../../database/entities/agency-profile.entity';
import { Booking } from '../../database/entities/booking.entity';
import { Passenger } from '../../database/entities/passenger.entity';
import { SeatLock } from '../../database/entities/seat-lock.entity';
import { FarePricingProposal } from '../../database/entities/fare-pricing-proposal.entity';
import { FlightScheduleTemplate } from '../../database/entities/flight-schedule-template.entity';
import { AuditLog } from '../../database/entities/audit-log.entity';
import { User } from '../../database/entities/user.entity';
import { WalletEntry } from '../../database/entities/wallet-entry.entity';
import { LedgerEntry } from '../../database/entities/ledger-entry.entity';
import { AuditService } from '../audit/audit.service';
import { ErrorCode } from '../../common/errors';
import { enumerateSeats } from '../reservation/seat-layout';
import { resolveAircraftType } from './aircraft-type.util';
import { serializeCabinCapacities } from './flight-definition.util';
import { materializeDepartedInstances } from './flight-lifecycle.util';
import {
  PRICE_SUGGESTION_PROVIDER,
  type PriceSuggestionProvider,
} from '../ai/price-suggestion.provider';
import { StepUpService } from '../auth/step-up.service';
import type { PersistedAiSuggestion } from '../pricing/pricing.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import {
  ZERO_IRR,
  addIrr,
  divRoundBigInt,
  maxIrr,
  roundIrrTo,
  subIrr,
} from '../../common/money';
import type { Irr } from '../../common/money';
import { RedisService } from '../../redis/redis.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SmsService } from '../sms/sms.service';
import {
  BookingStatus,
  BookingChannel,
  FlightDefinitionStatus,
  FlightInstanceStatus,
  LedgerEntryType,
  NotificationCategory,
  WalletEntryType,
  type CabinClass,
} from '../../database/enums';
import { isSellableDefinitionStatus } from './definition-sellability';
import {
  buildClassBreakdown,
  commercialRowExtras,
  mergeCommercialPanelSettings,
  parseCommercialPanelSettings,
  resolveSiteVisible,
  type CommercialPanelSettings,
} from './commercial-panel-settings';

/** Long-range published inventory is repeated in the planning tab, but it
 * must never be removed from the complete active-flight list. */
const FUTURE_WINDOW_DAYS = 7;

/** Statuses that count as a sold seat (design: «صندلی فروخته‌شده»). */
const SOLD_STATUSES = ['PAID', 'TICKETED'] as const;

/** Product rule: weak-sale escalation begins one week before departure. */
const WEAK_SALES_WINDOW_HOURS = 7 * 24;
const WEAK_SALES_OCCUPANCY_PCT = 60;

function stringifyScalar(value: unknown, fallback = ''): string {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'bigint' ||
    typeof value === 'boolean'
  ) {
    return String(value);
  }
  return fallback;
}

export function isCommercialInventoryVisible(
  instance: Pick<
    FlightInstance,
    'status' | 'definitionStatus' | 'approvedSnapshot'
  > &
    Partial<Pick<FlightInstance, 'saleStartsAt' | 'saleEndsAt'>>,
  now = new Date(),
): boolean {
  return (
    (instance.status === FlightInstanceStatus.SCHEDULED ||
      instance.status === FlightInstanceStatus.CANCELLED) &&
    isSellableDefinitionStatus(
      instance.definitionStatus,
      instance.approvedSnapshot != null,
    ) &&
    (!instance.saleStartsAt || instance.saleStartsAt <= now) &&
    (!instance.saleEndsAt || instance.saleEndsAt >= now)
  );
}

/** Every published occurrence stays in the active list until departure. */
export function isCommercialActiveOccurrence(
  instance: Pick<FlightInstance, 'status' | 'departureAt'>,
  now = new Date(),
): boolean {
  return (
    instance.status === FlightInstanceStatus.CANCELLED ||
    (instance.status === FlightInstanceStatus.SCHEDULED &&
      instance.departureAt >= now)
  );
}

export function commercialSalesHealth(
  departureAt: Date,
  sold: number,
  capacity: number,
  now = new Date(),
) {
  const occupancyPct =
    capacity > 0 ? Math.round((Math.max(0, sold) / capacity) * 100) : 0;
  const hoursToDeparture = Math.max(
    0,
    Math.round(((departureAt.getTime() - now.getTime()) / 3_600_000) * 10) / 10,
  );
  const isWeak =
    departureAt > now &&
    hoursToDeparture <= WEAK_SALES_WINDOW_HOURS &&
    occupancyPct < WEAK_SALES_OCCUPANCY_PCT;
  return {
    isWeak,
    occupancyPct,
    hoursToDeparture,
    thresholdPct: WEAK_SALES_OCCUPANCY_PCT,
    windowHours: WEAK_SALES_WINDOW_HOURS,
    reasonFa: isWeak
      ? `فروش این پرواز تا ${hoursToDeparture} ساعت مانده به پرواز فقط ${occupancyPct}٪ ظرفیت است.`
      : occupancyPct >= WEAK_SALES_OCCUPANCY_PCT
        ? 'فروش پرواز در محدوده قابل قبول است.'
        : 'پرواز هنوز خارج از بازه هشدار فروش ضعیف است.',
  };
}

@Injectable()
export class FlightsService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(FlightInstance)
    private readonly instanceRepo: Repository<FlightInstance>,
    @InjectRepository(Flight)
    private readonly flightRepo: Repository<Flight>,
    @InjectRepository(Route)
    private readonly routeRepo: Repository<Route>,
    @InjectRepository(Airport)
    private readonly airportRepo: Repository<Airport>,
    @InjectRepository(AircraftSeatMap)
    private readonly seatMapRepo: Repository<AircraftSeatMap>,
    @InjectRepository(Schedule)
    private readonly scheduleRepo: Repository<Schedule>,
    @InjectRepository(FareRule)
    private readonly fareRuleRepo: Repository<FareRule>,
    @InjectRepository(AgencyAllotment)
    private readonly allotmentRepo: Repository<AgencyAllotment>,
    @InjectRepository(AgencyProfile)
    private readonly agencyProfileRepo: Repository<AgencyProfile>,
    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,
    @InjectRepository(Passenger)
    private readonly passengerRepo: Repository<Passenger>,
    @InjectRepository(SeatLock)
    private readonly seatLockRepo: Repository<SeatLock>,
    @InjectRepository(FarePricingProposal)
    private readonly proposalRepo: Repository<FarePricingProposal>,
    @InjectRepository(FlightScheduleTemplate)
    private readonly scheduleTemplateRepo: Repository<FlightScheduleTemplate>,
    @InjectRepository(AuditLog)
    private readonly auditLogRepo: Repository<AuditLog>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly audit: AuditService,
    @Inject(PRICE_SUGGESTION_PROVIDER)
    private readonly priceSuggestions: PriceSuggestionProvider,
    private readonly stepUp: StepUpService,
    private readonly redis: RedisService,
    private readonly notifications: NotificationsService,
    private readonly sms: SmsService,
  ) {}

  private async emitWeakSalesAlerts(
    rows: Array<{
      id: string;
      flightNo: string;
      departureAt: string;
      salesHealth: { isWeak: boolean; reasonFa: string };
    }>,
  ) {
    const weak = rows.filter((row) => row.salesHealth.isWeak);
    if (weak.length === 0) return;
    const recipients = await this.userRepo.find({
      where: {
        role: In([
          'COMMERCIAL_MANAGER',
          'FINANCE_MANAGER',
          'SENIOR_MANAGER',
          'CEO',
          'BOARD_CHAIR',
        ]),
        isActive: true,
        deletedAt: IsNull(),
      },
      select: { id: true },
    });
    await Promise.allSettled(
      weak.flatMap((flight) =>
        recipients.map((recipient) =>
          this.notifications.notify({
            recipientId: recipient.id,
            category: 'SYSTEM',
            action: 'WEAK_FLIGHT_SALES',
            title: `هشدار فروش ضعیف پرواز ${flight.flightNo}`,
            body: flight.salesHealth.reasonFa,
            entityType: 'FlightInstance',
            entityId: flight.id,
            dedupeKey: `weak-sales:${flight.id}:${recipient.id}`,
          }),
        ),
      ),
    );
  }

  private async soldByInstance(
    instanceIds: string[],
  ): Promise<Map<string, number>> {
    if (instanceIds.length === 0) return new Map();
    const rows = await this.bookingRepo
      .createQueryBuilder('b')
      .select('b.flightInstanceId', 'flightInstanceId')
      .addSelect('COUNT(*)', 'count')
      .where('b.flightInstanceId IN (:...ids)', { ids: instanceIds })
      .andWhere('b.status IN (:...statuses)', { statuses: [...SOLD_STATUSES] })
      .groupBy('b.flightInstanceId')
      .getRawMany<{ flightInstanceId: string; count: string }>();
    return new Map(rows.map((r) => [r.flightInstanceId, Number(r.count)]));
  }

  private async soldByInstanceAndCabin(
    instanceIds: string[],
  ): Promise<Map<string, Map<CabinClass, number>>> {
    const result = new Map<string, Map<CabinClass, number>>();
    if (instanceIds.length === 0) return result;
    const rows = await this.bookingRepo
      .createQueryBuilder('b')
      .select('b.flightInstanceId', 'flightInstanceId')
      .addSelect('b.cabin', 'cabin')
      .addSelect('COUNT(*)', 'count')
      .where('b.flightInstanceId IN (:...ids)', { ids: instanceIds })
      .andWhere('b.status IN (:...statuses)', { statuses: [...SOLD_STATUSES] })
      .groupBy('b.flightInstanceId')
      .addGroupBy('b.cabin')
      .getRawMany<{
        flightInstanceId: string;
        cabin: CabinClass;
        count: string;
      }>();
    for (const row of rows) {
      const byCabin = result.get(row.flightInstanceId) ?? new Map();
      byCabin.set(row.cabin, Number(row.count));
      result.set(row.flightInstanceId, byCabin);
    }
    return result;
  }

  private async fareRulesByInstances(
    instanceIds: string[],
  ): Promise<Map<string, FareRule[]>> {
    const map = new Map<string, FareRule[]>();
    if (instanceIds.length === 0) return map;
    const rules = await this.fareRuleRepo.find({
      where: { flightInstanceId: In(instanceIds) },
      order: { cabin: 'ASC', priceIrr: 'ASC' },
    });
    for (const rule of rules) {
      const list = map.get(rule.flightInstanceId) ?? [];
      list.push(rule);
      map.set(rule.flightInstanceId, list);
    }
    return map;
  }

  private async lockedSeatsByInstance(
    instanceIds: string[],
  ): Promise<Map<string, number>> {
    if (instanceIds.length === 0) return new Map();
    const rows = await this.seatLockRepo
      .createQueryBuilder('sl')
      .select('sl.flightInstanceId', 'flightInstanceId')
      .addSelect('COUNT(*)', 'count')
      .where('sl.flightInstanceId IN (:...ids)', { ids: instanceIds })
      .andWhere('sl.releasedAt IS NULL')
      .groupBy('sl.flightInstanceId')
      .getRawMany<{ flightInstanceId: string; count: string }>();
    return new Map(rows.map((r) => [r.flightInstanceId, Number(r.count)]));
  }

  private async routeAgencyPriceByTemplate(
    templateIds: string[],
  ): Promise<Map<string, string>> {
    if (templateIds.length === 0) return new Map();
    const templates = await this.scheduleTemplateRepo.find({
      where: { id: In(templateIds) },
      select: ['id', 'agencyPriceIrr'],
    });
    return new Map(
      templates.map((t) => [t.id, String(t.agencyPriceIrr ?? '0')]),
    );
  }

  private buildCommercialExtras(
    instance: FlightInstance,
    sold: number,
    soldByCabin: Map<CabinClass, number>,
    fareRules: FareRule[],
    lockedSeats: number,
    routeAgencyPriceIrr: string | null,
  ) {
    const settings = parseCommercialPanelSettings(
      instance.commercialPanelSettings,
    );
    const classBreakdown = buildClassBreakdown({
      capacity: instance.capacity,
      cabinCapacities: instance.cabinCapacities,
      soldTotal: sold,
      soldByCabin,
      fareRules: fareRules.map((r) => ({
        cabin: r.cabin,
        classCode: r.classCode,
        seatsAllocated: r.seatsAllocated,
      })),
    });
    return {
      ...commercialRowExtras({
        settings,
        classBreakdown,
        lockedSeats,
        routeAgencyPriceIrr,
      }),
      // publicSaleEnabled is the canonical sellability flag. Keeping the
      // legacy panel value aligned prevents the list and detail views from
      // contradicting one another.
      siteVisible: instance.publicSaleEnabled,
    };
  }

  private async priceChangeHistory(flightInstanceId: string) {
    const proposal = await this.proposalRepo.findOne({
      where: { flightInstanceId },
      select: ['id'],
    });
    const qb = this.auditLogRepo
      .createQueryBuilder('a')
      .leftJoin('a.actor', 'actor')
      .addSelect(['actor.id', 'actor.fullName'])
      .where('a.action = :action', {
        action: 'تغییر قیمت فروش پرواز منتشرشده',
      })
      .orderBy('a.createdAt', 'DESC')
      .take(20);
    if (proposal) {
      qb.andWhere(
        '(a.entityId = :proposalId OR a.metadata ->> :metaKey = :instanceId)',
        {
          proposalId: proposal.id,
          metaKey: 'flightInstanceId',
          instanceId: flightInstanceId,
        },
      );
    } else {
      qb.andWhere('a.metadata ->> :metaKey = :instanceId', {
        metaKey: 'flightInstanceId',
        instanceId: flightInstanceId,
      });
    }
    const rows = await qb.getMany();
    return rows.map((r) => {
      const meta = (r.metadata ?? {}) as Record<string, unknown>;
      return {
        id: r.id,
        previousPriceIrr: stringifyScalar(meta.previousPriceIrr),
        salePriceIrr: stringifyScalar(meta.salePriceIrr),
        reason: r.detail,
        actorName: r.actor?.fullName ?? '—',
        createdAt: r.createdAt.toISOString(),
      };
    });
  }

  /** ⚑ Derived status per docs — the mocks' hardcoded strings mapped to
   * real state: CANCELLED→لغو شده; sold==cap→تکمیل; sold>0→در حال فروش;
   * else فعال. */
  private derivedStatus(
    status: string,
    sold: number,
    capacity: number,
  ): 'ACTIVE' | 'SELLING' | 'FULL' | 'CANCELLED' {
    if (status === 'CANCELLED') return 'CANCELLED';
    if (capacity > 0 && sold >= capacity) return 'FULL';
    if (sold > 0) return 'SELLING';
    return 'ACTIVE';
  }

  private baseRow(i: FlightInstance, sold: number) {
    return {
      id: i.id,
      flightNo: i.flight.flightNo,
      originCode: i.flight.route.originCode,
      destCode: i.flight.route.destCode,
      departureAt: i.departureAt.toISOString(),
      capacity: i.capacity,
      charterSeats: i.charterSeats,
      sold,
      basePriceIrr: i.basePriceIrr,
      publicSaleEnabled: i.publicSaleEnabled,
      cancelledAt: i.cancelledAt?.toISOString() ?? null,
      cancellationReason: i.cancellationReason,
    };
  }

  async overview() {
    const now = new Date();
    const futureCutoff = new Date(
      now.getTime() + FUTURE_WINDOW_DAYS * 24 * 3_600_000,
    );
    const instances = await this.instanceRepo
      .createQueryBuilder('fi')
      .leftJoinAndSelect('fi.flight', 'flight')
      .leftJoinAndSelect('flight.route', 'route')
      .orderBy('fi.departureAt', 'ASC')
      .getMany();
    const sold = await this.soldByInstance(instances.map((i) => i.id));

    // Commercial inventory starts only after the governed approval/publish
    // workflow. Draft/pending/rejected instances must never leak into the
    // manager's sale controls merely because a schedule row already exists.
    const scheduled = instances.filter((instance) =>
      isCommercialInventoryVisible(instance, now),
    );
    // CEO approval publishes every materialized occurrence. The active list
    // mirrors that occurrence-level contract and never applies a date cutoff.
    const activeRows = scheduled.filter((i) =>
      isCommercialActiveOccurrence(i, now),
    );
    const futureRows = scheduled.filter(
      (i) =>
        i.status === 'SCHEDULED' &&
        i.departureAt > futureCutoff &&
        (sold.get(i.id) ?? 0) === 0,
    );

    const activeIds = activeRows.map((i) => i.id);
    const [soldByCabin, fareRulesMap, lockedMap] = await Promise.all([
      this.soldByInstanceAndCabin(activeIds),
      this.fareRulesByInstances(activeIds),
      this.lockedSeatsByInstance(activeIds),
    ]);
    const templateIds = [
      ...new Set(
        activeRows
          .map((i) => i.scheduleTemplateId)
          .filter((id): id is string => id != null),
      ),
    ];
    const templatePrices = await this.routeAgencyPriceByTemplate(templateIds);

    const active = activeRows.map((i) => {
      const s = sold.get(i.id) ?? 0;
      const commercial = this.buildCommercialExtras(
        i,
        s,
        soldByCabin.get(i.id) ?? new Map(),
        fareRulesMap.get(i.id) ?? [],
        lockedMap.get(i.id) ?? 0,
        i.scheduleTemplateId
          ? (templatePrices.get(i.scheduleTemplateId) ?? null)
          : null,
      );
      return {
        ...this.baseRow(i, s),
        derivedStatus: this.derivedStatus(i.status, s, i.capacity),
        salesHealth:
          i.status === FlightInstanceStatus.CANCELLED
            ? {
                ...commercialSalesHealth(i.departureAt, s, i.capacity),
                isWeak: false,
                reasonFa: 'پرواز لغو شده و در تحلیل فروش فعال لحاظ نمی‌شود.',
              }
            : commercialSalesHealth(i.departureAt, s, i.capacity),
        aiSuggestion: i.aiSuggestion as unknown as PersistedAiSuggestion | null,
        competitorPriceIrr: i.competitorPriceIrr,
        ...commercial,
      };
    });

    const future = futureRows.map((i) => ({
      ...this.baseRow(i, sold.get(i.id) ?? 0),
      agencySeatsAllocated: i.agencySeatsAllocated,
      aiSuggestion: i.aiSuggestion as unknown as PersistedAiSuggestion | null,
    }));

    await this.emitWeakSalesAlerts(active);

    const completed = await this.completedReport();

    const nonCancelled = active.filter((r) => r.derivedStatus !== 'CANCELLED');
    const soldTotal = nonCancelled.reduce((a, r) => a + r.sold, 0);
    const capTotal = nonCancelled.reduce((a, r) => a + r.capacity, 0);
    const kpis = {
      activeCount: nonCancelled.length,
      soldSeats: soldTotal,
      meanOccupancyPct:
        capTotal > 0 ? Math.round((soldTotal / capTotal) * 100) : 0,
    };

    return { kpis, active, completed, future };
  }

  /** ⚑ Real per-channel figures from bookings — no fabricated margins.
   * سود/ضرر compare the achieved average rate to the base rate. */
  private async completedReport() {
    await materializeDepartedInstances(this.dataSource);
    const departed = await this.instanceRepo
      .createQueryBuilder('fi')
      .leftJoinAndSelect('fi.flight', 'flight')
      .leftJoinAndSelect('flight.route', 'route')
      .where('fi.status = :status', { status: 'DEPARTED' })
      .orderBy('fi.departureAt', 'DESC')
      .take(30)
      .getMany();

    const byChannel = departed.length
      ? await this.bookingRepo
          .createQueryBuilder('b')
          .select('b.flightInstanceId', 'flightInstanceId')
          .addSelect('b.channel', 'channel')
          .addSelect('COUNT(*)', 'count')
          .addSelect('SUM(b.priceIrr)', 'sumPriceIrr')
          .where('b.flightInstanceId IN (:...ids)', {
            ids: departed.map((d) => d.id),
          })
          .andWhere('b.status IN (:...statuses)', {
            statuses: [...SOLD_STATUSES],
          })
          .groupBy('b.flightInstanceId')
          .addGroupBy('b.channel')
          .getRawMany<{
            flightInstanceId: string;
            channel: 'SYSTEM' | 'CHARTER' | 'AGENCY';
            count: string;
            sumPriceIrr: string | null;
          }>()
      : [];

    const rows = departed.map((i) => {
      const channels = {
        SYSTEM: ZERO_IRR,
        CHARTER: ZERO_IRR,
        AGENCY: ZERO_IRR,
      } as Record<'SYSTEM' | 'CHARTER' | 'AGENCY', Irr>;
      let tickets = 0;
      let revenueIrr: Irr = ZERO_IRR;
      for (const c of byChannel.filter((b) => b.flightInstanceId === i.id)) {
        const sum = BigInt(c.sumPriceIrr ?? '0');
        channels[c.channel] = sum;
        tickets += Number(c.count);
        revenueIrr = addIrr(revenueIrr, sum);
      }
      const base = i.basePriceIrr ?? ZERO_IRR;
      const avgIrr: Irr =
        tickets > 0 ? divRoundBigInt(revenueIrr, BigInt(tickets)) : ZERO_IRR;
      const delta: Irr = subIrr(avgIrr, base) * BigInt(tickets);
      return {
        id: i.id,
        flightNo: i.flight.flightNo,
        originCode: i.flight.route.originCode,
        destCode: i.flight.route.destCode,
        departureAt: i.departureAt.toISOString(),
        tickets,
        basePriceIrr: base,
        avgPriceIrr: avgIrr,
        revenueIrr,
        channelRevenueIrr: channels,
        profitIrr: maxIrr(delta, ZERO_IRR),
        lossIrr: maxIrr(-delta, ZERO_IRR),
      };
    });

    return {
      rows,
      kpis: {
        totalSalesIrr: rows.reduce((a, r) => addIrr(a, r.revenueIrr), ZERO_IRR),
        totalProfitIrr: rows.reduce((a, r) => addIrr(a, r.profitIrr), ZERO_IRR),
        totalTickets: rows.reduce((a, r) => a + r.tickets, 0),
        flightCount: rows.length,
      },
    };
  }

  async airports() {
    return this.airportRepo.find({
      where: { active: true },
      order: { cityFa: 'ASC', code: 'ASC' },
    });
  }

  async createAirport(
    actor: AuthenticatedUser,
    dto: {
      code: string;
      cityFa: string;
      airportNameFa?: string;
      tz?: string;
      isInternational?: boolean;
    },
  ) {
    const code = dto.code.trim().toUpperCase();
    const cityFa = dto.cityFa.trim();
    const airportNameFa = dto.airportNameFa?.trim() || null;
    if (!/^[A-Z]{3}$/.test(code)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'کد فرودگاه باید دقیقاً سه حرف انگلیسی باشد.',
      });
    }
    if (!cityFa) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'نام شهر الزامی است.',
      });
    }
    const existing = await this.airportRepo.findOneBy({ code });
    if (existing) {
      if (!existing.active) {
        existing.cityFa = cityFa;
        existing.airportNameFa = airportNameFa;
        existing.tz = dto.tz?.trim() || existing.tz || 'Asia/Tehran';
        existing.isInternational = dto.isInternational ?? false;
        existing.active = true;
        const restored = await this.airportRepo.save(existing);
        await this.redis.del('search:airports');
        await this.redis.del('search:airports:v2');
        await this.redis.del('search:airports:v3');
        await this.redis.del('search:airports:v4');
        await this.audit.record({
          actorId: actor.id,
          actorRole: actor.role,
          category: 'SYSTEM',
          action: 'بازگردانی شهر پروازی',
          detail: `شهر «${cityFa}» (${code}) توسط ${actor.fullName} دوباره فعال شد.`,
          entityType: 'Airport',
          entityId: restored.id,
        });
        return restored;
      }
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'فرودگاهی با این کد قبلاً ثبت شده است.',
      });
    }
    // A city may legitimately have more than one airport (THR/IKA,
    // DXB/DWC, IST/SAW); uniqueness belongs to the IATA code, not city name.
    const created = await this.airportRepo.save(
      this.airportRepo.create({
        code,
        cityFa,
        airportNameFa,
        tz: dto.tz?.trim() || 'Asia/Tehran',
        isInternational: dto.isInternational ?? false,
        active: true,
      }),
    );
    await this.redis.del('search:airports');
    await this.redis.del('search:airports:v2');
    await this.redis.del('search:airports:v3');
    await this.redis.del('search:airports:v4');
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'SYSTEM',
      action: 'افزودن شهر پروازی',
      detail: `شهر «${cityFa}» (${code}) توسط ${actor.fullName} ثبت شد.`,
      entityType: 'Airport',
      entityId: created.id,
    });
    return created;
  }

  async removeAirport(actor: AuthenticatedUser, id: string) {
    const airport = await this.airportRepo.findOneBy({ id });
    if (!airport) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'فرودگاه یافت نشد.',
      });
    }
    // Soft-delete keeps historical route/ticket/report labels resolvable while
    // immediately removing the city from every new-flight/search selector.
    airport.active = false;
    await this.airportRepo.save(airport);
    await this.redis.del('search:airports');
    await this.redis.del('search:airports:v2');
    await this.redis.del('search:airports:v3');
    await this.redis.del('search:airports:v4');
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'SYSTEM',
      action: 'حذف شهر پروازی',
      detail: `شهر «${airport.cityFa}» (${airport.code}) توسط ${actor.fullName} حذف شد.`,
      entityType: 'Airport',
      entityId: id,
    });
    return { id };
  }

  /** Reference data for the aircraft-type-change form — no such listing
   * existed anywhere; every other caller of `AircraftSeatMap` already
   * knows the exact type string it wants (e.g. from `Flight.aircraftType`
   * or a `changeAircraftType` override), so this is the first place that
   * needs the full catalog. */
  async aircraftTypes() {
    const maps = await this.seatMapRepo.find({
      order: { aircraftType: 'ASC' },
    });
    return maps.map((m) => ({
      aircraftType: m.aircraftType,
      capacity: enumerateSeats(m).length,
    }));
  }

  private async findOrCreateRoute(originCode: string, destCode: string) {
    const existing = await this.routeRepo.findOneBy({ originCode, destCode });
    if (existing) return existing;
    return this.routeRepo.save(this.routeRepo.create({ originCode, destCode }));
  }

  private async findOrCreateFlight(
    flightNo: string,
    routeId: string,
  ): Promise<Flight> {
    const existingFlight = await this.flightRepo.findOneBy({ flightNo });
    if (existingFlight && existingFlight.routeId !== routeId) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'این شماره پرواز قبلاً برای مسیر دیگری ثبت شده است.',
      });
    }
    if (existingFlight) return existingFlight;
    return this.flightRepo.save(
      this.flightRepo.create({
        flightNo,
        routeId,
        aircraftType: 'Airbus A320',
      }),
    );
  }

  async create(
    actor: AuthenticatedUser,
    dto: {
      originCode: string;
      destCode: string;
      flightNo: string;
      departureAt: string;
      capacity: number;
      basePriceIrr: Irr;
      aircraftType?: string;
      charterSeats?: number;
    },
  ) {
    if (dto.originCode === dto.destCode) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'مبدأ و مقصد نمی‌توانند یکسان باشند.',
      });
    }
    const airports = await this.airportRepo.find({
      where: { code: In([dto.originCode, dto.destCode]), active: true },
    });
    if (airports.length !== 2) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'فرودگاه انتخاب‌شده معتبر نیست.',
      });
    }
    const departureAt = new Date(dto.departureAt);
    if (Number.isNaN(departureAt.getTime()) || departureAt <= new Date()) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'تاریخ و ساعت پرواز باید در آینده باشد.',
      });
    }

    const charterSeats = dto.charterSeats ?? 0;
    if (charterSeats >= dto.capacity) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'تعهد چارتری باید کمتر از تعداد صندلی موجود باشد.',
      });
    }

    const aircraftType =
      (dto.aircraftType ?? 'Airbus A320').trim() || 'Airbus A320';
    if (dto.aircraftType) {
      const map = await this.seatMapRepo.findOneBy({ aircraftType });
      if (!map) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_FAILED,
          message: 'نوع هواپیمای انتخاب‌شده در کاتالوگ نیست.',
        });
      }
    }

    const route = await this.findOrCreateRoute(dto.originCode, dto.destCode);
    const existingFlight = await this.flightRepo.findOneBy({
      flightNo: dto.flightNo,
    });
    const flight = await this.findOrCreateFlight(dto.flightNo, route.id);
    if (dto.aircraftType && !existingFlight) {
      flight.aircraftType = aircraftType;
      await this.flightRepo.save(flight);
    }

    const created = await this.instanceRepo.save(
      this.instanceRepo.create({
        flightId: flight.id,
        departureAt,
        arrivalAt: new Date(departureAt.getTime() + route.durationMin * 60_000),
        capacity: dto.capacity,
        charterSeats,
        status: 'SCHEDULED',
        definitionStatus: FlightDefinitionStatus.DRAFT,
        basePriceIrr: dto.basePriceIrr,
        ...(existingFlight && dto.aircraftType
          ? { aircraftTypeOverride: aircraftType }
          : {}),
      }),
    );
    const instance = await this.instanceRepo
      .createQueryBuilder('fi')
      .leftJoinAndSelect('fi.flight', 'flight')
      .leftJoinAndSelect('flight.route', 'route')
      .where('fi.id = :id', { id: created.id })
      .getOneOrFail();

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'SYSTEM',
      action: 'افزودن پرواز جدید',
      detail: `پرواز ${dto.flightNo} (${dto.originCode} ← ${dto.destCode}) توسط ${actor.fullName} ایجاد شد.`,
      entityType: 'FlightInstance',
      entityId: instance.id,
    });

    return { ...this.baseRow(instance, 0), derivedStatus: 'ACTIVE' as const };
  }

  /** Flight detail modal: real channel breakdown from bookings. */
  async detail(id: string) {
    const instance = await this.instanceRepo
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
    const byChannel = await this.bookingRepo
      .createQueryBuilder('b')
      .select('b.channel', 'channel')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(b.priceIrr)', 'sumPriceIrr')
      .where('b.flightInstanceId = :id', { id })
      .andWhere('b.status IN (:...statuses)', {
        statuses: [...SOLD_STATUSES],
      })
      .groupBy('b.channel')
      .getRawMany<{
        channel: 'SYSTEM' | 'CHARTER' | 'AGENCY';
        count: string;
        sumPriceIrr: string | null;
      }>();
    const channels = (['SYSTEM', 'CHARTER', 'AGENCY'] as const).map((ch) => {
      const row = byChannel.find((b) => b.channel === ch);
      return {
        channel: ch,
        seats: row ? Number(row.count) : 0,
        revenueIrr: row ? BigInt(row.sumPriceIrr ?? '0') : ZERO_IRR,
      };
    });
    const sold = channels.reduce((a, c) => a + c.seats, 0);
    const soldByCabinRows = await this.bookingRepo
      .createQueryBuilder('b')
      .select('b.cabin', 'cabin')
      .addSelect('COUNT(*)', 'count')
      .where('b.flightInstanceId = :id', { id })
      .andWhere('b.status IN (:...statuses)', { statuses: [...SOLD_STATUSES] })
      .groupBy('b.cabin')
      .getRawMany<{ cabin: CabinClass; count: string }>();
    const soldByCabin = new Map<CabinClass, number>();
    for (const row of soldByCabinRows) {
      soldByCabin.set(row.cabin, Number(row.count));
    }
    const fareRules = await this.fareRuleRepo.find({
      where: { flightInstanceId: id },
      order: { cabin: 'ASC', priceIrr: 'ASC' },
    });
    const lockedSeats = await this.seatLockRepo.count({
      where: { flightInstanceId: id, releasedAt: IsNull() },
    });
    let routeAgencyPriceIrr: string | null = null;
    if (instance.scheduleTemplateId) {
      const template = await this.scheduleTemplateRepo.findOne({
        where: { id: instance.scheduleTemplateId },
        select: ['agencyPriceIrr'],
      });
      routeAgencyPriceIrr = template
        ? String(template.agencyPriceIrr ?? '0')
        : null;
    }
    const commercial = this.buildCommercialExtras(
      instance,
      sold,
      soldByCabin,
      fareRules,
      lockedSeats,
      routeAgencyPriceIrr,
    );
    const priceHistory = await this.priceChangeHistory(id);
    return {
      ...this.baseRow(instance, sold),
      derivedStatus: this.derivedStatus(
        instance.status,
        sold,
        instance.capacity,
      ),
      channels,
      totalRevenueIrr: channels.reduce(
        (a, c) => addIrr(a, c.revenueIrr),
        ZERO_IRR,
      ),
      occupancyPct:
        instance.capacity > 0
          ? Math.round((sold / instance.capacity) * 100)
          : 0,
      aircraftType: resolveAircraftType(instance),
      aiSuggestion:
        instance.aiSuggestion as unknown as PersistedAiSuggestion | null,
      ...commercial,
      priceHistory,
    };
  }

  /** نرخ‌گذاری/allocation modal. ⚑ Stores plan figures only — the bookable
   * price stays with Phase 6: for COMMERCIAL the plan also upserts the
   * pricing proposal (still requiring CEO registration). A REGISTERED
   * (locked) proposal blocks re-planning. */
  async plan(
    actor: AuthenticatedUser,
    id: string,
    dto: {
      priceIrr: Irr;
      agencySeats: number;
      saleStartsAt?: string;
      saleEndsAt?: string;
    },
  ) {
    const instance = await this.instanceRepo
      .createQueryBuilder('fi')
      .where('fi.id = :id', { id })
      .getOne();
    if (!instance || instance.status !== 'SCHEDULED') {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'پرواز برنامه‌ریزی‌شده یافت نشد.',
      });
    }
    const pricing = await this.proposalRepo
      .createQueryBuilder('p')
      .where('p.flightInstanceId = :id', { id })
      .getOne();
    if (pricing?.status === 'REGISTERED') {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message:
          'پیشنهاد اولیه تأیید شده است؛ برای اصلاح نرخ از عملیات تغییر قیمت فروش استفاده کنید.',
      });
    }
    const agencyMax = instance.capacity - instance.charterSeats;
    if (dto.agencySeats > agencyMax) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: `تخصیص آژانس نمی‌تواند از ${agencyMax} صندلی بیشتر باشد.`,
      });
    }

    instance.basePriceIrr = dto.priceIrr;
    instance.agencySeatsAllocated = dto.agencySeats;
    if (dto.saleStartsAt !== undefined) {
      instance.saleStartsAt = dto.saleStartsAt
        ? new Date(dto.saleStartsAt)
        : null;
    }
    if (dto.saleEndsAt !== undefined) {
      instance.saleEndsAt = dto.saleEndsAt ? new Date(dto.saleEndsAt) : null;
    }
    const updated = await this.instanceRepo.save(instance);

    if (actor.role === 'COMMERCIAL_MANAGER') {
      if (pricing) {
        pricing.proposedPriceIrr = dto.priceIrr;
        pricing.updatedAt = new Date();
        await this.proposalRepo.save(pricing);
      } else {
        await this.proposalRepo.save(
          this.proposalRepo.create({
            flightInstanceId: id,
            basePriceIrr: dto.priceIrr,
            competitorPriceIrr: dto.priceIrr,
            proposedPriceIrr: dto.priceIrr,
            proposedById: actor.id,
            updatedAt: new Date(),
          }),
        );
      }
    }

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'PRICING',
      action: 'نرخ‌گذاری و تخصیص صندلی پرواز آینده',
      detail: `نرخ برنامه‌ریزی و تخصیص صندلی پرواز توسط ${actor.fullName} ثبت شد.`,
      entityType: 'FlightInstance',
      entityId: id,
      metadata: { priceIrr: dto.priceIrr, agencySeats: dto.agencySeats },
    });

    return {
      id: updated.id,
      basePriceIrr: updated.basePriceIrr,
      agencySeatsAllocated: updated.agencySeatsAllocated,
      directSeats: Math.max(
        updated.capacity - updated.charterSeats - dto.agencySeats,
        0,
      ),
      proposalPending: actor.role === 'COMMERCIAL_MANAGER',
    };
  }

  /** Phase 13: re-points this instance at a different aircraft type/seat
   * map without touching the shared `Flight` row (which would silently
   * change every other instance of the same recurring schedule) — sets
   * `aircraftTypeOverride` instead. Rejects with a shortfall count rather
   * than auto-cancelling/rebooking paying customers, which is a business
   * decision with no design/product guidance anywhere (see DB_SCHEMA.md
   * Phase 13). */
  async changeAircraftType(
    actor: AuthenticatedUser,
    id: string,
    newAircraftType: string,
    stepUpChallengeId: string,
    stepUpCode: string,
  ) {
    await this.stepUp.verify(
      actor,
      stepUpChallengeId,
      stepUpCode,
      'PRICE_CAPACITY_CHANGE',
    );
    const instance = await this.instanceRepo
      .createQueryBuilder('fi')
      .leftJoinAndSelect('fi.flight', 'flight')
      .where('fi.id = :id', { id })
      .getOne();
    if (!instance) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'پرواز یافت نشد.',
      });
    }
    const newMap = await this.seatMapRepo.findOneBy({
      aircraftType: newAircraftType,
    });
    if (!newMap) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: `نقشهٔ صندلی برای «${newAircraftType}» تعریف نشده است.`,
      });
    }
    const newCapacity = enumerateSeats(newMap).length;

    const [confirmedCount, lockCount] = await Promise.all([
      this.passengerRepo
        .createQueryBuilder('p')
        .leftJoin('p.booking', 'booking')
        .where('p.seatCode IS NOT NULL')
        .andWhere('booking.flightInstanceId = :id', { id })
        .andWhere('booking.status IN (:...statuses)', {
          statuses: ['PAID', 'TICKETED'],
        })
        .getCount(),
      this.seatLockRepo.count({
        where: {
          flightInstanceId: id,
          releasedAt: IsNull(),
          expiresAt: MoreThan(new Date()),
        },
      }),
    ]);
    const confirmedOrLocked = confirmedCount + lockCount;
    if (newCapacity < confirmedOrLocked) {
      const shortfall = confirmedOrLocked - newCapacity;
      throw new ConflictException({
        code: ErrorCode.CAPACITY_BELOW_CONFIRMED,
        message: `ظرفیت هواپیمای جدید (${newCapacity}) کمتر از تعداد رزروهای قطعی/لاک‌شدهٔ فعلی (${confirmedOrLocked}) است — ${shortfall} مسافر مازاد باید ابتدا جابه‌جا یا لغو شود.`,
      });
    }

    const previousAircraftType = resolveAircraftType(instance);
    instance.aircraftTypeOverride = newAircraftType;
    instance.capacity = newCapacity;
    const updated = await this.instanceRepo.save(instance);

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'SYSTEM',
      action: 'تغییر نوع هواپیمای پرواز',
      detail: `نوع هواپیمای پرواز ${instance.flight.flightNo} از «${previousAircraftType}» به «${newAircraftType}» توسط ${actor.fullName} تغییر کرد.`,
      entityType: 'FlightInstance',
      entityId: id,
      metadata: {
        previousAircraftType,
        newAircraftType,
        newCapacity,
      },
    });

    return {
      id: updated.id,
      aircraftType: newAircraftType,
      capacity: updated.capacity,
    };
  }

  /** Advisory ML analysis over future planning and weak-selling flights.
   * Suggestions are persisted but never applied automatically. */
  async runAiAnalysis(actor: AuthenticatedUser, requestId?: string) {
    const now = new Date();
    const futureCutoff = new Date(
      now.getTime() + FUTURE_WINDOW_DAYS * 24 * 3_600_000,
    );
    const lowSalesWindowEnd = new Date(now.getTime() + 72 * 3_600_000);
    const upcoming = await this.instanceRepo
      .createQueryBuilder('fi')
      .leftJoinAndSelect('fi.flight', 'flight')
      .leftJoinAndSelect('flight.route', 'route')
      .where('fi.status = :status', { status: 'SCHEDULED' })
      .andWhere('fi.departureAt > :now', { now })
      .getMany();
    const sold = await this.soldByInstance(upcoming.map((item) => item.id));
    const analyzable = upcoming.filter((item) => {
      if (!isCommercialInventoryVisible(item, now)) return false;
      if (item.basePriceIrr == null) return false;
      if (item.departureAt > futureCutoff) return true;
      const occupancy =
        item.capacity > 0 ? (sold.get(item.id) ?? 0) / item.capacity : 0;
      return item.departureAt <= lowSalesWindowEnd && occupancy < 0.6;
    });
    if (analyzable.length === 0) return { analyzed: 0, available: true };

    const result = await this.priceSuggestions.suggest(
      analyzable.map((i) => {
        // ADVISORY-ONLY ML boundary (CLAUDE.md ML Service Rules): the
        // FastAPI service expects plain JSON numbers, and this payload is
        // a one-way outbound signal for a suggestion — never round-tripped
        // back into a stored/authoritative field without going through
        // NestJS's own re-pricing logic. Individual fare amounts are far
        // below 2^53, so Number() loses no precision here.
        const basePriceIrr = Number(i.basePriceIrr);
        return {
          proposal_id: i.id,
          origin_code: i.flight.route.originCode,
          dest_code: i.flight.route.destCode,
          departure_at: i.departureAt.toISOString(),
          base_price_irr: basePriceIrr,
          competitor_price_irr: Number(i.competitorPriceIrr ?? i.basePriceIrr),
          proposed_price_irr: basePriceIrr,
          capacity: i.capacity,
          charter_seats: i.charterSeats,
        };
      }),
      requestId,
    );
    if (!result) return { analyzed: 0, available: false };

    const generatedAt = new Date().toISOString();
    const futureById = new Map(analyzable.map((i) => [i.id, i]));
    for (const s of result.suggestions) {
      const suggestion: PersistedAiSuggestion = {
        priceIrr: s.price_irr,
        reason: s.reason_fa,
        factors: s.factors_fa,
        season: s.season_fa,
        occasion: s.occasion_fa,
        confidence: s.confidence,
        modelVersion: result.model_version,
        generatedAt,
      };
      const target = futureById.get(s.proposal_id);
      if (!target) continue;
      target.aiSuggestion = suggestion as unknown as typeof target.aiSuggestion;
      await this.instanceRepo.save(target);
    }

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'PRICING',
      action: 'تحلیل قیمت‌گذاری و فروش پروازها با هوش مصنوعی',
      detail: `تحلیل هوش مصنوعی برای ${result.suggestions.length} پرواز آینده یا کم‌فروش توسط ${actor.fullName} اجرا شد.`,
      metadata: {
        analyzed: result.suggestions.length,
        modelVersion: result.model_version,
      },
    });

    return { analyzed: result.suggestions.length, available: true };
  }

  // ─── Recurring schedules (CLAUDE.md: Schedule via RRULE) ───────────────

  async createSchedule(
    actor: AuthenticatedUser,
    dto: {
      originCode: string;
      destCode: string;
      flightNo: string;
      rrule: string;
      depTime: string;
      capacity: number;
      daysAhead?: number;
    },
  ) {
    if (dto.originCode === dto.destCode) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'مبدأ و مقصد نمی‌توانند یکسان باشند.',
      });
    }
    const airports = await this.airportRepo.find({
      where: { code: In([dto.originCode, dto.destCode]), active: true },
    });
    if (airports.length !== 2) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'فرودگاه انتخاب‌شده معتبر نیست.',
      });
    }
    try {
      RRule.parseString(dto.rrule);
    } catch {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'الگوی تکرار (RRULE) معتبر نیست.',
      });
    }
    const [depHour, depMinute] = dto.depTime.split(':').map(Number);

    const route = await this.findOrCreateRoute(dto.originCode, dto.destCode);
    const flight = await this.findOrCreateFlight(dto.flightNo, route.id);

    const schedule = await this.scheduleRepo.save(
      this.scheduleRepo.create({
        flightId: flight.id,
        rrule: dto.rrule,
        depHour,
        depMinute,
        durationMin: route.durationMin,
        capacity: dto.capacity,
      }),
    );
    const materialized = await this.materializeSchedule(
      schedule.id,
      dto.daysAhead ?? 30,
    );

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'SYSTEM',
      action: 'ثبت برنامه تکرارشونده پرواز',
      detail: `برنامه ${dto.flightNo} (${dto.rrule}) با ${materialized} پرواز آینده ثبت شد.`,
      entityType: 'Schedule',
      entityId: schedule.id,
      metadata: { rrule: dto.rrule, materialized },
    });

    return { scheduleId: schedule.id, materialized };
  }

  /**
   * Materializes FlightInstances for the next `daysAhead` days from the
   * schedule's RRULE. Idempotent: @@unique([scheduleId, departureAt]) +
   * ON CONFLICT DO NOTHING means re-running never doubles instances.
   * depHour/depMinute are UTC (storage is UTC per CLAUDE.md; rendering
   * converts to the airport's IANA tz at the edge). Bulk `.insert()`
   * bypasses entity `@BeforeInsert()` listeners, so `id` is generated
   * here explicitly per row.
   */
  async materializeSchedule(scheduleId: string, daysAhead: number) {
    const schedule = await this.scheduleRepo
      .createQueryBuilder('s')
      .where('s.id = :id', { id: scheduleId })
      .getOneOrFail();
    if (!schedule.active) return 0;

    const parsed = RRule.parseString(schedule.rrule);
    const start = new Date();
    const until = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
    const rule = new RRule({ ...parsed, dtstart: start });
    const dates = rule.between(start, until, true);
    if (dates.length === 0) return 0;

    const rows = dates.map((d) => {
      const departureAt = new Date(
        Date.UTC(
          d.getUTCFullYear(),
          d.getUTCMonth(),
          d.getUTCDate(),
          schedule.depHour,
          schedule.depMinute,
        ),
      );
      return {
        id: randomUUID(),
        flightId: schedule.flightId,
        scheduleId: schedule.id,
        departureAt,
        arrivalAt: new Date(
          departureAt.getTime() + schedule.durationMin * 60_000,
        ),
        capacity: schedule.capacity,
        charterSeats: 0,
        status: 'SCHEDULED' as const,
        definitionStatus: FlightDefinitionStatus.DRAFT,
      };
    });

    const result = await this.instanceRepo
      .createQueryBuilder()
      .insert()
      .into(FlightInstance)
      .values(rows)
      .orIgnore()
      .execute();
    return (result.raw as unknown[]).length;
  }

  async listSchedules() {
    const schedules = await this.scheduleRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.flight', 'flight')
      .leftJoinAndSelect('flight.route', 'route')
      .orderBy('s.createdAt', 'DESC')
      .getMany();

    const counts = schedules.length
      ? await this.instanceRepo
          .createQueryBuilder('fi')
          .select('fi.scheduleId', 'scheduleId')
          .addSelect('COUNT(*)', 'count')
          .where('fi.scheduleId IN (:...ids)', {
            ids: schedules.map((s) => s.id),
          })
          .groupBy('fi.scheduleId')
          .getRawMany<{ scheduleId: string; count: string }>()
      : [];
    const countById = new Map(
      counts.map((c) => [c.scheduleId, Number(c.count)]),
    );

    return schedules.map((s) => ({
      id: s.id,
      flightNo: s.flight.flightNo,
      originCode: s.flight.route.originCode,
      destCode: s.flight.route.destCode,
      rrule: s.rrule,
      depTime: `${String(s.depHour).padStart(2, '0')}:${String(s.depMinute).padStart(2, '0')}`,
      capacity: s.capacity,
      active: s.active,
      instanceCount: countById.get(s.id) ?? 0,
    }));
  }

  // ── Phase 13 Part B: manageable fare classes ──────────────────────────

  async listFareRules(instanceId: string) {
    return this.fareRuleRepo.find({
      where: { flightInstanceId: instanceId },
      order: { cabin: 'ASC', priceIrr: 'ASC' },
    });
  }

  /**
   * Older flight occurrences already contain the approved cabin capacities
   * and base fare, but pre-date persisted FareRule rows.  Commercial users
   * must not recreate those cabins manually merely to release inventory.
   * Materialise one standard base rule per approved cabin once, preserving
   * the existing public-sale state, and use the same rules thereafter.
   */
  private async ensureCommercialFareRules(instance: FlightInstance) {
    const current = await this.listFareRules(instance.id);
    if (current.length > 0) return current;

    let cabins = serializeCabinCapacities(instance.cabinCapacities).filter(
      (row) => row.seats > 0,
    );
    if (cabins.length === 0) {
      const seatMap = await this.seatMapRepo.findOneBy({
        aircraftType: resolveAircraftType(instance),
      });
      if (seatMap) {
        const counts = new Map<CabinClass, number>();
        for (const seat of enumerateSeats(seatMap)) {
          counts.set(seat.cabin, (counts.get(seat.cabin) ?? 0) + 1);
        }
        cabins = [...counts.entries()].map(([cabin, seats]) => ({
          cabin,
          seats,
          capacity: seats,
        }));
      }
    }
    if (cabins.length === 0 || instance.basePriceIrr == null) return [];

    const classCode = (cabin: CabinClass) => {
      switch (cabin) {
        case 'FIRST':
          return 'F';
        case 'BUSINESS':
          return 'C';
        case 'COMFORT':
          return 'W';
        default:
          return 'Y';
      }
    };

    return this.dataSource.transaction(async (manager) => {
      await manager
        .createQueryBuilder(FlightInstance, 'instance')
        .setLock('pessimistic_write')
        .where('instance.id = :instanceId', { instanceId: instance.id })
        .getOneOrFail();
      const existing = await manager.find(FareRule, {
        where: { flightInstanceId: instance.id },
        order: { cabin: 'ASC', priceIrr: 'ASC' },
      });
      if (existing.length > 0) return existing;

      return manager.save(
        FareRule,
        cabins.map((row) =>
          manager.create(FareRule, {
            flightInstanceId: instance.id,
            cabin: row.cabin,
            classCode: classCode(row.cabin),
            priceIrr: instance.basePriceIrr!,
            sitePriceIrr: null,
            seatsAllocated: row.seats,
            siteSeatsReleased: instance.publicSaleEnabled ? row.seats : 0,
            agencySeatsReleased: 0,
            agencyReleasePriceIrr: null,
            agencySpecialOffer: false,
            refundable: true,
            changeable: true,
            taxIrr: 0n,
            allowedChannels: [BookingChannel.SYSTEM, BookingChannel.AGENCY],
          }),
        ),
      );
    });
  }

  private async loadCommercialInstance(instanceId: string) {
    const instance = await this.instanceRepo
      .createQueryBuilder('fi')
      .leftJoinAndSelect('fi.flight', 'flight')
      .leftJoinAndSelect('flight.route', 'route')
      .where('fi.id = :instanceId', { instanceId })
      .getOne();
    if (!instance) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'پرواز یافت نشد.',
      });
    }
    return instance;
  }

  private async invalidateFlightSearch(instance: FlightInstance) {
    const route = instance.flight?.route;
    if (!route) return;
    const date = instance.departureAt.toISOString().slice(0, 10);
    await this.redis.del(
      `search:flights:${route.originCode.toUpperCase()}:${route.destCode.toUpperCase()}:${date}`,
    );
  }

  async updateSalesVisibility(
    actor: AuthenticatedUser,
    instanceId: string,
    enabled: boolean,
  ) {
    const instance = await this.loadCommercialInstance(instanceId);
    if (
      enabled &&
      (instance.status !== FlightInstanceStatus.SCHEDULED ||
        !isSellableDefinitionStatus(
          instance.definitionStatus,
          instance.approvedSnapshot != null,
        ))
    ) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'فقط پرواز تأییدشده و زمان‌بندی‌شده قابل نمایش در سایت است.',
      });
    }
    const previous = instance.publicSaleEnabled;
    instance.publicSaleEnabled = enabled;
    const settings = parseCommercialPanelSettings(
      instance.commercialPanelSettings,
    );
    instance.commercialPanelSettings = {
      ...settings,
      siteVisible: enabled,
    } as unknown as typeof instance.commercialPanelSettings;
    instance.version += 1;
    const saved = await this.instanceRepo.save(instance);
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'PRICING',
      action: 'تغییر وضعیت فروش عمومی پرواز',
      detail: `فروش عمومی پرواز ${instance.flight.flightNo} توسط ${actor.fullName} ${enabled ? 'فعال' : 'غیرفعال'} شد.`,
      entityType: 'FlightInstance',
      entityId: instance.id,
      metadata: { previous, enabled },
    });
    await this.invalidateFlightSearch(instance);
    return {
      flightInstanceId: saved.id,
      publicSaleEnabled: saved.publicSaleEnabled,
      version: saved.version,
    };
  }

  async updateAgencySalesVisibility(
    actor: AuthenticatedUser,
    instanceId: string,
    enabled: boolean,
  ) {
    const instance = await this.loadCommercialInstance(instanceId);
    if (
      enabled &&
      (instance.status !== FlightInstanceStatus.SCHEDULED ||
        !isSellableDefinitionStatus(
          instance.definitionStatus,
          instance.approvedSnapshot != null,
        ))
    ) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message:
          'فقط پرواز تأییدشده و زمان‌بندی‌شده قابل نمایش برای آژانس‌ها است.',
      });
    }
    const previous = instance.agencySaleEnabled;
    instance.agencySaleEnabled = enabled;
    instance.version += 1;
    const saved = await this.instanceRepo.save(instance);
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'PRICING',
      action: 'تغییر وضعیت فروش آژانسی پرواز',
      detail: `نمایش آژانسی پرواز ${instance.flight.flightNo} توسط ${actor.fullName} ${enabled ? 'فعال' : 'غیرفعال'} شد.`,
      entityType: 'FlightInstance',
      entityId: instance.id,
      metadata: { previous, enabled },
    });
    return {
      flightInstanceId: saved.id,
      agencySaleEnabled: saved.agencySaleEnabled,
      version: saved.version,
    };
  }

  async commercialControl(instanceId: string) {
    const instance = await this.loadCommercialInstance(instanceId);
    const rules = await this.ensureCommercialFareRules(instance);
    const soldRows = await this.passengerRepo
      .createQueryBuilder('p')
      .innerJoin('p.booking', 'b')
      .select('b.cabin', 'cabin')
      .addSelect('b.fareClassCode', 'classCode')
      .addSelect('b.channel', 'channel')
      .addSelect('COUNT(p.id)', 'soldSeats')
      .where('b.flightInstanceId = :instanceId', { instanceId })
      .andWhere('b.status IN (:...statuses)', { statuses: [...SOLD_STATUSES] })
      .andWhere('p.occupiesSeat = true')
      .andWhere('p.deletedAt IS NULL')
      .groupBy('b.cabin')
      .addGroupBy('b.fareClassCode')
      .addGroupBy('b.channel')
      .getRawMany<{
        cabin: CabinClass;
        classCode: string | null;
        channel: BookingChannel;
        soldSeats: string;
      }>();
    const inventoryRows = await this.passengerRepo
      .createQueryBuilder('p')
      .innerJoin('p.booking', 'b')
      .select('b.cabin', 'cabin')
      .addSelect('b.fareClassCode', 'classCode')
      .addSelect('b.channel', 'channel')
      .addSelect(
        'SUM(CASE WHEN p."extraSeatCode" IS NULL THEN 1 ELSE 2 END)',
        'reservedSeats',
      )
      .where('b.flightInstanceId = :instanceId', { instanceId })
      .andWhere('b.status IN (:...statuses)', {
        statuses: ['DRAFT', 'HELD', 'PAID', 'TICKETED'],
      })
      .andWhere('(b.status != :held OR b."holdExpiresAt" > :inventoryNow)', {
        held: 'HELD',
        inventoryNow: new Date(),
      })
      .andWhere('p.occupiesSeat = true')
      .andWhere('p.deletedAt IS NULL')
      .andWhere('b.deletedAt IS NULL')
      .groupBy('b.cabin')
      .addGroupBy('b.fareClassCode')
      .addGroupBy('b.channel')
      .getRawMany<{
        cabin: CabinClass;
        classCode: string | null;
        channel: BookingChannel;
        reservedSeats: string;
      }>();
    const agencyAllocationRows = await this.dataSource
      .getRepository(AgencyAllotment)
      .createQueryBuilder('allotment')
      .select('allotment.cabin', 'cabin')
      .addSelect('allotment.fareClassCode', 'classCode')
      .addSelect('COALESCE(SUM(allotment.seatsAllocated), 0)', 'allocatedSeats')
      .where('allotment.flightInstanceId = :instanceId', { instanceId })
      .andWhere('allotment.cabin IS NOT NULL')
      .andWhere('allotment.fareClassCode IS NOT NULL')
      .andWhere(
        '(allotment.type = :hard OR allotment.releaseAt IS NULL OR allotment.releaseAt > :allocationNow)',
        { hard: 'HARD', allocationNow: new Date() },
      )
      .groupBy('allotment.cabin')
      .addGroupBy('allotment.fareClassCode')
      .getRawMany<{
        cabin: CabinClass;
        classCode: string;
        allocatedSeats: string;
      }>();
    const revenueRows = await this.bookingRepo
      .createQueryBuilder('b')
      .select('b.cabin', 'cabin')
      .addSelect('b.fareClassCode', 'classCode')
      .addSelect('SUM(b.priceIrr)', 'revenueIrr')
      .where('b.flightInstanceId = :instanceId', { instanceId })
      .andWhere('b.status IN (:...statuses)', { statuses: [...SOLD_STATUSES] })
      .groupBy('b.cabin')
      .addGroupBy('b.fareClassCode')
      .getRawMany<{
        cabin: CabinClass;
        classCode: string | null;
        revenueIrr: string | null;
      }>();
    const soldRateRows = await this.passengerRepo
      .createQueryBuilder('p')
      .innerJoin('p.booking', 'b')
      .select('b.cabin', 'cabin')
      .addSelect('b.fareClassCode', 'classCode')
      .addSelect('b.channel', 'channel')
      .addSelect('p.fareIrr', 'priceIrr')
      .addSelect('COUNT(p.id)', 'seats')
      .addSelect('SUM(p.fareIrr)', 'revenueIrr')
      .addSelect('MAX(b.createdAt)', 'lastSoldAt')
      .where('b.flightInstanceId = :instanceId', { instanceId })
      .andWhere('b.status IN (:...statuses)', { statuses: [...SOLD_STATUSES] })
      .andWhere('p.occupiesSeat = true')
      .andWhere('p.deletedAt IS NULL')
      .groupBy('b.cabin')
      .addGroupBy('b.fareClassCode')
      .addGroupBy('b.channel')
      .addGroupBy('p.fareIrr')
      .orderBy('MAX(b.createdAt)', 'DESC')
      .getRawMany<{
        cabin: CabinClass;
        classCode: string | null;
        channel: BookingChannel;
        priceIrr: string;
        seats: string;
        revenueIrr: string | null;
        lastSoldAt: Date | string;
      }>();

    const ruleIds = rules.map((rule) => rule.id);
    const history =
      ruleIds.length > 0
        ? await this.dataSource
            .getRepository(AuditLog)
            .createQueryBuilder('a')
            .where('a.entityType = :entityType', { entityType: 'FareRule' })
            .andWhere('a.entityId IN (:...ruleIds)', { ruleIds })
            .andWhere('a.action IN (:...actions)', {
              actions: [
                'تغییر قیمت فروش سایت کلاس نرخی',
                'آزادسازی آژانسی کلاس نرخی',
              ],
            })
            .orderBy('a.createdAt', 'DESC')
            .getMany()
        : [];

    return {
      flightInstanceId: instance.id,
      departureAt: instance.departureAt.toISOString(),
      competitorPriceIrr: instance.competitorPriceIrr?.toString() ?? null,
      publicSaleEnabled: instance.publicSaleEnabled,
      agencySaleEnabled: instance.agencySaleEnabled,
      fareClasses: rules.map((rule) => {
        const classSoldRows = soldRows.filter(
          (row) => row.cabin === rule.cabin && row.classCode === rule.classCode,
        );
        const revenue = revenueRows.find(
          (row) => row.cabin === rule.cabin && row.classCode === rule.classCode,
        );
        const priceHistory = history
          .filter((entry) => entry.entityId === rule.id)
          .map((entry) => {
            const metadata =
              entry.metadata &&
              !Array.isArray(entry.metadata) &&
              typeof entry.metadata === 'object'
                ? entry.metadata
                : {};
            return {
              channel:
                entry.action === 'آزادسازی آژانسی کلاس نرخی'
                  ? ('AGENCY' as const)
                  : ('SYSTEM' as const),
              previousPriceIrr:
                typeof metadata.previousPriceIrr === 'string'
                  ? metadata.previousPriceIrr
                  : '0',
              newPriceIrr:
                typeof metadata.newPriceIrr === 'string'
                  ? metadata.newPriceIrr
                  : typeof metadata.priceIrr === 'string'
                    ? metadata.priceIrr
                    : '0',
              reason:
                typeof metadata.reason === 'string' ? metadata.reason : '',
              changedAt: entry.createdAt.toISOString(),
            };
          });
        const soldSeats = classSoldRows.reduce(
          (total, row) => total + Number(row.soldSeats),
          0,
        );
        const siteSoldSeats = classSoldRows
          .filter((row) => row.channel === BookingChannel.SYSTEM)
          .reduce((total, row) => total + Number(row.soldSeats), 0);
        const agencySoldSeats = classSoldRows
          .filter((row) => row.channel === BookingChannel.AGENCY)
          .reduce((total, row) => total + Number(row.soldSeats), 0);
        const classInventoryRows = inventoryRows.filter(
          (row) => row.cabin === rule.cabin && row.classCode === rule.classCode,
        );
        const siteReservedSeats = classInventoryRows
          .filter((row) => row.channel === BookingChannel.SYSTEM)
          .reduce((total, row) => total + Number(row.reservedSeats), 0);
        const agencyBookedSeats = classInventoryRows
          .filter((row) => row.channel === BookingChannel.AGENCY)
          .reduce((total, row) => total + Number(row.reservedSeats), 0);
        const nonAgencyReservedSeats = classInventoryRows
          .filter((row) => row.channel !== BookingChannel.AGENCY)
          .reduce((total, row) => total + Number(row.reservedSeats), 0);
        const agencyAllocatedSeats = Number(
          agencyAllocationRows.find(
            (row) =>
              row.cabin === rule.cabin && row.classCode === rule.classCode,
          )?.allocatedSeats ?? 0,
        );
        const agencyCommittedSeats = Math.max(
          agencyAllocatedSeats,
          agencyBookedSeats,
        );
        const sharedSeatsRemaining = Math.max(
          0,
          rule.seatsAllocated - nonAgencyReservedSeats - agencyCommittedSeats,
        );
        const siteSeatsAvailable = Math.max(
          0,
          Math.min(
            sharedSeatsRemaining,
            rule.siteSeatsReleased - siteReservedSeats,
          ),
        );
        const agencySeatsAvailable = Math.max(
          0,
          Math.min(
            sharedSeatsRemaining,
            rule.agencySeatsReleased - agencyCommittedSeats,
          ),
        );
        return {
          ruleId: rule.id,
          cabin: rule.cabin,
          classCode: rule.classCode,
          seatsAllocated: rule.seatsAllocated,
          soldSeats,
          siteSoldSeats,
          agencySoldSeats,
          remainingSeats: Math.max(0, rule.seatsAllocated - soldSeats),
          sharedSeatsRemaining,
          siteSeatsAvailable,
          agencySeatsAvailable,
          agencySeatsCommitted: agencyCommittedSeats,
          revenueIrr: String(revenue?.revenueIrr ?? '0'),
          basePriceIrr: rule.priceIrr.toString(),
          sitePriceIrr: rule.sitePriceIrr?.toString() ?? null,
          siteSeatsReleased: rule.siteSeatsReleased,
          agencySeatsReleased: rule.agencySeatsReleased,
          agencyReleasePriceIrr: rule.agencyReleasePriceIrr?.toString() ?? null,
          agencySpecialOffer: rule.agencySpecialOffer,
          salesByRate: soldRateRows
            .filter(
              (row) =>
                row.cabin === rule.cabin && row.classCode === rule.classCode,
            )
            .map((row) => ({
              channel: row.channel,
              priceIrr: row.priceIrr,
              seats: Number(row.seats),
              revenueIrr: String(row.revenueIrr ?? '0'),
              lastSoldAt: new Date(row.lastSoldAt).toISOString(),
            })),
          priceHistory,
        };
      }),
    };
  }

  /**
   * Advisory-only fare-class pricing.  The ML service is preferred when it
   * is configured; the deterministic fallback keeps the commercial workflow
   * usable and is labelled as such.  This method never mutates or publishes a
   * FareRule — a commercial user must explicitly save the proposed amount.
   */
  async suggestFareClassPrice(
    instanceId: string,
    ruleId: string,
    channel: 'SYSTEM' | 'AGENCY',
    competitorPriceOverride?: Irr,
    requestId?: string,
  ) {
    const instance = await this.loadCommercialInstance(instanceId);
    const control = await this.commercialControl(instanceId);
    const row = control.fareClasses.find((item) => item.ruleId === ruleId);
    if (!row) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'کلاس نرخی یافت نشد.',
      });
    }

    const basePriceIrr = BigInt(row.basePriceIrr);
    const currentPriceIrr =
      channel === 'AGENCY'
        ? BigInt(
            row.agencyReleasePriceIrr ?? row.sitePriceIrr ?? row.basePriceIrr,
          )
        : BigInt(row.sitePriceIrr ?? row.basePriceIrr);
    const competitorPriceIrr =
      competitorPriceOverride ?? instance.competitorPriceIrr ?? currentPriceIrr;
    const soldSeats =
      channel === 'AGENCY' ? row.agencySoldSeats : row.siteSoldSeats;
    const releasedSeats =
      channel === 'AGENCY' ? row.agencySeatsReleased : row.siteSeatsReleased;
    const availableSeats =
      channel === 'AGENCY' ? row.agencySeatsAvailable : row.siteSeatsAvailable;
    const occupancyPct =
      row.seatsAllocated > 0
        ? Math.round((row.soldSeats / row.seatsAllocated) * 100)
        : 0;
    const hoursToDeparture = Math.max(
      0,
      Math.round(
        ((instance.departureAt.getTime() - Date.now()) / 3_600_000) * 10,
      ) / 10,
    );

    const factorsFa: string[] = [
      `فروش کل کلاس ${occupancyPct}٪ ظرفیت است.`,
      `${hoursToDeparture} ساعت تا پرواز باقی مانده است.`,
      `نرخ رقیب ${competitorPriceIrr.toString()} ریال در تحلیل لحاظ شد.`,
    ];
    let demandAdjustmentPct = 0;
    if (occupancyPct >= 85) {
      demandAdjustmentPct += 12;
      factorsFa.push(
        'تقاضای بسیار بالا، امکان افزایش کنترل‌شده نرخ را نشان می‌دهد.',
      );
    } else if (occupancyPct >= 65) {
      demandAdjustmentPct += 7;
      factorsFa.push('ضریب اشغال مناسب است.');
    } else if (occupancyPct <= 25) {
      demandAdjustmentPct -= hoursToDeparture <= 168 ? 10 : 5;
      factorsFa.push(
        'فروش پایین کلاس، کاهش نرخ برای تحریک تقاضا را توجیه می‌کند.',
      );
    } else if (occupancyPct <= 45 && hoursToDeparture <= 72) {
      demandAdjustmentPct -= 5;
      factorsFa.push('تا پرواز زمان کمی مانده و فروش کلاس پایین است.');
    }
    if (hoursToDeparture <= 24) {
      demandAdjustmentPct += occupancyPct >= 65 ? 5 : -8;
      factorsFa.push(
        occupancyPct >= 65
          ? 'نزدیکی پرواز همراه با تقاضای بالا، فشار افزایشی نرخ دارد.'
          : 'نزدیکی پرواز همراه با ظرفیت خالی، فشار کاهشی نرخ دارد.',
      );
    }

    const marketAnchor = divRoundBigInt(
      currentPriceIrr * 6n + competitorPriceIrr * 4n,
      10n,
    );
    let fallbackPriceIrr = divRoundBigInt(
      marketAnchor * BigInt(100 + demandAdjustmentPct),
      100n,
    );
    const lowerBound = divRoundBigInt(basePriceIrr * 70n, 100n);
    const upperBound = divRoundBigInt(basePriceIrr * 150n, 100n);
    fallbackPriceIrr =
      fallbackPriceIrr < lowerBound
        ? lowerBound
        : fallbackPriceIrr > upperBound
          ? upperBound
          : fallbackPriceIrr;
    fallbackPriceIrr = maxIrr(100_000n, roundIrrTo(fallbackPriceIrr, 100_000n));

    const mlResult = await this.priceSuggestions.suggest(
      [
        {
          proposal_id: ruleId,
          origin_code: instance.flight.route.originCode,
          dest_code: instance.flight.route.destCode,
          departure_at: instance.departureAt.toISOString(),
          base_price_irr: Number(basePriceIrr),
          competitor_price_irr: Number(competitorPriceIrr),
          proposed_price_irr: Number(fallbackPriceIrr),
          capacity: row.seatsAllocated,
          charter_seats: instance.charterSeats,
        },
      ],
      requestId,
    );
    const mlSuggestion = mlResult?.suggestions.find(
      (item) => item.proposal_id === ruleId && item.price_irr > 0,
    );
    const suggestedPriceIrr = mlSuggestion
      ? roundIrrTo(BigInt(Math.round(mlSuggestion.price_irr)), 100_000n)
      : fallbackPriceIrr;

    return {
      ruleId,
      cabin: row.cabin,
      classCode: row.classCode,
      channel,
      capacity: row.seatsAllocated,
      releasedSeats,
      soldSeats,
      totalSoldSeats: row.soldSeats,
      availableSeats,
      sharedSeatsRemaining: row.sharedSeatsRemaining,
      occupancyPct,
      hoursToDeparture,
      basePriceIrr: basePriceIrr.toString(),
      currentPriceIrr: currentPriceIrr.toString(),
      competitorPriceIrr: competitorPriceIrr.toString(),
      suggestedPriceIrr: suggestedPriceIrr.toString(),
      source: mlSuggestion ? ('ML' as const) : ('HEURISTIC' as const),
      modelVersion: mlSuggestion && mlResult ? mlResult.model_version : null,
      confidence: mlSuggestion?.confidence ?? null,
      reasonFa:
        mlSuggestion?.reason_fa ??
        'پیشنهاد پشتیبان با ترکیب فروش کلاس، زمان باقی‌مانده و فاصله نرخ بازار محاسبه شد.',
      factorsFa: mlSuggestion?.factors_fa ?? factorsFa,
      advisoryOnly: true,
    };
  }

  async updateFareClassSitePrice(
    actor: AuthenticatedUser,
    instanceId: string,
    ruleId: string,
    priceIrr: Irr,
    reason: string,
    seats?: number,
  ) {
    const trimmedReason = reason.trim();
    const { saved, previousPriceIrr } = await this.dataSource.transaction(
      async (tx) => {
        const rule = await tx
          .createQueryBuilder(FareRule, 'r')
          .leftJoinAndSelect('r.flightInstance', 'flightInstance')
          .leftJoinAndSelect('flightInstance.flight', 'flight')
          .leftJoinAndSelect('flight.route', 'route')
          .setLock('pessimistic_write', undefined, ['r'])
          .where('r.id = :ruleId', { ruleId })
          .getOne();
        if (!rule || rule.flightInstanceId !== instanceId) {
          throw new NotFoundException({
            code: ErrorCode.NOT_FOUND,
            message: 'کلاس نرخی یافت نشد.',
          });
        }
        const nextSeats = seats ?? rule.siteSeatsReleased;
        if (nextSeats < 0 || nextSeats > rule.seatsAllocated) {
          throw new BadRequestException({
            code: ErrorCode.VALIDATION_FAILED,
            message: `حداکثر ${rule.seatsAllocated} صندلی از این کلاس برای سایت قابل آزادسازی است.`,
          });
        }
        const previousPriceIrr = rule.sitePriceIrr ?? rule.priceIrr;
        if (previousPriceIrr !== priceIrr && trimmedReason.length < 2) {
          throw new BadRequestException({
            code: ErrorCode.VALIDATION_FAILED,
            message: 'دلیل تغییر قیمت را وارد کنید.',
          });
        }
        rule.sitePriceIrr = priceIrr;
        rule.siteSeatsReleased = nextSeats;
        return { saved: await tx.save(rule), previousPriceIrr };
      },
    );
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'PRICING',
      action: 'تغییر قیمت فروش سایت کلاس نرخی',
      detail: `قیمت و ظرفیت فروش سایت کلاس ${saved.classCode} پرواز ${saved.flightInstance.flight.flightNo} توسط ${actor.fullName} تغییر کرد.`,
      entityType: 'FareRule',
      entityId: saved.id,
      metadata: {
        previousPriceIrr: previousPriceIrr.toString(),
        newPriceIrr: priceIrr.toString(),
        reason: trimmedReason,
        seats: saved.siteSeatsReleased,
      },
    });
    await this.invalidateFlightSearch(saved.flightInstance);
    return saved;
  }

  async upsertAgencyFareRelease(
    actor: AuthenticatedUser,
    instanceId: string,
    ruleId: string,
    dto: { seats: number; priceIrr: Irr; specialOffer?: boolean },
  ) {
    const { saved, previousPriceIrr } = await this.dataSource.transaction(
      async (tx) => {
        const rule = await tx
          .createQueryBuilder(FareRule, 'r')
          .leftJoinAndSelect('r.flightInstance', 'flightInstance')
          .leftJoinAndSelect('flightInstance.flight', 'flight')
          .setLock('pessimistic_write', undefined, ['r'])
          .where('r.id = :ruleId', { ruleId })
          .getOne();
        if (!rule || rule.flightInstanceId !== instanceId) {
          throw new NotFoundException({
            code: ErrorCode.NOT_FOUND,
            message: 'کلاس نرخی یافت نشد.',
          });
        }

        // Keep this query on the transaction connection and serialize it after
        // the FareRule lock. The activation path takes the same locks, so a
        // release cannot race an agency payment/allotment activation.
        const allocatedRow = await tx
          .createQueryBuilder(AgencyAllotment, 'allotment')
          .select('COALESCE(SUM(allotment.seatsAllocated), 0)', 'allocated')
          .where('allotment.flightInstanceId = :instanceId', { instanceId })
          .andWhere('allotment.cabin = :cabin', { cabin: rule.cabin })
          .andWhere('allotment.fareClassCode = :classCode', {
            classCode: rule.classCode,
          })
          .andWhere(
            '(allotment.type = :hard OR allotment.releaseAt IS NULL OR allotment.releaseAt > :now)',
            { hard: 'HARD', now: new Date() },
          )
          .getRawOne<{ allocated: string }>();
        const activated = Number(allocatedRow?.allocated ?? 0);
        if (dto.seats < activated) {
          throw new BadRequestException({
            code: ErrorCode.VALIDATION_FAILED,
            message: `سهمیه آژانسی نمی‌تواند از ${activated} صندلی فعال‌شده کمتر باشد.`,
          });
        }
        if (dto.seats > rule.seatsAllocated) {
          throw new BadRequestException({
            code: ErrorCode.VALIDATION_FAILED,
            message: `حداکثر ${rule.seatsAllocated} صندلی از این کلاس برای آژانس‌ها قابل آزادسازی است.`,
          });
        }
        const previousPriceIrr = rule.agencyReleasePriceIrr ?? rule.priceIrr;
        rule.agencySeatsReleased = dto.seats;
        rule.agencyReleasePriceIrr = dto.seats > 0 ? dto.priceIrr : null;
        rule.agencySpecialOffer = dto.seats > 0 && (dto.specialOffer ?? false);
        return { saved: await tx.save(rule), previousPriceIrr };
      },
    );
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'PRICING',
      action: 'آزادسازی آژانسی کلاس نرخی',
      detail: `${dto.seats} صندلی از کلاس ${saved.classCode} پرواز ${saved.flightInstance.flight.flightNo} برای فروش آژانسی تنظیم شد.`,
      entityType: 'FareRule',
      entityId: saved.id,
      metadata: {
        seats: dto.seats,
        previousPriceIrr: previousPriceIrr.toString(),
        newPriceIrr: dto.priceIrr.toString(),
        priceIrr: dto.priceIrr.toString(),
        specialOffer: dto.specialOffer ?? false,
      },
    });
    return saved;
  }

  async updateFareClassChannelRelease(
    actor: AuthenticatedUser,
    instanceId: string,
    ruleId: string,
    dto: {
      siteSeats: number;
      sitePriceIrr: Irr;
      agencySeats: number;
      agencyPriceIrr: Irr;
      specialOffer?: boolean;
      reason?: string;
    },
  ) {
    const trimmedReason = dto.reason?.trim() ?? '';
    const result = await this.dataSource.transaction(async (tx) => {
      const rule = await tx
        .createQueryBuilder(FareRule, 'r')
        .leftJoinAndSelect('r.flightInstance', 'flightInstance')
        .leftJoinAndSelect('flightInstance.flight', 'flight')
        .setLock('pessimistic_write', undefined, ['r'])
        .where('r.id = :ruleId', { ruleId })
        .getOne();
      if (!rule || rule.flightInstanceId !== instanceId) {
        throw new NotFoundException({
          code: ErrorCode.NOT_FOUND,
          message: 'کلاس نرخی یافت نشد.',
        });
      }

      if (
        dto.siteSeats > rule.seatsAllocated ||
        dto.agencySeats > rule.seatsAllocated
      ) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_FAILED,
          message: `سقف فروش هر کانال نمی‌تواند از ${rule.seatsAllocated} صندلی بیشتر باشد.`,
        });
      }
      if (dto.agencySeats > 0 && dto.agencyPriceIrr <= ZERO_IRR) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_FAILED,
          message: 'برای ظرفیت آژانسی، قیمت فروش معتبر وارد کنید.',
        });
      }

      const soldRows = await tx
        .createQueryBuilder(Passenger, 'p')
        .innerJoin('p.booking', 'b')
        .select('b.channel', 'channel')
        .addSelect('COUNT(p.id)', 'soldSeats')
        .where('b.flightInstanceId = :instanceId', { instanceId })
        .andWhere('b.cabin = :cabin', { cabin: rule.cabin })
        .andWhere('b.fareClassCode = :classCode', {
          classCode: rule.classCode,
        })
        .andWhere('b.status IN (:...statuses)', {
          statuses: [...SOLD_STATUSES],
        })
        .andWhere('p.occupiesSeat = true')
        .andWhere('p.deletedAt IS NULL')
        .groupBy('b.channel')
        .getRawMany<{ channel: BookingChannel; soldSeats: string }>();
      const soldFor = (channel: BookingChannel) =>
        Number(soldRows.find((row) => row.channel === channel)?.soldSeats ?? 0);
      const siteSold = soldFor(BookingChannel.SYSTEM);
      const agencySold = soldFor(BookingChannel.AGENCY);
      if (dto.siteSeats < siteSold) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_FAILED,
          message: `ظرفیت سایت نمی‌تواند از ${siteSold} صندلی فروخته‌شده کمتر باشد.`,
        });
      }
      if (dto.agencySeats < agencySold) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_FAILED,
          message: `ظرفیت آژانسی نمی‌تواند از ${agencySold} صندلی فروخته‌شده کمتر باشد.`,
        });
      }

      const allocatedRow = await tx
        .createQueryBuilder(AgencyAllotment, 'allotment')
        .select('COALESCE(SUM(allotment.seatsAllocated), 0)', 'allocated')
        .where('allotment.flightInstanceId = :instanceId', { instanceId })
        .andWhere('allotment.cabin = :cabin', { cabin: rule.cabin })
        .andWhere('allotment.fareClassCode = :classCode', {
          classCode: rule.classCode,
        })
        .andWhere(
          '(allotment.type = :hard OR allotment.releaseAt IS NULL OR allotment.releaseAt > :now)',
          { hard: 'HARD', now: new Date() },
        )
        .getRawOne<{ allocated: string }>();
      const activeAgencySeats = Number(allocatedRow?.allocated ?? 0);
      if (dto.agencySeats < activeAgencySeats) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_FAILED,
          message: `ظرفیت آژانسی نمی‌تواند از ${activeAgencySeats} صندلی فعال‌شده کمتر باشد.`,
        });
      }

      const previousSitePriceIrr = rule.sitePriceIrr ?? rule.priceIrr;
      const sitePriceChanged = previousSitePriceIrr !== dto.sitePriceIrr;
      if (sitePriceChanged && trimmedReason.length < 2) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_FAILED,
          message: 'برای تغییر قیمت فروش سایت، دلیل تغییر را وارد کنید.',
        });
      }

      rule.siteSeatsReleased = dto.siteSeats;
      rule.sitePriceIrr = dto.sitePriceIrr;
      rule.agencySeatsReleased = dto.agencySeats;
      rule.agencyReleasePriceIrr =
        dto.agencySeats > 0 ? dto.agencyPriceIrr : null;
      rule.agencySpecialOffer =
        dto.agencySeats > 0 && (dto.specialOffer ?? false);
      return {
        saved: await tx.save(rule),
        previousSitePriceIrr,
        sitePriceChanged,
      };
    });

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'PRICING',
      action: result.sitePriceChanged
        ? 'تغییر قیمت فروش سایت کلاس نرخی'
        : 'تنظیم ظرفیت فروش سایت و آژانس',
      detail: `نرخ و ظرفیت فروش سایت و آژانس کلاس ${result.saved.classCode} پرواز ${result.saved.flightInstance.flight.flightNo} توسط ${actor.fullName} ثبت شد.`,
      entityType: 'FareRule',
      entityId: result.saved.id,
      metadata: {
        previousPriceIrr: result.previousSitePriceIrr.toString(),
        newPriceIrr: dto.sitePriceIrr.toString(),
        reason: trimmedReason,
        siteSeats: dto.siteSeats,
        agencySeats: dto.agencySeats,
        agencyPriceIrr: dto.agencyPriceIrr.toString(),
        specialOffer: dto.specialOffer ?? false,
      },
    });
    await this.invalidateFlightSearch(result.saved.flightInstance);
    return result.saved;
  }

  /** Physical seat count for one cabin — prefers flight-definition
   * cabinCapacities when present; otherwise counts seats on the map. */
  private async cabinSeatCount(
    instance: {
      flight: { aircraftType: string };
      aircraftTypeOverride: string | null;
      cabinCapacities?: unknown;
    },
    cabin: CabinClass,
  ): Promise<number> {
    const capacities = serializeCabinCapacities(instance.cabinCapacities);
    if (capacities.length > 0) {
      return capacities.find((row) => row.cabin === cabin)?.seats ?? 0;
    }
    const map = await this.seatMapRepo.findOneBy({
      aircraftType: resolveAircraftType(instance),
    });
    if (!map) return 0;
    return enumerateSeats(map).filter((s) => s.cabin === cabin).length;
  }

  private cabinLabelFa(cabin: CabinClass): string {
    switch (cabin) {
      case 'FIRST':
        return 'درجه یک';
      case 'BUSINESS':
        return 'بیزینس';
      case 'COMFORT':
        return 'کامفورت';
      case 'ECONOMY':
        return 'اکونومی';
      default:
        return cabin;
    }
  }

  private validateFareRuleWindow(dto: {
    validFrom?: string;
    validUntil?: string;
  }) {
    if (
      dto.validFrom &&
      dto.validUntil &&
      new Date(dto.validUntil) <= new Date(dto.validFrom)
    ) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'پایان بازه اعتبار باید بعد از شروع آن باشد.',
      });
    }
  }

  async createFareRule(
    actor: AuthenticatedUser,
    instanceId: string,
    dto: {
      cabin: CabinClass;
      classCode: string;
      priceIrr: Irr;
      seatsAllocated: number;
      siteSeats?: number;
      sitePriceIrr?: Irr;
      agencySeats?: number;
      agencyPriceIrr?: Irr;
      agencySpecialOffer?: boolean;
      taxIrr?: Irr;
      refundable?: boolean;
      changeable?: boolean;
      baggageAllowanceKg?: number;
      validFrom?: string;
      validUntil?: string;
      allowedChannels?: ('SYSTEM' | 'CHARTER' | 'AGENCY')[];
    },
  ) {
    const instance = await this.instanceRepo
      .createQueryBuilder('fi')
      .leftJoinAndSelect('fi.flight', 'flight')
      .where('fi.id = :id', { id: instanceId })
      .getOne();
    if (!instance) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'پرواز یافت نشد.',
      });
    }
    this.validateFareRuleWindow(dto);

    const siteSeats = dto.siteSeats ?? dto.seatsAllocated;
    const agencySeats = dto.agencySeats ?? 0;
    if (siteSeats > dto.seatsAllocated || agencySeats > dto.seatsAllocated) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'سقف فروش هر کانال از ظرفیت برنامه نرخ بیشتر است.',
      });
    }
    if (agencySeats > 0 && !dto.agencyPriceIrr) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'برای سهم آژانسی، نرخ فروش آژانس را وارد کنید.',
      });
    }

    const cabinSeats = await this.cabinSeatCount(instance, dto.cabin);
    const existing = await this.fareRuleRepo.find({
      where: { flightInstanceId: instanceId, cabin: dto.cabin },
    });
    const existingTotal = existing.reduce((a, r) => a + r.seatsAllocated, 0);
    if (existingTotal + dto.seatsAllocated > cabinSeats) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: `مجموع صندلی تخصیص‌یافته کلاس‌های نرخی (${existingTotal + dto.seatsAllocated}) از ظرفیت کابین ${this.cabinLabelFa(dto.cabin)} (${cabinSeats}) بیشتر است.`,
      });
    }

    const created = await this.fareRuleRepo.save(
      this.fareRuleRepo.create({
        flightInstanceId: instanceId,
        cabin: dto.cabin,
        classCode: dto.classCode,
        priceIrr: dto.priceIrr,
        seatsAllocated: dto.seatsAllocated,
        sitePriceIrr: dto.sitePriceIrr ?? dto.priceIrr,
        siteSeatsReleased: siteSeats,
        agencySeatsReleased: agencySeats,
        agencyReleasePriceIrr:
          agencySeats > 0 ? (dto.agencyPriceIrr ?? null) : null,
        agencySpecialOffer:
          agencySeats > 0 && (dto.agencySpecialOffer ?? false),
        taxIrr: dto.taxIrr ?? ZERO_IRR,
        refundable: dto.refundable ?? true,
        changeable: dto.changeable ?? true,
        baggageAllowanceKg: dto.baggageAllowanceKg,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : undefined,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
        allowedChannels: dto.allowedChannels ?? [],
      }),
    );

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'PRICING',
      action: 'ایجاد کلاس نرخی',
      detail: `کلاس نرخی «${dto.classCode}» برای پرواز ${instance.flight.flightNo} توسط ${actor.fullName} ایجاد شد.`,
      entityType: 'FareRule',
      entityId: created.id,
    });

    return created;
  }

  async updateFareRule(
    actor: AuthenticatedUser,
    instanceId: string,
    ruleId: string,
    dto: {
      priceIrr?: Irr;
      seatsAllocated?: number;
      taxIrr?: Irr;
      refundable?: boolean;
      changeable?: boolean;
      baggageAllowanceKg?: number;
      validFrom?: string;
      validUntil?: string;
      allowedChannels?: ('SYSTEM' | 'CHARTER' | 'AGENCY')[];
    },
  ) {
    const rule = await this.fareRuleRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.flightInstance', 'flightInstance')
      .leftJoinAndSelect('flightInstance.flight', 'flight')
      .where('r.id = :id', { id: ruleId })
      .getOne();
    if (!rule || rule.flightInstanceId !== instanceId) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'کلاس نرخی یافت نشد.',
      });
    }
    this.validateFareRuleWindow({
      validFrom: dto.validFrom ?? rule.validFrom?.toISOString(),
      validUntil: dto.validUntil ?? rule.validUntil?.toISOString(),
    });

    if (dto.seatsAllocated !== undefined) {
      const cabinSeats = await this.cabinSeatCount(
        rule.flightInstance,
        rule.cabin,
      );
      const others = await this.fareRuleRepo.find({
        where: {
          flightInstanceId: instanceId,
          cabin: rule.cabin,
          id: Not(ruleId),
        },
      });
      const othersTotal = others.reduce((a, r) => a + r.seatsAllocated, 0);
      if (othersTotal + dto.seatsAllocated > cabinSeats) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_FAILED,
          message: `مجموع صندلی تخصیص‌یافته کلاس‌های نرخی (${othersTotal + dto.seatsAllocated}) از ظرفیت کابین ${this.cabinLabelFa(rule.cabin)} (${cabinSeats}) بیشتر است.`,
        });
      }
    }

    if (dto.priceIrr !== undefined) rule.priceIrr = dto.priceIrr;
    if (dto.seatsAllocated !== undefined)
      rule.seatsAllocated = dto.seatsAllocated;
    if (dto.taxIrr !== undefined) rule.taxIrr = dto.taxIrr;
    if (dto.refundable !== undefined) rule.refundable = dto.refundable;
    if (dto.changeable !== undefined) rule.changeable = dto.changeable;
    if (dto.baggageAllowanceKg !== undefined)
      rule.baggageAllowanceKg = dto.baggageAllowanceKg;
    if (dto.validFrom !== undefined)
      rule.validFrom = dto.validFrom ? new Date(dto.validFrom) : null;
    if (dto.validUntil !== undefined)
      rule.validUntil = dto.validUntil ? new Date(dto.validUntil) : null;
    if (dto.allowedChannels !== undefined)
      rule.allowedChannels = dto.allowedChannels;
    const updated = await this.fareRuleRepo.save(rule);

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'PRICING',
      action: 'ویرایش کلاس نرخی',
      detail: `کلاس نرخی «${rule.classCode}» پرواز ${rule.flightInstance.flight.flightNo} توسط ${actor.fullName} ویرایش شد.`,
      entityType: 'FareRule',
      entityId: rule.id,
    });

    return updated;
  }

  async deleteFareRule(
    actor: AuthenticatedUser,
    instanceId: string,
    ruleId: string,
  ) {
    const rule = await this.fareRuleRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.flightInstance', 'flightInstance')
      .leftJoinAndSelect('flightInstance.flight', 'flight')
      .where('r.id = :id', { id: ruleId })
      .getOne();
    if (!rule || rule.flightInstanceId !== instanceId) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'کلاس نرخی یافت نشد.',
      });
    }
    const activeBooking = await this.bookingRepo
      .createQueryBuilder('b')
      .where('b.flightInstanceId = :instanceId', { instanceId })
      .andWhere('b.cabin = :cabin', { cabin: rule.cabin })
      .andWhere('b.fareClassCode = :classCode', { classCode: rule.classCode })
      .andWhere('b.status IN (:...statuses)', {
        statuses: ['DRAFT', 'HELD', 'PAID', 'TICKETED'],
      })
      .getOne();
    if (activeBooking) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'این کلاس نرخی توسط رزروهای فعال استفاده شده و قابل حذف نیست.',
      });
    }

    await this.fareRuleRepo.delete({ id: ruleId });

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'PRICING',
      action: 'حذف کلاس نرخی',
      detail: `کلاس نرخی «${rule.classCode}» پرواز ${rule.flightInstance.flight.flightNo} توسط ${actor.fullName} حذف شد.`,
      entityType: 'FareRule',
      entityId: rule.id,
    });

    return { success: true };
  }

  // ── Phase 13 Part C: per-agency allotments ────────────────────────────

  async listAllotments(instanceId: string) {
    const rows = await this.allotmentRepo
      .createQueryBuilder('a')
      .leftJoin('a.agency', 'agency')
      .leftJoin('agency.user', 'user')
      .addSelect(['agency.userId', 'user.id', 'user.fullName'])
      .where('a.flightInstanceId = :instanceId', { instanceId })
      .orderBy('a.createdAt', 'DESC')
      .getMany();
    const now = new Date();
    return rows.map((r) => ({
      id: r.id,
      agencyId: r.agencyId,
      agencyName: r.agency.user.fullName,
      seatsAllocated: r.seatsAllocated,
      type: r.type,
      releaseAt: r.releaseAt,
      contractPriceIrr: r.contractPriceIrr,
      createdAt: r.createdAt,
      active: r.type === 'HARD' || !r.releaseAt || r.releaseAt > now,
    }));
  }

  async allotmentSummary(instanceId: string) {
    const instance = await this.instanceRepo.findOne({
      where: { id: instanceId },
    });
    if (!instance) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'پرواز یافت نشد.',
      });
    }

    const agencies = (await this.listAllotments(instanceId)).filter(
      (row) => row.active,
    );
    const directReserved = await this.passengerRepo
      .createQueryBuilder('passenger')
      .innerJoin('passenger.booking', 'booking')
      .where('booking.flightInstanceId = :instanceId', { instanceId })
      .andWhere('booking.agencyId IS NULL')
      .andWhere('booking.deletedAt IS NULL')
      .andWhere('passenger.deletedAt IS NULL')
      .andWhere('passenger.occupiesSeat = true')
      .andWhere('booking.status IN (:...statuses)', {
        statuses: ['DRAFT', 'HELD', 'PAID', 'TICKETED'],
      })
      .getCount();

    const agencySeats = agencies.reduce(
      (sum, row) => sum + row.seatsAllocated,
      0,
    );
    const agencyRevenueIrr = agencies.reduce(
      (sum, row) =>
        sum + BigInt(row.contractPriceIrr ?? 0) * BigInt(row.seatsAllocated),
      0n,
    );
    const charterSeats = Math.max(instance.charterSeats ?? 0, 0);
    const freeSeats = Math.max(
      instance.capacity - charterSeats - agencySeats - directReserved,
      0,
    );

    return {
      flightInstanceId: instanceId,
      totalCapacity: instance.capacity,
      charterSeats,
      directReserved,
      agencySeats,
      freeSeats,
      agencyRevenueIrr: agencyRevenueIrr.toString(),
      agencies: agencies.map((row) => ({
        ...row,
        contractPriceIrr: row.contractPriceIrr?.toString() ?? null,
        revenueIrr: (
          BigInt(row.contractPriceIrr ?? 0) * BigInt(row.seatsAllocated)
        ).toString(),
      })),
    };
  }

  async createAllotment(
    actor: AuthenticatedUser,
    instanceId: string,
    dto: {
      agencyId: string;
      seatsAllocated: number;
      type?: 'SOFT' | 'HARD';
      releaseAt?: string;
      contractPriceIrr?: Irr;
    },
  ) {
    const agency = await this.agencyProfileRepo.findOneBy({
      userId: dto.agencyId,
    });
    if (!agency) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'آژانس یافت نشد.',
      });
    }

    const created = await this.dataSource.transaction(async (manager) => {
      // Shared lock with schedule-template deactivate.
      const instance = await manager
        .createQueryBuilder(FlightInstance, 'fi')
        .setLock('pessimistic_write')
        .where('fi.id = :id', { id: instanceId })
        .getOne();
      if (!instance) {
        throw new NotFoundException({
          code: ErrorCode.NOT_FOUND,
          message: 'پرواز یافت نشد.',
        });
      }
      if (instance.status === FlightInstanceStatus.CANCELLED) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message: 'پرواز لغو شده و قابل تخصیص سهمیه نیست.',
        });
      }
      const now = new Date();
      const activeAllotments = await manager
        .getRepository(AgencyAllotment)
        .createQueryBuilder('a')
        .where('a.flightInstanceId = :instanceId', { instanceId })
        .andWhere(
          '(a.type = :hard OR a.releaseAt IS NULL OR a.releaseAt > :now)',
          { hard: 'HARD', now },
        )
        .getMany();
      const existingTotal = activeAllotments.reduce(
        (sum, allotment) => sum + allotment.seatsAllocated,
        0,
      );
      const directReserved = await manager
        .getRepository(Passenger)
        .createQueryBuilder('passenger')
        .innerJoin('passenger.booking', 'booking')
        .where('booking.flightInstanceId = :instanceId', { instanceId })
        .andWhere('booking.agencyId IS NULL')
        .andWhere('booking.deletedAt IS NULL')
        .andWhere('passenger.deletedAt IS NULL')
        .andWhere('passenger.occupiesSeat = true')
        .andWhere('booking.status IN (:...statuses)', {
          statuses: ['DRAFT', 'HELD', 'PAID', 'TICKETED'],
        })
        .getCount();
      const physicalAvailable = Math.max(
        instance.capacity -
          Math.max(instance.charterSeats ?? 0, 0) -
          directReserved -
          existingTotal,
        0,
      );
      if (dto.seatsAllocated > physicalAvailable) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_FAILED,
          message: `فقط ${physicalAvailable} صندلی از ظرفیت واقعی پرواز آزاد است؛ فروش آنلاین و تخصیص آژانس در مجموع نمی‌توانند از ${instance.capacity} صندلی بیشتر شوند.`,
        });
      }

      return manager.save(
        manager.create(AgencyAllotment, {
          agencyId: dto.agencyId,
          flightInstanceId: instanceId,
          seatsAllocated: dto.seatsAllocated,
          type: dto.type ?? 'HARD',
          releaseAt:
            dto.type === 'SOFT' && dto.releaseAt
              ? new Date(dto.releaseAt)
              : undefined,
          contractPriceIrr: dto.contractPriceIrr,
          createdById: actor.id,
        }),
      );
    });

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'AGENCY',
      action: 'تخصیص سهمیه پرواز به آژانس',
      detail: `${dto.seatsAllocated} صندلی برای این پرواز به آژانس تخصیص یافت (نوع: ${dto.type ?? 'HARD'}) توسط ${actor.fullName}.`,
      entityType: 'AgencyAllotment',
      entityId: created.id,
    });

    return created;
  }

  async deleteAllotment(
    actor: AuthenticatedUser,
    instanceId: string,
    allotmentId: string,
  ) {
    const allotment = await this.allotmentRepo.findOneBy({ id: allotmentId });
    if (!allotment || allotment.flightInstanceId !== instanceId) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'سهمیه یافت نشد.',
      });
    }
    const activeBooking = await this.bookingRepo
      .createQueryBuilder('b')
      .where('b.flightInstanceId = :instanceId', { instanceId })
      .andWhere('b.agencyId = :agencyId', { agencyId: allotment.agencyId })
      .andWhere('b.status IN (:...statuses)', {
        statuses: ['DRAFT', 'HELD', 'PAID', 'TICKETED'],
      })
      .getOne();
    if (activeBooking) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message:
          'این آژانس رزرو فعالی روی این پرواز دارد و سهمیه قابل حذف نیست.',
      });
    }

    await this.allotmentRepo.delete({ id: allotmentId });

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'AGENCY',
      action: 'حذف سهمیه آژانس',
      detail: `سهمیه آژانس روی این پرواز توسط ${actor.fullName} حذف شد.`,
      entityType: 'AgencyAllotment',
      entityId: allotmentId,
    });

    return { success: true };
  }

  async cancelFlight(
    actor: AuthenticatedUser,
    instanceId: string,
    reasonInput: string,
  ) {
    const reason = reasonInput.trim();
    if (reason.length < 3) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'علت کنسلی را کامل وارد کنید.',
      });
    }
    const result = await this.dataSource.transaction(async (manager) => {
      const instance = await manager
        .getRepository(FlightInstance)
        .createQueryBuilder('fi')
        .setLock('pessimistic_write')
        .leftJoinAndSelect('fi.flight', 'flight')
        .leftJoinAndSelect('flight.route', 'route')
        .where('fi.id = :instanceId', { instanceId })
        .getOne();
      if (!instance) {
        throw new NotFoundException({
          code: ErrorCode.NOT_FOUND,
          message: 'پرواز یافت نشد.',
        });
      }
      if (instance.status === FlightInstanceStatus.CANCELLED) {
        return {
          instance,
          alreadyCancelled: true as const,
          bookings: [] as Booking[],
        };
      }
      if (instance.status !== FlightInstanceStatus.SCHEDULED) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message: 'فقط پرواز زمان‌بندی‌شده قابل کنسل کردن است.',
        });
      }
      instance.status = FlightInstanceStatus.CANCELLED;
      instance.publicSaleEnabled = false;
      instance.commercialPanelSettings = {
        ...parseCommercialPanelSettings(instance.commercialPanelSettings),
        siteVisible: false,
      } as unknown as typeof instance.commercialPanelSettings;
      instance.cancelledAt = new Date();
      instance.cancellationReason = reason;
      instance.cancelledByUserId = actor.id;
      instance.version += 1;
      await manager.save(instance);
      const bookings = await manager.getRepository(Booking).find({
        where: {
          flightInstanceId: instance.id,
          status: In([BookingStatus.PAID, BookingStatus.TICKETED]),
        },
      });
      await manager.save(
        manager.create(AuditLog, {
          actorId: actor.id,
          actorRole: actor.role,
          category: 'RESERVATION',
          action: 'کنسلی پرواز',
          detail: `پرواز ${instance.flight.flightNo} توسط ${actor.fullName} کنسل شد: ${reason}`,
          entityType: 'FlightInstance',
          entityId: instance.id,
          metadata: { reason, affectedBookings: bookings.length },
        }),
      );
      return { instance, alreadyCancelled: false as const, bookings };
    });

    if (!result.alreadyCancelled) {
      await this.invalidateFlightSearch(result.instance);
      const route = `${result.instance.flight.route.originCode} به ${result.instance.flight.route.destCode}`;
      await Promise.allSettled(
        result.bookings.flatMap((booking) => {
          const jobs: Promise<unknown>[] = [
            this.sms.send(
              booking.contactPhone,
              `مسافر گرامی، پرواز ${result.instance.flight.flightNo} مسیر ${route} کنسل شد. استرداد وجه توسط واحد مالی انجام می‌شود.`,
              'FLIGHT_CANCELLED',
            ),
          ];
          if (booking.userId) {
            jobs.push(
              this.notifications.notify({
                recipientId: booking.userId,
                category: NotificationCategory.SYSTEM,
                action: 'FLIGHT_CANCELLED',
                title: 'پرواز شما کنسل شد',
                body: `پرواز ${result.instance.flight.flightNo} مسیر ${route} کنسل شد.`,
                entityType: 'Booking',
                entityId: booking.id,
                dedupeKey: `Booking:${booking.id}:FLIGHT_CANCELLED`,
              }),
            );
          }
          return jobs;
        }),
      );
    }
    return {
      flightInstanceId: result.instance.id,
      status: result.instance.status,
      cancelledAt: result.instance.cancelledAt?.toISOString() ?? null,
      cancellationReason: result.instance.cancellationReason,
      affectedBookings: result.bookings.length,
      alreadyCancelled: result.alreadyCancelled,
    };
  }

  async listCancellations() {
    const instances = await this.instanceRepo
      .createQueryBuilder('fi')
      .leftJoinAndSelect('fi.flight', 'flight')
      .leftJoinAndSelect('flight.route', 'route')
      .leftJoinAndSelect('fi.cancelledBy', 'cancelledBy')
      .where('fi.status = :status', { status: FlightInstanceStatus.CANCELLED })
      .orderBy('fi.cancelledAt', 'DESC')
      .addOrderBy('fi.departureAt', 'ASC')
      .getMany();
    if (instances.length === 0) return [];
    const bookings = await this.bookingRepo.find({
      where: {
        flightInstanceId: In(instances.map((instance) => instance.id)),
        status: In([
          BookingStatus.PAID,
          BookingStatus.TICKETED,
          BookingStatus.REFUNDED,
        ]),
      },
      order: { createdAt: 'ASC' },
    });
    const passengers = bookings.length
      ? await this.passengerRepo.find({
          where: {
            bookingId: In(bookings.map((booking) => booking.id)),
            deletedAt: IsNull(),
          },
        })
      : [];
    const namesByBooking = new Map<string, string[]>();
    for (const passenger of passengers) {
      const names = namesByBooking.get(passenger.bookingId) ?? [];
      names.push(passenger.fullName);
      namesByBooking.set(passenger.bookingId, names);
    }
    return instances.map((instance) => {
      const affected = bookings.filter(
        (booking) => booking.flightInstanceId === instance.id,
      );
      return {
        id: instance.id,
        flightNo: instance.flight.flightNo,
        originCode: instance.flight.route.originCode,
        destCode: instance.flight.route.destCode,
        departureAt: instance.departureAt.toISOString(),
        cancelledAt: instance.cancelledAt?.toISOString() ?? null,
        cancellationReason: instance.cancellationReason,
        cancelledBy: instance.cancelledBy
          ? {
              id: instance.cancelledBy.id,
              fullName: instance.cancelledBy.fullName,
            }
          : null,
        refundSummary: {
          total: affected.length,
          pending: affected.filter(
            (booking) => booking.status !== BookingStatus.REFUNDED,
          ).length,
          refunded: affected.filter(
            (booking) => booking.status === BookingStatus.REFUNDED,
          ).length,
        },
        bookings: affected.map((booking) => ({
          id: booking.id,
          pnr: booking.pnr,
          status: booking.status,
          priceIrr: booking.priceIrr,
          contactPhone: booking.contactPhone,
          passengerNames: namesByBooking.get(booking.id) ?? [],
        })),
      };
    });
  }

  async refundCancelledBooking(
    actor: AuthenticatedUser,
    instanceId: string,
    bookingId: string,
  ) {
    const result = await this.dataSource.transaction(async (manager) => {
      const instance = await manager
        .getRepository(FlightInstance)
        .createQueryBuilder('fi')
        .setLock('pessimistic_read')
        .where('fi.id = :instanceId', { instanceId })
        .getOne();
      if (!instance || instance.status !== FlightInstanceStatus.CANCELLED) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message: 'این پرواز در فهرست پروازهای کنسل‌شده نیست.',
        });
      }
      const booking = await manager
        .getRepository(Booking)
        .createQueryBuilder('booking')
        .setLock('pessimistic_write')
        .where('booking.id = :bookingId', { bookingId })
        .andWhere('booking.flightInstanceId = :instanceId', { instanceId })
        .getOne();
      if (!booking) {
        throw new NotFoundException({
          code: ErrorCode.NOT_FOUND,
          message: 'رزرو مرتبط با این پرواز یافت نشد.',
        });
      }
      if (booking.status === BookingStatus.REFUNDED) {
        return { booking, alreadyRefunded: true as const };
      }
      if (
        booking.status !== BookingStatus.PAID &&
        booking.status !== BookingStatus.TICKETED
      ) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message: 'این رزرو وجه قابل استرداد ندارد.',
        });
      }
      booking.status = BookingStatus.REFUNDED;
      await manager.save(booking);
      await manager.save(
        manager.create(LedgerEntry, {
          bookingId: booking.id,
          type: LedgerEntryType.REFUND,
          signedAmountIrr: -booking.priceIrr,
          createdById: actor.id,
          agencyId: booking.agencyId,
        }),
      );
      if (booking.userId) {
        await manager.save(
          manager.create(WalletEntry, {
            userId: booking.userId,
            type: WalletEntryType.REFUND,
            signedAmountIrr: booking.priceIrr,
            bookingId: booking.id,
          }),
        );
      }
      await manager.save(
        manager.create(AuditLog, {
          actorId: actor.id,
          actorRole: actor.role,
          category: 'REFUND',
          action: 'استرداد پرواز کنسل‌شده',
          detail: `مبلغ رزرو ${booking.pnr} توسط ${actor.fullName} به حساب مسافر بازگشت داده شد.`,
          entityType: 'Booking',
          entityId: booking.id,
          metadata: {
            flightInstanceId: instanceId,
            amountIrr: booking.priceIrr.toString(),
          },
        }),
      );
      return { booking, alreadyRefunded: false as const };
    });
    if (!result.alreadyRefunded && result.booking.userId) {
      await this.notifications.notify({
        recipientId: result.booking.userId,
        category: NotificationCategory.SYSTEM,
        action: 'CANCELLED_FLIGHT_REFUNDED',
        title: 'وجه بلیط به حساب شما بازگشت داده شد',
        body: `مبلغ رزرو ${result.booking.pnr} به حساب شما بازگشت داده شد.`,
        entityType: 'Booking',
        entityId: result.booking.id,
        dedupeKey: `Booking:${result.booking.id}:CANCELLED_FLIGHT_REFUNDED`,
      });
    }
    return {
      bookingId: result.booking.id,
      pnr: result.booking.pnr,
      status: result.booking.status,
      refundedIrr: result.booking.priceIrr,
      alreadyRefunded: result.alreadyRefunded,
    };
  }

  async patchCommercialPanelSettings(
    actor: AuthenticatedUser,
    instanceId: string,
    dto: Partial<CommercialPanelSettings>,
  ) {
    const instance = await this.instanceRepo
      .createQueryBuilder('fi')
      .leftJoinAndSelect('fi.flight', 'flight')
      .leftJoinAndSelect('flight.route', 'route')
      .where('fi.id = :id', { id: instanceId })
      .getOne();
    if (!instance) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'پرواز یافت نشد.',
      });
    }
    const previous = parseCommercialPanelSettings(
      instance.commercialPanelSettings,
    );
    const merged = mergeCommercialPanelSettings(
      instance.commercialPanelSettings,
      dto,
    );
    if (typeof dto.siteVisible === 'boolean') {
      if (
        dto.siteVisible &&
        (instance.status !== FlightInstanceStatus.SCHEDULED ||
          !isSellableDefinitionStatus(
            instance.definitionStatus,
            instance.approvedSnapshot != null,
          ))
      ) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message: 'فقط پرواز تأییدشده و زمان‌بندی‌شده قابل نمایش در سایت است.',
        });
      }
      instance.publicSaleEnabled = dto.siteVisible;
    }
    instance.commercialPanelSettings =
      merged as unknown as typeof instance.commercialPanelSettings;
    instance.version += 1;
    await this.instanceRepo.save(instance);

    if (previous.siteVisible !== merged.siteVisible) {
      const visible = resolveSiteVisible(merged);
      await this.audit.record({
        actorId: actor.id,
        actorRole: actor.role,
        category: 'PRICING',
        action: visible
          ? 'فعال‌سازی نمایش پرواز در سایت'
          : 'مخفی‌سازی پرواز از سایت',
        detail: `پرواز ${instance.flight.flightNo} (${instance.flight.route.originCode}←${instance.flight.route.destCode}) توسط ${actor.fullName}.`,
        entityType: 'FlightInstance',
        entityId: instance.id,
        metadata: { siteVisible: visible },
      });
      await this.redis.del(
        `search:flights:${instance.flight.route.originCode.toUpperCase()}:${instance.flight.route.destCode.toUpperCase()}:${instance.departureAt.toISOString().slice(0, 10)}`,
      );
    }

    const sold = await this.soldByInstance([instance.id]);
    const soldByCabin = await this.soldByInstanceAndCabin([instance.id]);
    const fareRules = await this.fareRuleRepo.find({
      where: { flightInstanceId: instance.id },
    });
    const lockedSeats = await this.lockedSeatsByInstance([instance.id]);
    let routeAgencyPriceIrr: string | null = null;
    if (instance.scheduleTemplateId) {
      const prices = await this.routeAgencyPriceByTemplate([
        instance.scheduleTemplateId,
      ]);
      routeAgencyPriceIrr = prices.get(instance.scheduleTemplateId) ?? null;
    }
    return this.buildCommercialExtras(
      instance,
      sold.get(instance.id) ?? 0,
      soldByCabin.get(instance.id) ?? new Map(),
      fareRules,
      lockedSeats.get(instance.id) ?? 0,
      routeAgencyPriceIrr,
    );
  }
}
