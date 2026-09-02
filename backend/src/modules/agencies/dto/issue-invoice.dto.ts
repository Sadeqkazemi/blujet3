import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601 } from 'class-validator';
import {
  IsIrrAmount,
  MinIrrAmount,
  TransformToIrr,
} from '../../../common/dto/irr.decorator';
import type { Irr } from '../../../common/money';

export class IssueInvoiceDto {
  @ApiProperty({
    example: '800000000',
    type: String,
    description: 'مبلغ فاکتور به ریال (رشته یا عدد صحیح)',
  })
  @IsIrrAmount()
  @MinIrrAmount(1n)
  @TransformToIrr()
  amountIrr: Irr;

  @ApiProperty({ example: '2026-08-05T00:00:00.000Z' })
  @IsISO8601()
  dueAt: string;
}
