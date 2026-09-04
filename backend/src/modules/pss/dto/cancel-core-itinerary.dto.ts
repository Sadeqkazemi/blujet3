import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { HeldCoreItineraryDto } from './hold-core-itinerary.dto';

export class CancelCoreItineraryDto {
  @ApiProperty({
    example: '3f4c1f5e-9a84-4f5a-8c4a-2c4f2e8b4e91',
    description: 'شناسه مالک برای کنترل محدوده لغو',
  })
  @IsUUID()
  ownerId!: string;
}

export class CancelCoreItineraryResponseDto {
  @ApiProperty({ example: true, description: 'موفقیت درخواست' })
  success!: true;

  @ApiProperty({
    type: HeldCoreItineraryDto,
    description: 'سفارش چندسگمنتی لغوشده',
  })
  data!: HeldCoreItineraryDto;
}
