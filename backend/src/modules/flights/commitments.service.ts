import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AgencySeatCommitment } from '../../database/entities/agency-seat-commitment.entity';
import { AgencyProfile } from '../../database/entities/agency-profile.entity';
import { Booking } from '../../database/entities/booking.entity';
import { CharterCommitment } from '../../database/entities/charter-commitment.entity';
import { FlightInstance } from '../../database/entities/flight-instance.entity';
import { LedgerEntry } from '../../database/entities/ledger-entry.entity';
import { AircraftSeatMap } from '../../database/entities/aircraft-seat-map.entity';
import {
  CabinClass,
  CommitmentStatus,
  FlightInstanceStatus,
} from '../../database/enums';
import { ErrorCode } from '../../common/errors';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { serializeCabinCapacities } from './flight-definition.util';
import { resolveAircraftType } from './aircraft-type.util';
import { sumActiveCommittedSeats } from './commitment-capacity.util';
import { countSeatsByCabin } from '../reservation/seat-layout';
import type { CreateCommitmentDto } from './dto/commitment.dto';

const HELD_STATUSES = ['DRAFT', 'HELD', 'PAID', 'TICKETED'] as const;

@Injectable()
export class CommitmentsService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(FlightInstance)
    private readonly instanceRepo: Repository<FlightInstance>,
    @InjectRepository(CharterCommitment)
    private readonly charterRepo: Repository<CharterCommitment>,
    @InjectRepository(AgencySeatCommitment)
    private readonly agencyCommitmentRepo: Repository<AgencySeatCommitment>,
    @InjectRepository(AgencyProfile)
    private readonly agencyProfileRepo: Repository<AgencyProfile>,
    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,
    @InjectRepository(AircraftSeatMap)
    private readonly seatMapRepo: Repository<AircraftSeatMap>,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  private async loadInstanceOrThrow(id: string): Promise<FlightInstance> {
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
    return instance;
  }

  private cabinCapacity(instance: FlightInstance, cabin: CabinClass): number {
    const rows = serializeCabinCapacities(instance.cabinCapacities);
    return rows.find((r) => r.cabin === cabin)?.seats ?? 0;
  }

  private validatePeriod(
    instance: FlightInstance,
    startDate?: string,
    releaseAt?: string,
  ): { startDate: Date | null; releaseAt: Date | null } {
    const start = startDate ? new Date(startDate) : null;
    const end = releaseAt ? new Date(releaseAt) : null;
    if (start && Number.isNaN(start.getTime())) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'شروع بازه تعهد نامعتبر است.',
      });
    }
    if (end && Number.isNaN(end.getTime())) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'پایان بازه تعهد نامعتبر است.',
      });
    }
    if (start && end && end < start) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'پایان بازه تعهد نمی‌تواند قبل از شروع آن باشد.',
      });
    }
    // The commitment must not outlive the flight it's committing seats on.
    if (end && end > instance.departureAt) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'بازه تعهد باید داخل بازه پرواز (تا زمان پرواز) باشد.',
      });
    }
    if (start && start > instance.departureAt) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'بازه تعهد باید داخل بازه پرواز (تا زمان پرواز) باشد.',
      });
    }
    return { startDate: start, releaseAt: end };
  }

  /** Real seats already sold/held for a cabin — needs the physical seat
   * map (search/booking already lock per-seat via this same mechanism). */
  private async soldCountForCabin(
    instance: FlightInstance,
    cabin: CabinClass,
  ): Promise<number> {
    const map = await this.seatMapRepo.findOneBy({
      aircraftType: resolveAircraftType(instance),
    });
    if (!map) return 0;
    // Cabin-level sold count is approximated via bookings' declared cabin —
    // exact seat-level accounting happens in booking.service.ts's own
    // row-locked checks; this count is for the capacity-summary display.
    return this.bookingRepo
      .createQueryBuilder('b')
      .where('b.flightInstanceId = :id', { id: instance.id })
      .andWhere('b.cabin = :cabin', { cabin })
      .andWhere('b.status IN (:...statuses)', { statuses: HELD_STATUSES })
      .getCount();
  }

  /** Sum of ACTIVE charter + agency commitments for one cabin — the number
   * SearchService/BookingService must subtract from physical seatsLeft so
   * online sale never dips into committed capacity. */
  async committedSeatsForCabin(
    flightInstanceId: string,
    cabin: CabinClass,
  ): Promise<number> {
    return sumActiveCommittedSeats(
      this.charterRepo.manager,
      flightInstanceId,
      cabin,
    );
  }

  async listForInstance(instanceId: string) {
    await this.loadInstanceOrThrow(instanceId);
    const [charter, agency] = await Promise.all([
      this.charterRepo.find({
        where: { flightInstanceId: instanceId },
        order: { createdAt: 'DESC' },
      }),
      this.agencyCommitmentRepo.find({
        where: { flightInstanceId: instanceId },
        order: { createdAt: 'DESC' },
      }),
    ]);
    const agencyIds = [...new Set(agency.map((a) => a.agencyId))];
    const profiles = agencyIds.length
      ? await this.agencyProfileRepo
          .createQueryBuilder('p')
          .where('p.userId IN (:...ids)', { ids: agencyIds })
          .getMany()
      : [];
    const profileById = new Map(profiles.map((p) => [p.userId, p]));

    return {
      charter: charter.map((c) => ({ ...c, type: 'CHARTER' as const })),
      agency: agency.map((a) => ({
        ...a,
        type: 'AGENCY' as const,
        agencyName: profileById.get(a.agencyId)?.managerName ?? null,
        agencyLicenseNo: profileById.get(a.agencyId)?.licenseNo ?? null,
      })),
    };
  }

  /** «فهرست آژانس‌های متعهد و خلاصه ظرفیت»: per-cabin totalCapacity /
   * charterCommitted / agencyCommitted / sold / availableOnline, plus an
   * instance-wide aggregate row. */
  async capacitySummary(instanceId: string) {
    const instance = await this.loadInstanceOrThrow(instanceId);
    const cabins = serializeCabinCapacities(instance.cabinCapacities);

    const perCabin = await Promise.all(
      cabins.map(async (row) => {
        const [charterSum, agencySum] = await Promise.all([
          this.charterRepo
            .createQueryBuilder('c')
            .select('COALESCE(SUM(c.seats), 0)', 'sum')
            .where('c.flightInstanceId = :id', { id: instanceId })
            .andWhere('c.cabin = :cabin', { cabin: row.cabin })
            .andWhere('c.status = :status', {
              status: CommitmentStatus.ACTIVE,
            })
            .getRawOne<{ sum: string }>(),
          this.agencyCommitmentRepo
            .createQueryBuilder('a')
            .select('COALESCE(SUM(a.seats), 0)', 'sum')
            .where('a.flightInstanceId = :id', { id: instanceId })
            .andWhere('a.cabin = :cabin', { cabin: row.cabin })
            .andWhere('a.status = :status', {
              status: CommitmentStatus.ACTIVE,
            })
            .getRawOne<{ sum: string }>(),
        ]);
        const charterCommitted = Number(charterSum?.sum ?? 0);
        const agencyCommitted = Number(agencySum?.sum ?? 0);
        const sold = await this.soldCountForCabin(instance, row.cabin);
        const totalCapacity = row.seats;
        const availableOnline = Math.max(
          0,
          totalCapacity - charterCommitted - agencyCommitted - sold,
        );
        return {
          cabin: row.cabin,
          totalCapacity,
          charterCommitted,
          agencyCommitted,
          sold,
          availableOnline,
        };
      }),
    );

    const aggregate = perCabin.reduce(
      (acc, c) => ({
        totalCapacity: acc.totalCapacity + c.totalCapacity,
        charterCommitted: acc.charterCommitted + c.charterCommitted,
        agencyCommitted: acc.agencyCommitted + c.agencyCommitted,
        sold: acc.sold + c.sold,
        availableOnline: acc.availableOnline + c.availableOnline,
      }),
      {
        totalCapacity: 0,
        charterCommitted: 0,
        agencyCommitted: 0,
        sold: 0,
        availableOnline: 0,
      },
    );

    return { cabins: perCabin, ...aggregate };
  }

  private async assertCapacity(
    manager: DataSource['manager'],
    instance: FlightInstance,
    cabin: CabinClass,
    seats: number,
    excludeCommitmentId?: string,
  ): Promise<void> {
    const capacity = this.cabinCapacity(instance, cabin);
    if (capacity <= 0) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: `کابین ${cabin} برای این پرواز تعریف نشده است.`,
      });
    }
    if (seats > capacity) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: `تعداد صندلی درخواستی (${seats}) از ظرفیت کابین ${cabin} (${capacity}) بیشتر است.`,
      });
    }

    const charterSumQ = manager
      .createQueryBuilder(CharterCommitment, 'c')
      .select('COALESCE(SUM(c.seats), 0)', 'sum')
      .where('c."flightInstanceId" = :id', { id: instance.id })
      .andWhere('c.cabin = :cabin', { cabin })
      .andWhere('c.status = :status', { status: CommitmentStatus.ACTIVE });
    if (excludeCommitmentId) {
      charterSumQ.andWhere('c.id != :excludeId', {
        excludeId: excludeCommitmentId,
      });
    }
    const agencySumQ = manager
      .createQueryBuilder(AgencySeatCommitment, 'a')
      .select('COALESCE(SUM(a.seats), 0)', 'sum')
      .where('a."flightInstanceId" = :id', { id: instance.id })
      .andWhere('a.cabin = :cabin', { cabin })
      .andWhere('a.status = :status', { status: CommitmentStatus.ACTIVE });
    if (excludeCommitmentId) {
      agencySumQ.andWhere('a.id != :excludeId', {
        excludeId: excludeCommitmentId,
      });
    }
    const [charterSum, agencySum] = await Promise.all([
      charterSumQ.getRawOne<{ sum: string }>(),
      agencySumQ.getRawOne<{ sum: string }>(),
    ]);
    const committed =
      Number(charterSum?.sum ?? 0) + Number(agencySum?.sum ?? 0);

    // Seats already sold/held (real passengers, not just other
    // commitments) also eat into the same cabin — without this a
    // commitment could be created on top of already-sold inventory,
    // overbooking the cabin the moment both sides are counted together.
    const sold = await this.soldCountForCabin(instance, cabin);

    // The physical seat map is the hard ceiling too — a commitment can
    // never exceed real seats even if cabinCapacities were configured
    // higher than the aircraft's actual layout for that cabin.
    const map = await this.seatMapRepo.findOneBy({
      aircraftType: resolveAircraftType(instance),
    });
    const physical = map ? countSeatsByCabin(map)[cabin] : capacity;

    const projected = committed + sold + seats;
    if (projected > capacity || projected > physical) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: `مجموع تعهدات و صندلی‌های فروخته‌شده (${projected}) از ظرفیت کابین ${cabin} تجاوز می‌کند.`,
      });
    }
  }

  /** POST /flights/:instanceId/commitments — the single, canonical creation
   * endpoint: `dto.agencyId` present -> agency commitment, absent -> charter
   * commitment. `releaseAt` wins over `endDate` when both are sent. */
  async create(
    actor: AuthenticatedUser,
    instanceId: string,
    dto: CreateCommitmentDto,
  ) {
    const releaseAt = dto.releaseAt ?? dto.endDate;
    if (dto.agencyId) {
      return this.createAgency(actor, instanceId, dto.agencyId, {
        cabin: dto.cabin,
        seats: dto.seats,
        contractPriceIrr: dto.contractPriceIrr,
        startDate: dto.startDate,
        releaseAt,
        idempotencyKey: dto.idempotencyKey,
      });
    }
    return this.createCharter(actor, instanceId, {
      cabin: dto.cabin,
      seats: dto.seats,
      contractPriceIrr: dto.contractPriceIrr,
      startDate: dto.startDate,
      releaseAt,
      idempotencyKey: dto.idempotencyKey,
    });
  }

  private async createCharter(
    actor: AuthenticatedUser,
    instanceId: string,
    dto: {
      cabin: CabinClass;
      seats: number;
      contractPriceIrr: bigint;
      startDate?: string;
      releaseAt?: string;
      idempotencyKey?: string;
    },
  ) {
    if (dto.idempotencyKey) {
      const existing = await this.charterRepo.findOneBy({
        idempotencyKey: dto.idempotencyKey,
      });
      if (existing) return { ...existing, type: 'CHARTER' as const };
    }
    const instance = await this.loadInstanceOrThrow(instanceId);
    const { startDate, releaseAt } = this.validatePeriod(
      instance,
      dto.startDate,
      dto.releaseAt,
    );

    const created = await this.dataSource.transaction(async (manager) => {
      // Shared lock with schedule-template deactivate — prevents creating a
      // commitment while the instance is being cancelled (and vice versa).
      const locked = await manager
        .createQueryBuilder(FlightInstance, 'fi')
        .setLock('pessimistic_write')
        .where('fi.id = :id', { id: instanceId })
        .getOne();
      if (!locked || locked.status === FlightInstanceStatus.CANCELLED) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message: 'پرواز لغو شده و قابل تعهد نیست.',
        });
      }

      // The row lock targets FlightInstance only; reuse the already-loaded required flight relation.
      locked.flight = instance.flight;
      await this.assertCapacity(manager, locked, dto.cabin, dto.seats);

      const entity = await manager.save(
        manager.create(CharterCommitment, {
          flightInstanceId: instanceId,
          cabin: dto.cabin,
          seats: dto.seats,
          contractPriceIrr: dto.contractPriceIrr,
          startDate,
          releaseAt,
          status: CommitmentStatus.ACTIVE,
          idempotencyKey: dto.idempotencyKey ?? null,
          createdById: actor.id,
          createdAt: new Date(),
        }),
      );

      await manager.save(
        manager.create(LedgerEntry, {
          type: 'COMMITMENT',
          signedAmountIrr: dto.contractPriceIrr,
          createdById: actor.id,
        }),
      );

      return entity;
    });

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'FINANCE',
      action: 'ثبت تعهد صندلی چارتر',
      detail: `تعهد ${dto.seats} صندلی کابین ${dto.cabin} برای پرواز توسط ${actor.fullName} ثبت شد.`,
      entityType: 'CharterCommitment',
      entityId: created.id,
      metadata: {
        cabin: dto.cabin,
        seats: dto.seats,
        contractPriceIrr: String(dto.contractPriceIrr),
      },
    });

    return { ...created, type: 'CHARTER' as const };
  }

  private async createAgency(
    actor: AuthenticatedUser,
    instanceId: string,
    agencyId: string,
    dto: {
      cabin: CabinClass;
      seats: number;
      contractPriceIrr: bigint;
      startDate?: string;
      releaseAt?: string;
      idempotencyKey?: string;
    },
  ) {
    if (dto.idempotencyKey) {
      const existing = await this.agencyCommitmentRepo.findOneBy({
        idempotencyKey: dto.idempotencyKey,
      });
      if (existing) return { ...existing, type: 'AGENCY' as const };
    }
    const agency = await this.agencyProfileRepo.findOneBy({
      userId: agencyId,
    });
    if (!agency) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'آژانس یافت نشد.',
      });
    }
    const instance = await this.loadInstanceOrThrow(instanceId);
    const { startDate, releaseAt } = this.validatePeriod(
      instance,
      dto.startDate,
      dto.releaseAt,
    );

    const created = await this.dataSource.transaction(async (manager) => {
      const locked = await manager
        .createQueryBuilder(FlightInstance, 'fi')
        .setLock('pessimistic_write')
        .where('fi.id = :id', { id: instanceId })
        .getOne();
      if (!locked || locked.status === FlightInstanceStatus.CANCELLED) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message: 'پرواز لغو شده و قابل تعهد نیست.',
        });
      }

      // The row lock targets FlightInstance only; reuse the already-loaded required flight relation.
      locked.flight = instance.flight;
      await this.assertCapacity(manager, locked, dto.cabin, dto.seats);

      const entity = await manager.save(
        manager.create(AgencySeatCommitment, {
          flightInstanceId: instanceId,
          agencyId,
          cabin: dto.cabin,
          seats: dto.seats,
          contractPriceIrr: dto.contractPriceIrr,
          startDate,
          releaseAt,
          status: CommitmentStatus.ACTIVE,
          idempotencyKey: dto.idempotencyKey ?? null,
          createdById: actor.id,
          createdAt: new Date(),
        }),
      );

      await manager.save(
        manager.create(LedgerEntry, {
          type: 'COMMITMENT',
          signedAmountIrr: dto.contractPriceIrr,
          createdById: actor.id,
          agencyId,
        }),
      );

      return entity;
    });

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'FINANCE',
      action: 'ثبت تعهد صندلی آژانس',
      detail: `تعهد ${dto.seats} صندلی کابین ${dto.cabin} برای آژانس ${agency.managerName} توسط ${actor.fullName} ثبت شد.`,
      entityType: 'AgencySeatCommitment',
      entityId: created.id,
      metadata: {
        agencyId,
        cabin: dto.cabin,
        seats: dto.seats,
        contractPriceIrr: String(dto.contractPriceIrr),
      },
    });

    await this.notifications.notify({
      recipientId: agencyId,
      category: 'APPROVAL',
      action: 'CREATED',
      title: 'تعهد صندلی جدید برای آژانس شما ثبت شد',
      body: `${dto.seats} صندلی کابین ${dto.cabin} برای یک پرواز به نام آژانس شما تعهد شد.`,
      entityType: 'AgencySeatCommitment',
      entityId: created.id,
      dedupeKey: `AgencySeatCommitment:${created.id}:CREATED`,
    });

    return { ...created, type: 'AGENCY' as const };
  }

  /** DELETE /flights/:instanceId/commitments/:id — the caller doesn't know
   * (and shouldn't need to know) whether `id` is a charter or an agency
   * commitment; try charter first, then agency. */
  async cancel(actor: AuthenticatedUser, instanceId: string, id: string) {
    const charter = await this.charterRepo
      .createQueryBuilder('c')
      .where('c.id = :id', { id })
      .andWhere('c.flightInstanceId = :instanceId', { instanceId })
      .getOne();
    if (charter) {
      return this.cancelCharter(actor, id, charter);
    }
    const agency = await this.agencyCommitmentRepo
      .createQueryBuilder('a')
      .where('a.id = :id', { id })
      .andWhere('a.flightInstanceId = :instanceId', { instanceId })
      .getOne();
    if (agency) {
      return this.cancelAgency(actor, id, agency);
    }
    throw new NotFoundException({
      code: ErrorCode.NOT_FOUND,
      message: 'تعهد یافت نشد.',
    });
  }

  private async cancelCharter(
    actor: AuthenticatedUser,
    id: string,
    existing: CharterCommitment,
  ) {
    if (existing.status === CommitmentStatus.CANCELLED) {
      // Idempotent: cancelling an already-cancelled commitment is a no-op.
      return { ...existing, type: 'CHARTER' as const };
    }

    const now = new Date();
    const updateResult = await this.charterRepo
      .createQueryBuilder()
      .update(CharterCommitment)
      .set({
        status: CommitmentStatus.CANCELLED,
        cancelledById: actor.id,
        cancelledAt: now,
      })
      .where('id = :id', { id })
      .andWhere('status = :status', { status: CommitmentStatus.ACTIVE })
      .execute();

    if ((updateResult.affected ?? 0) > 0) {
      await this.audit.record({
        actorId: actor.id,
        actorRole: actor.role,
        category: 'FINANCE',
        action: 'لغو تعهد چارتر',
        detail: `تعهد چارتر توسط ${actor.fullName} لغو شد.`,
        entityType: 'CharterCommitment',
        entityId: id,
      });
    }

    const reloaded = await this.charterRepo
      .createQueryBuilder('c')
      .where('c.id = :id', { id })
      .getOneOrFail();
    return { ...reloaded, type: 'CHARTER' as const };
  }

  private async cancelAgency(
    actor: AuthenticatedUser,
    id: string,
    existing: AgencySeatCommitment,
  ) {
    if (existing.status === CommitmentStatus.CANCELLED) {
      // Idempotent: cancelling an already-cancelled commitment is a no-op.
      return { ...existing, type: 'AGENCY' as const };
    }

    const now = new Date();
    const updateResult = await this.agencyCommitmentRepo
      .createQueryBuilder()
      .update(AgencySeatCommitment)
      .set({
        status: CommitmentStatus.CANCELLED,
        cancelledById: actor.id,
        cancelledAt: now,
      })
      .where('id = :id', { id })
      .andWhere('status = :status', { status: CommitmentStatus.ACTIVE })
      .execute();

    if ((updateResult.affected ?? 0) > 0) {
      await this.audit.record({
        actorId: actor.id,
        actorRole: actor.role,
        category: 'FINANCE',
        action: 'لغو تعهد آژانس',
        detail: `تعهد آژانس توسط ${actor.fullName} لغو شد.`,
        entityType: 'AgencySeatCommitment',
        entityId: id,
      });
      await this.notifications.notify({
        recipientId: existing.agencyId,
        category: 'SYSTEM',
        action: 'DELETED',
        title: 'تعهد صندلی آژانس شما لغو شد',
        body: `تعهد ${existing.seats} صندلی کابین ${existing.cabin} برای آژانس شما لغو شد.`,
        entityType: 'AgencySeatCommitment',
        entityId: id,
        dedupeKey: `AgencySeatCommitment:${id}:CANCELLED`,
      });
    }

    const reloaded = await this.agencyCommitmentRepo
      .createQueryBuilder('a')
      .where('a.id = :id', { id })
      .getOneOrFail();
    return { ...reloaded, type: 'AGENCY' as const };
  }
}
