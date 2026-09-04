import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ErrorCode } from '../../common/errors';
import { FareRule } from '../../database/entities/fare-rule.entity';
import { FlightInstance } from '../../database/entities/flight-instance.entity';
import { Passenger } from '../../database/entities/passenger.entity';
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
  ) {}

  async resolve(
    dto: ResolveCoreItineraryDto,
  ): Promise<ResolvedCoreItineraryDto> {
    const requested = this.orderAndValidateRequest(dto.segments);
    const ids = requested.map((segment) => segment.flightInstanceId);
    const [instances, rules, usageRows] = await Promise.all([
      this.loadInstances(ids),
      this.fareRuleRepo.find({ where: { flightInstanceId: In(ids) } }),
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

    this.assertContinuity(resolved);
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

  private async loadInstances(ids: string[]): Promise<FlightInstance[]> {
    return this.flightInstanceRepo
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

  private async loadFareUsage(ids: string[]): Promise<FareUsageRow[]> {
    return this.passengerRepo
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
  }

  private resolveFareAvailability(
    segment: CoreItinerarySegmentDto,
    channel: CoreItineraryChannel,
    now: Date,
    physicalSeatsLeft: number,
    allRules: FareRule[],
    usageRows: FareUsageRow[],
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
      if (physicalSeatsLeft <= 0) this.poolExhausted();
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
      if (availableSeats > 0) {
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

  private assertContinuity(segments: ResolvedCoreItinerarySegmentDto[]): void {
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
