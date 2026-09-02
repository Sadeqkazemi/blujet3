import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';
import { CabinClass } from '../../../database/enums';

const CABIN_CLASSES = Object.values(CabinClass);

export class CreatePriceLockDto {
  @ApiProperty()
  @IsString()
  flightInstanceId: string;

  @ApiProperty({ enum: CABIN_CLASSES })
  @IsIn(CABIN_CLASSES)
  cabin: CabinClass;
}
