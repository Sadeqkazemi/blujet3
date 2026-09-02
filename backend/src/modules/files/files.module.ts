import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StoredFile } from '../../database/entities/stored-file.entity';
import { ManagerReferral } from '../../database/entities/manager-referral.entity';
import { ManagerReferralReport } from '../../database/entities/manager-referral-report.entity';
import { ManagerMessage } from '../../database/entities/manager-message.entity';
import { CartableTask } from '../../database/entities/cartable-task.entity';
import { SupportTicket } from '../../database/entities/support-ticket.entity';
import { AgencyMessage } from '../../database/entities/agency-message.entity';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StoredFile,
      ManagerReferral,
      ManagerReferralReport,
      ManagerMessage,
      CartableTask,
      SupportTicket,
      AgencyMessage,
    ]),
    AuditModule,
  ],
  controllers: [FilesController],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}
