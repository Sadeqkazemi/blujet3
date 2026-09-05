import { ApiProperty } from '@nestjs/swagger';

export class CardRequestMemberView {
  @ApiProperty({ description: 'شناسه عضویت', example: 'member-id' })
  id!: string;
  @ApiProperty({ description: 'نام عضو', example: 'عضو باشگاه' })
  fullName!: string;
  @ApiProperty({ description: 'ایمیل عضو', example: 'member@example.com' })
  email!: string;
  @ApiProperty({ description: 'امتیاز ثبت‌شده عضو', example: 5000 })
  points!: number;
  @ApiProperty({ description: 'سطح عضو', example: 'GOLD' })
  level!: string;
}

export class ExecutiveCardRequestView {
  @ApiProperty({ description: 'شناسه درخواست', example: 'request-id' })
  id!: string;
  @ApiProperty({ description: 'شناسه عضویت', example: 'member-id' })
  memberId!: string;
  @ApiProperty({ description: 'سطح هنگام درخواست', example: 'GOLD' })
  level!: string;
  @ApiProperty({ description: 'امتیاز هنگام درخواست', example: 5000 })
  points!: number;
  @ApiProperty({
    description: 'وضعیت صف مدیران',
    enum: ['REFERRED', 'APPROVED', 'REJECTED'],
    example: 'REFERRED',
  })
  status!: string;
  @ApiProperty({
    description: 'مدیر مقصد',
    type: String,
    nullable: true,
    example: 'CEO',
  })
  assignedTo!: string | null;
  @ApiProperty({
    description: 'شناسه تصمیم‌گیرنده؛ بدون اتصال به هویت',
    type: String,
    nullable: true,
    example: null,
  })
  decidedById!: string | null;
  @ApiProperty({
    description: 'زمان تصمیم UTC',
    type: String,
    nullable: true,
    example: '2026-09-05T10:00:00.000Z',
  })
  decidedAt!: string | null;
  @ApiProperty({
    description: 'شماره کارت',
    type: String,
    nullable: true,
    example: null,
  })
  cardNo!: string | null;
  @ApiProperty({
    description: 'تاریخچه نمایشی موجود؛ حداکثر ۳۲ مرحله',
    type: 'array',
    items: { type: 'object' },
    example: [{ step: 'referred', labelFa: 'ارجاع درخواست', at: 'اکنون' }],
  })
  history!: unknown;
  @ApiProperty({
    description: 'زمان ایجاد UTC',
    example: '2026-09-05T10:00:00.000Z',
  })
  createdAt!: string;
  @ApiProperty({
    description: 'نمای محدود عضو بدون کد ملی',
    type: CardRequestMemberView,
    nullable: true,
  })
  member!: CardRequestMemberView | null;
}

export class CardRequestsResponse {
  @ApiProperty({ description: 'موفقیت درخواست', example: true })
  success!: boolean;
  @ApiProperty({
    description: 'صف درخواست‌های مدیران',
    type: [ExecutiveCardRequestView],
    example: [],
  })
  data!: ExecutiveCardRequestView[];
}
