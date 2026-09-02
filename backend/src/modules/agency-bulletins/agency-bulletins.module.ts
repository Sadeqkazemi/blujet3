import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgencyProfile } from '../../database/entities/agency-profile.entity';
import { Notification } from '../../database/entities/notification.entity';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AgencyBulletinsController } from './agency-bulletins.controller';
import { AgencyBulletinsService } from './agency-bulletins.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([AgencyProfile, Notification]),
    NotificationsModule,
    AuditModule,
  ],
  controllers: [AgencyBulletinsController],
  providers: [AgencyBulletinsService],
})
export class AgencyBulletinsModule {}
