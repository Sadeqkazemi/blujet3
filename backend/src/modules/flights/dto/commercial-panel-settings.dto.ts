import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class AgencyReleaseClassDto {
  @ApiPropertyOptional({ example: 12, description: 'تعداد صندلی آزاد برای آژانس' })
  @IsOptional()
  seats?: number;

  @ApiPropertyOptional({
    example: '45000000',
    description: 'قیمت فروش آژانس (ریال)',
  })
  @IsOptional()
  @IsString()
  priceIrr?: string;

  @ApiPropertyOptional({ example: false, description: 'فروش فوق‌العاده' })
  @IsOptional()
  @IsBoolean()
  special?: boolean;
}

export class PatchCommercialPanelSettingsDto {
  @ApiPropertyOptional({
    example: true,
    description: 'نمایش و فروش در سایت عمومی',
  })
  @IsOptional()
  @IsBoolean()
  siteVisible?: boolean;

  @ApiPropertyOptional({
    description: 'قیمت سایت به ازای هر کلاس — کلید: برچسب کلاس',
    example: { 'اکونومی Y': '380000000' },
  })
  @IsOptional()
  @IsObject()
  classSitePrices?: Record<string, string>;

  @ApiPropertyOptional({
    description: 'آزادسازی صندلی آژانس به ازای هر کلاس',
  })
  @IsOptional()
  @IsObject()
  @ValidateNested({ each: true })
  @Type(() => AgencyReleaseClassDto)
  agencyRelease?: Record<string, AgencyReleaseClassDto>;
}
