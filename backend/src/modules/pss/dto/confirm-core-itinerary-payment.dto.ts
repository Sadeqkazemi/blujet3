import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';
import {
  IsIrrAmount,
  MinIrrAmount,
  TransformToIrr,
} from '../../../common/dto/irr.decorator';
import type { Irr } from '../../../common/money';

export class ConfirmCoreItineraryPaymentDto {
  @ApiProperty({
    example: '3f4c1f5e-9a84-4f5a-8c4a-2c4f2e8b4e91',
    description: 'شناسه مالک برای کنترل محدوده سفارش',
  })
  @IsUUID()
  ownerId!: string;

  @ApiProperty({
    example: 'psp-verified-7f2b4d',
    description: 'مرجع پرداختی که فراخواننده مورد اعتماد قبلاً تأیید کرده است',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  paymentReference!: string;

  @ApiProperty({
    type: String,
    example: '46100000',
    description: 'مبلغ تأییدشده به ریال، به‌صورت رشته عدد صحیح مثبت',
  })
  @IsIrrAmount()
  @MinIrrAmount(1n)
  @TransformToIrr()
  amountIrr!: Irr;
}

export class CoreItineraryFlightCouponDto {
  @ApiProperty({ example: 1, description: 'شماره ترتیبی کوپن پرواز' })
  couponNumber!: number;

  @ApiProperty({
    example: '3f4c1f5e-9a84-4f5a-8c4a-2c4f2e8b4e91',
    description: 'شناسه سگمنت سفارش',
  })
  segmentId!: string;

  @ApiProperty({ example: 'OPEN', description: 'وضعیت کوپن' })
  status!: 'OPEN';
}

export class CoreItineraryTicketDocumentDto {
  @ApiProperty({
    example: '3f4c1f5e-9a84-4f5a-8c4a-2c4f2e8b4e91',
    description: 'شناسه مسافر سفارش',
  })
  travellerId!: string;

  @ApiProperty({
    example: '1230000000123',
    description: 'شماره ۱۳ رقمی سند accountable',
  })
  documentNumber!: string;

  @ApiProperty({
    type: [CoreItineraryFlightCouponDto],
    description: 'یک کوپن مرتب برای هر سگمنت سفر',
  })
  coupons!: CoreItineraryFlightCouponDto[];
}

export class ConfirmedCoreItineraryPaymentDto {
  @ApiProperty({
    example: '3f4c1f5e-9a84-4f5a-8c4a-2c4f2e8b4e91',
    description: 'شناسه سفارش',
  })
  id!: string;

  @ApiProperty({ example: 'BJ4X2K', description: 'PNR مشترک سفر' })
  pnr!: string;

  @ApiProperty({ example: 'TICKETED', description: 'وضعیت نهایی سفارش' })
  status!: 'TICKETED';

  @ApiProperty({ example: 'IRR', description: 'واحد مبلغ' })
  currency!: 'IRR';

  @ApiProperty({ example: '46100000', description: 'مبلغ تأییدشده به ریال' })
  amountIrr!: string;

  @ApiProperty({ example: 'psp-verified-7f2b4d' })
  paymentReference!: string;

  @ApiProperty({
    example: '3f4c1f5e-9a84-4f5a-8c4a-2c4f2e8b4e91',
    description: 'شناسه شاهد پایدار تأیید پرداخت',
  })
  paymentConfirmationId!: string;

  @ApiProperty({
    type: [CoreItineraryTicketDocumentDto],
    description: 'اسناد بلیت و کوپن‌های صادرشده',
  })
  documents!: CoreItineraryTicketDocumentDto[];
}

export class ConfirmCoreItineraryPaymentResponseDto {
  @ApiProperty({ example: true, description: 'موفقیت درخواست' })
  success!: true;

  @ApiProperty({ type: ConfirmedCoreItineraryPaymentDto })
  data!: ConfirmedCoreItineraryPaymentDto;
}
