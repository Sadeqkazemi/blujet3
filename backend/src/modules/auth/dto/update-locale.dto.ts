import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export class UpdateLocaleDto {
  @ApiProperty({ enum: ['FA', 'EN', 'AR'], example: 'EN' })
  @IsIn(['FA', 'EN', 'AR'])
  locale: 'FA' | 'EN' | 'AR';
}
