import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from '../../database/enums';
import { ErrorCode } from '../errors';
import { SKIP_MUST_CHANGE_PASSWORD } from '../decorators/skip-must-change-password.decorator';
import type { AuthenticatedUser } from '../types/authenticated-user';
import { User } from '../../database/entities/user.entity';
import { AgencyProfile } from '../../database/entities/agency-profile.entity';

const PASSWORD_CHANGE_ROLES: Role[] = [
  'EMPLOYEE',
  'IT_MANAGER',
  'COMMERCIAL_MANAGER',
  'OPERATIONS_MANAGER',
  'FINANCE_MANAGER',
  'SENIOR_MANAGER',
  'CEO',
  'BOARD_CHAIR',
  'SITE_ADMIN',
  'AGENCY',
];

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(AgencyProfile)
    private readonly agencyProfileRepo: Repository<AgencyProfile>,
  ) {
    super();
  }

  override async canActivate(context: ExecutionContext): Promise<boolean> {
    const activated = await super.canActivate(context);
    if (!activated) return false;

    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) return true;

    // Access revocation: a JWT access token stays cryptographically valid
    // until it expires, so blocking/suspending an account must be checked
    // against LIVE account state on every request, not just at
    // login/refresh — otherwise a still-valid token keeps working for up
    // to the token's remaining lifetime after an admin revokes access.
    // Every authenticated role is checked (manager/employee/agency/
    // customer alike). Super-admin accounts are exempt by product design
    // (they can't be blocked via the normal admin flow).
    const row = await this.userRepo.findOne({
      where: { id: user.id },
      select: { isActive: true, mustChangePassword: true },
    });
    if (!row || (!row.isActive && !user.isSuperAdmin)) {
      throw new ForbiddenException({
        code: ErrorCode.ACCESS_REVOKED,
        message: 'دسترسی شما لغو شده است. لطفاً دوباره وارد شوید.',
      });
    }

    if (user.role === 'AGENCY') {
      const profile = await this.agencyProfileRepo.findOne({
        where: { userId: user.id },
        select: { suspendedAt: true },
      });
      if (profile?.suspendedAt) {
        throw new ForbiddenException({
          code: ErrorCode.ACCESS_REVOKED,
          message: 'دسترسی آژانس شما تعلیق شده است.',
        });
      }
    }

    const skip = this.reflector.getAllAndOverride<boolean>(
      SKIP_MUST_CHANGE_PASSWORD,
      [context.getHandler(), context.getClass()],
    );
    if (
      !skip &&
      PASSWORD_CHANGE_ROLES.includes(user.role) &&
      row.mustChangePassword
    ) {
      throw new ForbiddenException({
        code: 'PASSWORD_CHANGE_REQUIRED',
        message: 'قبل از ادامه باید رمز عبور خود را تغییر دهید.',
      });
    }

    return true;
  }
}
