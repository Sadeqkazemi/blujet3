import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  ValidateNested,
} from 'class-validator';
import {
  CoreItineraryQuoteSegmentDto,
  CoreItineraryQuoteTravellerDto,
} from './quote-core-itinerary.dto';

/** Browser-facing input for the signed Offer facade.
 * Seller/channel are deliberately absent: both are derived from the JWT. */
export class PublicOfferSearchDto {
  @ApiProperty({
    type: [CoreItineraryQuoteSegmentDto],
    minItems: 1,
    maxItems: 3,
    description: 'یک تا سه سگمنت مرتب سفر',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => CoreItineraryQuoteSegmentDto)
  segments!: CoreItineraryQuoteSegmentDto[];

  @ApiProperty({
    type: [CoreItineraryQuoteTravellerDto],
    minItems: 1,
    maxItems: 9,
    description: 'فهرست مسافران برای قیمت‌گذاری',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(9)
  @ValidateNested({ each: true })
  @Type(() => CoreItineraryQuoteTravellerDto)
  travellers!: CoreItineraryQuoteTravellerDto[];
}
