import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorCode } from '../../common/errors';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { CoreOfferService } from './core-offer.service';
import type { CoreOfferDto } from './dto/core-offer.dto';
import type { PublicOfferSearchDto } from './dto/public-offer-search.dto';

@Injectable()
export class PublicOfferFacadeService {
  constructor(
    private readonly coreOffers: CoreOfferService,
    private readonly config: ConfigService,
  ) {}

  async search(
    actor: AuthenticatedUser,
    dto: PublicOfferSearchDto,
  ): Promise<CoreOfferDto> {
    if (this.config.get<string>('CORE_OFFER_PUBLIC_ENABLED') !== 'true') {
      throw new ServiceUnavailableException({
        code: ErrorCode.OFFER_UNAVAILABLE,
        message: 'دریافت پیشنهاد قیمت در حال حاضر فعال نیست.',
      });
    }

    if (actor.role !== 'USER' && actor.role !== 'AGENCY') {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'دسترسی به پیشنهاد قیمت برای این نقش مجاز نیست.',
      });
    }

    return this.coreOffers.search({
      channel: actor.role === 'AGENCY' ? 'AGENCY' : 'SYSTEM',
      seller: {
        type: actor.role === 'AGENCY' ? 'AGENCY' : 'USER',
        id: actor.id,
      },
      segments: dto.segments,
      travellers: dto.travellers,
    });
  }
}
