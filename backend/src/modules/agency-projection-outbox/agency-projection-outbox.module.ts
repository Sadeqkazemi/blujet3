import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgencyProjectionAudit } from '../../database/entities/agency-projection-audit.entity';
import { CommerceOutboxModule } from '../commerce-outbox/commerce-outbox.module';
import { AgencyProjectionEventService } from './agency-projection-event.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([AgencyProjectionAudit]),
    CommerceOutboxModule,
  ],
  providers: [AgencyProjectionEventService],
  exports: [AgencyProjectionEventService],
})
export class AgencyProjectionOutboxModule {}
