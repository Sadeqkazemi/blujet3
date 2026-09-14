import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  AgencyKafkaFailureStatus,
  type AgencyKafkaFailureStatus as AgencyFailureStatus,
} from '../../database/entities/agency-kafka-processing-failure.entity';

export class AgencyDlqListDto {
  @IsOptional()
  @IsEnum(AgencyKafkaFailureStatus)
  status: AgencyFailureStatus = AgencyKafkaFailureStatus.QUARANTINED;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}
