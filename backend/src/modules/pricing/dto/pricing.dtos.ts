import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import {
  IsIrrAmount,
  MinIrrAmount,
  TransformToIrr,
} from '../../../common/dto/irr.decorator';
import type { Irr } from '../../../common/money';

export class UpsertProposalDto {
  @ApiProperty({
    example: '38500000',
    type: String,
    description: 'نرخ پیشنهادی به ریال',
  })
  @IsIrrAmount()
  @MinIrrAmount(1n, { message: 'نرخ پیشنهادی را وارد کنید' })
  @TransformToIrr()
  proposedPriceIrr: Irr;

  @ApiPropertyOptional({
    example: '42000000',
    type: String,
    description: 'نرخ قانونی/مصوب به ریال',
  })
  @IsOptional()
  @IsIrrAmount()
  @MinIrrAmount(1n)
  @TransformToIrr()
  legalRateIrr?: Irr;

  @ApiPropertyOptional({ description: 'یادداشت برای مدیر عامل (اختیاری)' })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({ description: 'یادداشت مدیرعامل (اختیاری)' })
  @IsOptional()
  @IsString()
  ceoNote?: string;

  @ApiPropertyOptional({ description: 'یادداشت مدیر عملیات (اختیاری)' })
  @IsOptional()
  @IsString()
  operationsNote?: string;

  @ApiPropertyOptional({ description: 'یادداشت مدیر بازرگانی (اختیاری)' })
  @IsOptional()
  @IsString()
  commercialNote?: string;
}

export class SetLegalRateDto {
  @ApiProperty({
    example: '42000000',
    type: String,
    description: 'نرخ قانونی (مصوب سازمان هواپیمایی) به ریال',
  })
  @IsIrrAmount()
  @MinIrrAmount(1n, { message: 'نرخ قانونی را وارد کنید' })
  @TransformToIrr()
  legalRateIrr: Irr;
}

export class RegisterProposalDto {
  @ApiProperty({
    enum: ['PROPOSED', 'AI'],
    description: 'منبع قیمت ثبتی: تأیید بازرگانی یا ثبت با AI',
  })
  @IsIn(['PROPOSED', 'AI'])
  source: 'PROPOSED' | 'AI';

  @ApiPropertyOptional({
    example: 'قیمت و برنامه فروش تأیید شد.',
    description: 'نظر اختیاری مدیر عامل برای تاریخچه پرواز',
  })
  @IsOptional()
  @IsString()
  comment?: string;
}

export class RejectProposalDto {
  @ApiProperty({
    example: 'نرخ پیشنهادی با نرخ قانونی سازگار نیست',
    description: 'دلیل رد — اجباری، پس از trim خالی نباشد',
  })
  @IsString()
  rejectionReason: string;
}

export class UpdatePublishedPriceDto {
  @ApiProperty({
    example: '37500000',
    type: String,
    description: 'قیمت جدید فروش پرواز منتشرشده به ریال',
  })
  @IsIrrAmount()
  @MinIrrAmount(1n, { message: 'قیمت جدید را وارد کنید' })
  @TransformToIrr()
  salePriceIrr: Irr;

  @ApiProperty({
    example: 'اصلاح نرخ برای افزایش ضریب اشغال',
    description: 'دلیل تغییر قیمت؛ در تاریخچه غیرقابل‌حذف ثبت می‌شود',
  })
  @IsString()
  @MinLength(2)
  reason: string;

  @ApiPropertyOptional({
    example: 7,
    description: 'نسخه مشاهده‌شده پرواز برای جلوگیری از تغییر هم‌زمان',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}
