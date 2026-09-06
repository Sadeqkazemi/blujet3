import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { InternalAuthGuard } from './internal-auth.guard';

describe('agency internal service identity', () => {
  const token = 'fixture-agency-token-at-least-32-characters';
  const getOrThrow = jest.fn();
  const guard = new InternalAuthGuard({
    getOrThrow,
  } as unknown as ConfigService);
  function context(supplied?: string | string[], handler = () => undefined) {
    return {
      getHandler: () => handler,
      getClass: () => class ProtectedController {},
      switchToHttp: () => ({
        getRequest: () => ({
          headers: { 'x-internal-token': supplied },
        }),
      }),
    } as unknown as ExecutionContext;
  }
  beforeEach(() => {
    getOrThrow.mockReset().mockReturnValue(token);
  });
  it('accepts only its configured service token', () => {
    expect(guard.canActivate(context(token))).toBe(true);
    expect(getOrThrow).toHaveBeenCalledWith('AGENCY_INTERNAL_TOKEN');
  });
  it.each([undefined, '', 'wrong', 'fixture-other-service-token', [token]])(
    'rejects missing, incorrect or ambiguous credentials (%#)',
    (supplied) => {
      expect(() => guard.canActivate(context(supplied))).toThrow(
        UnauthorizedException,
      );
    },
  );
  it('rejects the old token after configured token replacement', () => {
    getOrThrow.mockReturnValue(
      'fixture-replacement-token-at-least-32-characters',
    );
    expect(() => guard.canActivate(context(token))).toThrow(
      UnauthorizedException,
    );
    expect(
      guard.canActivate(
        context('fixture-replacement-token-at-least-32-characters'),
      ),
    ).toBe(true);
  });
  it('fails closed if service configuration is unavailable', () => {
    getOrThrow.mockImplementation(() => {
      throw new Error('fixture configuration unavailable');
    });
    expect(() => guard.canActivate(context(token))).toThrow(
      'fixture configuration unavailable',
    );
  });
});
