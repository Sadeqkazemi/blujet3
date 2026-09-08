import {
  Body,
  Controller,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CoreOfferPricingService } from '../pss/core-offer-pricing.service';
import {
  CoreOfferRepriceDto,
  CoreOfferSearchDto,
} from '../pss/dto/core-offer.dto';
import { OfferInternalAuthGuard } from './offer-internal-auth.guard';

@Controller('internal/v1/offers')
@UseGuards(OfferInternalAuthGuard)
export class OfferPricingController {
  constructor(private readonly offers: CoreOfferPricingService) {}

  @Post('search')
  @HttpCode(200)
  async search(@Body() dto: CoreOfferSearchDto) {
    return { success: true, data: await this.offers.search(dto) };
  }

  @Post(':offerId/reprice')
  @HttpCode(200)
  async reprice(
    @Param('offerId', ParseUUIDPipe) offerId: string,
    @Body() dto: CoreOfferRepriceDto,
  ) {
    return { success: true, data: await this.offers.reprice(offerId, dto) };
  }
}
