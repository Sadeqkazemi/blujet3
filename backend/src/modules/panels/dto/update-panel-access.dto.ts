import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdatePanelAccessDto {
  @ApiProperty({ example: false })
  @IsBoolean()
  enabled: boolean;
}
