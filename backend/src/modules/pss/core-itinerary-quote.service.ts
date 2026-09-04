import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { ErrorCode } from '../../common/errors';
import { addIrr, toIrr, type Irr } from '../../common/money';
import { FareRule } from '../../database/entities/fare-rule.entity';
import { TravelExtraSetting } from '../../database/entities/travel-extra-setting.entity';
import { AncillaryServicesService } from '../ancillary-services/ancillary-services.service';
import {
  passengerFareRows,
  validatePassengerManifest,
} from '../booking-engine/passenger-fares';
import { getCabinPrice } from '../booking-engine/pricing';
import { calculateActiveCharges } from '../flights/charge-rules';
import { CoreItineraryService } from './core-itinerary.service';
import type {
  CoreItineraryQuoteExtraDto,
  CoreItineraryQuoteTravellerDto,
  CoreItineraryQuotedExtraDto,
  QuoteCoreItineraryDto,
  QuotedCoreItineraryDto,
  QuotedCoreItinerarySegmentDto,
} from './dto/quote-core-itinerary.dto';

@Injectable()
export class CoreItineraryQuoteService {
  constructor(
    private readonly itineraries: CoreItineraryService,
    @InjectRepository(FareRule)
    private readonly fareRuleRepo: Repository<FareRule>,
    @InjectRepository(TravelExtraSetting)
    private readonly travelExtraRepo: Repository<TravelExtraSetting>,
    private readonly ancillary: AncillaryServicesService,
  ) {}

  async quote(
    dto: QuoteCoreItineraryDto,
    manager?: EntityManager,
  ): Promise<QuotedCoreItineraryDto> {
    const requiredSeats = dto.travellers.filter(
      (traveller) => traveller.passengerType !== 'INFANT',
    ).length;
    if (requiredSeats < 1) {
      this.invalid('سفر باید حداقل یک مسافر دارای صندلی داشته باشد.');
    }
    const resolved = manager
      ? await this.itineraries.resolve(dto, requiredSeats, manager)
      : await this.itineraries.resolve(dto, requiredSeats);
    const extraIds = dto.segments.flatMap((segment) =>
      (segment.extras ?? []).map((extra) => extra.id),
    );
    const loadFareRules = () =>
      (manager ? manager.getRepository(FareRule) : this.fareRuleRepo).find({
        where: {
          flightInstanceId: In(
            resolved.segments.map((segment) => segment.flightInstanceId),
          ),
        },
      });
    const loadExtras = () =>
      extraIds.length
        ? (manager
            ? manager.getRepository(TravelExtraSetting)
            : this.travelExtraRepo
          ).find({ where: { id: In(extraIds) } })
        : Promise.resolve([]);
    const [fareRules, configuredExtras] = manager
      ? [await loadFareRules(), await loadExtras()]
      : await Promise.all([loadFareRules(), loadExtras()]);
    const pricedExtras = await this.ancillary.overlayTravelExtras(
      configuredExtras,
      manager,
    );
    const extrasById = new Map(pricedExtras.map((extra) => [extra.id, extra]));
    const inputById = new Map(
      dto.segments.map((segment) => [segment.flightInstanceId, segment]),
    );
    const segments: QuotedCoreItinerarySegmentDto[] = [];

    for (const resolvedSegment of resolved.segments) {
      const input = inputById.get(resolvedSegment.flightInstanceId)!;
      const passengers = this.passengers(dto.travellers);
      validatePassengerManifest(passengers, resolvedSegment.departureAt);
      const selectedRule = resolvedSegment.fareClassCode
        ? fareRules.find(
            (rule) =>
              rule.flightInstanceId === resolvedSegment.flightInstanceId &&
              rule.cabin === resolvedSegment.cabin &&
              rule.classCode === resolvedSegment.fareClassCode,
          )
        : null;
      if (resolvedSegment.fareClassCode && !selectedRule) {
        this.invalid('کلاس نرخی سگمنت هنگام محاسبه تغییر کرده است.');
      }
      const unitFareIrr = selectedRule
        ? this.priceForChannel(selectedRule, dto.channel)
        : await getCabinPrice(
            manager ?? this.fareRuleRepo.manager,
            resolvedSegment.flightInstanceId,
            resolvedSegment.cabin,
            dto.channel,
          );
      const charges = await calculateActiveCharges(
        manager ?? this.fareRuleRepo.manager,
        resolvedSegment.flightInstanceId,
        unitFareIrr,
        resolvedSegment.cabin,
        resolvedSegment.departureAt,
      );
      const rows = passengerFareRows(
        passengers,
        unitFareIrr,
        addIrr(selectedRule?.taxIrr ?? 0n, toIrr(charges.totalChargesIrr)),
        dto.channel,
      );
      const travellers = rows.map((row, index) => ({
        sequence: index + 1,
        passengerType: dto.travellers[index].passengerType,
        fareIrr: String(row.fareIrr),
        taxIrr: String(row.taxIrr),
        totalIrr: String(addIrr(row.fareIrr, row.taxIrr)),
      }));
      const extras = this.quoteExtras(
        input.extras ?? [],
        extrasById,
        dto.travellers.length,
      );
      const fareIrr = addIrr(...rows.map((row) => row.fareIrr));
      const taxIrr = addIrr(...rows.map((row) => row.taxIrr));
      const extrasIrr = addIrr(...extras.map((extra) => toIrr(extra.totalIrr)));
      segments.push({
        ...resolvedSegment,
        baggageAllowanceKg: selectedRule?.baggageAllowanceKg ?? null,
        travellers,
        extras,
        fareIrr: String(fareIrr),
        taxIrr: String(taxIrr),
        extrasIrr: String(extrasIrr),
        totalIrr: String(addIrr(fareIrr, taxIrr, extrasIrr)),
      });
    }

    const fareIrr = addIrr(
      ...segments.map((segment) => toIrr(segment.fareIrr)),
    );
    const taxIrr = addIrr(...segments.map((segment) => toIrr(segment.taxIrr)));
    const extrasIrr = addIrr(
      ...segments.map((segment) => toIrr(segment.extrasIrr)),
    );
    return {
      currency: 'IRR',
      quotedAt: new Date().toISOString(),
      requiresReprice: true,
      channel: dto.channel,
      segments,
      fareIrr: String(fareIrr),
      taxIrr: String(taxIrr),
      extrasIrr: String(extrasIrr),
      totalIrr: String(addIrr(fareIrr, taxIrr, extrasIrr)),
    };
  }

