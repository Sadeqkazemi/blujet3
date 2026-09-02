import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsISO8601,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

const TIERS = ['SILVER', 'GOLD', 'PLATINUM'] as const;

export class ListMembersQueryDto {
  @ApiPropertyOptional({ enum: TIERS, description: 'فیلتر سطح عضویت' })
  @IsOptional()
  @IsIn(TIERS)
  level?: (typeof TIERS)[number];

  @ApiPropertyOptional({
    description: 'جستجو در نام، ایمیل، شماره کارت یا کد ملی (تطبیق دقیق)',
  })
  @IsOptional()
  @IsString()
  q?: string;
}

export class CreateMemberDto {
  @ApiProperty({ example: 'نام و نام خانوادگی' })
  @IsString()
  @MinLength(1)
  fullName: string;

  @ApiProperty({ example: 'negar@email.example' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({
    description: 'تاریخ تولد (ISO — از تقویم شمسی تبدیل می‌شود)',
  })
  @IsOptional()
  @IsISO8601()
  birthDate?: string;

  @ApiProperty({ description: 'کد ملی — با چک‌سام رسمی اعتبارسنجی می‌شود' })
  @IsString()
  nationalId: string;

  @ApiProperty({ enum: TIERS })
  @IsIn(TIERS)
  level: (typeof TIERS)[number];

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  points?: number;
}

export class UpdateLevelDto {
  @ApiProperty({ enum: TIERS })
  @IsIn(TIERS)
  level: (typeof TIERS)[number];
}

export class UpdateTierRulesDto {
  @ApiProperty({ example: 5000, description: 'حد نصاب امتیاز سطح طلایی' })
  @IsInt()
  @Min(0)
  goldMinPoints: number;

  @ApiProperty({ example: 15000, description: 'حد نصاب امتیاز سطح پلاتین' })
  @IsInt()
  @Min(0)
  platinumMinPoints: number;

  @ApiProperty({
    example: 5000,
    description: 'حد نصاب امتیاز برای درخواست صدور کارت عضویت',
  })
  @IsInt()
  @Min(0)
  cardRequestMinPoints: number;
}

export class ReferCardRequestDto {
  @ApiProperty({
    enum: ['SENIOR', 'CHAIR'],
    description: 'مدیر ارشد یا رئیس هیئت مدیره — تنها دو مقصد ارجاع طراحی',
  })
  @IsIn(['SENIOR', 'CHAIR'])
  assignedTo: 'SENIOR' | 'CHAIR';
}
