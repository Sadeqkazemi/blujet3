import { ConflictException } from '@nestjs/common';
import { assertPaymentReplay, paymentRequestHash } from './payment-request';

describe('payment request binding', () => {
  it('normalizes defaults and property order without losing bigint precision', () => {
    expect(paymentRequestHash('booking', 'user', {})).toBe(
      paymentRequestHash('booking', 'user', {
        paymentMethod: 'GATEWAY',
        promoCode: '',
      }),
    );
    const price = 9007199254740993n;
    expect(
      paymentRequestHash('booking', 'user', {
        confirmedPriceIrr: price,
        promoCode: 'CODE',
      }),
    ).toBe(
      paymentRequestHash('booking', 'user', {
        promoCode: 'CODE',
        confirmedPriceIrr: price,
      }),
    );
    expect(
      paymentRequestHash('booking', 'user', { confirmedPriceIrr: price }),
    ).not.toBe(
      paymentRequestHash('booking', 'user', { confirmedPriceIrr: price - 1n }),
    );
    expect(
      paymentRequestHash('booking', 'user', { confirmedPriceIrr: 0n }),
    ).not.toBe(paymentRequestHash('booking', 'user', {}));
  });

  it.each([
    { paymentMethod: 'WALLET' as const },
    { paymentMethod: 'POINTS' as const },
    { promoCode: 'OTHER' },
    { confirmedPriceIrr: 10n },
  ])('detects changed options %#', (options) => {
    expect(paymentRequestHash('booking', 'user', options)).not.toBe(
      paymentRequestHash('booking', 'user', {}),
    );
  });

  it('checks ownership before fingerprint and rejects legacy fingerprints', () => {
    const scope = {
      bookingId: 'booking',
      userId: 'user',
      requestHash: paymentRequestHash('booking', 'user', {}),
    };
    expect(() => assertPaymentReplay(scope, scope)).not.toThrow();
    for (const record of [
      { ...scope, userId: 'another' },
      { ...scope, bookingId: 'another' },
      { ...scope, requestHash: null },
      { ...scope, requestHash: 'different' },
    ]) {
      expect(() => assertPaymentReplay(record, scope)).toThrow(
        ConflictException,
      );
    }
  });
});
