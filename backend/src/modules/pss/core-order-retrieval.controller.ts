import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CoreItineraryRetrievalService } from './core-itinerary-retrieval.service';
import {
  CoreOrderRetrievalQueryDto,
  CoreOrderRetrievalResponseDto,
} from './dto/core-order-retrieval.dto';
import { PssInternalAuthGuard } from './pss-internal-auth.guard';

@ApiTags('internal-core-order-retrieval')
@Controller('internal/v1/orders')
@UseGuards(PssInternalAuthGuard)
export class CoreOrderRetrievalController {
  constructor(private readonly retrieval: CoreItineraryRetrievalService) {}

  @Get(':reference')
  @ApiOperation({ summary: 'بازیابی خواندنی سفارش Core با شناسه یا PNR' })
  @ApiParam({ name: 'reference', description: 'شناسه سفارش یا PNR' })
  @ApiOkResponse({ type: CoreOrderRetrievalResponseDto })
  @ApiUnauthorizedResponse({ description: 'توکن سرویس داخلی نامعتبر است.' })
  @ApiBadRequestResponse({ description: 'مالک سفارش معتبر نیست.' })
  @ApiNotFoundResponse({ description: 'سفارش در محدوده مالک یافت نشد.' })
  async retrieve(
    @Param('reference') reference: string,
    @Query() query: CoreOrderRetrievalQueryDto,
  ) {
    const data = await this.retrieval.retrieve(reference, query.ownerId);
    return { success: true, data };
  }
}
