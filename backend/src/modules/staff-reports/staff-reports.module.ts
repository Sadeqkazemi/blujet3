import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../database/entities/user.entity';
import { AuditLog } from '../../database/entities/audit-log.entity';
import { StaffReportsController } from './staff-reports.controller';
import { StaffReportsService } from './staff-reports.service';
import { PanelsModule } from '../panels/panels.module';

@Module({
  imports: [TypeOrmModule.forFeature([User, AuditLog]), PanelsModule],
  controllers: [StaffReportsController],
  providers: [StaffReportsService],
})
export class StaffReportsModule {}
