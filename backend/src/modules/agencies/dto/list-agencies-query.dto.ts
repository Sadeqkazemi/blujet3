import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class ListAgenciesQueryDto {
  @ApiPropertyOptional({ description: 'جستجو در نام، شماره مجوز، مدیر، شهر' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    description: 'فقط آژانس‌های دارای بدهی (پنل مدیر بازرگانی)',
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  debtorsOnly?: boolean;
}
