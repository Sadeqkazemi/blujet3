import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CabinClass } from '../../../database/enums';

const CABIN_CLASSES = Object.values(CabinClass);
const PASSENGER_TYPES = ['ADULT', 'CHILD', 'INFANT'] as const;
export type BookingPassengerType = (typeof PASSENGER_TYPES)[number];

export class BookingPassengerDto {
  @ApiProperty({ example: 'علی رضایی' })
  @IsString()
  fullName: string;

  @ApiProperty({ example: '0012345678', required: false })
  @IsOptional()
  @IsString()
  @MinLength(10)
  nationalId?: string;

  @ApiProperty({
    example: 'A1234567',
    required: false,
    description: 'Passport number when travelling on passport',
  })
  @IsOptional()
  @IsString()
  @MinLength(5)
  passportNo?: string;

  @ApiProperty({
    enum: ['male', 'female'],
    required: false,
    example: 'male',
  })
  @IsOptional()
  @IsIn(['male', 'female'])
  gender?: 'male' | 'female';

  @ApiProperty({ example: '09121234567', required: false })
  @IsOptional()
  @IsString()
  mobile?: string;

  @ApiProperty({
    enum: PASSENGER_TYPES,
    example: 'ADULT',
    required: false,
    default: 'ADULT',
  })
  @IsIn(PASSENGER_TYPES)
  passengerType: BookingPassengerType = 'ADULT';

  @ApiProperty({
    example: '1990-05-20',
    description: 'ISO birth date',
    required: false,
    default: '1970-01-01',
  })
  @IsDateString({ strict: true })
  birthDate = '1970-01-01';

  @ApiProperty({
    example: '4A',
    required: false,
    description: 'Required for adults/children; omitted for a lap infant',
  })
  @IsOptional()
  @IsString()
  seatCode?: string;

  @ApiProperty({
    required: false,
    default: false,
    description: 'Reserve one adjacent EXST seat without baggage entitlement',
  })
  @IsOptional()
  @IsBoolean()
  extraSeatRequested?: boolean;
}

export class BookingExtraSelectionDto {
  @ApiProperty({ description: 'شناسه هزینه سفر فعال از کاتالوگ عمومی' })
  @IsUUID()
  id!: string;

  @ApiProperty({ default: 1, description: 'برای بار اضافه: تعداد کیلوگرم' })
  @IsInt()
  @Min(1)
  @Max(50)
  quantity!: number;
}

export class CreateBookingDto {
  @ApiProperty()
  @IsString()
  flightInstanceId: string;

  @ApiProperty({ enum: CABIN_CLASSES })
  @IsIn(CABIN_CLASSES)
  cabin: CabinClass;

  @ApiProperty({ type: [BookingPassengerDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BookingPassengerDto)
  passengers: BookingPassengerDto[];

  @ApiProperty({ required: false, type: [BookingExtraSelectionDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => BookingExtraSelectionDto)
  extras?: BookingExtraSelectionDto[];
}
