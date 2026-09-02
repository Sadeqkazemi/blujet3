import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class DecideDocumentDto {
  @ApiProperty({ example: true, description: 'تأیید یا رد مدرک' })
  @IsBoolean()
  approve: boolean;
}
