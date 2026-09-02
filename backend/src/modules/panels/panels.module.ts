import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../database/entities/user.entity';
import { EmployeePermission } from '../../database/entities/employee-permission.entity';
import { PanelAccessFlag } from '../../database/entities/panel-access-flag.entity';
import { RefreshToken } from '../../database/entities/refresh-token.entity';
import { PanelsController } from './panels.controller';
import { PanelsService } from './panels.service';
import { PanelAccessGuard } from './panel-access.guard';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, EmployeePermission, PanelAccessFlag, RefreshToken]),
    AuditModule,
  ],
  controllers: [PanelsController],
  providers: [PanelsService, PanelAccessGuard],
  exports: [PanelsService, PanelAccessGuard],
})
export class PanelsModule {}
