import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoyaltyProjectionAudit } from '../../database/entities/loyalty-projection-audit.entity';
import { CommerceOutboxModule } from '../commerce-outbox/commerce-outbox.module';
import { LoyaltyProjectionEventService } from './loyalty-projection-event.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([LoyaltyProjectionAudit]),
    CommerceOutboxModule,
  ],
  providers: [LoyaltyProjectionEventService],
  exports: [LoyaltyProjectionEventService],
})
export class LoyaltyProjectionOutboxModule {}
