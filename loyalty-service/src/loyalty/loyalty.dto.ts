import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsUUID, Matches } from 'class-validator';

export class OwnerParams {
  @ApiProperty({
    description: 'شناسه مالک تأییدشده توسط درگاه',
    example: '00000000-0000-4000-8000-000000000001',
  })
  @IsUUID()
  userId!: string;
}
export class ReadQuery {
  @ApiPropertyOptional({
    description: 'لحظه مقایسه UTC؛ فقط برای خواندن',
    example: '2026-09-04T12:00:00.000Z',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/Z$/)
  at?: string;
}
export class MemberView {
  @ApiProperty({ description: 'شناسه عضویت', example: 'member-id' })
  id!: string;
  @ApiProperty({ description: 'شناسه مالک', example: 'user-id' })
  userId!: string;
  @ApiProperty({ description: 'سطح ثبت‌شده', example: 'GOLD' })
  level!: string;
  @ApiProperty({ description: 'وضعیت کارت', example: 'NONE' })
  cardStatus!: string;
  @ApiProperty({ description: 'جمع صحیح دفتر امتیاز', example: '5000' })
  points!: string;
}
export class LockView {
  @ApiProperty({ description: 'شناسه قفل', example: 'lock-id' })
  id!: string;
  @ApiProperty({ description: 'شناسه پرواز', example: 'flight-id' })
  flightInstanceId!: string;
  @ApiProperty({ description: 'کابین', example: 'ECONOMY' })
  cabin!: string;
  @ApiProperty({ description: 'قیمت صحیح ریال', example: '10000000' })
  lockedPriceIrr!: string;
  @ApiProperty({ description: 'کارمزد صحیح ریال', example: '300000' })
  feeIrr!: string;
  @ApiProperty({ description: 'وضعیت قفل', example: 'ACTIVE' })
  status!: string;
  @ApiProperty({
    description: 'انقضای UTC',
    example: '2026-09-05T12:00:00.000Z',
  })
  expiresAt!: string;
  @ApiProperty({
    description: 'ایجاد UTC',
    example: '2026-09-04T12:00:00.000Z',
  })
  createdAt!: string;
  @ApiProperty({
    description: 'شناسه رزرو متصل؛ مجوز فروش نیست',
    example: null,
    nullable: true,
    type: String,
  })
  bookingId!: string | null;
}

export class MemberResponse {
  @ApiProperty({ example: true })
  success!: boolean;
  @ApiProperty({ type: MemberView })
  data!: MemberView;
}

export class LocksResponse {
  @ApiProperty({ example: true })
  success!: boolean;
  @ApiProperty({ type: [LockView] })
  data!: LockView[];
}

export class LockHistoryView {
  @ApiProperty({
    description: 'شناسه مالک تأییدشده برای تمام ردیف‌ها',
    example: '00000000-0000-4000-8000-000000000001',
  })
  userId!: string;

  @ApiProperty({ type: [LockView] })
  locks!: LockView[];
}

export class LockHistoryResponse {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ type: LockHistoryView })
  data!: LockHistoryView;
}

export interface CardRequestView {
  id: string;
  status: string;
  history: unknown;
  cardNo: string | null;
  createdAt: string;
}

export class TierRulesView {
  @ApiProperty({ example: 5000 })
  goldMinPoints!: number;
  @ApiProperty({ example: 15000 })
  platinumMinPoints!: number;
  @ApiProperty({ example: 5000 })
  cardRequestMinPoints!: number;
}

export class TierRulesProjection extends TierRulesView {
  @ApiProperty({ example: '2026-09-05T10:00:00.000Z' })
  updatedAt!: string;

  @ApiProperty({
    example: '00000000-0000-4000-8000-000000000001',
    nullable: true,
    type: String,
  })
  updatedById!: string | null;
}

export class TierRulesResponse {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ type: TierRulesProjection })
  data!: TierRulesProjection;
}

export class MembershipView {
  @ApiProperty({ example: '00000000-0000-4000-8000-000000000001' })
  userId!: string;
  @ApiProperty({ example: true })
  isMember!: boolean;
  @ApiProperty({ example: 'GOLD', nullable: true, type: String })
  level!: string | null;
  @ApiProperty({ example: '5000' })
  balance!: string;
  @ApiProperty({ example: 'NONE', nullable: true, type: String })
  cardStatus!: string | null;
  @ApiProperty({ example: null, nullable: true, type: String })
  cardNo!: string | null;
  @ApiProperty({ type: TierRulesView })
  tierRules!: TierRulesView;
  @ApiProperty({ example: null, nullable: true, type: Object })
  cardRequest!: CardRequestView | null;
  @ApiProperty({ example: true })
  canRequestCard!: boolean;
  @ApiProperty({ example: '0' })
  pointsNeededForCard!: string;
}

export class MembershipResponse {
  @ApiProperty({ example: true })
  success!: boolean;
  @ApiProperty({ type: MembershipView })
  data!: MembershipView;
}
