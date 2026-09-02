import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import type { AuthenticatedUser } from '../types/authenticated-user';

function contextFor(user: AuthenticatedUser): ExecutionContext {
  return {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard super-admin boundary', () => {
  it('allows the owner through management-role endpoints', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['FINANCE_MANAGER']),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(
      guard.canActivate(
        contextFor({
          id: 'owner',
          role: 'SITE_ADMIN',
          fullName: 'Owner',
          isSuperAdmin: true,
        }),
      ),
    ).toBe(true);
  });

  it('never elevates the owner into USER or AGENCY tenant endpoints', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['USER']),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(() =>
      guard.canActivate(
        contextFor({
          id: 'owner',
          role: 'SITE_ADMIN',
          fullName: 'Owner',
          isSuperAdmin: true,
        }),
      ),
    ).toThrow(ForbiddenException);
  });
});
