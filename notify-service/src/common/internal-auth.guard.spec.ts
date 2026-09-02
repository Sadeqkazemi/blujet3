import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Reflector } from '@nestjs/core';
import { InternalAuthGuard } from './internal-auth.guard';

describe('InternalAuthGuard', () => {
  const token = 'test-notify-internal-token-at-least-32-characters';

  function setup(supplied?: string, isPublic = false) {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(isPublic),
    };
    const config = { getOrThrow: jest.fn().mockReturnValue(token) };
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          headers: supplied ? { 'x-internal-token': supplied } : {},
        }),
      }),
    };
    return {
      context: context as unknown as ExecutionContext,
      guard: new InternalAuthGuard(
        reflector as unknown as Reflector,
        config as unknown as ConfigService,
      ),
    };
  }

  it('accepts the configured internal token', () => {
    const { guard, context } = setup(token);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects a missing or incorrect internal token', () => {
    expect(() => setup().guard.canActivate(setup().context)).toThrow(
      UnauthorizedException,
    );
    const wrong = setup('wrong-token');
    expect(() => wrong.guard.canActivate(wrong.context)).toThrow(
      UnauthorizedException,
    );
  });

  it('allows explicitly public health endpoints', () => {
    const { guard, context } = setup(undefined, true);
    expect(guard.canActivate(context)).toBe(true);
  });
});
