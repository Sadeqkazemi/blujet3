import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'node:crypto';
import { DataSource, In, type EntityManager, Repository } from 'typeorm';
import { Airport } from '../../database/entities/airport.entity';
import { AircraftDefinition } from '../../database/entities/aircraft-definition.entity';
import { AircraftCabin } from '../../database/entities/aircraft-cabin.entity';
import { Flight } from '../../database/entities/flight.entity';
import { Route } from '../../database/entities/route.entity';
import { FlightInstance } from '../../database/entities/flight-instance.entity';
import { FlightScheduleTemplate } from '../../database/entities/flight-schedule-template.entity';
import { FareRule } from '../../database/entities/fare-rule.entity';
import { Booking } from '../../database/entities/booking.entity';
import { CharterCommitment } from '../../database/entities/charter-commitment.entity';
import { AgencySeatCommitment } from '../../database/entities/agency-seat-commitment.entity';
import { AgencyAllotment } from '../../database/entities/agency-allotment.entity';
import { SeatLock } from '../../database/entities/seat-lock.entity';
import { PriceLock } from '../../database/entities/price-lock.entity';
import {
  CabinClass,
  CommitmentStatus,
  FlightDefinitionStatus,
  FlightInstanceStatus,
  FlightScheduleTemplateStatus,
  PriceLockStatus,
} from '../../database/enums';
import {
  normalizeCabinCapacities,
  serializeCabinCapacities,
} from './flight-definition.util';
import { ErrorCode } from '../../common/errors';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AuditService } from '../audit/audit.service';
import {
  enumerateMatchingDates,
  zonedLocalToUtc,
} from './schedule-template.dates';
import type {
  CreateScheduleTemplateDto,
  RouteDistanceSuggestionDto,
  ScheduleTemplatePreviewDto,
} from './dto/schedule-template.dto';
import {
  ROUTE_DISTANCE_PROVIDER,
  type RouteDistanceProvider,
} from '../ai/route-distance.provider';
import { standardClassCode } from './aircraft-class-code';
import { buildInitialFareRuleRows } from './schedule-template-fare-rules';

type ResolvedCtx = Awaited<
  ReturnType<ScheduleTemplateService['resolveContext']>
>;

