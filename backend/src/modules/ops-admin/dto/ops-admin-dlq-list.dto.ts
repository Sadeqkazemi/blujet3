import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  OpsAdminKafkaFailureStatus,
  type OpsAdminKafkaFailureStatus as OpsAdminFailureStatus,
} from '../../../database/ops-admin-projection-entities/ops-admin-kafka-processing-failure.entity';

export class OpsAdminDlqListDto {
  @ApiPropertyOptional({
    description: 'وضعیت رکوردهای قرنطینه',
    example: 'QUARANTINED',
    enum: OpsAdminKafkaFailureStatus,
    default: OpsAdminKafkaFailureStatus.QUARANTINED,
  })
  @IsOptional()
  @IsEnum(OpsAdminKafkaFailureStatus)
  status: OpsAdminFailureStatus = OpsAdminKafkaFailureStatus.QUARANTINED;

  @ApiPropertyOptional({
    description: 'حداکثر تعداد رکوردهای بازگشتی',
    example: 50,
    minimum: 1,
    maximum: 100,
    default: 50,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}
