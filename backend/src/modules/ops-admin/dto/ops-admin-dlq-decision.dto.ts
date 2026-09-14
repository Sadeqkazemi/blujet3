import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, Matches } from 'class-validator';

export const OpsAdminDlqDecisionReason = {
  TRANSIENT_DEPENDENCY_RECOVERED: 'TRANSIENT_DEPENDENCY_RECOVERED',
  PROJECTION_FIX_DEPLOYED: 'PROJECTION_FIX_DEPLOYED',
  SCHEMA_COMPATIBILITY_CONFIRMED: 'SCHEMA_COMPATIBILITY_CONFIRMED',
  MESSAGE_REJECTED_AFTER_REVIEW: 'MESSAGE_REJECTED_AFTER_REVIEW',
  DUPLICATE_DELIVERY_CONFIRMED: 'DUPLICATE_DELIVERY_CONFIRMED',
} as const;
export type OpsAdminDlqDecisionReason =
  (typeof OpsAdminDlqDecisionReason)[keyof typeof OpsAdminDlqDecisionReason];

export class OpsAdminDlqDecisionDto {
  @ApiProperty({
    description: 'شناسهٔ اپراتور تصمیم‌گیرنده',
    example: 'operator-42',
    pattern: '^[A-Za-z0-9][A-Za-z0-9._@-]{1,127}$',
  })
  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9._@-]{1,127}$/)
  operatorId!: string;

  @ApiProperty({
    description: 'کد ثابت و بدون دادهٔ شخصی برای دلیل تصمیم',
    example: OpsAdminDlqDecisionReason.PROJECTION_FIX_DEPLOYED,
    enum: OpsAdminDlqDecisionReason,
  })
  @IsEnum(OpsAdminDlqDecisionReason)
  reason!: OpsAdminDlqDecisionReason;
}
