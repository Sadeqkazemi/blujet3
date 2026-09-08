import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AncillaryService } from '../../database/entities/ancillary-service.entity';
import type { TravelExtraCode } from '../../database/entities/travel-extra-setting.entity';
import { ANCILLARY_KEY_BY_TRAVEL_EXTRA } from '../ancillary-services/ancillary-services.catalog';
import type { TravelExtraPricing } from '../pss/travel-extra-pricing.interface';

@Injectable()
export class OfferTravelExtraPricingService implements TravelExtraPricing {
  constructor(
    @InjectRepository(AncillaryService)
    private readonly repository: Repository<AncillaryService>,
  ) {}

  async overlayTravelExtras<
    T extends {
      code: string;
      priceIrr: bigint;
      purchaseEnabled: boolean;
      active: boolean;
      titleFa: string;
      descriptionFa: string | null;
    },
  >(extras: T[], manager?: EntityManager): Promise<T[]> {
    const rows = await (
      manager ? manager.getRepository(AncillaryService) : this.repository
    ).find();
    const byKey = new Map(rows.map((row) => [row.key, row]));
    return extras.flatMap((extra) => {
      const key = ANCILLARY_KEY_BY_TRAVEL_EXTRA.get(
        extra.code as TravelExtraCode,
      );
      if (!key) return [extra];
      const ancillary = byKey.get(key);
      if (!ancillary) return [extra];
      if (!ancillary.enabled) return [];
      return [
        {
          ...extra,
          priceIrr: ancillary.priceIrr,
          purchaseEnabled: true,
          active: true,
          titleFa: ancillary.titleFa,
          descriptionFa: ancillary.descriptionFa || extra.descriptionFa,
        },
      ];
    });
  }
}
