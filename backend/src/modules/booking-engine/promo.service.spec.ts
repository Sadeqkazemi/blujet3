import { BadRequestException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { CabinClass } from '../../database/enums';
import { PromoCode } from '../../database/entities/promo-code.entity';
import { applyPromoCode, quotePromoCode } from './promo.service';

describe('payment promo preflight', () => {
  const params = {
    code: 'CODE',
    userId: 'user',
    bookingId: 'booking',
    originCode: 'THR',
    destCode: 'KIH',
    cabin: CabinClass.ECONOMY,
    priceIrr: 1000n,
  };
  function setup(fields: Partial<PromoCode> = {}) {
    const promo = Object.assign(
      new PromoCode(),
      {
        id: 'promo',
        code: 'CODE',
        type: 'FIXED',
        value: 100n,
        active: true,
        originCode: null,
        destCode: null,
        cabin: null,
        startsAt: null,
        endsAt: null,
        maxRedemptions: null,
        maxPerUser: null,
      },
      fields,
    );
    const findOne = jest.fn().mockResolvedValue(promo);
    const count = jest.fn().mockResolvedValue(0);
    const save = jest.fn().mockResolvedValue({});
    const create = jest.fn((_entity: unknown, input: unknown) => input);
    const manager = {
      findOne,
      count,
      save,
      create,
    } as unknown as EntityManager;
    return { manager, findOne, count, save };
  }

  it('quotes without consuming redemption and caps fixed discounts at zero', async () => {
    const { manager, save } = setup({ value: 2000n });
    expect(await quotePromoCode(manager, params)).toEqual({
      promoCodeId: 'promo',
      discountIrr: 1000n,
      finalPriceIrr: 0n,
    });
    expect(
      await quotePromoCode(manager, { ...params, priceIrr: 0n }),
    ).toMatchObject({ discountIrr: 0n, finalPriceIrr: 0n });
    expect(save).not.toHaveBeenCalled();
  });

  it('preserves amounts beyond JS safe integers and rounds percentages in integer IRR', async () => {
    const { manager } = setup({ type: 'PERCENT', value: 10n });
    expect(
      await quotePromoCode(manager, { ...params, priceIrr: 9007199254740993n }),
    ).toMatchObject({
      discountIrr: 900719925474099n,
      finalPriceIrr: 8106479329266894n,
    });
    expect(
      await quotePromoCode(manager, { ...params, priceIrr: 15n }),
    ).toMatchObject({ discountIrr: 2n, finalPriceIrr: 13n });
  });

  it('locks promo capacity only on redemption, then writes once', async () => {
    const { manager, findOne, save } = setup();
    expect(await applyPromoCode(manager, params)).toEqual({
      discountIrr: 100n,
      finalPriceIrr: 900n,
    });
    expect(findOne).toHaveBeenCalledWith(PromoCode, {
      where: { code: 'CODE' },
      lock: { mode: 'pessimistic_write' },
    });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it.each<Partial<PromoCode>>([
    { active: false },
    { endsAt: new Date(0) },
    { startsAt: new Date('2099-01-01') },
    { originCode: 'OTHER' },
    { destCode: 'OTHER' },
    { cabin: CabinClass.BUSINESS },
    { maxRedemptions: 0 },
    { maxPerUser: 0 },
  ])('rejects unavailable promotion %j without redemption', async (fields) => {
    const { manager, save } = setup(fields);
    await expect(quotePromoCode(manager, params)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(save).not.toHaveBeenCalled();
  });
});
