import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class InventoryAvailabilityParamsDto {
  @ApiProperty({
    description: 'شناسهٔ UUID پرواز',
    example: '11111111-1111-4111-8111-111111111111',
  })
  @IsUUID('4')
  flightInstanceId!: string;
}
