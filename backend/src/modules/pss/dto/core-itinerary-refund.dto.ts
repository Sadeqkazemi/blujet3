import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

export class QuoteCoreItineraryRefundDto {
  @ApiProperty({
    example: '3f4c1f5e-9a84-4f5a-8c4a-2c4f2e8b4e91',
    description: 'شناسه مالک برای کنترل محدوده سفارش',
  })
  @IsUUID()
  ownerId!: string;
}

export class ApplyCoreItineraryRefundDto extends QuoteCoreItineraryRefundDto {
  @ApiProperty({
    example:
      'v1:9fbf1b792fa263739b46c970528247698fba9439fb75b5c85bf7e9e6d2f65c9d',
    description: 'مرجع قطعی quote که باید زیر قفل دوباره تأیید شود',
  })
  @IsString()
  @Matches(/^v1:[a-f0-9]{64}$/)
  quoteReference!: string;

  @ApiProperty({
    example: 'refund-approved-7f2b4d',
    description: 'مرجع استرداد که فراخواننده مورد اعتماد قبلاً تأیید کرده است',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  refundReference!: string;
}

export class CoreItineraryRefundSegmentDto {
  @ApiProperty({ example: 1, description: 'ترتیب سگمنت در سفر' })
  sequence!: number;

  @ApiProperty({
    example: '3f4c1f5e-9a84-4f5a-8c4a-2c4f2e8b4e91',
    description: 'شناسه سگمنت سفارش',
  })
  segmentId!: string;

  @ApiProperty({
    example: '2026-12-01T08:00:00.000Z',
    description: 'زمان حرکت UTC مبنای قاعده جریمه',
  })
  departureAt!: string;

  @ApiProperty({ example: 2160, description: 'ساعت باقی‌مانده تا حرکت' })
  hoursLeft!: number;

  @ApiProperty({ example: 30, description: 'درصد جریمه مصوب' })
  penaltyPct!: number;

  @ApiProperty({
    example: '18000000',
    description: 'مبلغ ناخالص سگمنت به ریال',
  })
  grossAmountIrr!: string;

  @ApiProperty({ example: '5400000', description: 'مبلغ جریمه سگمنت به ریال' })
  penaltyAmountIrr!: string;

  @ApiProperty({
    example: '12600000',
    description: 'مبلغ قابل استرداد سگمنت به ریال',
  })
  refundableIrr!: string;
}

export class CoreItineraryRefundQuoteDto {
  @ApiProperty({
    example: '3f4c1f5e-9a84-4f5a-8c4a-2c4f2e8b4e91',
    description: 'شناسه سفارش',
  })
  id!: string;

  @ApiProperty({ example: 'BJ4X2K', description: 'PNR مشترک سفر' })
  pnr!: string;

  @ApiProperty({ example: 'IRR', description: 'واحد مبالغ' })
  currency!: 'IRR';

  @ApiProperty({
    example:
      'v1:9fbf1b792fa263739b46c970528247698fba9439fb75b5c85bf7e9e6d2f65c9d',
    description: 'مرجع قطعی quote برای فرمان استرداد',
  })
  quoteReference!: string;

  @ApiProperty({ example: '36000000', description: 'کل مبلغ ناخالص به ریال' })
  grossAmountIrr!: string;

  @ApiProperty({ example: '10800000', description: 'کل جریمه به ریال' })
  penaltyAmountIrr!: string;

  @ApiProperty({ example: '25200000', description: 'کل قابل استرداد به ریال' })
  refundableIrr!: string;

  @ApiProperty({ type: [CoreItineraryRefundSegmentDto] })
  segments!: CoreItineraryRefundSegmentDto[];
}

export class QuoteCoreItineraryRefundResponseDto {
  @ApiProperty({ example: true, description: 'موفقیت درخواست' })
  success!: true;

  @ApiProperty({ type: CoreItineraryRefundQuoteDto })
  data!: CoreItineraryRefundQuoteDto;
}

export class AppliedCoreItineraryRefundDto extends CoreItineraryRefundQuoteDto {
  @ApiProperty({
    example: '3f4c1f5e-9a84-4f5a-8c4a-2c4f2e8b4e91',
    description: 'شناسه شاهد پایدار استرداد',
  })
  refundId!: string;

  @ApiProperty({ example: 'refund-approved-7f2b4d' })
  refundReference!: string;

  @ApiProperty({ example: 'REFUNDED', description: 'وضعیت نهایی سفارش' })
  status!: 'REFUNDED';

  @ApiProperty({
    example: '3f4c1f5e-9a84-4f5a-8c4a-2c4f2e8b4e91',
    description: 'شناسه ردیف immutable لجر استرداد',
  })
  ledgerEntryId!: string;
}

export class ApplyCoreItineraryRefundResponseDto {
  @ApiProperty({ example: true, description: 'موفقیت درخواست' })
  success!: true;

  @ApiProperty({ type: AppliedCoreItineraryRefundDto })
  data!: AppliedCoreItineraryRefundDto;
}
