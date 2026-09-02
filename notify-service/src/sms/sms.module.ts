import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SmsLog } from '../database/entities/sms-log.entity';
import { SmsController } from './sms.controller';
import { SmsDeliveryService } from './sms-delivery.service';
import { SmsReportService } from './sms-report.service';

@Module({
  imports: [TypeOrmModule.forFeature([SmsLog])],
  controllers: [SmsController],
  providers: [SmsDeliveryService, SmsReportService],
  exports: [SmsDeliveryService],
})
export class SmsModule {}
