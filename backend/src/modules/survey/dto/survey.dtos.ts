import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateSurveySettingsDto {
  @ApiPropertyOptional({ description: 'فعال/غیرفعال بودن نظرسنجی' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ example: 'نظرسنجی رضایت مسافران' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;
}

export class CreateSurveyQuestionDto {
  @ApiProperty({ example: 'راحتی صندلی و کابین' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  label: string;
}

export class SubmitSurveyResponseDto {
  @ApiProperty({ example: 5, minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}
