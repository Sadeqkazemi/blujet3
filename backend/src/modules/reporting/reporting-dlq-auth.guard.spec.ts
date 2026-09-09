import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { ReportingDlqAuthGuard } from './reporting-dlq-auth.guard';

describe('ReportingDlqAuthGuard', () => {
  const token = 'reporting-operator-token-at-least-32-characters';
  const context = (supplied?: string) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          headers: supplied ? { 'x-internal-token': supplied } : {},
        }),
      }),
    }) as ExecutionContext;

  it('accepts the independently configured operator token', () => {
    const guard = new ReportingDlqAuthGuard({
      enabled: true,
      maxAttempts: 3,
      operatorToken: token,
    });
    expect(guard.canActivate(context(token))).toBe(true);
  });

  it.each([undefined, 'wrong-token'])(
    'rejects an absent or invalid token without exposing it',
    (supplied) => {
      const guard = new ReportingDlqAuthGuard({
        enabled: true,
        maxAttempts: 3,
        operatorToken: token,
      });
      expect(() => guard.canActivate(context(supplied))).toThrow(
        UnauthorizedException,
      );
    },
  );

  it('keeps the operator API unavailable while quarantine is disabled', () => {
    const guard = new ReportingDlqAuthGuard({ enabled: false });
    expect(() => guard.canActivate(context(token))).toThrow(
      UnauthorizedException,
    );
  });
});
