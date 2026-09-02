import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, MinLength } from 'class-validator';

export class LookupBookingDto {
  @ApiProperty({ example: 'BJ4X2K', description: 'کد رزرو (PNR)' })
  @IsString()
  @MinLength(4)
  pnr: string;

  @ApiProperty({
    example: 'رضایی',
    description: 'نام خانوادگی مسافر — حداقل ۳ کاراکتر',
    minLength: 3,
  })
  @IsString()
  @MinLength(3, { message: 'نام خانوادگی باید حداقل ۳ کاراکتر باشد.' })
  lastName: string;
}

export class SubmitAnonymousRefundDto {
  @ApiProperty({ example: 'BJ4X2K', description: 'کد رزرو (PNR)' })
  @IsString()
  @MinLength(4)
  pnr: string;

  @ApiProperty({
    example: 'رضایی',
    description: 'نام خانوادگی مسافر — حداقل ۳ کاراکتر',
    minLength: 3,
  })
  @IsString()
  @MinLength(3, { message: 'نام خانوادگی باید حداقل ۳ کاراکتر باشد.' })
  lastName: string;

  @ApiProperty({
    example: 'IR820170000000332211009900',
    description: '۲۶ کاراکتر شبا',
  })
  @IsString()
  @Length(26, 26)
  iban: string;
}
