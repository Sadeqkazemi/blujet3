import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmployeePermission } from '../../database/entities/employee-permission.entity';
import { User } from '../../database/entities/user.entity';
import { REQUIRES_PERMISSION_KEY } from '../decorators/requires-permission.decorator';
import { AuthenticatedUser } from '../types/authenticated-user';
import { ErrorCode } from '../errors';
import { grantsSatisfyingEmployeePermission } from '../employee-permission-dependencies';
import { catalogDeptFor } from '../../modules/it-manager/permission-catalog';

/**
 * Fine-grained backstop for the shared EMPLOYEE grant on @Roles(...): a
 * method that lists 'EMPLOYEE' alongside its usual manager roles is only
 * actually reachable by an EMPLOYEE who holds one of the @RequiresPermission
 * keys declared on that same handler (granted via IT_MANAGER's permission
 * catalog — see EmployeePermission). Every other role passes straight
 * through unaffected; a handler with no @RequiresPermission also passes
 * through (RolesGuard already fully gates it).
 */
@Injectable()
export class EmployeePermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(EmployeePermission)
    private readonly employeePermissionRepo: Repository<EmployeePermission>,
    // Optional keeps isolated unit tests that instantiate the guard directly
    // backwards-compatible; Nest supplies this repository in production.
    @InjectRepository(User)
    private readonly userRepo?: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user || user.role !== 'EMPLOYEE') return true;

    const keys = this.reflector.getAllAndOverride<string[] | undefined>(
      REQUIRES_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!keys || keys.length === 0) return true;

    const acceptedKeys = [
      ...new Set(keys.flatMap(grantsSatisfyingEmployeePermission)),
    ];

    // Permission keys such as `sv_view` intentionally exist in more than one
    // department. Scope the lookup to the employee's catalog department so an
    // IT grant cannot be replayed against a commercial endpoint (or vice
    // versa), even when the caller bypasses the panel navigation.
    const employee = await this.userRepo?.findOne({
      where: { id: user.id },
      select: { dept: true },
    });
    const catalogDept = catalogDeptFor(employee?.dept ?? '');

    const query = this.employeePermissionRepo
      .createQueryBuilder('ep')
      .innerJoin('ep.permission', 'p')
      .where('ep.employeeId = :employeeId', { employeeId: user.id })
      .andWhere('p.key IN (:...keys)', { keys: acceptedKeys });
    if (this.userRepo) {
      query.andWhere('p.dept = :catalogDept', { catalogDept });
    }
    const grant = await query.getOne();
    if (!grant) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'دسترسی شما برای این بخش توسط مدیر IT فعال نشده است.',
      });
    }
    return true;
  }
}
