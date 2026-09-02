import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { Airport } from '../../database/entities/airport.entity';
import { AircraftSeatMap } from '../../database/entities/aircraft-seat-map.entity';
import { AircraftCabin } from '../../database/entities/aircraft-cabin.entity';
import { Booking } from '../../database/entities/booking.entity';
import { AuditLog } from '../../database/entities/audit-log.entity';
import { FareRule } from '../../database/entities/fare-rule.entity';
import { Flight } from '../../database/entities/flight.entity';
import { FlightChargeRule } from '../../database/entities/flight-charge-rule.entity';
import { FlightInstance } from '../../database/entities/flight-instance.entity';
import { Route } from '../../database/entities/route.entity';
import { FarePricingProposal } from '../../database/entities/fare-pricing-proposal.entity';
import {
  BookingChannel,
  CabinClass,
  FlightDefinitionStatus,
  FlightInstanceStatus,
  PricingProposalStatus,
} from '../../database/enums';
import { ErrorCode } from '../../common/errors';
import type { Irr } from '../../common/money';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AuditService } from '../audit/audit.service';
import {
  calculateChargesForCabin,
  serializeChargeRule,
  type CalculatedChargeBreakdown,
} from './charge-rules';
import { normalizeChargeRuleInputs } from './charge-rule-validation';
import type {
  ChargeRuleDto,
  CompleteScheduledFlightDto,
  CreateFlightDefinitionDto,
  UpdateFlightDefinitionDto,
} from './dto/flight-definition.dto';
import {
  assertValidFlightNo,
  arrivalFromDuration,
  normalizeCabinCapacities,
  serializeCabinCapacities,
  type NormalizedCabinCapacity,
} from './flight-definition.util';
import { resolveAircraftType } from './aircraft-type.util';
import { toFlightUiStatus, toPublishStatus } from './definition-sellability';
import {
  PRICE_SUGGESTION_PROVIDER,
  type PriceSuggestionProvider,
} from '../ai/price-suggestion.provider';
import type { PersistedAiSuggestion } from '../pricing/pricing.service';
import {
  countSeatsByCabin,
  type AircraftSeatMapLike,
} from '../reservation/seat-layout';

const SOLD_STATUSES = ['PAID', 'TICKETED'] as const;

function settingsRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : {};
}

export type DefinitionSnapshot = {
  flightNo: string;
  originCode: string;
  destCode: string;
  departureAt: string;
  durationMinutes: number;
  aircraftType: string;
  aircraftDefinitionId: string | null;
  capacity: number;
  charterSeats: number;
  cabinCapacities: NormalizedCabinCapacity[];
  basePriceIrr: string | null;
  competitorPriceIrr: string | null;
  chargeRules: ReturnType<typeof serializeChargeRule>[];
};

/** Route/date a flight instance was searchable under before an approval
 * moved it — see applyCeoApprovalInTx's doc comment. */
export type PreviousSearchLocation = {
  originCode: string;
  destCode: string;
  departureAt: Date;
} | null;

