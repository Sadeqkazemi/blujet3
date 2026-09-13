import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  LoyaltyKafkaFailureStatus,
  type LoyaltyKafkaFailureStatus as LoyaltyFailureStatus,
} from '../../database/entities/loyalty-kafka-processing-failure.entity';

export class LoyaltyDlqListDto {
  @IsOptional()
  @IsEnum(LoyaltyKafkaFailureStatus)
  status: LoyaltyFailureStatus = LoyaltyKafkaFailureStatus.QUARANTINED;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}
