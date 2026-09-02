import { Injectable } from '@nestjs/common';
import { Controller, Get, Module, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { User } from '../../database/entities/user.entity';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { EmployeePermissionGuard } from '../../common/guards/employee-permission.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { ROLE_LABELS_FA, STAFF_ROLES } from '../../common/exec-roles';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import type { Role } from '../../database/enums';
import { isTemporaryPanelUsername } from '../../database/temporary-panel-accounts';
import { isSandboxAuthEnabled } from '../../common/sandbox-auth';

@Injectable()
export class StaffDirectoryService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  /** Active staff accounts for direct-message/transfer/recipient pickers —
   * never includes customers/agencies or the caller themselves. */
  async list(excludeUserId: string) {
    const roles: Role[] = [...STAFF_ROLES];

    const users = await this.userRepo.find({
      where: {
        role: In(roles),
        isActive: true,
        id: Not(excludeUserId),
      },
      select: { id: true, fullName: true, role: true, username: true },
      order: { fullName: 'ASC' },
    });
    return users
      .filter(
        (user) =>
          isSandboxAuthEnabled() || !isTemporaryPanelUsername(user.username),
      )
      .map((u) => ({
        id: u.id,
        fullName: u.fullName,
        role: u.role,
        roleLabelFa: ROLE_LABELS_FA[u.role],
      }));
  }
}

@ApiTags('staff-directory')
@Controller('staff-directory')
@UseGuards(JwtAuthGuard, RolesGuard, EmployeePermissionGuard)
@Roles(...STAFF_ROLES)
export class StaffDirectoryController {
  constructor(private readonly staffDirectory: StaffDirectoryService) {}

  @Get()
  @RequiresPermission('ct_process', 'rf_process', 'ag_requests')
  @ApiOperation({ summary: 'فهرست کارکنان فعال برای انتخاب مقصد انتقال/ارجاع' })
  async list(@CurrentUser() actor: AuthenticatedUser) {
    const data = await this.staffDirectory.list(actor.id);
    return { success: true, data };
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [StaffDirectoryController],
  providers: [StaffDirectoryService],
  exports: [StaffDirectoryService],
})
export class StaffDirectoryModule {}
