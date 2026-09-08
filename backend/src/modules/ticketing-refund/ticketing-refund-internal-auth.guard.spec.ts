import type { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TicketingRefundInternalAuthGuard } from './ticketing-refund-internal-auth.guard';

function context(token?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: token ? { 'x-internal-token': token } : {},
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('TicketingRefundInternalAuthGuard', () => {
  const expected = 'ticketing-refund-internal-token-2026-09-08';
  const guard = new TicketingRefundInternalAuthGuard(
    new ConfigService({ TICKETING_REFUND_INTERNAL_TOKEN: expected }),
  );

  it('accepts only the configured service token', () => {
    expect(guard.canActivate(context(expected))).toBe(true);
  });

  it('rejects missing and incorrect tokens without leaking details', () => {
    expect(() => guard.canActivate(context())).toThrow(
      'احراز هویت سرویس داخلی نامعتبر است.',
    );
    expect(() => guard.canActivate(context('wrong'))).toThrow(
      'احراز هویت سرویس داخلی نامعتبر است.',
    );
  });
});
