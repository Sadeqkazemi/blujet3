import type { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InventoryInternalAuthGuard } from './inventory-internal-auth.guard';

function context(token?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: token ? { 'x-internal-token': token } : {},
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('InventoryInternalAuthGuard', () => {
  const expected = 'inventory-internal-token-2026-09-09';
  const guard = new InventoryInternalAuthGuard(
    new ConfigService({ INVENTORY_INTERNAL_TOKEN: expected }),
  );

  it('accepts only the configured token', () => {
    expect(guard.canActivate(context(expected))).toBe(true);
  });

  it('rejects missing and incorrect tokens', () => {
    expect(() => guard.canActivate(context())).toThrow(
      'احراز هویت سرویس داخلی نامعتبر است.',
    );
    expect(() => guard.canActivate(context('wrong'))).toThrow(
      'احراز هویت سرویس داخلی نامعتبر است.',
    );
  });
});
