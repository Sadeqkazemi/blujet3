import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  IsIrrAmount,
  MinIrrAmount,
  TransformToIrr,
} from '../../../common/dto/irr.decorator';
import type { Irr } from '../../../common/money';

export class UpdateAncillaryPriceDto {
  @ApiProperty({
    example: '1500000',
    type: String,
    description: 'قیمت به ریال (رشته اعشاری پایه ۱۰، بدون ممیز)',
  })
  @IsIrrAmount()
  @MinIrrAmount(0n)
  @TransformToIrr()
  priceIrr!: Irr;
}

export class UpdateAncillaryEnabledDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  enabled!: boolean;
}

export class CreateAncillaryServiceDto {
  @ApiProperty({ example: 'اینترنت پروازی' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  titleFa!: string;

  @ApiPropertyOptional({ example: 'توضیح اختیاری' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  descriptionFa?: string;

  @ApiProperty({
    example: '1500000',
    type: String,
    description: 'قیمت به ریال',
  })
  @IsIrrAmount()
  @MinIrrAmount(0n)
  @TransformToIrr()
  priceIrr!: Irr;
}
