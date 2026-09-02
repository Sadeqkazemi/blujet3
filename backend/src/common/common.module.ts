import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../database/entities/user.entity';
import { EmployeePermission } from '../database/entities/employee-permission.entity';
import { AgencyProfile } from '../database/entities/agency-profile.entity';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { EmployeePermissionGuard } from './guards/employee-permission.guard';

/** Shared guards/decorators used across feature modules. Global so every
 * feature module's `@UseGuards(EmployeePermissionGuard)`/JwtAuthGuard can
 * resolve their repository dependencies without each module separately
 * registering User/EmployeePermission/AgencyProfile via
 * TypeOrmModule.forFeature. */
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([User, EmployeePermission, AgencyProfile]),
  ],
  providers: [JwtAuthGuard, EmployeePermissionGuard],
  exports: [JwtAuthGuard, EmployeePermissionGuard, TypeOrmModule],
})
export class CommonModule {}
