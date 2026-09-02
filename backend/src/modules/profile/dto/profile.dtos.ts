import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsEmail,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'نام و نام خانوادگی' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  fullName?: string;

  @ApiPropertyOptional({ example: '0012345679' })
  @IsOptional()
  @IsString()
  nationalId?: string;

  @ApiPropertyOptional({ example: '1370-05-12' })
  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @ApiPropertyOptional({ example: 'A12345678' })
  @IsOptional()
  @IsString()
  @MinLength(4)
  passportNo?: string;

  @ApiPropertyOptional({
    example: 'تهران، خیابان ولیعصر، کوچه بهار، پلاک ۱۲',
    description: 'آدرس محل سکونت؛ به‌صورت رمزگذاری‌شده نگهداری می‌شود',
  })
  @IsOptional()
  @IsString()
  @MinLength(5)
  address?: string;

  @ApiPropertyOptional({
    example: 'customer@example.com',
    description: 'ایمیل حساب؛ تغییر آن نیازمند تأیید مجدد است',
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;
}

export class VerifyEmailDto {
  @ApiProperty({ description: 'از POST /my/profile/email/verify-request' })
  @IsString()
  challengeId: string;

  @ApiProperty({ example: '482913' })
  @IsString()
  @Length(6, 6)
  code: string;
}
