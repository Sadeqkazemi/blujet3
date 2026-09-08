import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { CoreOfferResponseDto } from './dto/core-offer.dto';
import { PublicOfferSearchDto } from './dto/public-offer-search.dto';
import { PublicOfferFacadeService } from './public-offer-facade.service';

/** Authenticated compatibility facade for site and agency offer search. */
@ApiTags('search')
@ApiBearerAuth()
@Controller('search')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('USER', 'AGENCY')
export class PublicOfferFacadeController {
  constructor(private readonly offers: PublicOfferFacadeService) {}

  @Post('offers')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'دریافت Offer امضاشده برای مشتری یا آژانس' })
  @ApiOkResponse({ type: CoreOfferResponseDto })
  @ApiBadRequestResponse({ description: 'ورودی سفر یا مسافر معتبر نیست.' })
  @ApiUnauthorizedResponse({ description: 'توکن کاربر معتبر نیست.' })
  @ApiForbiddenResponse({ description: 'نقش کاربر برای فروش مجاز نیست.' })
  @ApiServiceUnavailableResponse({
    description: 'Facade با فلگ CORE_OFFER_PUBLIC_ENABLED خاموش است.',
  })
  async search(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: PublicOfferSearchDto,
  ) {
    return { success: true, data: await this.offers.search(actor, dto) };
  }
}