  private passengers(travellers: CoreItineraryQuoteTravellerDto[]) {
    return travellers.map((traveller, index) => ({
      fullName: `مسافر شماره ${index + 1}`,
      passengerType: traveller.passengerType,
      birthDate: traveller.birthDate,
    }));
  }

  private quoteExtras(
    selections: CoreItineraryQuoteExtraDto[],
    byId: ReadonlyMap<string, TravelExtraSetting>,
    travellerCount: number,
  ): CoreItineraryQuotedExtraDto[] {
    if (
      new Set(selections.map((selection) => selection.id)).size !==
      selections.length
    ) {
      this.invalid('هر خدمت در هر سگمنت فقط یک‌بار قابل انتخاب است.');
    }
    return selections.map((selection) => {
      const extra = byId.get(selection.id);
      if (!extra?.active || !extra.purchaseEnabled) {
        this.invalid('یکی از خدمات انتخاب‌شده فعال یا قابل خرید نیست.');
      }
      if (extra.billingUnit !== 'PER_KG' && selection.quantity !== 1) {
        this.invalid('تعداد فقط برای خدمت بار اضافه قابل تغییر است.');
      }
      const quantity =
        extra.billingUnit === 'PER_PASSENGER'
          ? travellerCount
          : selection.quantity;
      const totalIrr = addIrr(
        ...Array.from({ length: quantity }, () => extra.priceIrr),
      );
      return {
        id: extra.id,
        code: extra.code,
        titleFa: extra.titleFa,
        billingUnit: extra.billingUnit,
        unitPriceIrr: String(extra.priceIrr),
        quantity,
        totalIrr: String(totalIrr),
      };
    });
  }

  private priceForChannel(
    rule: FareRule,
    channel: QuoteCoreItineraryDto['channel'],
  ): Irr {
    return channel === 'AGENCY'
      ? (rule.agencyReleasePriceIrr ?? rule.priceIrr)
      : (rule.sitePriceIrr ?? rule.priceIrr);
  }

  private invalid(message: string): never {
    throw new BadRequestException({
      code: ErrorCode.VALIDATION_FAILED,
      message,
    });
  }
}
