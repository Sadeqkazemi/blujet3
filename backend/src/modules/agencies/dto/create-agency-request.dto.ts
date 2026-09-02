import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches, MinLength } from 'class-validator';

export class CreateAgencyRequestDto {
  @ApiProperty({ example: 'آژانس مسافرتی پرشین' })
  @IsString()
  @MinLength(2)
  applicantName: string;

  @ApiProperty({ example: 'نام و نام خانوادگی' })
  @IsString()
  @MinLength(2)
  managerName: string;

  @ApiProperty({ example: 'XXXX-XXXX', description: 'شماره مجوز بند ب' })
  @IsString()
  @MinLength(2)
  licenseNo: string;

  @ApiProperty({ example: '09121234567' })
  @Matches(/^09\d{9}$/, { message: 'شماره موبایل معتبر نیست.' })
  phone: string;

  @ApiProperty({ description: 'از POST /agencies/requests/otp' })
  @IsString()
  challengeId: string;

  @ApiProperty({ example: '482913' })
  @IsString()
  @Length(6, 6)
  code: string;
}
