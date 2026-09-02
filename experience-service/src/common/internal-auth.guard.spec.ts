import type { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { InternalAuthGuard } from './internal-auth.guard';

describe('InternalAuthGuard', () => {
  const token = 'x'.repeat(32);

  function context(supplied?: string): ExecutionContext {
    return {
      getHandler: () => function handler() {},
      getClass: () => class Controller {},
      switchToHttp: () => ({
        getRequest: () => ({
          headers: supplied ? { 'x-internal-token': supplied } : {},
        }),
      }),
    } as unknown as ExecutionContext;
  }

  function guard(isPublic = false): InternalAuthGuard {
    return new InternalAuthGuard(
      {
        getAllAndOverride: jest.fn().mockReturnValue(isPublic),
      } as unknown as Reflector,
      {
        getOrThrow: jest.fn().mockReturnValue(token),
      } as unknown as ConfigService,
    );
  }

  it('accepts the matching service token', () => {
    expect(guard().canActivate(context(token))).toBe(true);
  });

  it('rejects missing or wrong service identity', () => {
    expect(() => guard().canActivate(context())).toThrow();
    expect(() => guard().canActivate(context('wrong'))).toThrow();
  });

  it('allows explicitly public health endpoints', () => {
    expect(guard(true).canActivate(context())).toBe(true);
  });
});
