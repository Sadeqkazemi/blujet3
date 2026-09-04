import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { ErrorCode } from '../../common/errors';
import { Airport } from '../../database/entities/airport.entity';
import { FareRule } from '../../database/entities/fare-rule.entity';
import { FlightInstance } from '../../database/entities/flight-instance.entity';
import { Passenger } from '../../database/entities/passenger.entity';
import { CoreItineraryOrder } from '../../database/entities/core-itinerary-order.entity';
import { CoreItinerarySegment } from '../../database/entities/core-itinerary-segment.entity';
import type { BookingChannel, CabinClass } from '../../database/enums';
import { SearchService } from '../booking-engine/search.service';
import { isSellableDefinitionStatus } from '../flights/definition-sellability';
import {
  parseCommercialPanelSettings,
  resolveSiteVisible,
} from '../flights/commercial-panel-settings';
import type {
  CoreItineraryChannel,
  CoreItinerarySegmentDto,
  ResolveCoreItineraryDto,
  ResolvedCoreItineraryDto,
  ResolvedCoreItinerarySegmentDto,
} from './dto/resolve-core-itinerary.dto';

const ACTIVE_BOOKING_STATUSES = ['DRAFT', 'HELD', 'PAID', 'TICKETED'] as const;

type FareUsageRow = {
  flightInstanceId: string;
  cabin: CabinClass;
  fareClassCode: string;
  channel: BookingChannel;
  usedSeats: string;
};

@Injectable()
export class CoreItineraryService {
  constructor(
    @InjectRepository(FlightInstance)
    private readonly flightInstanceRepo: Repository<FlightInstance>,
    @InjectRepository(FareRule)
    private readonly fareRuleRepo: Repository<FareRule>,
    @InjectRepository(Passenger)
    private readonly passengerRepo: Repository<Passenger>,
    private readonly search: SearchService,
    @InjectRepository(Airport)
    private readonly airportRepo: Repository<Airport>,
    @InjectRepository(CoreItinerarySegment)
    private readonly itinerarySegmentRepo: Repository<CoreItinerarySegment>,
  ) {}

  async resolve(
    dto: ResolveCoreItineraryDto,
    requiredSeats = 1,
    manager?: EntityManager,
  ): Promise<ResolvedCoreItineraryDto> {
    if (!Number.isInteger(requiredSeats) || requiredSeats < 1) {
      this.invalid('تعداد صندلی مورد نیاز سفر معتبر نیست.');
    }
    const requested = this.orderAndValidateRequest(dto.segments);
    const ids = requested.map((segment) => segment.flightInstanceId);
    const loadRules = () =>
      (manager ? manager.getRepository(FareRule) : this.fareRuleRepo).find({
        where: { flightInstanceId: In(ids) },
      });
    const [instances, rules, usageRows] = manager
      ? [
          await this.loadInstances(ids, manager),
          await loadRules(),
          await this.loadFareUsage(ids, manager),
        ]
      : await Promise.all([
          this.loadInstances(ids),
          loadRules(),
          this.loadFareUsage(ids),
        ]);
    const byId = new Map(instances.map((instance) => [instance.id, instance]));
    const now = new Date();
    const resolved: ResolvedCoreItinerarySegmentDto[] = [];

    for (const segment of requested) {
      const instance = byId.get(segment.flightInstanceId);
      this.assertInstanceSellable(instance, dto.channel, now);
      const available = await this.search.cabinAvailability(
        instance,
        segment.cabin,
        manager,
      );
      if (!available) {
        throw new NotFoundException({
          code: ErrorCode.NOT_FOUND,
          message: 'کابین انتخاب‌شده برای یکی از پروازها قابل فروش نیست.',
        });
      }
      const fare = this.resolveFareAvailability(
        segment,
        dto.channel,
        now,
        available.seatsLeft,
        rules,
        usageRows,
        requiredSeats,
      );
      resolved.push({
        flightInstanceId: instance.id,
        sequence: segment.sequence,
        flightNo: instance.flight.flightNo,
        originCode: instance.flight.route.originCode,
        destinationCode: instance.flight.route.destCode,
        departureAt: instance.departureAt,
        arrivalAt: instance.arrivalAt,
        cabin: segment.cabin,
        fareClassCode: fare.fareClassCode,
        availableSeats: fare.availableSeats,
      });
    }

    await this.assertContinuity(resolved, manager);
    return { channel: dto.channel, segments: resolved };
  }

