import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CoreItineraryService } from './core-itinerary.service';
import {
  ResolveCoreItineraryDto,
  ResolveCoreItineraryResponseDto,
} from './dto/resolve-core-itinerary.dto';
import { PssInternalAuthGuard } from './pss-internal-auth.guard';

/** Internal service-to-service route; never exposed as a public sales API. */
@ApiTags('internal-core-itinerary')
@ApiHeader({
  name: 'X-Internal-Token',
  description: 'توکن احراز هویت سرویس داخلی',
  required: true,
})
@Controller('internal/v1/core/itineraries')
@UseGuards(PssInternalAuthGuard)
export class CoreItineraryController {
  constructor(private readonly itineraries: CoreItineraryService) {}

  @Post('resolve')
  @HttpCode(200)
  @ApiOperation({ summary: 'اعتبارسنجی خواندنی سفر چندسگمنتی در Core' })
  @ApiOkResponse({ type: ResolveCoreItineraryResponseDto })
  @ApiUnauthorizedResponse({ description: 'توکن سرویس داخلی نامعتبر است.' })
  @ApiBadRequestResponse({ description: 'ترتیب یا پیوستگی سفر معتبر نیست.' })
  @ApiNotFoundResponse({
    description: 'پرواز، کابین یا کلاس نرخ قابل فروش نیست.',
  })
  @ApiConflictResponse({
    description: 'ظرفیت سگمنت یا کلاس نرخ تکمیل شده است.',
  })
  async resolve(@Body() dto: ResolveCoreItineraryDto) {
    const data = await this.itineraries.resolve(dto);
    return { success: true, data };
  }
}
