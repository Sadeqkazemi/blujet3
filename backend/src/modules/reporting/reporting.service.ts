import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Not, Raw, Repository } from 'typeorm';
import { AgenciesService } from '../agencies/agencies.service';
import { ErrorCode } from '../../common/errors';
import { materializeDepartedInstances } from '../flights/flight-lifecycle.util';
import { LedgerEntry } from '../../database/entities/ledger-entry.entity';
import { AgencyProfile } from '../../database/entities/agency-profile.entity';
import { AgencyInvoice } from '../../database/entities/agency-invoice.entity';
import { AgencyMembershipRequest } from '../../database/entities/agency-membership-request.entity';
import { Passenger } from '../../database/entities/passenger.entity';
import { Booking } from '../../database/entities/booking.entity';
import { FlightInstance } from '../../database/entities/flight-instance.entity';
import { Airport } from '../../database/entities/airport.entity';
import { RefundRequest } from '../../database/entities/refund-request.entity';
import { SupportTicket } from '../../database/entities/support-ticket.entity';
import {
  ZERO_IRR,
  absIrr,
  addIrr,
  divRoundBigInt,
  isPositiveIrr,
  subIrr,
} from '../../common/money';
import type { Irr } from '../../common/money';
import {
  Bucket,
  CompletedFlightsSummary,
  FinanceDashboardStats,
  FlightSalesResult,
  KpiResult,
  KpiTrends,
  SalesChartPeriod,
  SalesGranularity,
  TransactionStatusTone,
} from './reporting.types';

const LOW_SALES_WINDOW_HOURS = 72;
const LOW_SALES_OCCUPANCY_THRESHOLD = 0.6;
const FLIGHT_SALES_LIST_LIMIT = 60;

