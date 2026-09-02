import { ApiProperty } from '@nestjs/swagger';
import {
  IsIrrAmount,
  MinIrrAmount,
  TransformToIrr,
} from '../../../common/dto/irr.decorator';
import type { Irr } from '../../../common/money';

export class UpdateCreditDto {
  @ApiProperty({
    example: '1800000000',
    type: String,
    description: 'سقف اعتبار به ریال (رشته یا عدد صحیح)',
  })
  @IsIrrAmount()
  @MinIrrAmount(0n)
  @TransformToIrr()
  limitIrr: Irr;
}
