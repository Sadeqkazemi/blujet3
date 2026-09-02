import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { SmsModule } from '../sms/sms.module';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  imports: [NotificationsModule, SmsModule],
  controllers: [EventsController],
  providers: [EventsService],
})
export class EventsModule {}
