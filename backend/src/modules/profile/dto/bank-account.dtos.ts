import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateBankAccountDto {
  @ApiProperty({
    example: '6104337112344521',
    description: '۱۶ رقم کارت (فارسی یا لاتین)',
  })
  @IsString()
  @MinLength(1)
  cardNo: string;

  @ApiProperty({ example: 'IR820540102680020817909002' })
  @IsString()
  @MinLength(1)
  sheba: string;

  @ApiPropertyOptional({ example: 'بانک ملت' })
  @IsOptional()
  @IsString()
  bankName?: string;
}

export class UpdateBankAccountDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