@Injectable()
export class ReportingService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly agencies: AgenciesService,
    @InjectRepository(LedgerEntry)
    private readonly ledgerEntryRepo: Repository<LedgerEntry>,
    @InjectRepository(AgencyProfile)
    private readonly agencyProfileRepo: Repository<AgencyProfile>,
    @InjectRepository(AgencyInvoice)
    private readonly agencyInvoiceRepo: Repository<AgencyInvoice>,
    @InjectRepository(AgencyMembershipRequest)
    private readonly agencyMembershipRequestRepo: Repository<AgencyMembershipRequest>,
    @InjectRepository(Passenger)
    private readonly passengerRepo: Repository<Passenger>,
    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,
    @InjectRepository(FlightInstance)
    private readonly flightInstanceRepo: Repository<FlightInstance>,
    @InjectRepository(Airport)
    private readonly airportRepo: Repository<Airport>,
    @InjectRepository(RefundRequest)
    private readonly refundRequestRepo: Repository<RefundRequest>,
    @InjectRepository(SupportTicket)
    private readonly supportTicketRepo: Repository<SupportTicket>,
  ) {}

  private buildBuckets(
    granularity: SalesGranularity,
    params: { periodStart?: string; date?: string },
  ): Bucket[] {
    const now = new Date();

    if (
      granularity === 'year' ||
      granularity === 'q6' ||
      granularity === 'q3'
    ) {
      const count = granularity === 'year' ? 12 : granularity === 'q6' ? 6 : 3;
      const buckets: Bucket[] = [];
      for (let i = count - 1; i >= 0; i--) {
        const start = new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1),
        );
        const end = new Date(
          Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1),
        );
        buckets.push({ key: start.toISOString().slice(0, 10), start, end });
      }
      return buckets;
    }

    if (granularity === 'month') {
      if (!params.periodStart) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_FAILED,
          message: 'periodStart لازم است.',
        });
      }
      const monthStart = new Date(params.periodStart);
      const daysInMonth = new Date(
        Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0),
      ).getUTCDate();
      const buckets: Bucket[] = [];
      for (let d = 1; d <= daysInMonth; d++) {
        const start = new Date(
          Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), d),
        );
        const end = new Date(
          Date.UTC(
            monthStart.getUTCFullYear(),
            monthStart.getUTCMonth(),
            d + 1,
          ),
        );
        buckets.push({ key: start.toISOString().slice(0, 10), start, end });
      }
      return buckets;
    }

    if (granularity === 'day') {
      if (!params.date) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_FAILED,
          message: 'date لازم است.',
        });
      }
      const start = new Date(params.date);
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      return [{ key: start.toISOString().slice(0, 10), start, end }];
    }

    // 'flight' granularity has no date bucket — handled separately by callers.
    return [];
  }

  private async sumByChannel(start: Date, end: Date, flightNo?: string) {
    const qb = this.ledgerEntryRepo
      .createQueryBuilder('e')
      .leftJoin('e.booking', 'booking')
      .select(['e.signedAmountIrr'])
      .addSelect(['booking.channel'])
      .where('e.type = :type', { type: 'SALE' })
      // Real ticket revenue only — excludes agency-debt-calibration
      // rows (AgenciesService.resetTestDebt reuses type:'SALE' with no
      // bookingId; see kpis()'s comment for the full explanation).
      .andWhere('e.bookingId IS NOT NULL')
      .andWhere('e.occurredAt >= :start AND e.occurredAt < :end', {
        start,
        end,
      });

    if (flightNo) {
      qb.leftJoin('booking.flightInstance', 'fi')
        .leftJoin('fi.flight', 'flight')
        .andWhere('flight.flightNo = :flightNo', { flightNo });
    }

    const entries = await qb.getMany();

    const totals = { SYSTEM: ZERO_IRR, CHARTER: ZERO_IRR, AGENCY: ZERO_IRR };
    for (const entry of entries) {
      const channel = entry.booking?.channel;
      if (channel)
        totals[channel] = addIrr(totals[channel], entry.signedAmountIrr);
    }
    return totals;
  }

  async salesChart(
    granularity: SalesGranularity,
    params: { periodStart?: string; date?: string; flightNo?: string },
  ): Promise<SalesChartPeriod[]> {
    if (granularity === 'flight') {
      if (!params.flightNo) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_FAILED,
          message: 'flightNo لازم است.',
        });
      }
      const epoch = new Date(0);
      const now = new Date();
      const totals = await this.sumByChannel(epoch, now, params.flightNo);
      return [
        {
          periodKey: params.flightNo,
          startDate: epoch.toISOString(),
          endDate: now.toISOString(),
          systemIrr: totals.SYSTEM,
          charterIrr: totals.CHARTER,
          agencyIrr: totals.AGENCY,
        },
      ];
    }

    const buckets = this.buildBuckets(granularity, params);
    return Promise.all(
      buckets.map(async (bucket) => {
        const totals = await this.sumByChannel(bucket.start, bucket.end);
        return {
          periodKey: bucket.key,
          startDate: bucket.start.toISOString(),
          endDate: bucket.end.toISOString(),
          systemIrr: totals.SYSTEM,
          charterIrr: totals.CHARTER,
          agencyIrr: totals.AGENCY,
        };
      }),
    );
  }

  private resolvePeriodRange(
    granularity: SalesGranularity,
    params: {
      periodStart?: string;
      date?: string;
      flightNo?: string;
      periodKey?: string;
    },
  ): { start: Date; end: Date; flightNo?: string } {
    if (granularity === 'flight') {
      if (!params.flightNo) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_FAILED,
          message: 'flightNo لازم است.',
        });
      }
      return { start: new Date(0), end: new Date(), flightNo: params.flightNo };
    }

    const buckets = this.buildBuckets(granularity, params);
    if (params.periodKey) {
      const match = buckets.find((b) => b.key === params.periodKey);
      if (!match) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_FAILED,
          message: 'periodKey نامعتبر است.',
        });
      }
      return { start: match.start, end: match.end };
    }

    // No periodKey — full range across every bucket.
    if (buckets.length === 0) return { start: new Date(0), end: new Date() };
    return { start: buckets[0].start, end: buckets[buckets.length - 1].end };
  }

  private monthUtcRange(offsetMonths: number): { start: Date; end: Date } {
    const now = new Date();
    const start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offsetMonths, 1),
    );
    const end = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offsetMonths + 1, 1),
    );
    return { start, end };
  }

  private trendPct(current: number, previous: number): number {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
  }

  private async aggregateKpiWindow(
    start: Date,
    end: Date,
    flightNo?: string,
  ): Promise<Omit<KpiResult, 'trends' | 'agencyDebtIrr' | 'agencyDebtCount'>> {
    const qb = this.ledgerEntryRepo
      .createQueryBuilder('e')
      .select(['e.type', 'e.signedAmountIrr', 'e.bookingId'])
      .where('e.occurredAt >= :start AND e.occurredAt < :end', { start, end });

    if (flightNo) {
      qb.leftJoin('e.booking', 'booking')
        .leftJoin('booking.flightInstance', 'fi')
        .leftJoin('fi.flight', 'flight')
        .andWhere('flight.flightNo = :flightNo', { flightNo });
    }

    const entries = await qb.getMany();

    let revenueIrr: Irr = ZERO_IRR;
    let refundIrr: Irr = ZERO_IRR;
    let operatingCostIrr: Irr = ZERO_IRR;
    for (const e of entries) {
      const amount: Irr =
        e.signedAmountIrr < 0n ? -e.signedAmountIrr : e.signedAmountIrr;
      // AgenciesService.resetTestDebt reuses type:'SALE' for agency
      // debt-line calibration (agencyId set, bookingId null, amount can
      // be negative) — that's not ticket revenue, so it's excluded here
      // the same way sumByChannel() already excludes it via its
      // booking-relation filter.
      if (e.type === 'SALE') {
        if (e.bookingId) revenueIrr = addIrr(revenueIrr, amount);
      } else if (e.type === 'REFUND') refundIrr = addIrr(refundIrr, amount);
      else if (e.type === 'SETTLEMENT' || e.type === 'COMMISSION')
        operatingCostIrr = addIrr(operatingCostIrr, amount);
    }

    const profitIrr = subIrr(subIrr(revenueIrr, refundIrr), operatingCostIrr);
    const marginPct = isPositiveIrr(revenueIrr)
      ? Number(divRoundBigInt(profitIrr * 100n, revenueIrr))
      : 0;

    return { revenueIrr, profitIrr, marginPct, operatingCostIrr };
  }

  private previousPeriodRange(
    start: Date,
    end: Date,
  ): { start: Date; end: Date } {
    const spanMs = end.getTime() - start.getTime();
    return {
      start: new Date(start.getTime() - spanMs),
      end: new Date(start.getTime()),
    };
  }

  async kpis(
    granularity: SalesGranularity,
    params: {
      periodStart?: string;
      date?: string;
      flightNo?: string;
      periodKey?: string;
    },
  ): Promise<KpiResult> {
    const { start, end, flightNo } = this.resolvePeriodRange(
      granularity,
      params,
    );

    const current = await this.aggregateKpiWindow(start, end, flightNo);
    const prevRange = this.previousPeriodRange(start, end);
    const previous = await this.aggregateKpiWindow(
      prevRange.start,
      prevRange.end,
      flightNo,
    );

    const { agencyDebtIrr, agencyDebtCount } =
      await this.agencies.getDebtSummary();

    const trends: KpiTrends = {
      revenuePct: this.trendPct(
        Number(current.revenueIrr),
        Number(previous.revenueIrr),
      ),
      profitPct: this.trendPct(
        Number(current.profitIrr),
        Number(previous.profitIrr),
      ),
      operatingCostPct: this.trendPct(
        Number(current.operatingCostIrr),
        Number(previous.operatingCostIrr),
      ),
      agencyDebtPct: this.trendPct(
        Number(agencyDebtIrr),
        Number(agencyDebtIrr),
      ),
    };

    return {
      ...current,
      agencyDebtIrr,
      agencyDebtCount,
      trends,
    };
  }

  /** Design-aligned dashboard stat cards for FINANCE_MANAGER — all real DB counts. */
  async financeDashboardStats(): Promise<FinanceDashboardStats> {
    const thisMonth = this.monthUtcRange(0);
    const lastMonth = this.monthUtcRange(-1);

    const bookingStatuses = ['PAID', 'TICKETED'] as const;

    const [
      activeAgencies,
      prevActiveAgencies,
      passengersThisMonth,
      prevPassengers,
      ticketsThisMonth,
      prevTickets,
      revenueThisMonthEntries,
      prevRevenueEntries,
    ] = await Promise.all([
      this.agencyProfileRepo
        .createQueryBuilder('a')
        .leftJoin('a.user', 'user')
        .where('a.suspendedAt IS NULL')
        .andWhere('user.isActive = true')
        .getCount(),
      this.agencyProfileRepo
        .createQueryBuilder('a')
        .leftJoin('a.user', 'user')
        .where('a.suspendedAt IS NULL')
        .andWhere('user.isActive = true')
        .andWhere('a.joinedAt < :cutoff', { cutoff: thisMonth.start })
        .getCount(),
      this.passengerRepo
        .createQueryBuilder('p')
        .leftJoin('p.booking', 'booking')
        .where('p.deletedAt IS NULL')
        .andWhere('booking.status IN (:...statuses)', {
          statuses: [...bookingStatuses],
        })
        .andWhere('booking.createdAt >= :start AND booking.createdAt < :end', {
          start: thisMonth.start,
          end: thisMonth.end,
        })
        .getCount(),
      this.passengerRepo
        .createQueryBuilder('p')
        .leftJoin('p.booking', 'booking')
        .where('p.deletedAt IS NULL')
        .andWhere('booking.status IN (:...statuses)', {
          statuses: [...bookingStatuses],
        })
        .andWhere('booking.createdAt >= :start AND booking.createdAt < :end', {
          start: lastMonth.start,
          end: lastMonth.end,
        })
        .getCount(),
      this.bookingRepo.count({
        where: {
          status: In([...bookingStatuses]),
          createdAt: Raw((alias) => `${alias} >= :start AND ${alias} < :end`, {
            start: thisMonth.start,
            end: thisMonth.end,
          }),
          deletedAt: IsNull(),
        },
      }),
      this.bookingRepo.count({
        where: {
          status: In([...bookingStatuses]),
          createdAt: Raw((alias) => `${alias} >= :start AND ${alias} < :end`, {
            start: lastMonth.start,
            end: lastMonth.end,
          }),
          deletedAt: IsNull(),
        },
      }),
      this.ledgerEntryRepo.find({
        where: {
          type: 'SALE',
          bookingId: Not(IsNull()),
          occurredAt: Raw((alias) => `${alias} >= :start AND ${alias} < :end`, {
            start: thisMonth.start,
            end: thisMonth.end,
          }),
        },
        select: { signedAmountIrr: true },
      }),
      this.ledgerEntryRepo.find({
        where: {
          type: 'SALE',
          bookingId: Not(IsNull()),
          occurredAt: Raw((alias) => `${alias} >= :start AND ${alias} < :end`, {
            start: lastMonth.start,
            end: lastMonth.end,
          }),
        },
        select: { signedAmountIrr: true },
      }),
    ]);

    const revenueThisMonthIrr = absIrr(
      revenueThisMonthEntries.reduce(
        (s, e) => addIrr(s, e.signedAmountIrr),
        ZERO_IRR,
      ),
    );
    const revenuePrevIrr = absIrr(
      prevRevenueEntries.reduce(
        (s, e) => addIrr(s, e.signedAmountIrr),
        ZERO_IRR,
      ),
    );

    return {
      activeAgencies,
      activeAgenciesTrendPct: this.trendPct(activeAgencies, prevActiveAgencies),
      passengersThisMonth,
      passengersTrendPct: this.trendPct(passengersThisMonth, prevPassengers),
      ticketsSoldThisMonth: ticketsThisMonth,
      ticketsTrendPct: this.trendPct(ticketsThisMonth, prevTickets),
      revenueThisMonthIrr,
      // Percentage derived from bigint money via divRoundBigInt (never a
      // float division on the raw amounts) — trendPct itself stays
      // number-only since it's also reused for plain counts above.
      revenueTrendPct: isPositiveIrr(revenuePrevIrr)
        ? Number(
            divRoundBigInt(
              subIrr(revenueThisMonthIrr, revenuePrevIrr) * 100n,
              revenuePrevIrr,
            ),
          )
        : revenueThisMonthIrr > ZERO_IRR
          ? 100
          : 0,
    };
  }

  /** Per-flight-instance count of bookings in the given statuses, since
   * this build's TypeORM has no loadRelationCountAndMap. */
  private async bookingCountsByInstance(
    instanceIds: string[],
    statuses: string[],
  ): Promise<Map<string, number>> {
    if (!instanceIds.length) return new Map();
    const rows = await this.bookingRepo
      .createQueryBuilder('b')
      .select('b.flightInstanceId', 'flightInstanceId')
      .addSelect('COUNT(*)', 'count')
      .where('b.flightInstanceId IN (:...ids)', { ids: instanceIds })
      .andWhere('b.status IN (:...statuses)', { statuses })
      .groupBy('b.flightInstanceId')
      .getRawMany<{ flightInstanceId: string; count: string }>();
    return new Map(rows.map((r) => [r.flightInstanceId, Number(r.count)]));
  }

  /** Departed instances + per-channel SALE totals for the «شماره پرواز» picker. */
  async flightSales(): Promise<FlightSalesResult> {
    await materializeDepartedInstances(this.dataSource);

    const instances = await this.flightInstanceRepo
      .createQueryBuilder('fi')
      .leftJoin('fi.flight', 'flight')
      .leftJoin('flight.route', 'route')
      .select(['fi.id', 'fi.departureAt', 'fi.capacity', 'fi.basePriceIrr', 'fi.competitorPriceIrr', 'fi.aiSuggestion'])
      .addSelect(['flight.id', 'flight.flightNo'])
      .addSelect(['route.id', 'route.originCode', 'route.destCode'])
      .where('fi.status = :status', { status: 'DEPARTED' })
      .orderBy('fi.departureAt', 'DESC')
      .take(FLIGHT_SALES_LIST_LIMIT)
      .getMany();

    const instanceIds = instances.map((i) => i.id);
    const [counts, entries, airports] = await Promise.all([
      this.bookingCountsByInstance(instanceIds, ['PAID', 'TICKETED']),
      instanceIds.length === 0
        ? Promise.resolve([])
        : this.ledgerEntryRepo
            .createQueryBuilder('e')
            .leftJoin('e.booking', 'booking')
            .select(['e.signedAmountIrr'])
            .addSelect(['booking.channel', 'booking.flightInstanceId'])
            .where('e.type = :type', { type: 'SALE' })
            .andWhere('e.bookingId IS NOT NULL')
            .andWhere('booking.flightInstanceId IN (:...ids)', {
              ids: instanceIds,
            })
            .getMany(),
      this.airportRepo.find({ select: { code: true, cityFa: true } }),
    ]);

    const cityByCode = new Map(airports.map((a) => [a.code, a.cityFa]));
    const totalsByInstance = new Map<
      string,
      { SYSTEM: Irr; CHARTER: Irr; AGENCY: Irr }
    >();
    for (const entry of entries) {
      const instanceId = entry.booking?.flightInstanceId;
      const channel = entry.booking?.channel;
      if (!instanceId || !channel) continue;
      const cur = totalsByInstance.get(instanceId) ?? {
        SYSTEM: ZERO_IRR,
        CHARTER: ZERO_IRR,
        AGENCY: ZERO_IRR,
      };
      cur[channel] = addIrr(cur[channel], entry.signedAmountIrr);
      totalsByInstance.set(instanceId, cur);
    }

    return {
      rows: instances.map((i) => {
        const totals = totalsByInstance.get(i.id) ?? {
          SYSTEM: ZERO_IRR,
          CHARTER: ZERO_IRR,
          AGENCY: ZERO_IRR,
        };
        const totalIrr = addIrr(totals.SYSTEM, totals.CHARTER, totals.AGENCY);
        const originCode = i.flight.route.originCode;
        const destCode = i.flight.route.destCode;
        return {
          flightInstanceId: i.id,
          flightNo: i.flight.flightNo,
          originCode,
          destCode,
          originCityFa: cityByCode.get(originCode) ?? originCode,
          destCityFa: cityByCode.get(destCode) ?? destCode,
          departureAt: i.departureAt.toISOString(),
          systemIrr: totals.SYSTEM,
          charterIrr: totals.CHARTER,
          agencyIrr: totals.AGENCY,
          totalIrr,
          capacity: i.capacity,
          soldSeats: counts.get(i.id) ?? 0,
        };
      }),
    };
  }

  async completedFlightsSummary(
    granularity: SalesGranularity,
    params: {
      periodStart?: string;
      date?: string;
      flightNo?: string;
      periodKey?: string;
    },
  ): Promise<CompletedFlightsSummary> {
    const { start, end, flightNo } = this.resolvePeriodRange(
      granularity,
      params,
    );

    await materializeDepartedInstances(this.dataSource);

    const qb = this.flightInstanceRepo
      .createQueryBuilder('fi')
      .select(['fi.id', 'fi.capacity'])
      .where('fi.status = :status', { status: 'DEPARTED' })
      .andWhere('fi.departureAt >= :start AND fi.departureAt < :end', {
        start,
        end,
      });

    if (flightNo) {
      qb.leftJoin('fi.flight', 'flight').andWhere(
        'flight.flightNo = :flightNo',
        { flightNo },
      );
    }

    const instances = await qb.getMany();
    const counts = await this.bookingCountsByInstance(
      instances.map((i) => i.id),
      ['PAID', 'TICKETED'],
    );

    const flightCount = instances.length;
    const totalSeats = instances.reduce((sum, i) => sum + i.capacity, 0);
    const soldSeats = instances.reduce(
      (sum, i) => sum + (counts.get(i.id) ?? 0),
      0,
    );

    return {
      flightCount,
      totalSeats,
      soldSeats,
      unsoldSeats: totalSeats - soldSeats,
    };
  }

  async lowSalesAlerts() {
    const now = new Date();
    const windowEnd = new Date(
      now.getTime() + LOW_SALES_WINDOW_HOURS * 60 * 60 * 1000,
    );

    const instances = await this.flightInstanceRepo
      .createQueryBuilder('fi')
      .leftJoin('fi.flight', 'flight')
      .leftJoin('flight.route', 'route')
      .select(['fi.id', 'fi.departureAt', 'fi.capacity'])
      .addSelect(['flight.id', 'flight.flightNo'])
      .addSelect(['route.id', 'route.originCode', 'route.destCode'])
      .where('fi.status = :status', { status: 'SCHEDULED' })
      .andWhere('fi.departureAt >= :now AND fi.departureAt <= :windowEnd', {
        now,
        windowEnd,
      })
      .getMany();

    const counts = await this.bookingCountsByInstance(
      instances.map((i) => i.id),
      ['PAID', 'TICKETED'],
    );

    return instances
      .map((i) => {
        const soldSeats = counts.get(i.id) ?? 0;
        return {
          flightNo: i.flight.flightNo,
          originCode: i.flight.route.originCode,
          destCode: i.flight.route.destCode,
          departureAt: i.departureAt.toISOString(),
          capacity: i.capacity,
          soldSeats,
          occupancyPct: i.capacity > 0 ? soldSeats / i.capacity : 0,
          currentPriceIrr: i.basePriceIrr,
          competitorPriceIrr: i.competitorPriceIrr,
          suggestedPriceIrr: (i.aiSuggestion as { priceIrr?: number } | null)?.priceIrr ?? null,
          reasonFa: (i.aiSuggestion as { reason?: string } | null)?.reason ?? null,
          factorsFa: (i.aiSuggestion as { factors?: string[] } | null)?.factors ?? [],
          confidence: (i.aiSuggestion as { confidence?: number } | null)?.confidence ?? null,
          generatedAt: (i.aiSuggestion as { generatedAt?: string } | null)?.generatedAt ?? null,
        };
      })
      .filter((i) => i.occupancyPct < LOW_SALES_OCCUPANCY_THRESHOLD);
  }

  // ── Phase 11: finance tab additions ──────────────────────────────────

  /** «تراکنش‌های مالی اخیر» — real ledger rows with party context. The
   * mock's static txDefs are replaced entirely; nothing is fabricated. */
  async recentTransactions() {
    const [entries, totalCount] = await Promise.all([
      this.ledgerEntryRepo
        .createQueryBuilder('e')
        .leftJoin('e.agency', 'agency')
        .leftJoin('agency.user', 'agencyUser')
        .leftJoin('e.booking', 'booking')
        .leftJoin('booking.flightInstance', 'fi')
        .leftJoin('fi.flight', 'flight')
        .leftJoin('flight.route', 'route')
        .select(['e.id', 'e.type', 'e.signedAmountIrr', 'e.occurredAt'])
        .addSelect(['agency.userId'])
        .addSelect(['agencyUser.fullName'])
        .addSelect(['booking.id', 'booking.pnr'])
        .addSelect(['fi.id'])
        .addSelect(['flight.id'])
        .addSelect(['route.id', 'route.originCode', 'route.destCode'])
        .orderBy('e.occurredAt', 'DESC')
        .take(20)
        .getMany(),
      this.ledgerEntryRepo.count(),
    ]);

    const bookingIds = entries
      .map((e) => e.booking?.id)
      .filter((id): id is string => !!id);
    const passengerRows = bookingIds.length
      ? await this.passengerRepo.find({
          where: { bookingId: In(bookingIds) },
          select: { bookingId: true, fullName: true },
        })
      : [];
    const firstPassengerByBooking = new Map<string, string>();
    for (const p of passengerRows) {
      if (!firstPassengerByBooking.has(p.bookingId))
        firstPassengerByBooking.set(p.bookingId, p.fullName);
    }

    const TITLE_FA: Record<string, string> = {
      SALE: 'درآمد فروش بلیط',
      SETTLEMENT: 'تسویه حساب',
      COMMISSION: 'کمیسیون آژانس همکار',
      REFUND: 'استرداد بلیط',
    };

    const statusFor = (
      type: string,
    ): { statusFa: string; statusTone: TransactionStatusTone } => {
      if (type === 'REFUND')
        return { statusFa: 'بازپرداخت', statusTone: 'danger' };
      if (type === 'COMMISSION')
        return { statusFa: 'در انتظار', statusTone: 'warning' };
      return { statusFa: 'موفق', statusTone: 'success' };
    };

    const rows = entries.map((e) => {
      const passenger = e.booking
        ? firstPassengerByBooking.get(e.booking.id)
        : undefined;
      const route = e.booking
        ? `${e.booking.flightInstance.flight.route.originCode} → ${e.booking.flightInstance.flight.route.destCode}`
        : null;
      const party =
        e.agency?.user.fullName ??
        (passenger
          ? `${passenger}${e.booking ? ` · ${e.booking.pnr}` : ''}`
          : (route ?? '—'));
      const { statusFa, statusTone } = statusFor(e.type);
      return {
        id: e.id,
        type: e.type,
        titleFa: TITLE_FA[e.type] ?? e.type,
        party,
        occurredAt: e.occurredAt.toISOString(),
        signedAmountIrr: e.signedAmountIrr,
        statusFa,
        statusTone,
      };
    });

    return { rows, totalCount };
  }

  /** «ترکیب درآمد» donut — per-channel SALE sums over the same optional
   * period window as the KPIs. */
  async revenueMix(
    granularity: SalesGranularity,
    params: {
      periodStart?: string;
      date?: string;
      flightNo?: string;
      periodKey?: string;
    },
  ) {
    const { start, end, flightNo } = this.resolvePeriodRange(
      granularity,
      params,
    );

    const qb = this.ledgerEntryRepo
      .createQueryBuilder('e')
      .leftJoin('e.booking', 'booking')
      .select(['e.signedAmountIrr'])
      .addSelect(['booking.channel'])
      .where('e.type = :type', { type: 'SALE' })
      // Real ticket revenue only — see kpis()'s comment: excludes
      // AgenciesService.resetTestDebt's bookingless debt-calibration rows.
      .andWhere('e.bookingId IS NOT NULL')
      .andWhere('e.occurredAt >= :start AND e.occurredAt < :end', {
        start,
        end,
      });

    if (flightNo) {
      qb.leftJoin('booking.flightInstance', 'fi')
        .leftJoin('fi.flight', 'flight')
        .andWhere('flight.flightNo = :flightNo', { flightNo });
    }

    const entries = await qb.getMany();

    const sums = { SYSTEM: ZERO_IRR, CHARTER: ZERO_IRR, AGENCY: ZERO_IRR };
    for (const e of entries) {
      if (!e.booking) continue;
      const amount: Irr =
        e.signedAmountIrr < 0n ? -e.signedAmountIrr : e.signedAmountIrr;
      sums[e.booking.channel] = addIrr(sums[e.booking.channel], amount);
    }
    const totalIrr = addIrr(sums.SYSTEM, sums.CHARTER, sums.AGENCY);
    const pct = (n: Irr) =>
      isPositiveIrr(totalIrr) ? Number(divRoundBigInt(n * 100n, totalIrr)) : 0;

    return {
      totalIrr,
      channels: [
        {
          channel: 'SYSTEM',
          labelFa: 'فروش سیستمی',
          amountIrr: sums.SYSTEM,
          pct: pct(sums.SYSTEM),
        },
        {
          channel: 'CHARTER',
          labelFa: 'چارتر',
          amountIrr: sums.CHARTER,
          pct: pct(sums.CHARTER),
        },
        {
          channel: 'AGENCY',
          labelFa: 'آژانس همکار',
          amountIrr: sums.AGENCY,
          pct: pct(sums.AGENCY),
        },
      ],
    };
  }

  /** «تسویه‌حساب آژانس‌های همکار» — per-agency settlement status derived
   * from Phase 3 invoices; presentation only, no new write path. */
  async agencySettlements() {
    const agencies = await this.agencyProfileRepo
      .createQueryBuilder('a')
      .leftJoin('a.user', 'user')
      .select(['a.userId'])
      .addSelect(['user.id', 'user.fullName'])
      .getMany();

    if (!agencies.length) return { rows: [], outstandingIrr: ZERO_IRR };

    const invoices = await this.agencyInvoiceRepo.find({
      where: { agencyId: In(agencies.map((a) => a.userId)) },
    });

    const invoicesByAgency = new Map<string, AgencyInvoice[]>();
    for (const inv of invoices) {
      const list = invoicesByAgency.get(inv.agencyId) ?? [];
      list.push(inv);
      invoicesByAgency.set(inv.agencyId, list);
    }

    const now = new Date();
    const rows = agencies
      .map((a) => ({ a, invoices: invoicesByAgency.get(a.userId) ?? [] }))
      .filter(({ invoices }) => invoices.length > 0)
      .map(({ a, invoices }) => {
        const totalIrr = invoices.reduce(
          (s, i) => addIrr(s, i.amountIrr),
          ZERO_IRR,
        );
        const paidIrr = invoices
          .filter((i) => i.status === 'PAID')
          .reduce((s, i) => addIrr(s, i.amountIrr), ZERO_IRR);
        const unpaid = invoices
          .filter((i) => i.status !== 'PAID')
          .sort((x, y) => x.dueAt.getTime() - y.dueAt.getTime());
        const earliestUnpaid = unpaid[0] ?? null;
        const overdueDays = earliestUnpaid
          ? Math.max(
              0,
              Math.floor(
                (now.getTime() - earliestUnpaid.dueAt.getTime()) /
                  (24 * 60 * 60 * 1000),
              ),
            )
          : 0;
        const status: 'SETTLED' | 'PENDING' | 'OVERDUE' =
          unpaid.length === 0
            ? 'SETTLED'
            : overdueDays > 0
              ? 'OVERDUE'
              : 'PENDING';

        return {
          agencyId: a.userId,
          agencyName: a.user.fullName,
          totalIrr,
          paidIrr,
          paidPct: isPositiveIrr(totalIrr)
            ? Number(divRoundBigInt(paidIrr * 100n, totalIrr))
            : 0,
          dueAt: earliestUnpaid?.dueAt.toISOString() ?? null,
          overdueDays,
          status,
          // The remind action reuses Phase 3's audited endpoint — the row
          // carries the invoice id it would target.
          remindInvoiceId: earliestUnpaid?.id ?? null,
        };
      });

    const outstandingIrr = rows.reduce(
      (s, r) => addIrr(s, subIrr(r.totalIrr, r.paidIrr)),
      ZERO_IRR,
    );
    return { rows, outstandingIrr };
  }

  /** Commercial Manager dashboard KPI row — per design-reference-v2/پنل مدیر بازرگانی.dc.html */
  async commercialOverview(): Promise<{
    activeAgencies: number;
    passengersThisMonth: number;
    pendingAgencyRequests: number;
  }> {
    const now = new Date();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const monthEnd = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    );

    const [activeAgencies, passengersThisMonth, pendingAgencyRequests] =
      await Promise.all([
        this.agencyProfileRepo.count({ where: { suspendedAt: IsNull() } }),
        this.passengerRepo
          .createQueryBuilder('p')
          .leftJoin('p.booking', 'booking')
          .where('booking.status IN (:...statuses)', {
            statuses: ['PAID', 'TICKETED'],
          })
          .andWhere(
            'booking.createdAt >= :start AND booking.createdAt < :end',
            { start: monthStart, end: monthEnd },
          )
          .getCount(),
        this.agencyMembershipRequestRepo.count({
          where: { status: In(['PENDING', 'REFERRED']) },
        }),
      ]);

    return { activeAgencies, passengersThisMonth, pendingAgencyRequests };
  }

  /** SITE_ADMIN dashboard KPI row — design-reference-v2/پنل ادمین سایت.dc.html */
  async siteAdminOverview(): Promise<{
    activeAgencies: number;
    passengersThisMonth: number;
    ticketsSoldThisMonth: number;
    pendingActionCount: number;
    agenciesTrendPct: number | null;
    passengersTrendPct: number | null;
    ticketsTrendPct: number | null;
  }> {
    const now = new Date();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const monthEnd = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    );
    const prevMonthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
    );
    const bookingStatuses = ['PAID', 'TICKETED'] as const;

    const momPct = (current: number, previous: number): number | null => {
      if (previous <= 0) return null;
      return Math.round(((current - previous) / previous) * 100);
    };

    const [
      activeAgencies,
      passengersThisMonth,
      ticketsSoldThisMonth,
      passengersPrevMonth,
      ticketsPrevMonth,
      pendingAgencyRequests,
      awaitingRefunds,
      openSupportTickets,
    ] = await Promise.all([
      this.agencyProfileRepo
        .createQueryBuilder('a')
        .leftJoin('a.user', 'user')
        .where('a.suspendedAt IS NULL')
        .andWhere('user.isActive = true')
        .getCount(),
      this.passengerRepo
        .createQueryBuilder('p')
        .leftJoin('p.booking', 'booking')
        .where('p.deletedAt IS NULL')
        .andWhere('booking.status IN (:...statuses)', {
          statuses: bookingStatuses,
        })
        .andWhere('booking.createdAt >= :start AND booking.createdAt < :end', {
          start: monthStart,
          end: monthEnd,
        })
        .getCount(),
      this.bookingRepo
        .createQueryBuilder('b')
        .where('b.status IN (:...statuses)', { statuses: bookingStatuses })
        .andWhere('b.createdAt >= :start AND b.createdAt < :end', {
          start: monthStart,
          end: monthEnd,
        })
        .andWhere('b.deletedAt IS NULL')
        .getCount(),
      this.passengerRepo
        .createQueryBuilder('p')
        .leftJoin('p.booking', 'booking')
        .where('p.deletedAt IS NULL')
        .andWhere('booking.status IN (:...statuses)', {
          statuses: bookingStatuses,
        })
        .andWhere('booking.createdAt >= :start AND booking.createdAt < :end', {
          start: prevMonthStart,
          end: monthStart,
        })
        .getCount(),
      this.bookingRepo
        .createQueryBuilder('b')
        .where('b.status IN (:...statuses)', { statuses: bookingStatuses })
        .andWhere('b.createdAt >= :start AND b.createdAt < :end', {
          start: prevMonthStart,
          end: monthStart,
        })
        .andWhere('b.deletedAt IS NULL')
        .getCount(),
      this.agencyMembershipRequestRepo.count({
        where: { status: In(['PENDING', 'REFERRED']) },
      }),
      this.refundRequestRepo.count({
        where: { status: In(['SUBMITTED', 'REVIEW']) },
      }),
      this.supportTicketRepo.count({
        where: { status: In(['OPEN', 'IN_PROGRESS']) },
      }),
    ]);

    return {
      activeAgencies,
      passengersThisMonth,
      ticketsSoldThisMonth,
      pendingActionCount:
        pendingAgencyRequests + awaitingRefunds + openSupportTickets,
      // Agency count is a stock metric — MoM % only for flow metrics.
      agenciesTrendPct: null,
      passengersTrendPct: momPct(passengersThisMonth, passengersPrevMonth),
      ticketsTrendPct: momPct(ticketsSoldThisMonth, ticketsPrevMonth),
    };
  }
}
