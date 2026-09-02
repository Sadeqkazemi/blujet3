import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, ValidateNested } from 'class-validator';
import { BookingPassengerDto } from '../../booking-engine/dto/create-booking.dto';
import { CabinClass } from '../../../database/enums';

const CABIN_CLASSES = Object.values(CabinClass);

export class CreateAllotmentBookingDto {
  @ApiProperty({ enum: CABIN_CLASSES })
  @IsIn(CABIN_CLASSES)
  cabin: CabinClass;

  @ApiProperty({ type: [BookingPassengerDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BookingPassengerDto)
  passengers: BookingPassengerDto[];
}
