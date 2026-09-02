import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthenticatedUser } from '../types/authenticated-user';
import { ErrorCode } from '../errors';

const SUPER_ADMIN_MANAGEMENT_ROLES: AuthenticatedUser['role'][] = [
  'EMPLOYEE',
  'IT_MANAGER',
  'COMMERCIAL_MANAGER',
  'FINANCE_MANAGER',
  'SENIOR_MANAGER',
  'CEO',
  'BOARD_CHAIR',
  'SITE_ADMIN',
];

/**
 * Enforces @Roles(...) server-side. Panel tab visibility is also computed
 * server-side (see panels/nav) — this guard is the backstop that makes
 * hiding a UI element meaningless as a bypass, per CLAUDE.md's
 * "never by hiding UI alone" rule.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<
      AuthenticatedUser['role'][]
    >(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    const user = request.user;
    if (
      user?.isSuperAdmin &&
      requiredRoles.some((role) => SUPER_ADMIN_MANAGEMENT_ROLES.includes(role))
    ) {
      return true;
    }
    if (!user || !requiredRoles.includes(user.role)) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'دسترسی به این بخش برای شما مجاز نیست.',
      });
    }
    return true;
  }
}
