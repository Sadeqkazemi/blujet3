import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsString, IsUUID, MinLength } from 'class-validator';

export const ACTOR_ROLES = [
  'USER',
  'AGENCY',
  'EMPLOYEE',
  'IT_MANAGER',
  'COMMERCIAL_MANAGER',
  'OPERATIONS_MANAGER',
  'FINANCE_MANAGER',
  'SENIOR_MANAGER',
  'CEO',
  'BOARD_CHAIR',
  'SITE_ADMIN',
] as const;

export class ActorContextDto {
  @ApiProperty({ format: 'uuid', description: 'شناسه پایدار کاربر احرازشده' })
  @IsUUID()
  id!: string;

  @ApiProperty({ example: 'مدیر سایت', description: 'نام نمایشی احرازشده' })
  @IsString()
  @MinLength(1)
  fullName!: string;

  @ApiProperty({ enum: ACTOR_ROLES, description: 'نقش احرازشده در Gateway' })
  @IsIn(ACTOR_ROLES)
  role!: (typeof ACTOR_ROLES)[number];

  @ApiProperty({ example: false, description: 'پرچم مدیر کل احرازشده' })
  @IsBoolean()
  isSuperAdmin!: boolean;
}
