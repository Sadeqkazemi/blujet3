import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { ErrorCode } from '../../common/errors';
import {
  encryptPii,
  hashPii,
  isValidIranianNationalId,
  normalizeNationalId,
} from '../../common/pii-crypto';
import { CoreItineraryOrder } from '../../database/entities/core-itinerary-order.entity';
import { CoreItinerarySegment } from '../../database/entities/core-itinerary-segment.entity';
import { CoreItineraryTraveller } from '../../database/entities/core-itinerary-traveller.entity';
import { CoreItineraryTravellerSegment } from '../../database/entities/core-itinerary-traveller-segment.entity';
import { FlightInstance } from '../../database/entities/flight-instance.entity';
import { AgencyProfile } from '../../database/entities/agency-profile.entity';
import { User } from '../../database/entities/user.entity';
import type { BookingStatus } from '../../database/enums';
import { CoreItineraryQuoteService } from './core-itinerary-quote.service';
import { CoreItineraryHoldExpiryService } from './core-itinerary-hold-expiry.service';
import type {
  HeldCoreItineraryDto,
  HoldCoreItineraryDto,
} from './dto/hold-core-itinerary.dto';

const HOLD_TTL_MS = 15 * 60_000;

@Injectable()
export class CoreItineraryHoldService {
  constructor(
    @InjectRepository(CoreItineraryOrder)
    private readonly orderRepo: Repository<CoreItineraryOrder>,
    private readonly quotes: CoreItineraryQuoteService,
    private readonly expiry: CoreItineraryHoldExpiryService,
  ) {}

