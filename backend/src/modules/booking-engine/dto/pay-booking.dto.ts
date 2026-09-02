import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { IsIrrAmount, TransformToIrr } from '../../../common/dto/irr.decorator';
import type { Irr } from '../../../common/money';

export class PayBookingDto {
  @ApiProperty({
    required: false,
    type: String,
    description:
      'Client-confirmed price from the checkout screen (decimal string or integer). Required to complete payment when the price changed since booking creation (re-price guard) — CLAUDE.md: "if the price changed, show the new price and require explicit user confirmation before charging."',
  })
  @IsOptional()
  @IsIrrAmount()
  @TransformToIrr()
  confirmedPriceIrr?: Irr;

  @ApiProperty({
    required: false,
    description: 'کد تخفیف — فقط در صفحه پرداخت',
  })
  @IsOptional()
  @IsString()
  promoCode?: string;

  @ApiProperty({ required: false, enum: ['GATEWAY', 'WALLET', 'POINTS'] })
  @IsOptional()
  @IsIn(['GATEWAY', 'WALLET', 'POINTS'])
  paymentMethod?: 'GATEWAY' | 'WALLET' | 'POINTS';
}