@Injectable()
export class FlightDefinitionService {
  private readonly logger = new Logger(FlightDefinitionService.name);

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
    @InjectRepository(AircraftCabin)
    private readonly aircraftCabinRepo: Repository<AircraftCabin>,
    @InjectRepository(FlightChargeRule)
    private readonly chargeRuleRepo: Repository<FlightChargeRule>,
    @InjectRepository(FarePricingProposal)
    private readonly proposalRepo: Repository<FarePricingProposal>,
    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,
    @Inject(PRICE_SUGGESTION_PROVIDER)
    private readonly priceSuggestions: PriceSuggestionProvider,
    private readonly audit: AuditService,
  ) {}

  private async findOrCreateRoute(
    originCode: string,
    destCode: string,
    durationMinutes: number,
    manager?: EntityManager,
  ) {
    const routeRepo = manager ? manager.getRepository(Route) : this.routeRepo;
    const existing = await routeRepo.findOneBy({ originCode, destCode });
    if (existing) {
      if (existing.durationMin !== durationMinutes) {
        existing.durationMin = durationMinutes;
        await routeRepo.save(existing);
      }
      return existing;
    }
    return routeRepo.save(
      routeRepo.create({
        originCode,
        destCode,
        durationMin: durationMinutes,
      }),
    );
  }

  private async validateCabinCapacitiesAgainstSeatMap(
    map: AircraftSeatMapLike & { aircraftDefinitionId?: string | null },
    cabinCapacities: NormalizedCabinCapacity[],
  ) {
    const physical = countSeatsByCabin(map);
    const operational = map.aircraftDefinitionId
      ? await this.aircraftCabinRepo.findBy({
          aircraftDefinitionId: map.aircraftDefinitionId,
        })
      : [];
    const operationalByCabin = new Map(
      operational.map((row) => [row.cabinType, row.capacity]),
    );
    for (const row of cabinCapacities) {
      const configured = row.seats;
      const phys = physical[row.cabin];
      if (configured > 0 && phys === 0) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_FAILED,
          message: `کلاس ${row.cabin} در نقشه صندلی این هواپیما تعریف نشده است.`,
        });
      }
      if (phys < configured) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_FAILED,
          message: `ظرفیت ${row.cabin} از تعداد صندلی فیزیکی (${phys}) بیشتر است.`,
        });
      }
      if (operational.length > 0) {
        const maximum = operationalByCabin.get(row.cabin) ?? 0;
        if (configured > maximum) {
          throw new BadRequestException({
            code: ErrorCode.VALIDATION_FAILED,
            message: `ظرفیت ${row.cabin} از ظرفیت تعریف‌شده هواپیما (${maximum}) بیشتر است.`,
          });
        }
      }
    }
  }

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

  private async countSold(flightInstanceId: string): Promise<number> {
    return this.bookingRepo.count({
      where: {
        flightInstanceId,
        status: In([...SOLD_STATUSES]),
      },
    });
  }

  private async findOrCreateFlight(
    flightNo: string,
    routeId: string,
    aircraftType: string,
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
        aircraftType,
      }),
    );
  }

  private validateChargeRules(rules: ChargeRuleDto[] | undefined) {
    return normalizeChargeRuleInputs(rules);
  }

  private buildSnapshot(input: {
    flightNo: string;
    originCode: string;
    destCode: string;
    departureAt: Date;
    durationMinutes: number;
    aircraftType: string;
    aircraftDefinitionId: string | null;
    capacity: number;
    charterSeats: number;
    cabinCapacities: NormalizedCabinCapacity[];
    basePriceIrr: Irr | null;
    competitorPriceIrr: Irr | null;
    chargeRules: ReturnType<typeof serializeChargeRule>[];
  }): DefinitionSnapshot {
    return {
      flightNo: input.flightNo,
      originCode: input.originCode,
      destCode: input.destCode,
      departureAt: input.departureAt.toISOString(),
      durationMinutes: input.durationMinutes,
      aircraftType: input.aircraftType,
      aircraftDefinitionId: input.aircraftDefinitionId,
      capacity: input.capacity,
      charterSeats: input.charterSeats,
      cabinCapacities: input.cabinCapacities,
      basePriceIrr:
        input.basePriceIrr == null ? null : String(input.basePriceIrr),
      competitorPriceIrr:
        input.competitorPriceIrr == null
          ? null
          : String(input.competitorPriceIrr),
      chargeRules: input.chargeRules,
    };
  }

  private async replaceChargeRules(
    manager: DataSource['manager'],
    flightInstanceId: string,
    rules: ReturnType<typeof normalizeChargeRuleInputs>,
    isPendingRevision: boolean,
  ) {
    await manager.delete(FlightChargeRule, {
      flightInstanceId,
      isPendingRevision,
    });
    if (rules.length === 0) return [];
    const entities = rules.map((r) =>
      manager.create(FlightChargeRule, {
        flightInstanceId,
        title: r.title,
        kind: r.kind,
        calculationMode: r.calculationMode,
        fixedAmountIrr: r.fixedAmountIrr,
        percentageBasisPoints: r.percentageBasisPoints,
        cabin: r.cabin,
        effectiveFrom: r.effectiveFrom,
        effectiveTo: r.effectiveTo,
        isActive: r.isActive,
        isPendingRevision,
      }),
    );
    return manager.save(entities);
  }

  private calculatedBreakdown(
    base: Irr,
    rules: FlightChargeRule[],
    departureAt: Date,
  ): CalculatedChargeBreakdown | null {
    // Preview uses ECONOMY as the default display cabin; per-cabin
    // totals are available via calculateChargesForCabin for each cabin.
    return calculateChargesForCabin(
      base,
      rules,
      CabinClass.ECONOMY,
      departureAt,
    );
  }

  private async loadInstanceOrThrow(id: string) {
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
    return instance;
  }

  async toDefinitionDetail(instance: FlightInstance) {
    const pricingProposal = await this.proposalRepo.findOne({
      where: { flightInstanceId: instance.id },
    });
    const activeRules = await this.chargeRuleRepo.find({
      where: { flightInstanceId: instance.id, isPendingRevision: false },
      order: { createdAt: 'ASC' },
    });
    const pendingRules = await this.chargeRuleRepo.find({
      where: { flightInstanceId: instance.id, isPendingRevision: true },
      order: { createdAt: 'ASC' },
    });
    const sold = await this.countSold(instance.id);
    const derivedStatus = this.derivedStatus(
      instance.status,
      sold,
      instance.capacity,
    );

    const liveDurationMinutes =
      instance.durationMinutes ??
      Math.max(
        1,
        Math.round(
          (instance.arrivalAt.getTime() - instance.departureAt.getTime()) /
            60_000,
        ),
      );

    const approvalStatus = instance.definitionStatus;
    const pendingRevision =
      approvalStatus === FlightDefinitionStatus.PENDING_REVISION;
    const pendingSnap =
      pendingRevision && instance.pendingRevisionSnapshot
        ? (instance.pendingRevisionSnapshot as DefinitionSnapshot)
        : null;

    const formFlightNo = pendingSnap?.flightNo ?? instance.flight.flightNo;
    const formOriginCode =
      pendingSnap?.originCode ?? instance.flight.route.originCode;
    const formDestCode =
      pendingSnap?.destCode ?? instance.flight.route.destCode;
    const formDepartureAt = pendingSnap
      ? new Date(pendingSnap.departureAt)
      : instance.departureAt;
    const formDurationMinutes =
      pendingSnap?.durationMinutes ?? liveDurationMinutes;
    const formArrivalAt = pendingSnap
      ? arrivalFromDuration(formDepartureAt, formDurationMinutes)
      : instance.arrivalAt;
    const formCapacity = pendingSnap?.capacity ?? instance.capacity;
    const formCharterSeats = pendingSnap?.charterSeats ?? instance.charterSeats;
    const formCabinCapacities = pendingSnap
      ? pendingSnap.cabinCapacities
      : serializeCabinCapacities(instance.cabinCapacities);
    const formBasePriceIrr =
      pendingSnap?.basePriceIrr != null
        ? BigInt(pendingSnap.basePriceIrr)
        : instance.basePriceIrr;
    const formCompetitorPriceIrr =
      pendingSnap?.competitorPriceIrr != null
        ? BigInt(pendingSnap.competitorPriceIrr)
        : instance.competitorPriceIrr;
    const formAircraftType =
      pendingSnap?.aircraftType ?? resolveAircraftType(instance);

    const chargeRulesForResponse =
      pendingRevision && pendingRules.length > 0
        ? pendingRules.map(serializeChargeRule)
        : pendingSnap?.chargeRules?.length
          ? pendingSnap.chargeRules
          : activeRules.map(serializeChargeRule);
    const rulesForPreview =
      pendingRevision && pendingRules.length > 0 ? pendingRules : activeRules;

    const base = formBasePriceIrr ?? 0n;
    const calculatedChargeBreakdown = this.calculatedBreakdown(
      base,
      rulesForPreview.filter((r) => r.isActive),
      formDepartureAt,
    );

    // Edits blocked while waiting on ops or CEO. PENDING_REVISION keeps the
    // live snapshot and stages a draft commercial can still adjust.
    const canEdit =
      approvalStatus !== FlightDefinitionStatus.PENDING_CEO &&
      approvalStatus !== FlightDefinitionStatus.PENDING_OPERATIONS;
    const editBlockedReason = canEdit
      ? null
      : approvalStatus === FlightDefinitionStatus.PENDING_OPERATIONS
        ? 'این تعریف در انتظار بررسی مدیر عملیات است.'
        : 'این تعریف در انتظار تأیید مدیرعامل است.';

    return {
      id: instance.id,
      flightNo: formFlightNo,
      originCode: formOriginCode,
      destCode: formDestCode,
      departureAt: formDepartureAt.toISOString(),
      arrivalAt: formArrivalAt.toISOString(),
      capacity: formCapacity,
      charterSeats: formCharterSeats,
      sold,
      basePriceIrr: formBasePriceIrr,
      competitorPriceIrr: formCompetitorPriceIrr,
      derivedStatus,
      aircraftType: formAircraftType,
      durationMinutes: formDurationMinutes,
      cabinCapacities: formCabinCapacities,
      chargeRules: chargeRulesForResponse,
      calculatedChargeBreakdown,
      approvalStatus,
      rejectionReason: instance.rejectionReason,
      canEdit: Boolean(canEdit),
      editBlockedReason,
      pendingRevision,
      approvedSnapshot: instance.approvedSnapshot,
      pendingRevisionSnapshot: instance.pendingRevisionSnapshot,
      definitionStatus: instance.definitionStatus,
      publishStatus: toPublishStatus(
        instance.definitionStatus,
        instance.approvedSnapshot != null,
      ),
      uiStatus: toFlightUiStatus(
        instance.definitionStatus,
        instance.approvedSnapshot != null,
      ),
      version: instance.version,
      publishedAt: instance.publishedAt?.toISOString() ?? null,
      publishedByUserId: instance.publishedByUserId,
      pricingProposal: pricingProposal
        ? {
            proposedPriceIrr: pricingProposal.proposedPriceIrr.toString(),
            legalRateIrr: pricingProposal.legalRateIrr?.toString() ?? null,
            ceoNote: pricingProposal.ceoNote,
            operationsNote: pricingProposal.operationsNote,
            commercialNote: pricingProposal.commercialNote,
          }
        : null,
    };
  }

  async getDefinition(id: string) {
    const instance = await this.loadInstanceOrThrow(id);
    return this.toDefinitionDetail(instance);
  }

  /**
   * Completes a DRAFT occurrence already materialized from a seasonal
   * schedule. The physical definition stays authoritative on the occurrence;
   * only commercial controls are accepted from the caller. All writes and the
   * workflow transition commit together, so a retry can never observe a
   * half-configured flight.
   */
  async completeScheduledAndSubmit(
    actor: AuthenticatedUser,
    id: string,
    dto: CompleteScheduledFlightDto,
  ) {
    let submittedIds: string[] = [];
    await this.dataSource.transaction(async (manager) => {
      const instance = await manager.findOne(FlightInstance, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!instance) {
        throw new NotFoundException({
          code: ErrorCode.NOT_FOUND,
          message: 'پرواز یافت نشد.',
        });
      }
      if (!instance.scheduleTemplateId) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message:
            'این عملیات فقط برای رخداد ساخته‌شده از مسیر پروازی مجاز است.',
        });
      }
      const isSubmittable =
        instance.definitionStatus === FlightDefinitionStatus.DRAFT ||
        instance.definitionStatus ===
          FlightDefinitionStatus.OPERATIONS_REJECTED ||
        instance.definitionStatus === FlightDefinitionStatus.REJECTED;
      if (!isSubmittable) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message: 'این پرواز در وضعیت فعلی قابل تکمیل و ارسال نیست.',
        });
      }
      if (
        dto.expectedVersion != null &&
        dto.expectedVersion !== instance.version
      ) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message:
            'نسخه پرواز تغییر کرده است. صفحه را تازه کنید و دوباره تلاش کنید.',
        });
      }
      if (instance.departureAt <= new Date()) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message: 'رخداد گذشته قابل تکمیل و ارسال نیست.',
        });
      }

      const targets = await manager
        .getRepository(FlightInstance)
        .createQueryBuilder('target')
        .setLock('pessimistic_write')
        .where('target.scheduleTemplateId = :templateId', {
          templateId: instance.scheduleTemplateId,
        })
        .andWhere('target.status = :scheduled', {
          scheduled: FlightInstanceStatus.SCHEDULED,
        })
        .andWhere('target.departureAt > :now', { now: new Date() })
        .andWhere('target.definitionStatus IN (:...statuses)', {
          statuses: [
            FlightDefinitionStatus.DRAFT,
            FlightDefinitionStatus.OPERATIONS_REJECTED,
            FlightDefinitionStatus.REJECTED,
          ],
        })
        .orderBy('target.departureAt', 'ASC')
        .getMany();
      if (targets.length === 0) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message: 'رخداد آینده‌ای برای تکمیل این شماره پرواز وجود ندارد.',
        });
      }
      submittedIds = targets.map((target) => target.id);

      const cabinCapacities = serializeCabinCapacities(
        instance.cabinCapacities,
      );
      const physicalTotal = cabinCapacities.reduce(
        (sum, row) => sum + row.seats,
        0,
      );
      if (physicalTotal <= 0 || physicalTotal !== instance.capacity) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message:
            'ظرفیت فیزیکی رخداد با نقشه کابین سازگار نیست؛ ابتدا مسیر پروازی را اصلاح کنید.',
        });
      }

      const flight = await manager.findOneByOrFail(Flight, {
        id: instance.flightId,
      });
      const aircraftType =
        instance.aircraftTypeOverride?.trim() || flight.aircraftType;
      const seatMap = await manager.findOneBy(AircraftSeatMap, {
        aircraftType,
      });
      if (!seatMap) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message: 'نقشه صندلی هواپیمای این رخداد یافت نشد.',
        });
      }
      await this.validateCabinCapacitiesAgainstSeatMap(
        seatMap,
        cabinCapacities,
      );

      const charterSeats = dto.charterSeats ?? 0;
      if (charterSeats >= physicalTotal) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_FAILED,
          message: 'تعهد چارتری باید کمتر از ظرفیت فیزیکی پرواز باشد.',
        });
      }

      const seen = new Set<string>();
      const allocatedByCabin = new Map<CabinClass, number>();
      for (const fare of dto.fareRules) {
        const key = `${fare.cabin}:${fare.classCode}`;
        if (seen.has(key)) {
          throw new BadRequestException({
            code: ErrorCode.VALIDATION_FAILED,
            message: `کلاس نرخی ${fare.classCode} برای کابین ${fare.cabin} تکراری است.`,
          });
        }
        seen.add(key);
        if (
          fare.validFrom &&
          fare.validUntil &&
          new Date(fare.validUntil) <= new Date(fare.validFrom)
        ) {
          throw new BadRequestException({
            code: ErrorCode.VALIDATION_FAILED,
            message: 'پایان بازه اعتبار کلاس نرخی باید بعد از شروع آن باشد.',
          });
        }
        allocatedByCabin.set(
          fare.cabin,
          (allocatedByCabin.get(fare.cabin) ?? 0) + fare.seatsAllocated,
        );
      }
      for (const [cabin, allocated] of allocatedByCabin) {
        const physical =
          cabinCapacities.find((row) => row.cabin === cabin)?.seats ?? 0;
        if (allocated > physical) {
          throw new BadRequestException({
            code: ErrorCode.VALIDATION_FAILED,
            message: `ظرفیت کلاس‌های نرخی ${cabin} (${allocated}) از ظرفیت فیزیکی کابین (${physical}) بیشتر است.`,
          });
        }
      }

      const sold = await manager.count(Booking, {
        where: {
          flightInstanceId: In(submittedIds),
          status: In([...SOLD_STATUSES]),
        },
      });
      if (sold > 0) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message:
            'پرواز دارای فروش قطعی است و کلاس‌های نرخی آن با این عملیات قابل جایگزینی نیست.',
        });
      }

      const chargeInputs = this.validateChargeRules(dto.chargeRules);
      for (const target of targets) {
        const targetCapacities = serializeCabinCapacities(
          target.cabinCapacities,
        );
        if (
          target.capacity !== physicalTotal ||
          JSON.stringify(targetCapacities) !== JSON.stringify(cabinCapacities)
        ) {
          throw new ConflictException({
            code: ErrorCode.CONFLICT,
            message:
              'ظرفیت یکی از رخدادهای این شماره پرواز با تعریف هواپیما سازگار نیست.',
          });
        }

        await this.replaceChargeRules(manager, target.id, chargeInputs, false);
        await manager.delete(FareRule, { flightInstanceId: target.id });
        await manager.save(
          dto.fareRules.map((fare) =>
            manager.create(FareRule, {
              flightInstanceId: target.id,
              cabin: fare.cabin,
              classCode: fare.classCode,
              priceIrr: fare.priceIrr,
              sitePriceIrr: null,
              // The approved initial fare allocation starts as site inventory;
              // Commercial Management can subsequently split it between site
              // and agency channels from the active-flight sales tab.
              siteSeatsReleased: fare.seatsAllocated,
              seatsAllocated: fare.seatsAllocated,
              agencySeatsReleased: 0,
              agencyReleasePriceIrr: null,
              agencySpecialOffer: false,
              taxIrr: fare.taxIrr ?? 0n,
              refundable: fare.refundable ?? true,
              changeable: fare.changeable ?? true,
              baggageAllowanceKg: fare.baggageAllowanceKg ?? null,
              validFrom: fare.validFrom ? new Date(fare.validFrom) : null,
              validUntil: fare.validUntil ? new Date(fare.validUntil) : null,
              allowedChannels:
                fare.allowedChannels ??
                ([BookingChannel.SYSTEM] as BookingChannel[]),
            }),
          ),
        );

        let proposal = await manager
          .getRepository(FarePricingProposal)
          .createQueryBuilder('proposal')
          .where('proposal.flightInstanceId = :id', { id: target.id })
          .getOne();
        if (!proposal) {
          proposal = manager.create(FarePricingProposal, {
            flightInstanceId: target.id,
            proposedById: actor.id,
            createdAt: new Date(),
          });
        }
        proposal.basePriceIrr = dto.basePriceIrr;
        proposal.competitorPriceIrr = dto.competitorPriceIrr ?? null;
        proposal.proposedPriceIrr = dto.pricingProposal.proposedPriceIrr;
        proposal.legalRateIrr = dto.pricingProposal.legalRateIrr ?? null;
        proposal.commercialNote =
          dto.pricingProposal.commercialNote?.trim() || null;
        proposal.operationsNote =
          dto.pricingProposal.operationsNote?.trim() || null;
        proposal.ceoNote = dto.pricingProposal.ceoNote?.trim() || null;
        proposal.note = null;
        proposal.proposedById = actor.id;
        proposal.status = PricingProposalStatus.PENDING;
        proposal.registeredPriceIrr = null;
        proposal.approvedById = null;
        proposal.approvedAt = null;
        proposal.rejectionReason = null;
        proposal.rejectedById = null;
        proposal.rejectedAt = null;
        proposal.aiSuggestion = null;
        proposal.updatedAt = new Date();
        await manager.save(proposal);

        const fromStatus = target.definitionStatus;
        target.basePriceIrr = dto.basePriceIrr;
        target.competitorPriceIrr = dto.competitorPriceIrr ?? null;
        target.charterSeats = charterSeats;
        target.definitionStatus = FlightDefinitionStatus.PENDING_OPERATIONS;
        target.publicSaleEnabled = false;
        target.commercialPanelSettings = {
          ...settingsRecord(target.commercialPanelSettings),
          siteVisible: false,
        };
        target.rejectionReason = null;
        target.version += 1;
        await manager.save(target);

        await manager.save(
          manager.create(AuditLog, {
            actorId: actor.id,
            actorRole: actor.role,
            category: 'SYSTEM',
            action: 'تکمیل اتمیک رخداد برنامه پروازی',
            detail: `رخداد ${flight.flightNo} تکمیل و همراه مجموعه ${targets.length} پروازی برای بررسی مدیر عملیات ارسال شد.`,
            entityType: 'FlightInstance',
            entityId: target.id,
            metadata: {
              fromStatus,
              toStatus: FlightDefinitionStatus.PENDING_OPERATIONS,
              version: target.version,
              fareRuleCount: dto.fareRules.length,
              physicalCapacity: physicalTotal,
              scheduleTemplateId: target.scheduleTemplateId,
              occurrenceCount: targets.length,
            },
          }),
        );
      }
    });

    const definition = await this.getDefinition(id);
    const occurrences = await this.instanceRepo.find({
      where: { id: In(submittedIds) },
      order: { departureAt: 'ASC' },
    });
    return {
      ...definition,
      scheduleGroup: {
        occurrenceCount: occurrences.length,
        startAt: occurrences[0]?.departureAt.toISOString() ?? null,
        endAt: occurrences.at(-1)?.departureAt.toISOString() ?? null,
        departures: occurrences.map((row) => row.departureAt.toISOString()),
      },
    };
  }

  async createDefinition(
    actor: AuthenticatedUser,
    dto: CreateFlightDefinitionDto,
  ) {
    assertValidFlightNo(dto.flightNo);
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
    const durationMinutes = dto.durationMinutes;
    const arrivalAt = arrivalFromDuration(departureAt, durationMinutes);
    if (arrivalAt <= departureAt) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'زمان ورود باید بعد از زمان خروج باشد.',
      });
    }

    const charterSeats = dto.charterSeats ?? 0;
    if (charterSeats >= dto.capacity) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'تعهد چارتری باید کمتر از تعداد صندلی موجود باشد.',
      });
    }

    const cabinCapacities = normalizeCabinCapacities(
      dto.cabinCapacities,
      dto.capacity,
    );
    const chargeInputs = this.validateChargeRules(dto.chargeRules);

    const aircraftType =
      (dto.aircraftType ?? 'Airbus A320').trim() || 'Airbus A320';
    const map = await this.seatMapRepo.findOneBy({ aircraftType });
    if (!map) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'نوع هواپیمای انتخاب‌شده در کاتالوگ نیست.',
      });
    }
    await this.validateCabinCapacitiesAgainstSeatMap(map, cabinCapacities);

    const createdId = await this.dataSource.transaction(async (manager) => {
      let route = await manager.findOneBy(Route, {
        originCode: dto.originCode,
        destCode: dto.destCode,
      });
      if (!route) {
        route = await manager.save(
          manager.create(Route, {
            originCode: dto.originCode,
            destCode: dto.destCode,
            durationMin: durationMinutes,
          }),
        );
      } else if (route.durationMin !== durationMinutes) {
        route.durationMin = durationMinutes;
        await manager.save(route);
      }

      const existingFlight = await manager.findOneBy(Flight, {
        flightNo: dto.flightNo,
      });
      let flight = existingFlight;
      if (!flight) {
        flight = await manager.save(
          manager.create(Flight, {
            flightNo: dto.flightNo,
            routeId: route.id,
            aircraftType,
          }),
        );
      } else if (flight.routeId !== route.id) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message: 'این شماره پرواز قبلاً برای مسیر دیگری ثبت شده است.',
        });
      }

      const instance = await manager.save(
        manager.create(FlightInstance, {
          flightId: flight.id,
          departureAt,
          arrivalAt,
          capacity: dto.capacity,
          charterSeats,
          status: 'SCHEDULED',
          basePriceIrr: dto.basePriceIrr,
          durationMinutes,
          competitorPriceIrr: dto.competitorPriceIrr ?? null,
          cabinCapacities,
          definitionStatus: FlightDefinitionStatus.DRAFT,
          publicSaleEnabled: false,
          rejectionReason: null,
          approvedSnapshot: null,
          pendingRevisionSnapshot: null,
          version: 1,
          publishedAt: null,
          publishedByUserId: null,
          aircraftDefinitionId: map.aircraftDefinitionId,
          ...(existingFlight && dto.aircraftType
            ? { aircraftTypeOverride: aircraftType }
            : {}),
        }),
      );

      await this.replaceChargeRules(manager, instance.id, chargeInputs, false);
      await manager.save(
        manager.create(FarePricingProposal, {
          flightInstanceId: instance.id,
          basePriceIrr: dto.basePriceIrr,
          competitorPriceIrr: dto.competitorPriceIrr ?? null,
          proposedPriceIrr: dto.basePriceIrr,
          legalRateIrr: null,
          note: null,
          ceoNote: null,
          operationsNote: null,
          commercialNote: null,
          proposedById: actor.id,
          status: PricingProposalStatus.PENDING,
          updatedAt: new Date(),
        }),
      );
      return instance.id;
    });

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'SYSTEM',
      action: 'افزودن تعریف پرواز (پیش‌نویس)',
      detail: `تعریف پرواز ${dto.flightNo} (${dto.originCode} ← ${dto.destCode}) توسط ${actor.fullName} به‌صورت پیش‌نویس ایجاد شد.`,
      entityType: 'FlightInstance',
      entityId: createdId,
      metadata: {
        durationMinutes,
        cabinCapacities,
        chargeRuleCount: chargeInputs.length,
        definitionStatus: FlightDefinitionStatus.DRAFT,
      },
    });

    // Advisory only: a missing/slow ML service must never roll back or block
    // the authoritative flight-definition transaction above.
    try {
      const aiResult = await this.priceSuggestions.suggest([
        {
          proposal_id: createdId,
          origin_code: dto.originCode,
          dest_code: dto.destCode,
          departure_at: departureAt.toISOString(),
          base_price_irr: Number(dto.basePriceIrr),
          competitor_price_irr: Number(
            dto.competitorPriceIrr ?? dto.basePriceIrr,
          ),
          proposed_price_irr: Number(dto.basePriceIrr),
          capacity: dto.capacity,
          charter_seats: charterSeats,
        },
      ]);
      const ai = aiResult?.suggestions?.find(
        (item) => item.proposal_id === createdId,
      );
      if (ai && aiResult) {
        const suggestion: PersistedAiSuggestion = {
          priceIrr: ai.price_irr,
          reason: ai.reason_fa,
          factors: ai.factors_fa,
          season: ai.season_fa,
          occasion: ai.occasion_fa,
          confidence: ai.confidence,
          modelVersion: aiResult.model_version,
          generatedAt: new Date().toISOString(),
        };
        await this.dataSource.query(
          `UPDATE "flight_instances" SET "aiSuggestion" = $1::jsonb WHERE "id" = $2`,
          [JSON.stringify(suggestion), createdId],
        );
      }
    } catch (error) {
      this.logger.warn(
        `Flight ${createdId} was created, but its advisory ML suggestion could not be persisted: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }

    return this.getDefinition(createdId);
  }

  async updateDefinition(
    actor: AuthenticatedUser,
    id: string,
    dto: UpdateFlightDefinitionDto,
  ) {
    assertValidFlightNo(dto.flightNo);
    const instance = await this.loadInstanceOrThrow(id);

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
    if (Number.isNaN(departureAt.getTime())) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'تاریخ و ساعت پرواز نامعتبر است.',
      });
    }
    const durationMinutes = dto.durationMinutes;
    const arrivalAt = arrivalFromDuration(departureAt, durationMinutes);
    const cabinCapacities = normalizeCabinCapacities(
      dto.cabinCapacities,
      dto.capacity,
    );
    const chargeInputs = this.validateChargeRules(dto.chargeRules);
    const charterSeats = dto.charterSeats ?? instance.charterSeats;
    if (charterSeats >= dto.capacity) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'تعهد چارتری باید کمتر از تعداد صندلی موجود باشد.',
      });
    }

    const aircraftType =
      (dto.aircraftType ?? resolveAircraftType(instance)).trim() ||
      'Airbus A320';
    const map = await this.seatMapRepo.findOneBy({ aircraftType });
    if (!map) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'نوع هواپیمای انتخاب‌شده در کاتالوگ نیست.',
      });
    }
    await this.validateCabinCapacitiesAgainstSeatMap(map, cabinCapacities);

    const status = instance.definitionStatus;

    if (
      status === FlightDefinitionStatus.PENDING_CEO ||
      status === FlightDefinitionStatus.PENDING_OPERATIONS
    ) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message:
          status === FlightDefinitionStatus.PENDING_OPERATIONS
            ? 'این تعریف در انتظار بررسی مدیر عملیات است و فعلاً قابل ویرایش نیست.'
            : 'این تعریف در انتظار تأیید مدیرعامل است و فعلاً قابل ویرایش نیست.',
      });
    }

    const isApprovedLive =
      status === FlightDefinitionStatus.PUBLISHED ||
      status === FlightDefinitionStatus.APPROVED ||
      (status === FlightDefinitionStatus.PENDING_REVISION &&
        instance.approvedSnapshot != null);

    await this.dataSource.transaction(async (manager) => {
      const route = await this.findOrCreateRoute(
        dto.originCode,
        dto.destCode,
        durationMinutes,
        manager,
      );
      const flight = await manager.findOneByOrFail(Flight, {
        id: instance.flightId,
      });
      if (flight.flightNo !== dto.flightNo) {
        const clash = await manager.findOneBy(Flight, {
          flightNo: dto.flightNo,
        });
        if (clash && clash.id !== flight.id) {
          throw new ConflictException({
            code: ErrorCode.CONFLICT,
            message: 'این شماره پرواز قبلاً ثبت شده است.',
          });
        }
        // Do not mutate active flightNo on APPROVED — goes into revision.
        if (!isApprovedLive) {
          flight.flightNo = dto.flightNo;
          flight.routeId = route.id;
          flight.aircraftType = aircraftType;
          await manager.save(flight);
        }
      } else if (!isApprovedLive) {
        flight.routeId = route.id;
        flight.aircraftType = aircraftType;
        await manager.save(flight);
      }

      const serializedRules = chargeInputs.map((r) => ({
        title: r.title,
        kind: r.kind,
        calculationMode: r.calculationMode,
        fixedAmountIrr:
          r.fixedAmountIrr == null ? null : String(r.fixedAmountIrr),
        percentageBasisPoints: r.percentageBasisPoints,
        cabin: r.cabin,
        validFrom: r.effectiveFrom?.toISOString() ?? null,
        validUntil: r.effectiveTo?.toISOString() ?? null,
        active: r.isActive,
        effectiveFrom: r.effectiveFrom?.toISOString() ?? null,
        effectiveTo: r.effectiveTo?.toISOString() ?? null,
        isActive: r.isActive,
      }));

      const snapshot = this.buildSnapshot({
        flightNo: dto.flightNo,
        originCode: dto.originCode,
        destCode: dto.destCode,
        departureAt,
        durationMinutes,
        aircraftType,
        aircraftDefinitionId: map.aircraftDefinitionId,
        capacity: dto.capacity,
        charterSeats,
        cabinCapacities,
        basePriceIrr: dto.basePriceIrr,
        competitorPriceIrr: dto.competitorPriceIrr ?? null,
        chargeRules: serializedRules,
      });

      if (isApprovedLive) {
        // Keep live columns + active charge rules intact; stage revision.
        instance.pendingRevisionSnapshot = snapshot;
        instance.definitionStatus = FlightDefinitionStatus.PENDING_REVISION;
        instance.rejectionReason = null;
        instance.version += 1;
        await manager.save(instance);
        await this.replaceChargeRules(manager, instance.id, chargeInputs, true);

        // Re-open pricing proposal for CEO review of revision (if registered).
        const proposal = await manager
          .createQueryBuilder(FarePricingProposal, 'p')
          .where('p.flightInstanceId = :id', { id: instance.id })
          .getOne();
        if (proposal && proposal.status === 'REGISTERED') {
          proposal.status = 'PENDING';
          proposal.registeredPriceIrr = null;
          proposal.approvedAt = null;
          proposal.approvedById = null;
          proposal.rejectionReason = null;
          proposal.rejectedAt = null;
          proposal.rejectedById = null;
          proposal.proposedPriceIrr = dto.basePriceIrr;
          if (dto.competitorPriceIrr != null) {
            proposal.competitorPriceIrr = dto.competitorPriceIrr;
          }
          proposal.updatedAt = new Date();
          await manager.save(proposal);
        } else if (proposal && proposal.status === 'REJECTED') {
          proposal.status = 'PENDING';
          proposal.proposedPriceIrr = dto.basePriceIrr;
          proposal.rejectionReason = null;
          proposal.rejectedAt = null;
          proposal.rejectedById = null;
          proposal.updatedAt = new Date();
          await manager.save(proposal);
        }
      } else {
        // Direct mutate for DRAFT / REJECTED / first PENDING_REVISION without snapshot.
        instance.departureAt = departureAt;
        instance.arrivalAt = arrivalAt;
        instance.durationMinutes = durationMinutes;
        instance.capacity = dto.capacity;
        instance.charterSeats = charterSeats;
        instance.basePriceIrr = dto.basePriceIrr;
        instance.competitorPriceIrr = dto.competitorPriceIrr ?? null;
        instance.cabinCapacities = cabinCapacities;
        instance.aircraftDefinitionId = map.aircraftDefinitionId;
        instance.definitionStatus = FlightDefinitionStatus.DRAFT;
        instance.rejectionReason = null;
        instance.pendingRevisionSnapshot = null;
        instance.version += 1;
        if (dto.aircraftType) {
          instance.aircraftTypeOverride = aircraftType;
        }
        await manager.save(instance);
        await this.replaceChargeRules(
          manager,
          instance.id,
          chargeInputs,
          false,
        );
      }
    });

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'SYSTEM',
      action: isApprovedLive ? 'ثبت بازنگری تعریف پرواز' : 'ویرایش تعریف پرواز',
      detail: `تعریف پرواز ${dto.flightNo} توسط ${actor.fullName} ${
        isApprovedLive ? 'برای تأیید مجدد ارسال شد' : 'ویرایش شد'
      }.`,
      entityType: 'FlightInstance',
      entityId: id,
      metadata: {
        previousStatus: status,
        nextStatus: isApprovedLive
          ? FlightDefinitionStatus.PENDING_REVISION
          : FlightDefinitionStatus.DRAFT,
      },
    });

    return this.getDefinition(id);
  }

  /**
   * Promote pending revision (or first approval) onto the live instance.
   * Called from pricing.register after CEO step-up. Returns the route/date
   * the instance was searchable under BEFORE this change (revision only —
   * a first-time approval has no prior searchable listing), so the caller
   * can invalidate that now-stale search-cache entry too: invalidateForInstance
   * only ever busts the *current* (post-update) key, since by the time it
   * runs the DB row already reflects the new state.
   */
  async applyCeoApprovalInTx(
    manager: EntityManager,
    flightInstanceId: string,
    publishedByUserId?: string,
  ): Promise<{ previousLocation: PreviousSearchLocation }> {
    const instance = await manager.findOne(FlightInstance, {
      where: { id: flightInstanceId },
      relations: { flight: { route: true } },
    });
    if (!instance?.flight?.route) return { previousLocation: null };

    if (
      instance.definitionStatus !== FlightDefinitionStatus.PENDING_CEO &&
      instance.definitionStatus !== FlightDefinitionStatus.PENDING_REVISION
    ) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'فقط پرواز در انتظار مدیرعامل قابل انتشار است.',
      });
    }

    if (
      instance.definitionStatus === FlightDefinitionStatus.PENDING_REVISION &&
      instance.pendingRevisionSnapshot
    ) {
      const previousLocation: PreviousSearchLocation = {
        originCode: instance.flight.route.originCode,
        destCode: instance.flight.route.destCode,
        departureAt: instance.departureAt,
      };
      const snap = instance.pendingRevisionSnapshot as DefinitionSnapshot;
      const departureAt = new Date(snap.departureAt);
      const arrivalAt = arrivalFromDuration(departureAt, snap.durationMinutes);
      instance.departureAt = departureAt;
      instance.arrivalAt = arrivalAt;
      instance.durationMinutes = snap.durationMinutes;
      instance.capacity = snap.capacity;
      instance.charterSeats = snap.charterSeats;
      instance.basePriceIrr =
        snap.basePriceIrr != null ? BigInt(snap.basePriceIrr) : null;
      instance.competitorPriceIrr =
        snap.competitorPriceIrr != null
          ? BigInt(snap.competitorPriceIrr)
          : null;
      instance.cabinCapacities = snap.cabinCapacities;
      instance.aircraftDefinitionId = snap.aircraftDefinitionId ?? null;
      instance.approvedSnapshot = snap;
      instance.pendingRevisionSnapshot = null;
      instance.definitionStatus = FlightDefinitionStatus.PUBLISHED;
      instance.rejectionReason = null;
      instance.publishedAt = new Date();
      instance.publishedByUserId =
        publishedByUserId ?? instance.publishedByUserId;
      instance.version += 1;

      const flight = await manager.findOneByOrFail(Flight, {
        id: instance.flightId,
      });
      flight.flightNo = snap.flightNo;
      flight.aircraftType = snap.aircraftType;
      const route = await this.findOrCreateRoute(
        snap.originCode,
        snap.destCode,
        snap.durationMinutes,
        manager,
      );
      flight.routeId = route.id;
      await manager.save(flight);

      // Promote pending rules → active.
      await manager.delete(FlightChargeRule, {
        flightInstanceId: instance.id,
        isPendingRevision: false,
      });
      await manager
        .createQueryBuilder()
        .update(FlightChargeRule)
        .set({ isPendingRevision: false })
        .where('"flightInstanceId" = :id AND "isPendingRevision" = true', {
          id: instance.id,
        })
        .execute();

      await manager.save(instance);
      return { previousLocation };
    }

    // First-time publish from PENDING_CEO.
    // No prior searchable listing existed, so there is no stale cache
    // entry to invalidate.
    const activeRules = await manager.find(FlightChargeRule, {
      where: {
        flightInstanceId: instance.id,
        isPendingRevision: false,
      },
    });
    const cabinCapacities = serializeCabinCapacities(instance.cabinCapacities);
    const durationMinutes =
      instance.durationMinutes ??
      Math.max(
        1,
        Math.round(
          (instance.arrivalAt.getTime() - instance.departureAt.getTime()) /
            60_000,
        ),
      );
    const snapshot = this.buildSnapshot({
      flightNo: instance.flight.flightNo,
      originCode: instance.flight.route.originCode,
      destCode: instance.flight.route.destCode,
      departureAt: instance.departureAt,
      durationMinutes,
      aircraftType: resolveAircraftType(instance),
      aircraftDefinitionId: instance.aircraftDefinitionId,
      capacity: instance.capacity,
      charterSeats: instance.charterSeats,
      cabinCapacities,
      basePriceIrr: instance.basePriceIrr,
      competitorPriceIrr: instance.competitorPriceIrr,
      chargeRules: activeRules.map(serializeChargeRule),
    });
    instance.approvedSnapshot = snapshot;
    instance.pendingRevisionSnapshot = null;
    instance.definitionStatus = FlightDefinitionStatus.PUBLISHED;
    // First CEO approval is the final publication gate. Keep revision
    // approvals from overriding a later manual commercial pause, but make a
    // newly approved flight immediately discoverable by the public search.
    instance.publicSaleEnabled = true;
    instance.commercialPanelSettings = {
      ...settingsRecord(instance.commercialPanelSettings),
      siteVisible: true,
    };
    instance.rejectionReason = null;
    instance.publishedAt = new Date();
    instance.publishedByUserId = publishedByUserId ?? null;
    instance.version += 1;
    await manager.save(instance);
    return { previousLocation: null };
  }

  async applyCeoApproval(
    flightInstanceId: string,
    publishedByUserId?: string,
  ): Promise<{ previousLocation: PreviousSearchLocation }> {
    return this.dataSource.transaction((manager) =>
      this.applyCeoApprovalInTx(manager, flightInstanceId, publishedByUserId),
    );
  }

  async applyCeoRejectionInTx(
    manager: EntityManager,
    flightInstanceId: string,
    reason: string,
  ): Promise<void> {
    const instance = await manager.findOne(FlightInstance, {
      where: { id: flightInstanceId },
    });
    if (!instance) return;

    if (instance.definitionStatus === FlightDefinitionStatus.PENDING_REVISION) {
      // Discard pending revision; keep approved live version.
      await manager.delete(FlightChargeRule, {
        flightInstanceId,
        isPendingRevision: true,
      });
      instance.pendingRevisionSnapshot = null;
      instance.definitionStatus = FlightDefinitionStatus.PUBLISHED;
      instance.rejectionReason = reason;
      instance.version += 1;
    } else if (
      instance.definitionStatus === FlightDefinitionStatus.PENDING_CEO
    ) {
      instance.definitionStatus = FlightDefinitionStatus.REJECTED;
      instance.rejectionReason = reason;
      instance.version += 1;
    } else {
      instance.rejectionReason = reason;
      instance.version += 1;
    }
    await manager.save(instance);
  }

  async applyCeoRejection(
    flightInstanceId: string,
    reason: string,
  ): Promise<void> {
    await this.dataSource.transaction((manager) =>
      this.applyCeoRejectionInTx(manager, flightInstanceId, reason),
    );
  }

  /**
   * Legacy hook from pricing upsert — no longer jumps DRAFT → PENDING_CEO.
   * Operations must approve first via submit-operations / ops-decision.
   * Kept so callers compile; intentionally a no-op for status.
   */
  markPendingCeoInTx(_manager: EntityManager, _flightInstanceId: string): void {
    void _manager;
    void _flightInstanceId;
    return;
  }
}
