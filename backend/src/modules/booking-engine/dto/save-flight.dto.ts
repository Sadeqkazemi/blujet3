import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsUUID } from 'class-validator';
import { CabinClass } from '../../../database/enums';

const CABINS = Object.values(CabinClass);

export class SaveFlightDto {
  @ApiProperty({ example: '00000000-0000-0000-0000-000000000001' })
  @IsUUID()
  flightInstanceId: string;

  @ApiProperty({ enum: CABINS, example: 'ECONOMY' })
  @IsIn(CABINS)
  cabin: CabinClass;
}
