import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class DecideCreditRequestDto {
  @ApiProperty({ example: true, description: 'تأیید یا رد درخواست' })
  @IsBoolean()
  approve: boolean;
}
