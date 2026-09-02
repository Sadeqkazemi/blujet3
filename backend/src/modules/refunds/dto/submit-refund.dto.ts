import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, Length } from 'class-validator';

export class PreviewRefundDto {
  @ApiProperty({
    description: 'شناسه رزرو متعلق به مشتری جاری',
    example: 'c2c3954d-b315-40d2-a663-bad2d310bec2',
  })
  @IsUUID()
  bookingId: string;
}

export class SubmitRefundDto extends PreviewRefundDto {
  @ApiProperty({
    example: 'IR820170000000332211009900',
    description: '۲۴ رقم شبا',
  })
  @IsString()
  @Length(26, 26)
  iban: string;
}