  async hold(
    dto: HoldCoreItineraryDto,
    idempotencyKey: string | undefined,
  ): Promise<HeldCoreItineraryDto> {
    const key = idempotencyKey?.trim();
    if (!key || key.length > 200) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'هدر Idempotency-Key معتبر الزامی است.',
      });
    }
    this.validateIdentities(dto);
    const requestHash = this.requestHash(dto);

    return this.orderRepo.manager.transaction(async (tx) => {
      // One replay key is serialized even when two retries reference different
      // flights. The advisory lock is transaction-scoped and stores no data.
      await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        key,
      ]);
      const replay = await tx
        .getRepository(CoreItineraryOrder)
        .createQueryBuilder('order')
        .addSelect('order.idempotencyRequestHash')
        .where('order.idempotencyKey = :key', { key })
        .getOne();
      if (replay) {
        this.assertReplay(replay, requestHash);
        return this.loadResponse(tx.getRepository(CoreItineraryOrder), replay);
      }

      await this.assertOwner(tx, dto);

      const flightIds = [
        ...new Set(dto.segments.map((segment) => segment.flightInstanceId)),
      ].sort();
      await tx
        .createQueryBuilder(FlightInstance, 'flight')
        .setLock('pessimistic_write')
        .where('flight.id IN (:...flightIds)', { flightIds })
        .orderBy('flight.id', 'ASC')
        .getMany();

      // Re-price after every affected flight row is locked. Existing
      // single-flight writers lock the same rows, so none can slip between
      // this availability check and the atomic inserts below.
      const quote = await this.quotes.quote(dto, tx);
      const expiry = new Date(Date.now() + HOLD_TTL_MS);
      const order = await tx.save(
        tx.create(CoreItineraryOrder, {
          pnr: this.generatePnr(),
          channel: dto.channel,
          ownerId: dto.ownerId,
          contactPhone: dto.contactPhone?.trim() || null,
          status: 'HELD',
          currency: 'IRR',
          fareIrr: BigInt(quote.fareIrr),
          taxIrr: BigInt(quote.taxIrr),
          extrasIrr: BigInt(quote.extrasIrr),
          totalIrr: BigInt(quote.totalIrr),
          holdExpiresAt: expiry,
          idempotencyKey: key,
          idempotencyRequestHash: requestHash,
        }),
      );
      const occupiedSeats = dto.travellers.filter(
        (traveller) => traveller.passengerType !== 'INFANT',
      ).length;
      const segments = await tx.save(
        quote.segments.map((segment) =>
          tx.create(CoreItinerarySegment, {
            orderId: order.id,
            sequence: segment.sequence,
            flightInstanceId: segment.flightInstanceId,
            flightNo: segment.flightNo,
            originCode: segment.originCode,
            destinationCode: segment.destinationCode,
            departureAt: segment.departureAt,
            arrivalAt: segment.arrivalAt,
            cabin: segment.cabin,
            fareClassCode: segment.fareClassCode,
            occupiedSeats,
            baggageAllowanceKg: segment.baggageAllowanceKg,
            fareIrr: BigInt(segment.fareIrr),
            taxIrr: BigInt(segment.taxIrr),
            extrasIrr: BigInt(segment.extrasIrr),
            totalIrr: BigInt(segment.totalIrr),
            extrasSnapshot: segment.extras,
          }),
        ),
      );
      const travellers = await tx.save(
        dto.travellers.map((traveller, index) => {
          const nationalId = traveller.nationalId
            ? normalizeNationalId(traveller.nationalId)
            : null;
          return tx.create(CoreItineraryTraveller, {
            orderId: order.id,
            sequence: index + 1,
            fullName: traveller.fullName.trim(),
            passengerType: traveller.passengerType,
            birthDate: traveller.birthDate,
            nationalIdEnc: nationalId ? encryptPii(nationalId) : null,
            nationalIdHash: nationalId ? hashPii(nationalId) : null,
            passportNoEnc: traveller.passportNo?.trim()
              ? encryptPii(traveller.passportNo.trim().toUpperCase())
              : null,
            mobileEnc: traveller.mobile?.trim()
              ? encryptPii(traveller.mobile.trim())
              : null,
            gender: traveller.gender ?? null,
          });
        }),
      );
      await tx.save(
        segments.flatMap((segment, segmentIndex) =>
          travellers.map((traveller, travellerIndex) => {
            const price =
              quote.segments[segmentIndex].travellers[travellerIndex];
            return tx.create(CoreItineraryTravellerSegment, {
              travellerId: traveller.id,
              segmentId: segment.id,
              occupiesSeat:
                dto.travellers[travellerIndex].passengerType !== 'INFANT',
              fareIrr: BigInt(price.fareIrr),
              taxIrr: BigInt(price.taxIrr),
            });
          }),
        ),
      );

      return this.toResponse(order, segments);
    });
  }

  private validateIdentities(dto: HoldCoreItineraryDto): void {
    for (const traveller of dto.travellers) {
      if (
        traveller.nationalId &&
        !isValidIranianNationalId(traveller.nationalId)
      ) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_FAILED,
          message: `کد ملی «${traveller.fullName}» معتبر نیست.`,
        });
      }
    }
  }

  private async assertOwner(
    manager: EntityManager,
    dto: HoldCoreItineraryDto,
  ): Promise<void> {
    const owner = await manager.getRepository(User).findOne({
      where: { id: dto.ownerId, isActive: true, deletedAt: IsNull() },
      select: { id: true, role: true },
    });
    const validCustomer = dto.channel === 'SYSTEM' && owner?.role === 'USER';
    if (validCustomer) return;
    if (dto.channel === 'AGENCY' && owner?.role === 'AGENCY') {
      const agency = await manager.getRepository(AgencyProfile).findOne({
        where: { userId: owner.id, suspendedAt: IsNull() },
        select: { userId: true },
      });
      if (agency) return;
    }
    throw new BadRequestException({
      code: ErrorCode.VALIDATION_FAILED,
      message: 'مالک فعال رزرو با کانال فروش مطابقت ندارد.',
    });
  }

  /** Canonical replay digest; plaintext PII is never stored. */
  private requestHash(dto: HoldCoreItineraryDto): string {
    const payload = {
      operation: 'core-itinerary-hold:v1',
      ownerId: dto.ownerId,
      channel: dto.channel,
      contactPhone: dto.contactPhone?.trim() || null,
      segments: [...dto.segments]
        .sort((left, right) => left.sequence - right.sequence)
        .map((segment) => ({
          flightInstanceId: segment.flightInstanceId,
          sequence: segment.sequence,
          cabin: segment.cabin,
          fareClassCode: segment.fareClassCode ?? null,
          extras: [...(segment.extras ?? [])].sort((left, right) =>
            left.id.localeCompare(right.id),
          ),
        })),
      travellers: dto.travellers.map((traveller) => ({
        fullName: traveller.fullName.trim(),
        passengerType: traveller.passengerType,
        birthDate: traveller.birthDate,
        nationalId: traveller.nationalId
          ? normalizeNationalId(traveller.nationalId)
          : null,
        passportNo: traveller.passportNo?.trim().toUpperCase() || null,
        gender: traveller.gender ?? null,
        mobile: traveller.mobile?.trim() || null,
      })),
    };
    return `v1:${hashPii(JSON.stringify(payload))}`;
  }

  private assertReplay(order: CoreItineraryOrder, requestHash: string): void {
    if (order.idempotencyRequestHash !== requestHash) {
      throw new ConflictException({
        code: ErrorCode.IDEMPOTENCY_PAYLOAD_MISMATCH,
        message: 'کلید تکرار برای درخواست دیگری استفاده شده است.',
      });
    }
  }

  private async loadResponse(
    repo: Repository<CoreItineraryOrder>,
    order: CoreItineraryOrder,
  ): Promise<HeldCoreItineraryDto> {
    let status: BookingStatus = order.status;
    if (status === 'HELD' && order.holdExpiresAt <= new Date()) {
      if (
        await this.expiry.expireWithinTransaction(
          repo.manager,
          order,
          new Date(),
        )
      ) {
        status = 'EXPIRED';
        order.status = status;
      }
    }
    const segments = await repo.manager
      .getRepository(CoreItinerarySegment)
      .find({
        where: { orderId: order.id },
        order: { sequence: 'ASC' },
      });
    return this.toResponse(order, segments);
  }

  private toResponse(
    order: CoreItineraryOrder,
    segments: CoreItinerarySegment[],
  ): HeldCoreItineraryDto {
    return {
      id: order.id,
      pnr: order.pnr,
      status: order.status,
      currency: 'IRR',
      holdExpiresAt: order.holdExpiresAt.toISOString(),
      segments: segments.map((segment) => ({
        sequence: segment.sequence,
        flightInstanceId: segment.flightInstanceId,
        cabin: segment.cabin,
        fareClassCode: segment.fareClassCode,
        occupiedSeats: segment.occupiedSeats,
        totalIrr: String(segment.totalIrr),
      })),
      totalIrr: String(order.totalIrr),
    };
  }

  private generatePnr(): string {
    return `BJ${randomBytes(4).toString('hex').toUpperCase()}`;
  }
}
