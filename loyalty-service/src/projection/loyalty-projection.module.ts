import { Module } from '@nestjs/common';
import { LOYALTY_DLQ_CONFIG, loyaltyDlqConfig } from '../loyalty-dlq.config';
import { LoyaltyDlqAuthGuard } from './loyalty-dlq-auth.guard';
import { LoyaltyDlqController } from './loyalty-dlq.controller';
import { LoyaltyDlqStore } from './loyalty-dlq.store';
import { LoyaltyKafkaHandler } from './loyalty-kafka.handler';
import { LoyaltyProjectionConsumer } from './loyalty-projection.consumer';
import { LoyaltyProjectionStore } from './loyalty-projection.store';

@Module({
  controllers: [LoyaltyDlqController],
  providers: [
    LoyaltyProjectionStore,
    LoyaltyProjectionConsumer,
    LoyaltyDlqStore,
    LoyaltyDlqAuthGuard,
    { provide: LOYALTY_DLQ_CONFIG, useFactory: loyaltyDlqConfig },
    LoyaltyKafkaHandler,
  ],
  exports: [
    LoyaltyKafkaHandler,
    LoyaltyProjectionStore,
    LoyaltyDlqStore,
    LOYALTY_DLQ_CONFIG,
  ],
})
export class LoyaltyProjectionModule {}
