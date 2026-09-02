import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { InternalAuthGuard } from './internal-auth.guard';

function context(token?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers: { 'x-internal-token': token } }),
    }),
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
  } as unknown as ExecutionContext;
}

describe('InternalAuthGuard', () => {
  const expected = 'test-pss-internal-token-at-least-32-characters';
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };
  const config = { getOrThrow: jest.fn().mockReturnValue(expected) };
  const guard = new InternalAuthGuard(
    reflector as unknown as Reflector,
    config as unknown as ConfigService,
  );

  it('rejects missing and incorrect credentials', () => {
    expect(() => guard.canActivate(context())).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(context('wrong'))).toThrow(
      UnauthorizedException,
    );
  });

  it('accepts the exact internal credential', () => {
    expect(guard.canActivate(context(expected))).toBe(true);
  });

  it('allows explicitly public endpoints', () => {
    reflector.getAllAndOverride.mockReturnValueOnce(true);
    expect(guard.canActivate(context())).toBe(true);
  });
});