  private orderAndValidateRequest(
    segments: CoreItinerarySegmentDto[],
  ): CoreItinerarySegmentDto[] {
    const ordered = [...segments].sort(
      (left, right) => left.sequence - right.sequence,
    );
    const ids = new Set<string>();
    for (const [index, segment] of ordered.entries()) {
      if (segment.sequence !== index + 1) {
        this.invalid('ترتیب سگمنت‌های سفر باید پیوسته و از عدد یک باشد.');
      }
      if (ids.has(segment.flightInstanceId)) {
        this.invalid('یک پرواز نمی‌تواند دوبار در یک سفر تکرار شود.');
      }
      ids.add(segment.flightInstanceId);
    }
    return ordered;
  }

  private async loadInstances(
    ids: string[],
    manager?: EntityManager,
  ): Promise<FlightInstance[]> {
    return (
      manager ? manager.getRepository(FlightInstance) : this.flightInstanceRepo
    )
      .createQueryBuilder('instance')
      .leftJoinAndSelect('instance.flight', 'flight')
      .leftJoinAndSelect('flight.route', 'route')
      .where('instance.id IN (:...ids)', { ids })
      .getMany();
  }

  private assertInstanceSellable(
    instance: FlightInstance | undefined,
    channel: CoreItineraryChannel,
    now: Date,
  ): asserts instance is FlightInstance {
    const saleGate =
      channel === 'AGENCY'
        ? instance?.agencySaleEnabled
        : instance?.publicSaleEnabled &&
          resolveSiteVisible(
            parseCommercialPanelSettings(instance.commercialPanelSettings),
          );
    if (
      !instance ||
      instance.status !== 'SCHEDULED' ||
      !isSellableDefinitionStatus(
        instance.definitionStatus,
        instance.approvedSnapshot != null,
      ) ||
      instance.departureAt <= now ||
      (instance.saleStartsAt != null && instance.saleStartsAt > now) ||
      (instance.saleEndsAt != null && instance.saleEndsAt < now) ||
      !saleGate
    ) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'یکی از پروازهای انتخاب‌شده یافت نشد یا قابل فروش نیست.',
      });
    }
  }

  private async loadFareUsage(
    ids: string[],
    manager?: EntityManager,
  ): Promise<FareUsageRow[]> {
    const passengerRepo = manager
      ? manager.getRepository(Passenger)
      : this.passengerRepo;
    const itineraryRepo = manager
      ? manager.getRepository(CoreItinerarySegment)
      : this.itinerarySegmentRepo;
    const legacy = await passengerRepo
      .createQueryBuilder('passenger')
      .innerJoin('passenger.booking', 'booking')
      .select('booking.flightInstanceId', 'flightInstanceId')
      .addSelect('booking.cabin', 'cabin')
      .addSelect('booking.fareClassCode', 'fareClassCode')
      .addSelect('booking.channel', 'channel')
      .addSelect(
        `COALESCE(SUM(CASE
          WHEN passenger."occupiesSeat" = FALSE THEN 0
          WHEN passenger."extraSeatCode" IS NULL THEN 1
          ELSE 2
        END), 0)`,
        'usedSeats',
      )
      .where('booking.flightInstanceId IN (:...ids)', { ids })
      .andWhere('booking.fareClassCode IS NOT NULL')
      .andWhere('booking.status IN (:...statuses)', {
        statuses: [...ACTIVE_BOOKING_STATUSES],
      })
      .andWhere('(booking.status != :held OR booking."holdExpiresAt" > :now)', {
        held: 'HELD',
        now: new Date(),
      })
      .andWhere('booking."deletedAt" IS NULL')
      .andWhere('passenger."deletedAt" IS NULL')
      .groupBy('booking.flightInstanceId')
      .addGroupBy('booking.cabin')
      .addGroupBy('booking.fareClassCode')
      .addGroupBy('booking.channel')
      .getRawMany<FareUsageRow>();
    const itinerary = await itineraryRepo
      .createQueryBuilder('segment')
      .innerJoin(
        CoreItineraryOrder,
        'itineraryOrder',
        'itineraryOrder.id = segment.orderId',
      )
      .select('segment.flightInstanceId', 'flightInstanceId')
      .addSelect('segment.cabin', 'cabin')
      .addSelect('segment.fareClassCode', 'fareClassCode')
      .addSelect('itineraryOrder.channel', 'channel')
      .addSelect('COALESCE(SUM(segment.occupiedSeats), 0)', 'usedSeats')
      .where('segment.flightInstanceId IN (:...ids)', { ids })
      .andWhere('segment.fareClassCode IS NOT NULL')
      .andWhere('itineraryOrder.status IN (:...statuses)', {
        statuses: ['HELD', 'PAID', 'TICKETED'],
      })
      .andWhere(
        '(itineraryOrder.status != :held OR itineraryOrder.holdExpiresAt > :now)',
        { held: 'HELD', now: new Date() },
      )
      .groupBy('segment.flightInstanceId')
      .addGroupBy('segment.cabin')
      .addGroupBy('segment.fareClassCode')
      .addGroupBy('itineraryOrder.channel')
      .getRawMany<FareUsageRow>();
    return [...legacy, ...itinerary];
  }

  private resolveFareAvailability(
    segment: CoreItinerarySegmentDto,
    channel: CoreItineraryChannel,
    now: Date,
    physicalSeatsLeft: number,
    allRules: FareRule[],
    usageRows: FareUsageRow[],
    requiredSeats: number,
  ): { fareClassCode: string | null; availableSeats: number } {
    const rules = allRules.filter(
      (rule) =>
        rule.flightInstanceId === segment.flightInstanceId &&
        rule.cabin === segment.cabin,
    );
    if (rules.length === 0) {
      if (segment.fareClassCode) {
        this.fareNotFound();
      }
      if (physicalSeatsLeft < requiredSeats) this.poolExhausted();
      return { fareClassCode: null, availableSeats: physicalSeatsLeft };
    }

    const policyEligible = rules.filter(
      (rule) =>
        (!rule.validFrom || rule.validFrom <= now) &&
        (!rule.validUntil || rule.validUntil >= now) &&
        ((rule.allowedChannels ?? []).length === 0 ||
          (rule.allowedChannels ?? []).includes(channel)),
    );
    if (policyEligible.length === 0) this.fareNotFound();

    const requested = segment.fareClassCode
      ? policyEligible.filter(
          (rule) => rule.classCode === segment.fareClassCode,
        )
      : [...policyEligible].sort((left, right) => {
          const leftPrice = this.priceForChannel(left, channel);
          const rightPrice = this.priceForChannel(right, channel);
          return leftPrice < rightPrice ? -1 : leftPrice > rightPrice ? 1 : 0;
        });
    if (requested.length === 0) this.fareNotFound();

    for (const rule of requested) {
      const released = this.releasedForChannel(rule, channel);
      const usedByChannel = this.usedSeats(
        usageRows,
        segment,
        rule.classCode,
        channel,
      );
      const sharedUsed = usageRows
        .filter(
          (row) =>
            row.flightInstanceId === segment.flightInstanceId &&
            row.cabin === segment.cabin &&
            row.fareClassCode === rule.classCode,
        )
        .reduce((sum, row) => sum + Number(row.usedSeats), 0);
      const availableSeats = Math.max(
        0,
        Math.min(
          physicalSeatsLeft,
          released - usedByChannel,
          rule.seatsAllocated - sharedUsed,
        ),
      );
      if (availableSeats >= requiredSeats) {
        return { fareClassCode: rule.classCode, availableSeats };
      }
    }

    return this.poolExhausted();
  }

  private usedSeats(
    rows: FareUsageRow[],
    segment: CoreItinerarySegmentDto,
    fareClassCode: string,
    channel: CoreItineraryChannel,
  ): number {
    return rows
      .filter(
        (row) =>
          row.flightInstanceId === segment.flightInstanceId &&
          row.cabin === segment.cabin &&
          row.fareClassCode === fareClassCode &&
          row.channel === channel,
      )
      .reduce((sum, row) => sum + Number(row.usedSeats), 0);
  }

  private releasedForChannel(
    rule: FareRule,
    channel: CoreItineraryChannel,
  ): number {
    return Math.max(
      0,
      channel === 'AGENCY' ? rule.agencySeatsReleased : rule.siteSeatsReleased,
    );
  }

  private priceForChannel(
    rule: FareRule,
    channel: CoreItineraryChannel,
  ): bigint {
    return channel === 'AGENCY'
      ? (rule.agencyReleasePriceIrr ?? rule.priceIrr)
      : (rule.sitePriceIrr ?? rule.priceIrr);
  }

  private async assertContinuity(
    segments: ResolvedCoreItinerarySegmentDto[],
    manager?: EntityManager,
  ): Promise<void> {
    for (const segment of segments) {
      if (segment.arrivalAt <= segment.departureAt) {
        this.invalid('زمان رسیدن هر سگمنت باید بعد از زمان حرکت آن باشد.');
      }
    }
    for (let index = 1; index < segments.length; index += 1) {
      const previous = segments[index - 1];
      const current = segments[index];
      if (previous.destinationCode !== current.originCode) {
        this.invalid('مبدأ و مقصد سگمنت‌های سفر پیوستگی ندارند.');
      }
      if (previous.arrivalAt >= current.departureAt) {
        this.invalid('زمان حرکت سگمنت بعدی باید بعد از رسیدن سگمنت قبلی باشد.');
      }
    }

    if (segments.length < 2) return;
    const transferCodes = [
      ...new Set(segments.slice(1).map((segment) => segment.originCode)),
    ];
    const airports = await (
      manager ? manager.getRepository(Airport) : this.airportRepo
    ).find({
      where: { code: In(transferCodes) },
      select: { code: true, minConnectMin: true },
    });
    const minimums = new Map(
      airports.map((airport) => [airport.code, airport.minConnectMin]),
    );
    for (let index = 1; index < segments.length; index += 1) {
      const previous = segments[index - 1];
      const current = segments[index];
      const minimum = minimums.get(current.originCode);
      if (minimum == null || !Number.isInteger(minimum) || minimum < 0) {
        this.invalid('حداقل زمان اتصال فرودگاه مشخص نیست یا معتبر نیست.');
      }
      const gap = current.departureAt.getTime() - previous.arrivalAt.getTime();
      if (gap < minimum * 60_000) {
        this.invalid(
          'فاصله بین سگمنت‌ها کمتر از حداقل زمان اتصال فرودگاه است.',
        );
      }
    }
  }

  private invalid(message: string): never {
    throw new BadRequestException({
      code: ErrorCode.VALIDATION_FAILED,
      message,
    });
  }

  private fareNotFound(): never {
    throw new NotFoundException({
      code: ErrorCode.NOT_FOUND,
      message: 'کلاس نرخی انتخاب‌شده برای یکی از پروازها قابل فروش نیست.',
    });
  }

  private poolExhausted(): never {
    throw new ConflictException({
      code: ErrorCode.POOL_EXHAUSTED,
      message: 'ظرفیت یکی از سگمنت‌های سفر تکمیل شده است.',
    });
  }
}
