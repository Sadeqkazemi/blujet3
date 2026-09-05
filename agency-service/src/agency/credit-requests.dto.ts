import { ApiProperty } from '@nestjs/swagger';

export class PortalCreditRequestView {
  @ApiProperty({
    description: 'شناسه درخواست',
    format: 'uuid',
    example: '00000000-0000-4000-8000-000000000001',
  })
  id!: string;
  @ApiProperty({
    description: 'شناسه آژانس مالک',
    format: 'uuid',
    example: '00000000-0000-4000-8000-000000000002',
  })
  agencyId!: string;
  @ApiProperty({
    description: 'سقف درخواستی به ریال صحیح',
    example: '9007199254740993',
  })
  requestedLimitIrr!: string;
  @ApiProperty({
    description: 'یادداشت ثبت‌شده درخواست',
    type: String,
    nullable: true,
    example: null,
  })
  note!: string | null;
  @ApiProperty({
    description: 'وضعیت درخواست؛ مجوز تغییر اعتبار نیست',
    enum: ['PENDING', 'APPROVED', 'REJECTED'],
    example: 'PENDING',
  })
  status!: string;
  @ApiProperty({
    description: 'شناسه تصمیم‌گیرنده بدون اطلاعات هویتی',
    type: String,
    nullable: true,
    example: null,
  })
  decidedById!: string | null;
  @ApiProperty({
    description: 'زمان تصمیم UTC',
    type: String,
    format: 'date-time',
    nullable: true,
    example: null,
  })
  decidedAt!: string | null;
  @ApiProperty({
    description: 'زمان ثبت UTC',
    format: 'date-time',
    example: '2026-09-05T10:00:00.123Z',
  })
  createdAt!: string;
}
export class PortalCreditRequestsResponse {
  @ApiProperty({ description: 'موفقیت درخواست', example: true })
  success!: boolean;
  @ApiProperty({
    description: 'فهرست درخواست‌های خود آژانس',
    type: [PortalCreditRequestView],
    example: [],
  })
  data!: PortalCreditRequestView[];
}