@Injectable()
export class ScheduleTemplateService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(FlightScheduleTemplate)
    private readonly templateRepo: Repository<FlightScheduleTemplate>,
    @InjectRepository(Airport)
    private readonly airportRepo: Repository<Airport>,
    @InjectRepository(AircraftDefinition)
    private readonly aircraftRepo: Repository<AircraftDefinition>,
    @InjectRepository(AircraftCabin)
    private readonly cabinRepo: Repository<AircraftCabin>,
    @InjectRepository(FlightInstance)
    private readonly instanceRepo: Repository<FlightInstance>,
    private readonly audit: AuditService,
    @Optional()
    @Inject(ROUTE_DISTANCE_PROVIDER)
    private readonly routeDistanceProvider?: RouteDistanceProvider,
  ) {}

  private parseIrr(value: string, field: string): bigint {
    if (!/^\d+$/.test(value)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: `${field} باید عدد صحیح ریال باشد.`,
      });
    }
    return BigInt(value);
  }

  private async resolveContext(dto: ScheduleTemplatePreviewDto) {
    if (dto.originAirportId === dto.destinationAirportId) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'مبدأ و مقصد نمی‌توانند یکسان باشند.',
      });
    }
    const agency = this.parseIrr(dto.agencyPriceIrr, 'agencyPriceIrr');
    const legal = this.parseIrr(dto.legalCeilingIrr, 'legalCeilingIrr');
    if (agency > legal) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'قیمت آژانس نمی‌تواند از سقف قانونی بیشتر باشد.',
      });
    }
    if (dto.startDate > dto.endDate) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'بازه تاریخ نامعتبر است.',
      });
    }

    const [origin, dest, aircraft] = await Promise.all([
      this.airportRepo.findOne({
        where: { id: dto.originAirportId, active: true },
      }),
      this.airportRepo.findOne({
        where: { id: dto.destinationAirportId, active: true },
      }),
      this.aircraftRepo.findOne({ where: { id: dto.aircraftDefinitionId } }),
    ]);
    if (!origin || !dest) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'فرودگاه انتخاب‌شده معتبر نیست.',
      });
    }
    if (!aircraft || aircraft.status !== 'ACTIVE') {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'تعریف هواپیما معتبر نیست.',
      });
    }
    // Never mutate MD-80 seat maps — only read cabin capacities.
    const cabins = await this.cabinRepo.find({
      where: { aircraftDefinitionId: aircraft.id },
    });
    if (cabins.length === 0) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'ظرفیت کابین برای این هواپیما تعریف نشده است.',
      });
    }
    const aircraftCapacityByCabin = new Map(
      cabins.map((c) => [c.cabinType, c.capacity]),
    );
    const requestedCabins =
      dto.cabinCapacities ??
      cabins.map((c) => ({
        cabin: c.cabinType,
        seats: c.capacity,
        basePriceIrr: dto.agencyPriceIrr,
      }));
    const requestedTotal = requestedCabins.reduce(
      (sum, row) => sum + Number(row.seats ?? 0),
      0,
    );
    const cabinCapacities = normalizeCabinCapacities(
      requestedCabins,
      requestedTotal,
    ).filter((row) => row.seats > 0);
    if (cabinCapacities.length === 0) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'حداقل یک کابین فعال برای مسیر پروازی انتخاب کنید.',
      });
    }
    for (const row of cabinCapacities) {
      const maximum = aircraftCapacityByCabin.get(row.cabin);
      if (maximum == null || row.seats > maximum) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_FAILED,
          message: `ظرفیت کابین ${row.cabin} از ظرفیت تعریف‌شده هواپیما بیشتر است.`,
        });
      }
    }
    const capacity = cabinCapacities.reduce((s, c) => s + c.seats, 0);
    const cabinDefinitions = cabinCapacities.map((row) => {
      const requested = requestedCabins.find(
        (candidate) => candidate.cabin === row.cabin,
      );
      const basePriceIrr = this.parseIrr(
        requested?.basePriceIrr ?? dto.agencyPriceIrr,
        `basePriceIrr.${row.cabin}`,
      );
      if (basePriceIrr < 1n) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_FAILED,
          message: `قیمت پایه کابین ${row.cabin} باید بیشتر از صفر باشد.`,
        });
      }
      if (basePriceIrr > legal) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_FAILED,
          message: `قیمت پایه کابین ${row.cabin} نمی‌تواند از سقف قانونی بیشتر باشد.`,
        });
      }
      const aircraftCabin = cabins.find(
        (candidate) => candidate.cabinType === row.cabin,
      );
      return {
        ...row,
        basePriceIrr,
        defaultClassCode:
          aircraftCabin?.defaultClassCode ?? standardClassCode(row.cabin),
      };
    });

    const dates = enumerateMatchingDates(
      dto.startDate,
      dto.endDate,
      dto.weekdays,
    );
    const occurrences = dates.map((dateOnly) => {
      const departureAt = zonedLocalToUtc(
        dateOnly,
        dto.departureTime,
        origin.tz,
      );
      const arrivalAt = new Date(
        departureAt.getTime() + dto.durationMinutes * 60_000,
      );
      return { dateOnly, departureAt, arrivalAt };
    });

    return {
      origin,
      dest,
      aircraft,
      cabinCapacities,
      cabinDefinitions,
      capacity,
      agency,
      legal,
      occurrences,
    };
  }

  async preview(dto: ScheduleTemplatePreviewDto) {
    const ctx = await this.resolveContext(dto);
    return {
      occurrenceCount: ctx.occurrences.length,
      capacity: ctx.capacity,
      cabinCapacities: ctx.cabinDefinitions.map((row) => ({
        cabin: row.cabin,
        seats: row.seats,
        basePriceIrr: row.basePriceIrr.toString(),
        defaultClassCode: row.defaultClassCode,
      })),
      distanceKm: dto.distanceKm ?? null,
      distanceSource: dto.distanceSource ?? null,
      dates: ctx.occurrences.map((o) => ({
        localDate: o.dateOnly,
        departureAt: o.departureAt.toISOString(),
        arrivalAt: o.arrivalAt.toISOString(),
      })),
    };
  }

  async suggestDistance(dto: RouteDistanceSuggestionDto) {
    if (dto.originAirportId === dto.destinationAirportId) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'مبدأ و مقصد نمی‌توانند یکسان باشند.',
      });
    }
    const [origin, destination] = await Promise.all([
      this.airportRepo.findOne({
        where: { id: dto.originAirportId, active: true },
      }),
      this.airportRepo.findOne({
        where: { id: dto.destinationAirportId, active: true },
      }),
    ]);
    if (!origin || !destination) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'فرودگاه انتخاب‌شده معتبر نیست.',
      });
    }
    return this.routeDistanceProvider?.suggest(origin, destination) ?? null;
  }

  private asDateOnly(value: string | Date): string {
    if (typeof value === 'string') return value.slice(0, 10);
    return value.toISOString().slice(0, 10);
  }

  private templateMatchesDto(
    t: FlightScheduleTemplate,
    actorId: string,
    dto: CreateScheduleTemplateDto,
    ctx: ResolvedCtx,
  ): boolean {
    const weekdaysA = JSON.stringify(
      [...(Array.isArray(t.weekdays) ? t.weekdays : [])].map(Number).sort(),
    );
    const weekdaysB = JSON.stringify([...dto.weekdays].map(Number).sort());
    return (
      t.createdByUserId === actorId &&
      t.originAirportId === dto.originAirportId &&
      t.destinationAirportId === dto.destinationAirportId &&
      t.flightNoBase === dto.flightNoBase &&
      t.aircraftDefinitionId === dto.aircraftDefinitionId &&
      t.departureTime === dto.departureTime &&
      t.durationMinutes === dto.durationMinutes &&
      t.distanceKm === (dto.distanceKm ?? null) &&
      t.distanceSource === (dto.distanceSource ?? null) &&
      this.asDateOnly(t.startDate) === dto.startDate &&
      this.asDateOnly(t.endDate) === dto.endDate &&
      weekdaysA === weekdaysB &&
      t.agencyPriceIrr === ctx.agency &&
      t.legalCeilingIrr === ctx.legal &&
      JSON.stringify(serializeCabinCapacities(t.cabinCapacities)) ===
        JSON.stringify(ctx.cabinCapacities) &&
      this.serializeCabinDefinitions(t).length ===
        ctx.cabinDefinitions.length &&
      this.serializeCabinDefinitions(t).every((row, index) => {
        const expected = ctx.cabinDefinitions[index];
        return (
          expected != null &&
          row.basePriceIrr === expected.basePriceIrr.toString() &&
          row.defaultClassCode === expected.defaultClassCode
        );
      })
    );
  }

  private async findConflicts(
    manager: EntityManager,
    flightNo: string,
    departures: Date[],
  ) {
    if (departures.length === 0) return [];
    const rows = await manager
      .getRepository(FlightInstance)
      .createQueryBuilder('fi')
      .innerJoinAndSelect('fi.flight', 'f')
      .where('fi.status = :scheduled', {
        scheduled: FlightInstanceStatus.SCHEDULED,
      })
      .andWhere('fi.departureAt IN (:...deps)', { deps: departures })
      .andWhere('f.flightNo = :flightNo', { flightNo })
      .getMany();
    return rows.map((r) => ({
      flightInstanceId: r.id,
      flightNo: r.flight.flightNo,
      departureAt: r.departureAt.toISOString(),
      aircraftDefinitionId: r.aircraftDefinitionId,
    }));
  }

  /** Independent advisory lock keypair for a resource kind. */
  private advisoryLockPair(kind: 'flightNo', value: string): [number, number] {
    const digest = createHash('sha256')
      .update(`schedule-template:${kind}:${value}`)
      .digest();
    return [digest.readInt32BE(0), digest.readInt32BE(4)];
  }

  /** Serialize creates for the only unique scheduling resource: flight number. */
  private async acquireScheduleLocks(
    manager: EntityManager,
    flightNoBase: string,
  ) {
    const [k1, k2] = this.advisoryLockPair('flightNo', flightNoBase);
    await manager.query('SELECT pg_advisory_xact_lock($1, $2)', [k1, k2]);
  }

  async create(actor: AuthenticatedUser, dto: CreateScheduleTemplateDto) {
    const ctx = await this.resolveContext(dto);
    if (ctx.occurrences.length === 0) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'هیچ تاریخی در بازه و روزهای هفته انتخاب‌شده نیست.',
      });
    }

    const existing = await this.templateRepo.findOne({
      where: { idempotencyKey: dto.idempotencyKey },
    });
    if (existing) {
      if (!this.templateMatchesDto(existing, actor.id, dto, ctx)) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message: 'کلید تکراری با محتوای یا مالک متفاوت است.',
        });
      }
      return this.toView(existing.id);
    }

    const templateId = await this.dataSource.transaction(async (manager) => {
      await this.acquireScheduleLocks(manager, dto.flightNoBase);

      const raced = await manager.findOne(FlightScheduleTemplate, {
        where: { idempotencyKey: dto.idempotencyKey },
      });
      if (raced) {
        if (!this.templateMatchesDto(raced, actor.id, dto, ctx)) {
          throw new ConflictException({
            code: ErrorCode.CONFLICT,
            message: 'کلید تکراری با محتوای یا مالک متفاوت است.',
          });
        }
        return raced.id;
      }

      const conflicts = await this.findConflicts(
        manager,
        dto.flightNoBase,
        ctx.occurrences.map((o) => o.departureAt),
      );
      if (conflicts.length > 0) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message: `شماره پرواز «${dto.flightNoBase}» در ${conflicts.length} تاریخ قبلاً برنامه‌ریزی شده است؛ شماره پرواز باید یکتا باشد.`,
        });
      }

      let route = await manager.findOne(Route, {
        where: {
          originCode: ctx.origin.code,
          destCode: ctx.dest.code,
        },
      });
      if (!route) {
        route = await manager.save(
          manager.create(Route, {
            originCode: ctx.origin.code,
            destCode: ctx.dest.code,
            durationMin: dto.durationMinutes,
            distanceKm: dto.distanceKm ?? null,
            distanceSource: dto.distanceSource ?? null,
          }),
        );
      } else if (dto.distanceKm != null) {
        route.distanceKm = dto.distanceKm;
        route.distanceSource = dto.distanceSource ?? 'MANUAL';
        route.durationMin = dto.durationMinutes;
        route = await manager.save(route);
      }

      let flight = await manager.findOne(Flight, {
        where: { flightNo: dto.flightNoBase },
      });
      if (!flight) {
        flight = await manager.save(
          manager.create(Flight, {
            flightNo: dto.flightNoBase,
            routeId: route.id,
            aircraftType: ctx.aircraft.code,
          }),
        );
      } else if (flight.routeId !== route.id) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message: 'شماره پرواز برای مسیر دیگری ثبت شده است.',
        });
      }

      const template = await manager.save(
        manager.create(FlightScheduleTemplate, {
          originAirportId: ctx.origin.id,
          destinationAirportId: ctx.dest.id,
          flightNoBase: dto.flightNoBase,
          aircraftDefinitionId: ctx.aircraft.id,
          departureTime: dto.departureTime,
          durationMinutes: dto.durationMinutes,
          distanceKm: dto.distanceKm ?? null,
          distanceSource: dto.distanceSource ?? null,
          startDate: dto.startDate,
          endDate: dto.endDate,
          weekdays: dto.weekdays,
          agencyPriceIrr: ctx.agency,
          legalCeilingIrr: ctx.legal,
          cabinCapacities: ctx.cabinDefinitions.map((row) => ({
            cabin: row.cabin,
            seats: row.seats,
            basePriceIrr: row.basePriceIrr.toString(),
            defaultClassCode: row.defaultClassCode,
          })),
          status: FlightScheduleTemplateStatus.ACTIVE,
          idempotencyKey: dto.idempotencyKey,
          createdByUserId: actor.id,
        }),
      );

      const rows = ctx.occurrences.map((o) => ({
        id: randomUUID(),
        flightId: flight.id,
        scheduleId: null,
        scheduleTemplateId: template.id,
        departureAt: o.departureAt,
        arrivalAt: o.arrivalAt,
        capacity: ctx.capacity,
        charterSeats: 0,
        status: FlightInstanceStatus.SCHEDULED,
        definitionStatus: FlightDefinitionStatus.DRAFT,
        publicSaleEnabled: false,
        durationMinutes: dto.durationMinutes,
        basePriceIrr: ctx.cabinDefinitions.reduce(
          (minimum, row) =>
            row.basePriceIrr < minimum ? row.basePriceIrr : minimum,
          ctx.cabinDefinitions[0].basePriceIrr,
        ),
        cabinCapacities: ctx.cabinDefinitions.map((row) => ({
          cabin: row.cabin,
          seats: row.seats,
          basePriceIrr: row.basePriceIrr.toString(),
          defaultClassCode: row.defaultClassCode,
        })),
        aircraftDefinitionId: ctx.aircraft.id,
        aircraftTypeOverride: ctx.aircraft.code,
      }));

      // No orIgnore: partial success must not look like a full create.
      // Loose typing avoids TS2589 on this entity graph.
      const insertRows: Array<Record<string, unknown>> = rows;
      await manager
        .createQueryBuilder()
        .insert()
        .into(FlightInstance)
        .values(insertRows)
        .execute();

      const fareRules = buildInitialFareRuleRows(
        rows.map((instance) => instance.id),
        ctx.cabinDefinitions,
        randomUUID,
      );
      await manager
        .createQueryBuilder()
        .insert()
        .into(FareRule)
        .values(fareRules)
        .execute();

      const inserted = await manager.count(FlightInstance, {
        where: { scheduleTemplateId: template.id },
      });
      if (inserted !== rows.length) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message: 'ایجاد نمونه‌های پرواز ناقص ماند؛ عملیات لغو شد.',
        });
      }

      return template.id;
    });

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'SYSTEM',
      action: 'ایجاد برنامه فصلی پرواز',
      detail: `برنامه ${dto.flightNoBase} با ${ctx.occurrences.length} پرواز ساخته شد.`,
      entityType: 'FlightScheduleTemplate',
      entityId: templateId,
      metadata: {
        occurrenceCount: ctx.occurrences.length,
        idempotencyKey: dto.idempotencyKey,
      },
    });

    return this.toView(templateId);
  }

  async list(page = 1, pageSize = 20) {
    const [rows, total] = await this.templateRepo.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      relations: {
        originAirport: true,
        destinationAirport: true,
        aircraftDefinition: true,
      },
    });
    return {
      items: rows.map((t) => this.serialize(t)),
      page,
      pageSize,
      total,
    };
  }

  async resolveActiveByFlightNo(rawFlightNo: string) {
    const flightNo = rawFlightNo.trim().toUpperCase();
    const template = await this.templateRepo.findOne({
      where: {
        flightNoBase: flightNo,
        status: FlightScheduleTemplateStatus.ACTIVE,
      },
      order: { updatedAt: 'DESC' },
      relations: {
        originAirport: true,
        destinationAirport: true,
        aircraftDefinition: true,
      },
    });
    if (!template) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'مسیر فعالی برای این شماره پرواز تعریف نشده است.',
      });
    }

    const occurrences = await this.instanceRepo
      .createQueryBuilder('fi')
      .where('fi.scheduleTemplateId = :templateId', { templateId: template.id })
      .andWhere('fi.departureAt >= :now', { now: new Date() })
      .andWhere('fi.status != :cancelled', {
        cancelled: FlightInstanceStatus.CANCELLED,
      })
      .orderBy('fi.departureAt', 'ASC')
      .getMany();
    const nextInstance = occurrences[0];

    return {
      ...this.serialize(template),
      nextFlightInstanceId: nextInstance?.id ?? null,
      nextDepartureAt: nextInstance?.departureAt.toISOString() ?? null,
      occurrences: occurrences.map((instance) => ({
        id: instance.id,
        departureAt: instance.departureAt.toISOString(),
        arrivalAt: instance.arrivalAt.toISOString(),
        definitionStatus: instance.definitionStatus,
        publicSaleEnabled: instance.publicSaleEnabled,
        version: instance.version,
      })),
    };
  }

  async get(id: string) {
    return this.toView(id);
  }

  /**
   * Future instances with bookings, charter/agency commitments, allotments,
   * active seat locks, or active price locks (financial) are never cancelled.
   */
  private async committedInstanceIds(
    manager: EntityManager,
    futureIds: string[],
  ): Promise<Set<string>> {
    const blocked = new Set<string>();
    if (futureIds.length === 0) return blocked;

    const sold = await manager.find(Booking, {
      where: {
        flightInstanceId: In(futureIds),
        status: In(['HELD', 'PAID', 'TICKETED']),
      },
      select: ['flightInstanceId'],
    });
    for (const b of sold) blocked.add(b.flightInstanceId);

    const charters = await manager.find(CharterCommitment, {
      where: {
        flightInstanceId: In(futureIds),
        status: CommitmentStatus.ACTIVE,
      },
      select: ['flightInstanceId'],
    });
    for (const c of charters) blocked.add(c.flightInstanceId);

    const agencySeats = await manager.find(AgencySeatCommitment, {
      where: {
        flightInstanceId: In(futureIds),
        status: CommitmentStatus.ACTIVE,
      },
      select: ['flightInstanceId'],
    });
    for (const c of agencySeats) blocked.add(c.flightInstanceId);

    const allotments = await manager
      .getRepository(AgencyAllotment)
      .createQueryBuilder('a')
      .select('a.flightInstanceId', 'flightInstanceId')
      .where('a.flightInstanceId IN (:...ids)', { ids: futureIds })
      .andWhere('a.seatsAllocated > 0')
      .andWhere('(a.releaseAt IS NULL OR a.releaseAt > NOW())')
      .getRawMany<{ flightInstanceId: string }>();
    for (const a of allotments) blocked.add(a.flightInstanceId);

    const locks = await manager
      .getRepository(SeatLock)
      .createQueryBuilder('s')
      .select('s.flightInstanceId', 'flightInstanceId')
      .where('s.flightInstanceId IN (:...ids)', { ids: futureIds })
      .andWhere('s.releasedAt IS NULL')
      .getRawMany<{ flightInstanceId: string }>();
    for (const s of locks) blocked.add(s.flightInstanceId);

    const priceLocks = await manager.find(PriceLock, {
      where: {
        flightInstanceId: In(futureIds),
        status: PriceLockStatus.ACTIVE,
      },
      select: ['flightInstanceId'],
    });
    for (const p of priceLocks) blocked.add(p.flightInstanceId);

    // Financial commitment via allotment contract price (active allotments).
    const pricedAllotments = await manager
      .getRepository(AgencyAllotment)
      .createQueryBuilder('a')
      .select('a.flightInstanceId', 'flightInstanceId')
      .where('a.flightInstanceId IN (:...ids)', { ids: futureIds })
      .andWhere('a.contractPriceIrr IS NOT NULL')
      .andWhere('a.seatsAllocated > 0')
      .andWhere('(a.releaseAt IS NULL OR a.releaseAt > NOW())')
      .getRawMany<{ flightInstanceId: string }>();
    for (const a of pricedAllotments) blocked.add(a.flightInstanceId);

    return blocked;
  }

  async deactivate(actor: AuthenticatedUser, id: string) {
    const template = await this.templateRepo.findOne({ where: { id } });
    if (!template) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'برنامه یافت نشد.',
      });
    }
    if (template.status === FlightScheduleTemplateStatus.DEACTIVATED) {
      return this.toView(id);
    }

    const now = new Date();
    await this.dataSource.transaction(async (manager) => {
      template.status = FlightScheduleTemplateStatus.DEACTIVATED;
      template.deactivatedAt = now;
      await manager.save(template);

      // Lock instances in id order so commitment/allotment creators
      // (who also take pessimistic_write on the same rows) serialize safely.
      const future = await manager
        .createQueryBuilder(FlightInstance, 'fi')
        .setLock('pessimistic_write')
        .where('fi.scheduleTemplateId = :id', { id })
        .andWhere('fi.status = :scheduled', {
          scheduled: FlightInstanceStatus.SCHEDULED,
        })
        .andWhere('fi.departureAt > :now', { now })
        .orderBy('fi.id', 'ASC')
        .getMany();
      const futureIds = future.map((fi) => fi.id);
      if (futureIds.length === 0) return;

      const blocked = await this.committedInstanceIds(manager, futureIds);
      const cancellable = futureIds.filter((fid) => !blocked.has(fid));
      if (cancellable.length > 0) {
        await manager
          .createQueryBuilder()
          .update(FlightInstance)
          .set({ status: FlightInstanceStatus.CANCELLED })
          .where('id IN (:...ids)', { ids: cancellable })
          .execute();
      }
    });

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'SYSTEM',
      action: 'غیرفعال‌سازی برنامه فصلی پرواز',
      detail: `برنامه ${template.flightNoBase} برای آینده غیرفعال شد (سوابق فروش و تعهدات حفظ شد).`,
      entityType: 'FlightScheduleTemplate',
      entityId: id,
    });

    return this.toView(id);
  }

  private async toView(id: string) {
    const t = await this.templateRepo.findOne({
      where: { id },
      relations: {
        originAirport: true,
        destinationAirport: true,
        aircraftDefinition: true,
      },
    });
    if (!t) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'برنامه یافت نشد.',
      });
    }
    const instanceCount = await this.instanceRepo.count({
      where: { scheduleTemplateId: id },
    });
    return { ...this.serialize(t), instanceCount };
  }

  private serialize(t: FlightScheduleTemplate) {
    const cabinCapacities = this.serializeCabinDefinitions(t);
    return {
      id: t.id,
      originAirportId: t.originAirportId,
      destinationAirportId: t.destinationAirportId,
      originCode: t.originAirport?.code,
      destCode: t.destinationAirport?.code,
      flightNoBase: t.flightNoBase,
      aircraftDefinitionId: t.aircraftDefinitionId,
      aircraftCode: t.aircraftDefinition?.code,
      departureTime: t.departureTime,
      durationMinutes: t.durationMinutes,
      distanceKm: t.distanceKm,
      distanceSource: t.distanceSource,
      startDate: t.startDate,
      endDate: t.endDate,
      weekdays: t.weekdays,
      agencyPriceIrr: t.agencyPriceIrr.toString(),
      legalCeilingIrr: t.legalCeilingIrr.toString(),
      cabinCapacities,
      capacity: cabinCapacities.reduce((sum, row) => sum + row.seats, 0),
      status: t.status,
      idempotencyKey: t.idempotencyKey,
      createdByUserId: t.createdByUserId,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
      deactivatedAt: t.deactivatedAt?.toISOString() ?? null,
    };
  }

  private serializeCabinDefinitions(t: FlightScheduleTemplate) {
    return Array.isArray(t.cabinCapacities)
      ? t.cabinCapacities.flatMap((value) => {
          if (
            value == null ||
            typeof value !== 'object' ||
            Array.isArray(value)
          ) {
            return [];
          }
          const cabin = value.cabin;
          const seats = value.seats;
          if (typeof cabin !== 'string' || typeof seats !== 'number') return [];
          const basePriceIrr =
            typeof value.basePriceIrr === 'string'
              ? value.basePriceIrr
              : t.agencyPriceIrr.toString();
          const defaultClassCode =
            typeof value.defaultClassCode === 'string'
              ? value.defaultClassCode
              : standardClassCode(cabin as CabinClass);
          return [{ cabin, seats, basePriceIrr, defaultClassCode }];
        })
      : [];
  }
}
