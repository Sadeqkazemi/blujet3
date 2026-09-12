import { Module } from '@nestjs/common';
import { loyaltyKafkaConsumerConfig } from '../loyalty-kafka.config';
import { LoyaltyProjectionModule } from './loyalty-projection.module';
import {
  createLoyaltyKafkaClient,
  LOYALTY_KAFKA_CLIENT,
  LOYALTY_KAFKA_CONFIG,
  LoyaltyKafkaRuntime,
} from './loyalty-kafka.runtime';

@Module({
  imports: [LoyaltyProjectionModule],
  providers: [
    {
      provide: LOYALTY_KAFKA_CONFIG,
      useFactory: () => loyaltyKafkaConsumerConfig(),
    },
    {
      provide: LOYALTY_KAFKA_CLIENT,
      inject: [LOYALTY_KAFKA_CONFIG],
      useFactory: createLoyaltyKafkaClient,
    },
    LoyaltyKafkaRuntime,
  ],
  exports: [LoyaltyKafkaRuntime],
})
export class LoyaltyKafkaRuntimeModule {}
