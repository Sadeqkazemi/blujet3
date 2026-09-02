import { BadRequestException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { PromoCode } from '../../database/entities/promo-code.entity';
import { PromoRedemption } from '../../database/entities/promo-redemption.entity';
import { ErrorCode } from '../../common/errors';
import type { CabinClass } from '../../database/enums';
import {
  type Irr,
  ZERO_IRR,
  maxIrr,
  minIrr,
  pctOfIrr,
  subIrr,
} from '../../common/money';

/**
 * Validates + computes the discount for a promo code and records the
 * redemption — CLAUDE.md: "entered on the پرداخت page (NOT checkout)", with
 * "full audit of redemptions" via the unique-per-booking PromoRedemption
 * row. Must run inside BookingService.pay()'s transaction so a failed
 * payment never leaves an orphaned redemption.
 */
export async function applyPromoCode(
  manager: EntityManager,
  params: {
    code: string;
    userId: string;
    bookingId: string;
    originCode: string;
    destCode: string;
    cabin: CabinClass;
    priceIrr: Irr;
  },
): Promise<{ discountIrr: Irr; finalPriceIrr: Irr }> {
  const promo = await manager.findOneBy(PromoCode, { code: params.code });
  if (!promo || !promo.active) {
    throw new BadRequestException({
      code: ErrorCode.VALIDATION_FAILED,
      message: 'کد تخفیف نامعتبر است.',
    });
  }
  const now = new Date();
  if (promo.startsAt && promo.startsAt > now) {
    throw new BadRequestException({
      code: ErrorCode.VALIDATION_FAILED,
      message: 'این کد تخفیف هنوز فعال نشده است.',
    });
  }
  if (promo.endsAt && promo.endsAt < now) {
    throw new BadRequestException({
      code: ErrorCode.VALIDATION_FAILED,
      message: 'این کد تخفیف منقضی شده است.',
    });
  }
  if (promo.originCode && promo.originCode !== params.originCode) {
    throw new BadRequestException({
      code: ErrorCode.VALIDATION_FAILED,
      message: 'این کد تخفیف برای این مسیر معتبر نیست.',
    });
  }
  if (promo.destCode && promo.destCode !== params.destCode) {
    throw new BadRequestException({
      code: ErrorCode.VALIDATION_FAILED,
      message: 'این کد تخفیف برای این مسیر معتبر نیست.',
    });
  }
  if (promo.cabin && promo.cabin !== params.cabin) {
    throw new BadRequestException({
      code: ErrorCode.VALIDATION_FAILED,
      message: 'این کد تخفیف برای این کلاس پروازی معتبر نیست.',
    });
  }

  if (promo.maxRedemptions !== null) {
    const totalUses = await manager.count(PromoRedemption, {
      where: { promoCodeId: promo.id },
    });
    if (totalUses >= promo.maxRedemptions) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'ظرفیت استفاده از این کد تخفیف به پایان رسیده است.',
      });
    }
  }
  if (promo.maxPerUser !== null) {
    const userUses = await manager.count(PromoRedemption, {
      where: { promoCodeId: promo.id, userId: params.userId },
    });
    if (userUses >= promo.maxPerUser) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'شما قبلاً از این کد تخفیف استفاده کرده‌اید.',
      });
    }
  }

  const discountIrr =
    promo.type === 'PERCENT'
      ? pctOfIrr(params.priceIrr, Number(promo.value))
      : minIrr(promo.value, params.priceIrr);
  const finalPriceIrr = maxIrr(subIrr(params.priceIrr, discountIrr), ZERO_IRR);

  await manager.save(
    manager.create(PromoRedemption, {
      promoCodeId: promo.id,
      bookingId: params.bookingId,
      userId: params.userId,
      discountIrr,
    }),
  );

  return { discountIrr, finalPriceIrr };
}
