import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from '../../database/entities/notification.entity';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotifyOutboxModule } from '../notify-outbox/notify-outbox.module';

@Module({
  imports: [TypeOrmModule.forFeature([Notification]), NotifyOutboxModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService, NotifyOutboxModule],
})
export class NotificationsModule {}
