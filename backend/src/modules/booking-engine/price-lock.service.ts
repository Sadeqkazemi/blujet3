import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThan, Repository } from 'typeorm';
import { PriceLock } from '../../database/entities/price-lock.entity';
import { FlightInstance } from '../../database/entities/flight-instance.entity';
import { ClubMember } from '../../database/entities/club-member.entity';
import { ErrorCode } from '../../common/errors';
import { getCabinPrice } from './pricing';
import { pctOfIrr, roundIrrTo } from '../../common/money';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import type { CabinClass } from '../../database/enums';
import { assertSellableForSale } from '../flights/definition-sellability';
import { WalletService } from './wallet.service';

const LOCK_TTL_MS = 72 * 60 * 60 * 1000;
/** Flat, NestJS-computed fee — CLAUDE.md: "fee/risk suggested by the ML
 * service but authorized and computed by NestJS." The AI-suggested variable
 * fee is deferred (see PLAN.md Phase 13); this is a documented flat rate. */
const LOCK_FEE_PCT = 3;
const GOLD_TIER_LEVELS = ['GOLD', 'PLATINUM'] as const;

@Injectable()
export class PriceLockService {
  constructor(
    @InjectRepository(PriceLock)
    private readonly priceLockRepo: Repository<PriceLock>,
    @InjectRepository(FlightInstance)
    private readonly flightInstanceRepo: Repository<FlightInstance>,
    @InjectRepository(ClubMember)
    private readonly clubMemberRepo: Repository<ClubMember>,
    private readonly wallet: WalletService,
  ) {}

  async create(
    user: AuthenticatedUser,
    dto: { flightInstanceId: string; cabin: CabinClass },
  ) {
    const member = await this.clubMemberRepo.findOneBy({
      userId: user.id,
      deactivatedAt: IsNull(),
    });
    if (
      !member ||
      !GOLD_TIER_LEVELS.includes(
        member.level as (typeof GOLD_TIER_LEVELS)[number],
      )
    ) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message:
          'قفل قیمت هوشمند فقط برای اعضای طلایی و بالاتر باشگاه مشتریان است.',
      });
    }

    const instance = await this.flightInstanceRepo
      .createQueryBuilder('fi')
      .where('fi.id = :id', { id: dto.flightInstanceId })
      .getOne();
    if (!instance || instance.status !== 'SCHEDULED') {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'پرواز یافت نشد یا دیگر قابل رزرو نیست.',
      });
    }
    assertSellableForSale(instance);

    const existing = await this.priceLockRepo.findOneBy({
      userId: user.id,
      flightInstanceId: dto.flightInstanceId,
      cabin: dto.cabin,
      status: 'ACTIVE',
      expiresAt: MoreThan(new Date()),
    });
    if (existing) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'شما قبلاً برای این پرواز و کلاس، قیمت را قفل کرده‌اید.',
      });
    }

    const priceIrr = await getCabinPrice(
      this.priceLockRepo.manager,
      dto.flightInstanceId,
      dto.cabin,
    );
    const feeIrr = roundIrrTo(pctOfIrr(priceIrr, LOCK_FEE_PCT), 10_000n);

    return this.priceLockRepo.manager.transaction(async (tx) => {
      await this.wallet.charge(tx, user.id, feeIrr, null);
      return tx.save(
        tx.create(PriceLock, {
          userId: user.id,
          flightInstanceId: dto.flightInstanceId,
          cabin: dto.cabin,
          lockedPriceIrr: priceIrr,
          feeIrr,
          feeCharged: true,
          expiresAt: new Date(Date.now() + LOCK_TTL_MS),
        }),
      );
    });
  }

  async listMine(user: AuthenticatedUser) {
    const locks = await this.priceLockRepo
      .createQueryBuilder('l')
      .leftJoinAndSelect('l.flightInstance', 'flightInstance')
      .leftJoinAndSelect('flightInstance.flight', 'flight')
      .leftJoinAndSelect('flight.route', 'route')
      .where('l.userId = :userId', { userId: user.id })
      .orderBy('l.createdAt', 'DESC')
      .getMany();
    return locks.map((l) => ({
      id: l.id,
      flightInstanceId: l.flightInstanceId,
      cabin: l.cabin,
      lockedPriceIrr: l.lockedPriceIrr,
      feeIrr: l.feeIrr,
      status: l.status,
      expiresAt: l.expiresAt,
      createdAt: l.createdAt,
      bookingId: l.bookingId,
      flight: {
        flightNo: l.flightInstance.flight.flightNo,
        originCode: l.flightInstance.flight.route.originCode,
        destCode: l.flightInstance.flight.route.destCode,
        departureAt: l.flightInstance.departureAt,
      },
    }));
  }

  async cancel(user: AuthenticatedUser, id: string) {
    const lock = await this.priceLockRepo.findOneBy({ id });
    if (!lock || lock.userId !== user.id) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'قفل قیمت یافت نشد.',
      });
    }
    if (lock.status !== 'ACTIVE') {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'این قفل قیمت دیگر فعال نیست.',
      });
    }
    return this.priceLockRepo.manager.transaction(async (tx) => {
      if (lock.feeCharged && lock.feeIrr > 0n) {
        await this.wallet.credit(tx, user.id, lock.feeIrr, null);
      }
      lock.status = 'CANCELLED';
      return tx.save(lock);
    });
  }

  /** Finds an active, non-expired, not-yet-consumed lock for this exact
   * user/flight/cabin — used by BookingService.createBooking to price the
   * new HELD booking at the locked rate instead of the live rate. */
  async findUsableLock(
    userId: string,
    flightInstanceId: string,
    cabin: CabinClass,
  ) {
    return this.priceLockRepo.findOneBy({
      userId,
      flightInstanceId,
      cabin,
      status: 'ACTIVE',
      expiresAt: MoreThan(new Date()),
      bookingId: IsNull(),
    });
  }
}
