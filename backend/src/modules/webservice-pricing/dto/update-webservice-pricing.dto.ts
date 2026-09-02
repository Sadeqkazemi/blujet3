import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class UpdateWebservicePricingDto {
  @ApiProperty({ description: 'قیمت پلن ۱ ماهه (ریال)', example: 45_000_000 })
  @IsInt()
  @Min(1)
  month1PriceIrr: number;

  @ApiProperty({ description: 'قیمت پلن ۳ ماهه (ریال)', example: 120_000_000 })
  @IsInt()
  @Min(1)
  month3PriceIrr: number;

  @ApiProperty({ description: 'قیمت پلن ۱۲ ماهه (ریال)', example: 420_000_000 })
  @IsInt()
  @Min(1)
  month12PriceIrr: number;
}
