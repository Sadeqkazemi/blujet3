import { ConflictException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ErrorCode } from '../../common/errors';
import type { PayBookingDto } from './dto/pay-booking.dto';

export type PaymentRequestScope = {
  bookingId: string;
  userId: string;
  requestHash: string;
  idempotencyKey?: string;
};

/** Fixed-order, non-PII payment options; bigint confirmation stays a string. */
export function paymentRequestHash(
  bookingId: string,
  userId: string,
  options: PayBookingDto,
): string {
  return `v1:${createHash('sha256')
    .update(
      JSON.stringify({
        operation: 'booking-pay:v1',
        bookingId,
        userId,
        paymentMethod: options.paymentMethod ?? 'GATEWAY',
        promoCode: options.promoCode || null,
        confirmedPriceIrr: options.confirmedPriceIrr?.toString() ?? null,
      }),
    )
    .digest('hex')}`;
}

export function assertPaymentReplay(
  record: { bookingId: string; userId: string; requestHash: string | null },
  scope: PaymentRequestScope,
): void {
  if (record.bookingId !== scope.bookingId || record.userId !== scope.userId) {
    throw new ConflictException({
      code: ErrorCode.CONFLICT,
      message: 'کلید یکتایی پرداخت برای درخواست دیگری استفاده شده است.',
    });
  }
  if (!record.requestHash || record.requestHash !== scope.requestHash) {
    throw new ConflictException({
      code: ErrorCode.IDEMPOTENCY_PAYLOAD_MISMATCH,
      message:
        'اطلاعات پرداخت با کلید یکتایی تطابق ندارد؛ پرداخت قبلی را بررسی کنید.',
    });
  }
}
