import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CartableTask } from '../../database/entities/cartable-task.entity';
import { ChairReportPermission } from '../../database/entities/chair-report-permission.entity';
import { ManagerReferral } from '../../database/entities/manager-referral.entity';
import { ManagerReferralReport } from '../../database/entities/manager-referral-report.entity';
import { User } from '../../database/entities/user.entity';
import { AuditLog } from '../../database/entities/audit-log.entity';
import { StoredFile } from '../../database/entities/stored-file.entity';
import { CartableController } from './cartable.controller';
import { CartableService } from './cartable.service';
import { PanelsModule } from '../panels/panels.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CartableTask,
      ChairReportPermission,
      ManagerReferral,
      ManagerReferralReport,
      User,
      AuditLog,
      StoredFile,
    ]),
    PanelsModule,
    AuditModule,
    NotificationsModule,
  ],
  controllers: [CartableController],
  providers: [CartableService],
  exports: [CartableService],
})
export class CartableModule {}
