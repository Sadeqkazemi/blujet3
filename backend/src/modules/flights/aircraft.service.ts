import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AircraftCabin } from '../../database/entities/aircraft-cabin.entity';
import { AircraftDefinition } from '../../database/entities/aircraft-definition.entity';
import { AircraftSeat } from '../../database/entities/aircraft-seat.entity';
import { AircraftSeatMap } from '../../database/entities/aircraft-seat-map.entity';
import { AircraftStatus } from '../../database/enums';
import { ErrorCode } from '../../common/errors';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AuditService } from '../audit/audit.service';
import {
  countSeatsByCabin,
  enumerateSeats,
  type AircraftSeatMapLike,
} from '../reservation/seat-layout';
import type { UpsertAircraftDto } from './dto/aircraft.dto';
import { resolveAircraftCabinCapacities } from './aircraft-capacity.util';
import {
  findDuplicateClassCode,
  standardClassCode,
} from './aircraft-class-code';

@Injectable()
export class AircraftService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(AircraftDefinition)
    private readonly aircraftRepo: Repository<AircraftDefinition>,
    @InjectRepository(AircraftCabin)
    private readonly cabinRepo: Repository<AircraftCabin>,
    @InjectRepository(AircraftSeat)
    private readonly seatRepo: Repository<AircraftSeat>,
    @InjectRepository(AircraftSeatMap)
    private readonly seatMapRepo: Repository<AircraftSeatMap>,
    private readonly audit: AuditService,
  ) {}

  /** Which side of the aisle a column sits on for a given cabin's band. A
   * column absent from BOTH the left/right arrays (shouldn't happen for a
   * seat enumerateSeats() actually produced) defaults to LEFT rather than
   * throwing — non-fatal, cosmetic-only field. */
  private sideForColumn(
    dto: UpsertAircraftDto,
    cabin: 'BUSINESS' | 'COMFORT' | 'ECONOMY' | 'FIRST',
    column: string,
  ): 'LEFT' | 'RIGHT' {
    const colsRight =
      cabin === 'BUSINESS'
        ? dto.businessColsRight
        : cabin === 'COMFORT'
          ? dto.comfortColsRight
          : cabin === 'FIRST'
            ? dto.firstColsRight
            : dto.economyColsRight;
    if (colsRight?.includes(column)) return 'RIGHT';
    return 'LEFT';
  }

  private toSeatMapLike(dto: UpsertAircraftDto): AircraftSeatMapLike {
    return {
      businessRowStart: dto.businessRowStart,
      businessRowEnd: dto.businessRowEnd,
      businessColsLeft: dto.businessColsLeft ?? null,
      businessColsRight: dto.businessColsRight ?? null,
      comfortRowStart: dto.comfortRowStart ?? null,
      comfortRowEnd: dto.comfortRowEnd ?? null,
      comfortColsLeft: dto.comfortColsLeft ?? null,
      comfortColsRight: dto.comfortColsRight ?? null,
      firstRowStart: dto.firstRowStart ?? null,
      firstRowEnd: dto.firstRowEnd ?? null,
      firstColsLeft: dto.firstColsLeft ?? null,
      firstColsRight: dto.firstColsRight ?? null,
      economyRowStart: dto.economyRowStart,
      economyRowEnd: dto.economyRowEnd,
      economyColsLeft: dto.economyColsLeft ?? null,
      economyColsRight: dto.economyColsRight ?? null,
      excludedSeatCodes: dto.excludedSeatCodes ?? [],
      exitRows: dto.exitRows ?? [],
    };
  }

  async list() {
    const aircraft = await this.aircraftRepo
      .createQueryBuilder('a')
      .orderBy('a.code', 'ASC')
      .getMany();
    const cabins = await this.cabinRepo.createQueryBuilder('c').getMany();
    const cabinsByAircraft = new Map<string, AircraftCabin[]>();
    for (const cabin of cabins) {
      const list = cabinsByAircraft.get(cabin.aircraftDefinitionId) ?? [];
      list.push(cabin);
      cabinsByAircraft.set(cabin.aircraftDefinitionId, list);
    }
    return aircraft.map((a) => ({
      id: a.id,
      code: a.code,
      model: a.model,
      title: a.title,
      status: a.status,
      totalCapacity: a.totalCapacity,
      version: a.version,
      cabins: (cabinsByAircraft.get(a.id) ?? []).map((c) => ({
        cabinType: c.cabinType,
        capacity: c.capacity,
        defaultClassCode: c.defaultClassCode,
      })),
    }));
  }

  private async loadOrThrow(id: string): Promise<AircraftDefinition> {
    const aircraft = await this.aircraftRepo
      .createQueryBuilder('a')
      .where('a.id = :id', { id })
      .getOne();
    if (!aircraft) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'هواپیما یافت نشد.',
      });
    }
    return aircraft;
  }

  async detail(id: string) {
    const aircraft = await this.loadOrThrow(id);
    const cabins = await this.cabinRepo.find({
      where: { aircraftDefinitionId: id },
      order: { cabinType: 'ASC' },
    });
    const seats = await this.seatRepo.find({
      where: { aircraftDefinitionId: id },
      order: { row: 'ASC', column: 'ASC' },
    });
    return {
      id: aircraft.id,
      code: aircraft.code,
      model: aircraft.model,
      title: aircraft.title,
      status: aircraft.status,
      totalCapacity: aircraft.totalCapacity,
      version: aircraft.version,
      cabins: cabins.map((c) => ({
        cabinType: c.cabinType,
        capacity: c.capacity,
        defaultClassCode: c.defaultClassCode,
      })),
      seats: seats.map((s) => ({
        row: s.row,
        column: s.column,
        label: s.label,
        cabinType: s.cabinType,
        side: s.side,
        isBlocked: s.isBlocked,
      })),
      seatMap: await this.seatMap(id),
    };
  }

  /** Row/column band layout (colsLeft/colsRight/aisle position per cabin) —
   * a static template derived from the linked AircraftSeatMap row, not tied
   * to any specific flight instance (no TAKEN/FREE seat status here; that
   * only exists once an instance/booking context is known — see
   * SearchService.seatMap for the per-flight equivalent). */
  async seatMap(id: string) {
    await this.loadOrThrow(id);
    const map = await this.seatMapRepo.findOneBy({ aircraftDefinitionId: id });
    if (!map) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'نقشه صندلی برای این هواپیما تعریف نشده است.',
      });
    }
    const seats = await this.seatRepo.find({
      where: { aircraftDefinitionId: id },
      order: { row: 'ASC', column: 'ASC' },
    });
    return {
      aircraftDefinitionId: id,
      cabinLayout: {
        FIRST: map.firstColsLeft
          ? {
              colsLeft: map.firstColsLeft,
              colsRight: map.firstColsRight,
              aisleAfterIndex: map.firstColsLeft?.length ?? 0,
            }
          : null,
        BUSINESS: {
          colsLeft: map.businessColsLeft,
          colsRight: map.businessColsRight,
          aisleAfterIndex: map.businessColsLeft?.length ?? 0,
        },
        COMFORT: map.comfortColsLeft
          ? {
              colsLeft: map.comfortColsLeft,
              colsRight: map.comfortColsRight,
              aisleAfterIndex: map.comfortColsLeft?.length ?? 0,
            }
          : null,
        ECONOMY: {
          colsLeft: map.economyColsLeft,
          colsRight: map.economyColsRight,
          aisleAfterIndex: map.economyColsLeft?.length ?? 0,
        },
      },
      excludedSeatCodes: map.excludedSeatCodes ?? [],
      exitRows: map.exitRows ?? [],
      seats: seats.map((s) => ({
        row: s.row,
        column: s.column,
        label: s.label,
        cabinType: s.cabinType,
        side: s.side,
        isBlocked: s.isBlocked,
      })),
    };
  }

  /** Shared create/update validation + apply — persists AircraftDefinition,
   * AircraftCabin, AircraftSeat, and a matching AircraftSeatMap row (so the
   * existing search/seatmap/booking code paths, which are unchanged in
   * this task, work for a newly-defined aircraft immediately). */
  private async upsert(
    actor: AuthenticatedUser,
    dto: UpsertAircraftDto,
    existing: AircraftDefinition | null,
  ) {
    const seatMapLike = this.toSeatMapLike(dto);
    const seats = enumerateSeats(seatMapLike);
    const cabinCounts = countSeatsByCabin(seatMapLike);
    const physicalTotal = Object.values(cabinCounts).reduce((a, b) => a + b, 0);

    if (physicalTotal === 0) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'حداقل یک کابین باید حداقل یک صندلی داشته باشد.',
      });
    }
    const configuredCabins = resolveAircraftCabinCapacities(
      dto.cabinCapacities,
      cabinCounts,
      dto.totalCapacity,
    );
    const defaultClassCodes = new Map(
      configuredCabins.map(({ cabinType }) => [
        cabinType,
        dto.cabinCapacities
          ?.find((row) => row.cabinType === cabinType)
          ?.defaultClassCode?.trim()
          .toUpperCase() ?? standardClassCode(cabinType),
      ]),
    );
    const duplicateClassCode = findDuplicateClassCode(
      defaultClassCodes.values(),
    );
    if (duplicateClassCode) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: `کلاس نرخی ${duplicateClassCode} برای بیش از یک کابین تعریف شده است.`,
      });
    }
    // enumerateSeats() already guarantees unique seatCode-per-cabin-band
    // combination within one call, but a seat could theoretically collide
    // across two overlapping bands (bad input) — check explicitly so the
    // error is a clean 400, not a DB unique-constraint 500.
    const labels = new Set<string>();
    for (const seat of seats) {
      if (labels.has(seat.seatCode)) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_FAILED,
          message: `شماره صندلی ${seat.seatCode} تکراری است.`,
        });
      }
      labels.add(seat.seatCode);
    }

    const codeClash = await this.aircraftRepo
      .createQueryBuilder('a')
      .where('a.code = :code', { code: dto.code })
      .andWhere(existing ? 'a.id != :id' : '1=1', { id: existing?.id })
      .getOne();
    if (codeClash) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'این کد هواپیما قبلاً ثبت شده است.',
      });
    }

    const now = new Date();
    const aircraftId = await this.dataSource.transaction(async (manager) => {
      let aircraft: AircraftDefinition;
      if (existing) {
        existing.code = dto.code;
        existing.model = dto.model;
        existing.title = dto.title;
        existing.status = dto.status ?? existing.status;
        existing.totalCapacity = dto.totalCapacity;
        existing.version += 1;
        existing.updatedById = actor.id;
        existing.updatedAt = now;
        aircraft = await manager.save(existing);
      } else {
        aircraft = await manager.save(
          manager.create(AircraftDefinition, {
            code: dto.code,
            model: dto.model,
            title: dto.title,
            status: dto.status ?? AircraftStatus.ACTIVE,
            totalCapacity: dto.totalCapacity,
            version: 1,
            createdById: actor.id,
            createdAt: now,
            updatedById: actor.id,
            updatedAt: now,
          }),
        );
      }

      await manager.delete(AircraftCabin, {
        aircraftDefinitionId: aircraft.id,
      });
      await manager.save(
        configuredCabins.map(({ cabinType, capacity }) =>
          manager.create(AircraftCabin, {
            aircraftDefinitionId: aircraft.id,
            cabinType,
            capacity,
            defaultClassCode: defaultClassCodes.get(cabinType),
            createdAt: now,
            updatedAt: now,
          }),
        ),
      );

      await manager.delete(AircraftSeat, { aircraftDefinitionId: aircraft.id });
      await manager.save(
        seats.map((seat) => {
          const column = seat.seatCode.slice(String(seat.row).length);
          return manager.create(AircraftSeat, {
            aircraftDefinitionId: aircraft.id,
            row: seat.row,
            column,
            label: seat.seatCode,
            cabinType: seat.cabin,
            side: this.sideForColumn(dto, seat.cabin, column),
            isBlocked: false,
            createdAt: now,
            updatedAt: now,
          });
        }),
      );

      const existingSeatMap = await manager.findOneBy(AircraftSeatMap, {
        aircraftType: dto.code,
      });
      const seatMapPayload = {
        aircraftType: dto.code,
        businessRowStart: dto.businessRowStart,
        businessRowEnd: dto.businessRowEnd,
        businessColsLeft: dto.businessColsLeft ?? null,
        businessColsRight: dto.businessColsRight ?? null,
        comfortRowStart: dto.comfortRowStart ?? null,
        comfortRowEnd: dto.comfortRowEnd ?? null,
        comfortColsLeft: dto.comfortColsLeft ?? null,
        comfortColsRight: dto.comfortColsRight ?? null,
        firstRowStart: dto.firstRowStart ?? null,
        firstRowEnd: dto.firstRowEnd ?? null,
        firstColsLeft: dto.firstColsLeft ?? null,
        firstColsRight: dto.firstColsRight ?? null,
        economyRowStart: dto.economyRowStart,
        economyRowEnd: dto.economyRowEnd,
        economyColsLeft: dto.economyColsLeft ?? null,
        economyColsRight: dto.economyColsRight ?? null,
        excludedSeatCodes: dto.excludedSeatCodes ?? [],
        exitRows: dto.exitRows ?? existingSeatMap?.exitRows ?? [],
        aircraftDefinitionId: aircraft.id,
        updatedAt: now,
      };
      if (existingSeatMap) {
        await manager.update(
          AircraftSeatMap,
          { id: existingSeatMap.id },
          seatMapPayload,
        );
      } else {
        await manager.save(manager.create(AircraftSeatMap, seatMapPayload));
      }

      return aircraft.id;
    });

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'SYSTEM',
      action: existing ? 'ویرایش تعریف هواپیما' : 'افزودن تعریف هواپیما',
      detail: `هواپیمای ${dto.code} (${dto.title}) توسط ${actor.fullName} ${
        existing ? 'ویرایش' : 'ایجاد'
      } شد.`,
      entityType: 'AircraftDefinition',
      entityId: aircraftId,
      metadata: { code: dto.code, totalCapacity: dto.totalCapacity },
    });

    return this.detail(aircraftId);
  }

  async create(actor: AuthenticatedUser, dto: UpsertAircraftDto) {
    return this.upsert(actor, dto, null);
  }

  async update(actor: AuthenticatedUser, id: string, dto: UpsertAircraftDto) {
    const existing = await this.loadOrThrow(id);
    return this.upsert(actor, dto, existing);
  }
}
