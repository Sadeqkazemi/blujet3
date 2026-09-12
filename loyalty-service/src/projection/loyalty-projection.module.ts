import { Module } from '@nestjs/common';
import { LoyaltyKafkaHandler } from './loyalty-kafka.handler';
import { LoyaltyProjectionConsumer } from './loyalty-projection.consumer';
import { LoyaltyProjectionStore } from './loyalty-projection.store';

@Module({
  providers: [
    LoyaltyProjectionStore,
    LoyaltyProjectionConsumer,
    LoyaltyKafkaHandler,
  ],
  exports: [LoyaltyKafkaHandler],
})
export class LoyaltyProjectionModule {}
