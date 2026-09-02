import { ApiProperty } from '@nestjs/swagger';
import {
  IsIrrAmount,
  MinIrrAmount,
  TransformToIrr,
} from '../../../common/dto/irr.decorator';
import type { Irr } from '../../../common/money';

export class TopupWalletDto {
  @ApiProperty({ example: '5000000', type: String })
  @IsIrrAmount()
  @MinIrrAmount(10_000n)
  @TransformToIrr()
  amountIrr: Irr;
}
