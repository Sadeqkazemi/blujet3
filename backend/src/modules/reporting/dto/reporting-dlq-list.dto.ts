import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  ReportingKafkaFailureStatus,
  type ReportingKafkaFailureStatus as ReportingFailureStatus,
} from '../../../database/entities/reporting-kafka-processing-failure.entity';

export class ReportingDlqListDto {
  @IsOptional()
  @IsEnum(ReportingKafkaFailureStatus)
  status: ReportingFailureStatus = ReportingKafkaFailureStatus.QUARANTINED;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}
