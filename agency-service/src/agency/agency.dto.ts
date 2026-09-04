import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsUUID, Max, Min } from 'class-validator';

export class AgencyParams {
  @ApiProperty({ description: 'شناسه حساب یکتای آژانس', format: 'uuid' })
  @IsUUID()
  agencyId!: string;
}
export class InvoiceParams extends AgencyParams {
  @ApiProperty({ description: 'شناسه فاکتور', format: 'uuid' })
  @IsUUID()
  invoiceId!: string;
}
export class InvoiceQuery {
  @ApiPropertyOptional({
    description: 'شماره صفحه؛ هر صفحه ۱۰ ردیف',
    default: 1,
    minimum: 1,
    maximum: 1000,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  page = 1;
}
export class ProfileView {
  @ApiProperty({ description: 'شناسه حساب آژانس', format: 'uuid' })
  agencyId!: string;
  @ApiProperty({ description: 'شهر', example: 'تهران' })
  city!: string;
  @ApiProperty({ description: 'سطح ثبت‌شده', example: 'NORMAL' })
  tier!: string;
  @ApiProperty({ description: 'زمان عضویت UTC', format: 'date-time' })
  joinedAt!: string;
  @ApiProperty({
    description: 'زمان تعلیق پرتال؛ مجوز Partner API نیست',
    nullable: true,
    type: String,
    format: 'date-time',
  })
  suspendedAt!: string | null;
}
export class InvoiceView {
  @ApiProperty({ description: 'شناسه فاکتور', format: 'uuid' })
  id!: string;
  @ApiProperty({ description: 'شماره فاکتور', example: 'INV-001' })
  invoiceNo!: string;
  @ApiProperty({
    description: 'مبلغ صحیح ریال؛ رشته دهدهی',
    example: '9007199254740993',
  })
  amountIrr!: string;
  @ApiProperty({
    description: 'وضعیت ثبت‌شده؛ مجوز پرداخت نیست',
    example: 'UNPAID',
  })
  status!: string;
  @ApiProperty({ description: 'زمان صدور UTC', format: 'date-time' })
  issuedAt!: string;
  @ApiProperty({ description: 'سررسید UTC', format: 'date-time' })
  dueAt!: string;
  @ApiProperty({
    description: 'زمان پرداخت UTC',
    nullable: true,
    type: String,
    format: 'date-time',
  })
  paidAt!: string | null;
}
export class InvoicePage {
  @ApiProperty({ type: [InvoiceView] })
  items!: InvoiceView[];
  @ApiProperty({ description: 'تعداد کل فاکتورهای همین آژانس', example: '12' })
  total!: string;
  @ApiProperty({ example: 1 })
  page!: number;
  @ApiProperty({ example: 10, enum: [10] })
  pageSize!: number;
}
export class PortalInvoiceView extends InvoiceView {
  @ApiProperty({
    description: 'شناسه مالک فاکتور',
    format: 'uuid',
    example: '00000000-0000-4000-8000-000000000001',
  })
  agencyId!: string;
  @ApiProperty({
    description: 'شناسه رزرو بدون اطلاعات مسافر',
    type: String,
    nullable: true,
    example: null,
  })
  bookingId!: string | null;
  @ApiProperty({
    description: 'شناسه صادرکننده بدون اطلاعات حساب',
    format: 'uuid',
    example: '00000000-0000-4000-8000-000000000002',
  })
  issuedById!: string;
  @ApiProperty({
    description: 'توضیح موجود فاکتور؛ فقط مالک مجاز',
    type: String,
    nullable: true,
    example: null,
  })
  descriptionFa!: string | null;
}
export class PortalInvoicesResponse {
  @ApiProperty({ example: true }) success!: boolean;
  @ApiProperty({ type: [PortalInvoiceView] }) data!: PortalInvoiceView[];
}
export class ProfileResponse {
  @ApiProperty({ example: true }) success!: boolean;
  @ApiProperty({ type: ProfileView }) data!: ProfileView;
}
export class InvoiceResponse {
  @ApiProperty({ example: true }) success!: boolean;
  @ApiProperty({ type: InvoiceView }) data!: InvoiceView;
}
export class InvoicesResponse {
  @ApiProperty({ example: true }) success!: boolean;
  @ApiProperty({ type: InvoicePage }) data!: InvoicePage;
}
