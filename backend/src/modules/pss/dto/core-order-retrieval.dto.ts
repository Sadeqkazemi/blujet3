import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class CoreOrderRetrievalQueryDto {
  @ApiProperty({
    example: '3f4c1f5e-9a84-4f5a-8c4a-2c4f2e8b4e91',
    description: 'شناسه مالک برای کنترل محدوده سفارش',
  })
  @IsUUID()
  ownerId!: string;
}

export class CoreOrderTravellerDto {
  @ApiProperty({
    example: '3f4c1f5e-9a84-4f5a-8c4a-2c4f2e8b4e91',
    description: 'شناسه مسافر سفارش',
  })
  id!: string;

  @ApiProperty({ example: 1, description: 'ترتیب مسافر در سفارش' })
  sequence!: number;

  @ApiProperty({ example: 'علی رضایی', description: 'نام مسافر' })
  fullName!: string;

  @ApiProperty({ example: 'ADULT', description: 'نوع مسافر' })
  passengerType!: string;
}

export class CoreOrderSegmentDto {
  @ApiProperty({ example: 1, description: 'ترتیب سگمنت' })
  sequence!: number;

  @ApiProperty({ example: 'segment-uuid', description: 'شناسه سگمنت' })
  id!: string;

  @ApiProperty({ example: 'BJ-101', description: 'شماره پرواز' })
  flightNo!: string;

  @ApiProperty({ example: 'THR', description: 'کد مبدأ' })
  originCode!: string;

  @ApiProperty({ example: 'MHD', description: 'کد مقصد' })
  destinationCode!: string;

  @ApiProperty({ example: '2026-12-01T08:00:00.000Z', description: 'حرکت UTC' })
  departureAt!: string;

  @ApiProperty({ example: '2026-12-01T09:30:00.000Z', description: 'ورود UTC' })
  arrivalAt!: string;

  @ApiProperty({ example: 'ECONOMY', description: 'کلاس کابین' })
  cabin!: string;

  @ApiProperty({ example: '10000000', description: 'کرایه سگمنت به ریال' })
  fareIrr!: string;

  @ApiProperty({ example: '1000000', description: 'مالیات سگمنت به ریال' })
  taxIrr!: string;

  @ApiProperty({ example: '0', description: 'خدمات سگمنت به ریال' })
  extrasIrr!: string;

  @ApiProperty({ example: '11000000', description: 'کل سگمنت به ریال' })
  totalIrr!: string;
}

export class CoreOrderCouponDto {
  @ApiProperty({ example: 'coupon-uuid', description: 'شناسه کوپن' })
  id!: string;

  @ApiProperty({ example: 1, description: 'شماره کوپن در سند' })
  couponNumber!: number;

  @ApiProperty({ example: 'segment-uuid', description: 'شناسه سگمنت مرتبط' })
  segmentId!: string;

  @ApiProperty({ example: 'OPEN', description: 'وضعیت مؤثر کوپن' })
  status!: 'OPEN' | 'REFUNDED';

  @ApiProperty({
    example: 'REFUND-UUID',
    description: 'شناسه servicing در صورت وجود',
  })
  servicingId!: string | null;
}

export class CoreOrderDocumentDto {
  @ApiProperty({ example: 'document-uuid', description: 'شناسه سند بلیت' })
  id!: string;

  @ApiProperty({
    example: '7801234567890',
    description: 'شماره accountable بلیت',
  })
  documentNumber!: string;

  @ApiProperty({ example: 'REFUNDED', description: 'وضعیت مؤثر سند' })
  status!: 'ISSUED' | 'REFUNDED';

  @ApiProperty({ example: 'traveller-uuid', description: 'شناسه مسافر' })
  travellerId!: string;

  @ApiProperty({
    example: 'REFUND-UUID',
    description: 'شناسه servicing در صورت وجود',
  })
  servicingId!: string | null;

  @ApiProperty({ type: [CoreOrderCouponDto], description: 'کوپن‌های مرتب سند' })
  coupons!: CoreOrderCouponDto[];
}

export class CoreOrderRefundHistoryDto {
  @ApiProperty({ example: 'refund-uuid', description: 'شناسه فرمان استرداد' })
  id!: string;

  @ApiProperty({
    example: 'refund-approved-7f2b4d',
    description: 'مرجع استرداد',
  })
  refundReference!: string;

  @ApiProperty({ example: 'COMPLETED', description: 'وضعیت شاهد استرداد' })
  status!: 'RECEIVED' | 'COMPLETED' | 'REVIEW_REQUIRED';

  @ApiProperty({
    example: '25200000',
    description: 'مبلغ قابل استرداد به ریال',
  })
  refundableIrr!: string;

  @ApiProperty({
    example: '2026-12-01T08:00:00.000Z',
    description: 'زمان ثبت شاهد',
  })
  createdAt!: string;
}

export class CoreOrderCouponEventDto {
  @ApiProperty({
    example: 'coupon-event-uuid',
    description: 'شناسه رویداد کوپن',
  })
  id!: string;

  @ApiProperty({ example: 'coupon-uuid', description: 'شناسه کوپن' })
  couponId!: string;

  @ApiProperty({ example: 'OPEN', description: 'وضعیت قبل' })
  fromStatus!: 'OPEN';

  @ApiProperty({ example: 'REFUNDED', description: 'وضعیت بعد' })
  toStatus!: 'REFUNDED';

  @ApiProperty({
    example: '2026-12-01T08:00:00.000Z',
    description: 'زمان رویداد',
  })
  occurredAt!: string;
}

export class CoreOrderRetrievalDto {
  @ApiProperty({ example: 'order-uuid', description: 'شناسه سفارش' })
  id!: string;

  @ApiProperty({ example: 'BJ4X2K', description: 'PNR سفارش' })
  pnr!: string;

  @ApiProperty({ example: 'SYSTEM', description: 'کانال فروش' })
  channel!: string;

  @ApiProperty({ example: 'REFUNDED', description: 'وضعیت سفارش' })
  status!: string;

  @ApiProperty({ example: 'IRR', description: 'واحد مبلغ' })
  currency!: 'IRR';

  @ApiProperty({ example: '36000000', description: 'کل سفارش به ریال' })
  totalIrr!: string;

  @ApiProperty({ type: [CoreOrderTravellerDto], description: 'مسافران سفارش' })
  travellers!: CoreOrderTravellerDto[];

  @ApiProperty({
    type: [CoreOrderSegmentDto],
    description: 'سگمنت‌های مرتب سفارش',
  })
  segments!: CoreOrderSegmentDto[];

  @ApiProperty({
    type: [CoreOrderDocumentDto],
    description: 'مدارک accountable سفارش',
  })
  documents!: CoreOrderDocumentDto[];

  @ApiProperty({
    type: [CoreOrderRefundHistoryDto],
    description: 'سابقه فرمان‌های استرداد',
  })
  refundHistory!: CoreOrderRefundHistoryDto[];

  @ApiProperty({
    type: [CoreOrderCouponEventDto],
    description: 'سابقه تغییر وضعیت کوپن‌ها',
  })
  couponEvents!: CoreOrderCouponEventDto[];
}

export class CoreOrderRetrievalResponseDto {
  @ApiProperty({ example: true, description: 'موفقیت درخواست' })
  success!: true;

  @ApiProperty({ type: CoreOrderRetrievalDto })
  data!: CoreOrderRetrievalDto;
}
