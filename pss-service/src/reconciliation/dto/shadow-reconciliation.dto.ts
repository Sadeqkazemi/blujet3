import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  Min,
  ValidateNested,
} from 'class-validator';

export class ShadowCountsDto {
  @IsInt()
  @Min(0)
  orders!: number;

  @IsInt()
  @Min(0)
  travellers!: number;

  @IsInt()
  @Min(0)
  heldOrders!: number;

  @IsInt()
  @Min(0)
  ticketedOrders!: number;

  @IsInt()
  @Min(0)
  inventoryTransactions!: number;
}

export class ShadowReconciliationDto {
  @IsDateString()
  capturedAt!: string;

  @IsNotEmpty()
  @ValidateNested()
  @Type(() => ShadowCountsDto)
  website!: ShadowCountsDto;
}
