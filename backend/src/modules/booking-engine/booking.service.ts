import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as crypto from 'node:crypto';
import {
  EntityManager,
  In,
  IsNull,
  Repository,
  type UpdateResult,
} from 'typeorm';
import { Booking } from '../../database/entities/booking.entity';
import { Passenger } from '../../database/entities/passenger.entity';
import { FlightInstance } from '../../database/entities/flight-instance.entity';
import { AircraftSeatMap } from '../../database/entities/aircraft-seat-map.entity';
import { User } from '../../database/entities/user.entity';
import { PriceLock } from '../../database/entities/price-lock.entity';
import { PaymentReconciliation } from '../../database/entities/payment-reconciliation.entity';
import { PayIdempotencyRecord } from '../../database/entities/pay-idempotency-record.entity';
import { LedgerEntry } from '../../database/entities/ledger-entry.entity';
import { AgencyAllotment } from '../../database/entities/agency-allotment.entity';
import { FareRule } from '../../database/entities/fare-rule.entity';
import { AgencyCreditLine } from '../../database/entities/agency-credit-line.entity';
import { TravelExtraSetting } from '../../database/entities/travel-extra-setting.entity';
import { AgencyProfile } from '../../database/entities/agency-profile.entity';
import { AgencyInvoice } from '../../database/entities/agency-invoice.entity';
import { AuditService } from '../audit/audit.service';
import { AncillaryServicesService } from '../ancillary-services/ancillary-services.service';
import { ErrorCode } from '../../common/errors';
import {
  encryptPii,
  hashPii,
  isValidIranianNationalId,
  normalizeNationalId,
} from '../../common/pii-crypto';
import {
  enumerateSeats,
  findAdjacentSeatCode,
  findAdjacentSeatPair,
} from '../reservation/seat-layout';
import { matchesLastName } from '../../common/passenger-name.util';
import { resolveAircraftType } from '../flights/aircraft-type.util';
import { assertSellableForSale } from '../flights/definition-sellability';
import {
  parseCommercialPanelSettings,
  resolveSiteVisible,
} from '../flights/commercial-panel-settings';
import { calculateActiveCharges } from '../flights/charge-rules';
import { serializeCabinCapacities } from '../flights/flight-definition.util';
import { sumActiveCommittedSeats } from '../flights/commitment-capacity.util';
import { getCabinPrice, resolveFareClass } from './pricing';
import {
  resolveCommercialCabinCapacity,
  resolveSiteCabinAvailability,
} from './commercial-cabin-capacity';
import type { Irr } from '../../common/money';
import type { CabinClass } from '../../database/enums';
import { PAYMENT_GATEWAY, type PaymentGateway } from './payment-gateway';
import { SearchService } from './search.service';
import { PriceLockService } from './price-lock.service';
import { WalletService } from './wallet.service';
import { ClubPointsService } from './club-points.service';
import { CustomerReferralsService } from '../customer-referrals/customer-referrals.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ticketedNotificationInput } from '../notifications/customer-notification-copy';
import { assertNationalIdSeatLimitForFlight } from './national-id-seat-limit';
import { applyPromoCode } from './promo.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import type { CreateBookingDto } from './dto/create-booking.dto';
import type { CreateAllotmentBookingDto } from '../agency-portal/dto/create-allotment-booking.dto';
import {
  passengerFareRows,
  validatePassengerManifest,
} from './passenger-fares';
import {
  assignPassengerSeats,
  SeatAssignmentPolicyError,
  type OccupiedSeatContext,
} from './seat-assignment-policy';

export type PaymentMethod = 'GATEWAY' | 'WALLET' | 'POINTS';

/** Unpaid bookings are held for exactly 15 minutes. Expiry releases inventory. */
const HOLD_TTL_MS = 15 * 60 * 1000;

function cabinLabelFa(cabin: CabinClass): string {
  switch (cabin) {
    case 'FIRST':
      return 'درجه یک';
    case 'BUSINESS':
      return 'بیزینس';
    case 'COMFORT':
      return 'کامفورت';
    case 'ECONOMY':
      return 'اکونومی';
    default:
      return cabin;
  }
}

function allocateAdjacentExtraSeats(
  map: AircraftSeatMap,
  cabin: CabinClass,
  passengers: CreateBookingDto['passengers'],
  taken: ReadonlySet<string>,
  assignedPrimarySeatCodes?: Array<string | null>,
): {
  primarySeatCodes: Array<string | null>;
  extraSeatCodes: Array<string | null>;
} {
  const primarySeatCodes = assignedPrimarySeatCodes
    ? [...assignedPrimarySeatCodes]
    : passengers.map((passenger) =>
        passenger.seatCode ? passenger.seatCode : null,
      );
  const unavailable = new Set([
    ...taken,
    ...primarySeatCodes.filter((code): code is string => Boolean(code)),
  ]);
  const extraSeatCodes = passengers.map((passenger, passengerIndex) => {
    if (!passenger.extraSeatRequested) return null;
    const requestedPrimary = primarySeatCodes[passengerIndex]!;
    let extraSeatCode = findAdjacentSeatCode(
      map,
      requestedPrimary,
      unavailable,
    );
    if (!extraSeatCode) {
      // Auto-selection may initially land on an isolated free seat. Move this
      // passenger to another free pair before declaring the cabin full.
      unavailable.delete(requestedPrimary);
      const pair = findAdjacentSeatPair(map, cabin, unavailable);
      if (!pair) {
        unavailable.add(requestedPrimary);
        throw new ConflictException({
          code: ErrorCode.POOL_EXHAUSTED,
          message: 'ظرفیت تکمیل است؛ دو صندلی کنار هم موجود نیست.',
        });
      }
      primarySeatCodes[passengerIndex] = pair[0];
      unavailable.add(pair[0]);
      extraSeatCode = pair[1];
    }
    unavailable.add(extraSeatCode);
    return extraSeatCode;
  });
  return { primarySeatCodes, extraSeatCodes };
}

function generatePnr(): string {
  return `BJ${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

function generateTicketNo(): string {
  return `780${String(crypto.randomInt(0, 10_000_000_000)).padStart(10, '0')}`;
}

type BookingWithRelations = Omit<Booking, 'generateId' | 'defaultTaxIrr'> & {
  passengers: Passenger[];
  priceLock: PriceLock | null;
};

@Injectable()
export class BookingService {
  constructor(
    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,
    @InjectRepository(Passenger)
    private readonly passengerRepo: Repository<Passenger>,
    @InjectRepository(FlightInstance)
    private readonly flightInstanceRepo: Repository<FlightInstance>,
    @InjectRepository(AircraftSeatMap)
    private readonly seatMapRepo: Repository<AircraftSeatMap>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(PriceLock)
    private readonly priceLockRepo: Repository<PriceLock>,
    @InjectRepository(PaymentReconciliation)
    private readonly reconciliationRepo: Repository<PaymentReconciliation>,
    @InjectRepository(PayIdempotencyRecord)
    private readonly payIdempotencyRepo: Repository<PayIdempotencyRecord>,
    @InjectRepository(LedgerEntry)
    private readonly ledgerRepo: Repository<LedgerEntry>,
    @InjectRepository(AgencyAllotment)
    private readonly allotmentRepo: Repository<AgencyAllotment>,
    @InjectRepository(TravelExtraSetting)
    private readonly travelExtraRepo: Repository<TravelExtraSetting>,
    private readonly audit: AuditService,
    private readonly ancillary: AncillaryServicesService,
    private readonly search: SearchService,
    private readonly priceLocks: PriceLockService,
    private readonly wallet: WalletService,
    private readonly clubPoints: ClubPointsService,
    private readonly customerReferrals: CustomerReferralsService,
    private readonly notifications: NotificationsService,
    @Inject(PAYMENT_GATEWAY)
    private readonly gateway: PaymentGateway,
  ) {}

  private bookingWithFlightQuery(manager: EntityManager) {
    return manager
      .createQueryBuilder(Booking, 'b')
      .leftJoinAndSelect('b.flightInstance', 'flightInstance')
      .leftJoinAndSelect('flightInstance.flight', 'flight')
      .leftJoinAndSelect('flight.route', 'route');
  }

  private async occupiedSeatContext(
    manager: EntityManager,
    flightInstanceId: string,
  ): Promise<OccupiedSeatContext[]> {
    const rows = await manager
      .createQueryBuilder(Passenger, 'p')
      .innerJoin('p.booking', 'b')
      .select([
        'p.bookingId',
        'p.seatCode',
        'p.extraSeatCode',
        'p.gender',
        'p.passengerType',
      ])
      .where('b.flightInstanceId = :flightInstanceId', { flightInstanceId })
      .andWhere('b.status IN (:...statuses)', {
        statuses: ['DRAFT', 'HELD', 'PAID', 'TICKETED'],
      })
      .andWhere('(b.status != :held OR b.holdExpiresAt > :now)', {
        held: 'HELD',
        now: new Date(),
      })
      .getMany();
    const byBooking = new Map<string, Passenger[]>();
    for (const row of rows) {
      const list = byBooking.get(row.bookingId) ?? [];
      list.push(row);
      byBooking.set(row.bookingId, list);
    }
    const context: OccupiedSeatContext[] = [];
    for (const passengers of byBooking.values()) {
      const infantCount = passengers.filter(
        (passenger) => passenger.passengerType === 'INFANT',
      ).length;
      const adultSeats = passengers.filter(
        (passenger) =>
          passenger.passengerType === 'ADULT' && Boolean(passenger.seatCode),
      );
      const infantCarriers = new Set(
        adultSeats.slice(0, infantCount).map((passenger) => passenger.seatCode),
      );
      for (const passenger of passengers) {
        if (passenger.seatCode) {
          context.push({
            seatCode: passenger.seatCode,
            gender: passenger.gender,
            hasLapInfant: infantCarriers.has(passenger.seatCode),
          });
        }
        if (passenger.extraSeatCode) {
          context.push({
            seatCode: passenger.extraSeatCode,
            gender: null,
            hasLapInfant: false,
          });
        }
      }
    }
    return context;
  }

  /** Booking has no inverse relation to Passenger/PriceLock — both are
   * fetched separately and merged, mirroring the reservation module's
   * `getBookingOrThrow` pattern. */
  private async loadBookingRelations(
    booking: Booking,
    manager: EntityManager = this.bookingRepo.manager,
  ): Promise<BookingWithRelations> {
    const [passengers, priceLock] = await Promise.all([
      manager.find(Passenger, {
        where: { bookingId: booking.id },
        order: { seatCode: 'ASC', id: 'ASC' },
      }),
      manager.findOneBy(PriceLock, { bookingId: booking.id }),
    ]);
    return { ...booking, passengers, priceLock };
  }

  private async findBookingWithRelations(
    where: { id?: string; pnr?: string; idempotencyKey?: string },
    manager: EntityManager = this.bookingRepo.manager,
  ): Promise<BookingWithRelations | null> {
    const qb = this.bookingWithFlightQuery(manager);
    if (where.id) qb.andWhere('b.id = :id', { id: where.id });
    if (where.pnr) qb.andWhere('b.pnr = :pnr', { pnr: where.pnr });
    if (where.idempotencyKey) {
      qb.andWhere('b.idempotencyKey = :idempotencyKey', {
        idempotencyKey: where.idempotencyKey,
      });
    }
    const booking = await qb.getOne();
    if (!booking) return null;
    return this.loadBookingRelations(booking, manager);
  }

  /** Lazily flips a past-TTL HELD booking to EXPIRED, releasing its seats
   * for the next reader (search/seatmap only look at non-expired holds) —
   * no cron job needed. Conditional update guards a concurrent double-flip. */
  private async materializeExpiry(
    booking: BookingWithRelations,
  ): Promise<BookingWithRelations> {
    if (
      booking.status !== 'HELD' ||
      !booking.holdExpiresAt ||
      booking.holdExpiresAt > new Date()
    ) {
      return booking;
    }
    await this.bookingRepo.update(
      { id: booking.id, status: 'HELD' },
      { status: 'EXPIRED' },
    );
    return { ...booking, status: 'EXPIRED' };
  }

  private toDetail(b: BookingWithRelations) {
    return {
      id: b.id,
      pnr: b.pnr,
      status: b.status,
      cabin: b.cabin,
      fareClassCode: b.fareClassCode,
      priceIrr: b.priceIrr,
      taxIrr: b.taxIrr,
      extrasIrr: b.extrasIrr,
      extras: b.extrasSnapshot,
      channel: b.channel,
      agencyId: b.agencyId,
      allotmentId: b.allotmentId,
      holdExpiresAt: b.holdExpiresAt,
      flightInstanceId: b.flightInstanceId,
      flightNo: b.flightInstance.flight.flightNo,
      aircraftType: resolveAircraftType(b.flightInstance),
      originCode: b.flightInstance.flight.route.originCode,
      destCode: b.flightInstance.flight.route.destCode,
      departureAt: b.flightInstance.departureAt,
      arrivalAt: b.flightInstance.arrivalAt,
      isPriceLocked: !!b.priceLock,
      passengers: b.passengers.map((p) => ({
        id: p.id,
        fullName: p.fullName,
        seatCode: p.seatCode,
        extraSeatCode: p.extraSeatCode,
        extraSeatFareIrr: p.extraSeatFareIrr,
        passengerType: p.passengerType,
        birthDate: p.birthDate,
        occupiesSeat: p.occupiesSeat,
        fareIrr: p.fareIrr,
        taxIrr: p.taxIrr,
        gender: p.gender,
        ticketNo: p.ticketNo,
        ticketIssuedAt: p.ticketIssuedAt,
      })),
    };
  }

  /** Anonymous manage-booking surface — only the credential-matching
   * passenger keeps their name; co-travellers are redacted. */
  private toAnonymousDetail(b: BookingWithRelations, lastName: string) {
    const detail = this.toDetail(b);
    return {
      ...detail,
      passengers: b.passengers.map((p) => ({
        fullName: matchesLastName(p.fullName, lastName)
          ? p.fullName
          : 'مسافر همراه',
        seatCode: p.seatCode,
      })),
    };
  }

  async createBooking(
    user: AuthenticatedUser,
    dto: CreateBookingDto,
    idempotencyKey?: string,
  ) {
    if (idempotencyKey) {
      const existing = await this.findBookingWithRelations({
        idempotencyKey,
      });
      if (existing) return this.toDetail(existing);
    }

    const instance = await this.flightInstanceRepo
      .createQueryBuilder('fi')
      .leftJoinAndSelect('fi.flight', 'flight')
      .where('fi.id = :id', { id: dto.flightInstanceId })
      .getOne();
    if (
      !instance ||
      instance.status !== 'SCHEDULED' ||
      !instance.publicSaleEnabled
    ) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'پرواز یافت نشد یا دیگر قابل رزرو نیست.',
      });
    }
    assertSellableForSale(instance);
    validatePassengerManifest(dto.passengers, instance.departureAt);
    const now = new Date();
    if (
      (instance.saleStartsAt && instance.saleStartsAt > now) ||
      (instance.saleEndsAt && instance.saleEndsAt < now)
    ) {
      throw new ConflictException({
        code: ErrorCode.SALE_WINDOW_CLOSED,
        message: 'مهلت فروش این پرواز به پایان رسیده یا هنوز آغاز نشده است.',
      });
    }
    if (
      !resolveSiteVisible(
        parseCommercialPanelSettings(instance.commercialPanelSettings),
      )
    ) {
      throw new ConflictException({
        code: ErrorCode.SALE_WINDOW_CLOSED,
        message: 'این پرواز هنوز برای نمایش و فروش در سایت مجوز ندارد.',
      });
    }

    const map = await this.seatMapRepo.findOneBy({
      aircraftType: resolveAircraftType(instance),
    });
    if (!map) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'نقشه صندلی برای این هواپیما تعریف نشده است.',
      });
    }
    const seatsByCode = new Map(
      enumerateSeats(map).map((s) => [s.seatCode, s]),
    );
    const requestedCodes = dto.passengers.flatMap((p) =>
      p.seatCode ? [p.seatCode] : [],
    );
    const seatBearingCount = dto.passengers.filter(
      (passenger) => passenger.passengerType !== 'INFANT',
    ).length;
    if (requestedCodes.length > seatBearingCount) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message:
          'تعداد صندلی‌های انتخابی از تعداد بلیط‌های دارای صندلی بیشتر است.',
      });
    }
    const seatTypeCharges = await this.ancillary.priceSelectedSeats(
      requestedCodes,
      resolveAircraftType(instance),
    );
    if (new Set(requestedCodes).size !== requestedCodes.length) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'صندلی تکراری انتخاب شده است.',
      });
    }
    for (const code of requestedCodes) {
      const seat = seatsByCode.get(code);
      if (!seat || seat.cabin !== dto.cabin) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_FAILED,
          message: `صندلی ${code} در کلاس ${cabinLabelFa(dto.cabin)} معتبر نیست.`,
        });
      }
    }

    for (const p of dto.passengers) {
      if (
        p.nationalId &&
        !isValidIranianNationalId(normalizeNationalId(p.nationalId))
      ) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_FAILED,
          message: `کد ملی «${p.fullName}» معتبر نیست.`,
        });
      }
    }

    // An active, unused price lock for this exact user/flight/cabin prices
    // the whole booking at the locked rate instead of the live rate — the
    // point of the feature is shielding the customer from a market move.
    const usableLock = await this.priceLocks.findUsableLock(
      user.id,
      instance.id,
      dto.cabin,
    );
    const unitPriceIrr: Irr = usableLock
      ? usableLock.lockedPriceIrr
      : await getCabinPrice(this.bookingRepo.manager, instance.id, dto.cabin);
    // Fare-class bucket (Y/B/M) this booking consumes, when class-based
    // pricing is active for the instance; null under flat pricing.
    const fareClass = usableLock
      ? null
      : await resolveFareClass(
          this.bookingRepo.manager,
          instance.id,
          dto.cabin,
        );
    const requestedExtras = dto.extras ?? [];
    const requestedExtraIds = requestedExtras.map((extra) => extra.id);
    if (new Set(requestedExtraIds).size !== requestedExtraIds.length) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'هر هزینه سفر فقط یک‌بار قابل انتخاب است.',
      });
    }
    const configuredExtras = requestedExtraIds.length
      ? await this.travelExtraRepo.findBy({ id: In(requestedExtraIds) })
      : [];
    const pricedExtras = requestedExtraIds.length
      ? await this.ancillary.overlayTravelExtras(configuredExtras)
      : [];
    if (
      pricedExtras.length !== requestedExtraIds.length ||
      pricedExtras.some((extra) => !extra.active || !extra.purchaseEnabled)
    ) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'یکی از هزینه‌های سفر انتخاب‌شده دیگر فعال نیست.',
      });
    }
    const configuredById = new Map(
      pricedExtras.map((extra) => [extra.id, extra]),
    );
    const configuredExtrasSnapshot = requestedExtras.map((selection) => {
      const extra = configuredById.get(selection.id)!;
      if (extra.billingUnit !== 'PER_KG' && selection.quantity !== 1) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_FAILED,
          message: 'تعداد فقط برای هزینه بار اضافه قابل تغییر است.',
        });
      }
      const quantity =
        extra.billingUnit === 'PER_PASSENGER'
          ? dto.passengers.length
          : selection.quantity;
      const totalIrr = extra.priceIrr * BigInt(quantity);
      return {
        id: extra.id,
        code: extra.code,
        titleFa: extra.titleFa,
        titleEn: extra.titleEn,
        titleAr: extra.titleAr,
        billingUnit: extra.billingUnit,
        unitPriceIrr: extra.priceIrr.toString(),
        quantity,
        totalIrr: totalIrr.toString(),
      };
    });
    const extrasSnapshot = [...configuredExtrasSnapshot, ...seatTypeCharges];
    const extrasIrr = extrasSnapshot.reduce(
      (total, extra) => total + BigInt(extra.totalIrr),
      0n,
    );
    // Tax/fee is per-fare-class (Phase 13 Part B) and included in the
    // stored total so ledger/refunds/reporting — which all read
    // priceIrr as-is — never need to know tax exists; taxIrr is stored
    // alongside purely for receipt display.
    // Tax/fee is per-fare-class (Phase 13 Part B) plus active charge rules;
    // both are included in the stored total so ledger/refunds/reporting — which
    // all read priceIrr as-is — never need to recompute; taxIrr and
    // chargeSnapshot are stored for receipt display and audit.
    const unitCharges = await calculateActiveCharges(
      this.bookingRepo.manager,
      instance.id,
      unitPriceIrr,
      dto.cabin,
      instance.departureAt,
    );
    const chargePerPax = BigInt(unitCharges.totalChargesIrr);
    const fareRows = passengerFareRows(
      dto.passengers,
      unitPriceIrr,
      (fareClass?.taxIrr ?? 0n) + chargePerPax,
      instance.charterSeats >= instance.capacity ? 'CHARTER' : 'SYSTEM',
    );
    const occupiedSeatCount =
      fareRows.filter((row) => row.occupiesSeat).length +
      fareRows.filter((row) => row.passenger.extraSeatRequested).length;
    const taxIrr: Irr = fareRows.reduce((sum, row) => sum + row.taxIrr, 0n);
    const priceIrr: Irr =
      fareRows.reduce(
        (sum, row) => sum + row.fareIrr + row.taxIrr + row.extraSeatFareIrr,
        0n,
      ) + extrasIrr;
    const contactUser = await this.userRepo
      .createQueryBuilder('u')
      .select(['u.id', 'u.phone'])
      .where('u.id = :id', { id: user.id })
      .getOneOrFail();
    const purchasingAgencyId =
      user.role === 'AGENCY' &&
      (await this.bookingRepo.manager.exists(AgencyProfile, {
        where: { userId: user.id },
      }))
        ? user.id
        : null;

    // Row lock on the flight instance serializes concurrent booking-creation
    // attempts for the same flight — CLAUDE.md: "Prevent double-booking with
    // SELECT ... FOR UPDATE ... Exactly one of two concurrent buyers of the
    // last seat may succeed."
    const booking = await this.bookingRepo.manager.transaction(async (tx) => {
      await tx
        .createQueryBuilder(FlightInstance, 'fi')
        .setLock('pessimistic_write')
        .where('fi.id = :id', { id: instance.id })
        .getOne();

      if (fareClass) {
        const liveFareClass = await resolveFareClass(
          tx,
          instance.id,
          dto.cabin,
          'SYSTEM',
        );
        if (
          !liveFareClass ||
          liveFareClass.classCode !== fareClass.classCode ||
          liveFareClass.priceIrr !== unitPriceIrr
        ) {
          throw new ConflictException({
            code: ErrorCode.CONFLICT,
            message:
              'ظرفیت این برنامه نرخ تکمیل یا نرخ آن تغییر کرده است؛ نتایج پرواز را دوباره بررسی کنید.',
          });
        }
      }

      await assertNationalIdSeatLimitForFlight(tx, instance.id, dto.passengers);

      const taken = await this.search.takenSeatCodes(instance.id);
      const conflict = requestedCodes.find((c) => taken.has(c));
      if (conflict) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message: `صندلی ${conflict} هم‌اکنون در دسترس نیست.`,
        });
      }

      const occupied = await this.occupiedSeatContext(tx, instance.id);
      const occupiedCodes = new Set(occupied.map((row) => row.seatCode));
      for (const seatCode of taken) {
        if (!occupiedCodes.has(seatCode)) {
          occupied.push({ seatCode, gender: null, hasLapInfant: false });
        }
      }
      let assignedPrimarySeatCodes: Array<string | null>;
      try {
        assignedPrimarySeatCodes = assignPassengerSeats({
          map,
          cabin: dto.cabin,
          passengers: dto.passengers,
          occupied,
        });
      } catch (error) {
        if (!(error instanceof SeatAssignmentPolicyError)) throw error;
        if (error.message.startsWith('No policy-compliant')) {
          throw new ConflictException({
            code: ErrorCode.POOL_EXHAUSTED,
            message: 'ظرفیت صندلی مطابق قوانین تخصیص تکمیل است.',
          });
        }
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_FAILED,
          message: 'صندلی انتخابی با قوانین ایمنی و تخصیص مسافر سازگار نیست.',
        });
      }

      const { primarySeatCodes, extraSeatCodes } = allocateAdjacentExtraSeats(
        map,
        dto.cabin,
        dto.passengers,
        taken,
        assignedPrimarySeatCodes,
      );

      // Charter/agency seat commitments aren't tied to specific seat codes,
      // so the per-seat conflict check above can't see them — a cabin's
      // committed capacity must be checked explicitly, otherwise SYSTEM
      // (public/online) sale could consume a seat already promised to a
      // charter or agency deal (CLAUDE.md: "فروش آنلاین فقط از ظرفیت
      // غیرمتعهد انجام شود").
      const cabinSeatCount = [...seatsByCode.values()].filter(
        (s) => s.cabin === dto.cabin,
      ).length;
      const configuredCabinCapacity = serializeCabinCapacities(
        instance.cabinCapacities,
      ).find((row) => row.cabin === dto.cabin)?.seats;
      const physicalCabinCapacity =
        configuredCabinCapacity == null
          ? cabinSeatCount
          : Math.min(configuredCabinCapacity, cabinSeatCount);
      const cabinCapacity = await resolveCommercialCabinCapacity(
        tx,
        instance.id,
        dto.cabin,
        physicalCabinCapacity,
      );
      const takenInCabin = [...taken].filter(
        (code) => seatsByCode.get(code)?.cabin === dto.cabin,
      ).length;
      const committedInCabin = await sumActiveCommittedSeats(
        tx,
        instance.id,
        dto.cabin,
      );
      const availableInCabin = Math.max(
        0,
        cabinCapacity - takenInCabin - committedInCabin,
      );
      if (occupiedSeatCount > availableInCabin) {
        throw new ConflictException({
          code: ErrorCode.POOL_EXHAUSTED,
          message: `ظرفیت غیرمتعهد کابین ${cabinLabelFa(dto.cabin)} برای این پرواز تکمیل شده است.`,
        });
      }

      const siteAvailability = await resolveSiteCabinAvailability(
        tx,
        instance.id,
        dto.cabin,
        availableInCabin,
      );
      if (occupiedSeatCount > siteAvailability.seatsLeft) {
        throw new ConflictException({
          code: ErrorCode.POOL_EXHAUSTED,
          message: 'ظرفیت آزادشده برای فروش سایت تکمیل شده است.',
        });
      }

      // This booking is always channel SYSTEM (public/direct sale) — must
      // not eat into seats reserved for the agency/charter pools even
      // though physical seats remain (CLAUDE.md pools: they belong to a
      // different pool). Managerial locks still count against this pool
      // (they physically occupy a public-pool seat).
      const counts = await this.search.takenCountsByChannel(instance.id);
      const publicPoolLimit =
        instance.capacity -
        instance.charterSeats -
        (instance.agencySeatsAllocated ?? 0);
      const publicPoolUsed = counts.SYSTEM + counts.MANAGERIAL;
      if (publicPoolUsed + occupiedSeatCount > publicPoolLimit) {
        throw new ConflictException({
          code: ErrorCode.POOL_EXHAUSTED,
          message: 'ظرفیت فروش عمومی این پرواز تکمیل شده است.',
        });
      }

      const created = await tx.save(
        tx.create(Booking, {
          pnr: generatePnr(),
          flightInstanceId: instance.id,
          channel: 'SYSTEM',
          agencyId: purchasingAgencyId,
          status: 'HELD',
          cabin: dto.cabin,
          fareClassCode: fareClass?.classCode ?? null,
          priceIrr,
          taxIrr,
          extrasIrr,
          extrasSnapshot,
          chargeSnapshot: unitCharges,
          userId: user.id,
          contactPhone: contactUser.phone ?? null,
          holdExpiresAt: new Date(Date.now() + HOLD_TTL_MS),
          idempotencyKey: idempotencyKey ?? null,
        }),
      );

      const passengerEntities = fareRows.map((row, passengerIndex) => {
        const p = row.passenger;
        const nationalId = p.nationalId
          ? normalizeNationalId(p.nationalId)
          : undefined;
        return tx.create(Passenger, {
          bookingId: created.id,
          fullName: p.fullName,
          seatCode: primarySeatCodes[passengerIndex] ?? null,
          extraSeatCode: extraSeatCodes[passengerIndex] ?? null,
          extraSeatFareIrr: row.extraSeatFareIrr,
          passengerType: p.passengerType,
          birthDate: p.birthDate,
          occupiesSeat: row.occupiesSeat,
          fareIrr: row.fareIrr,
          taxIrr: row.taxIrr,
          gender: p.gender ?? null,
          nationalIdEnc: nationalId ? encryptPii(nationalId) : null,
          nationalIdHash: nationalId ? hashPii(nationalId) : null,
          passportNoEnc: p.passportNo?.trim()
            ? encryptPii(p.passportNo.trim().toUpperCase())
            : null,
          mobileEnc: p.mobile ? encryptPii(p.mobile) : null,
        });
      });
      await tx.save(passengerEntities);

      if (usableLock) {
        // Conditional update: guards against the same user's lock being
        // consumed twice by a concurrent duplicate request.
        await tx.update(
          PriceLock,
          { id: usableLock.id, bookingId: IsNull() },
          { bookingId: created.id },
        );
      }

      return created;
    });

    // The just-consumed seat/fare-bucket must not keep showing as available
    // on a cached search result for the rest of the cache TTL.
    await this.search.invalidateForInstance(instance.id);

    const bookingWithRelations = (await this.findBookingWithRelations({
      id: booking.id,
    }))!;

    await this.audit.record({
      actorId: user.id,
      actorRole: user.role,
      category: 'RESERVATION',
      action: 'رزرو آنلاین (HELD)',
      detail: `رزرو ${booking.pnr} برای پرواز ${instance.flight.flightNo} توسط مشتری ثبت شد.`,
      entityType: 'Booking',
      entityId: booking.id,
      metadata: {
        extrasIrr: extrasIrr.toString(),
        extraCodes: extrasSnapshot.map((extra) => extra.code),
      },
    });

    // `bookingWithRelations` is re-fetched right after the priceLock claim
    // ran in the same transaction, so its `priceLock` relation reflects the
    // claim already — `usableLock` (resolved earlier) is kept as the
    // reliable signal that this booking actually consumed a lock, matching
    // the original Prisma code's own caution about staleness.
    const detail = this.toDetail(bookingWithRelations);
    return usableLock ? { ...detail, isPriceLocked: true } : detail;
  }

  private async getOwnedBooking(id: string, user: AuthenticatedUser) {
    const booking = await this.findBookingWithRelations({ id });
    if (!booking) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'رزرو یافت نشد.',
      });
    }
    if (booking.userId !== user.id) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'این رزرو متعلق به شما نیست.',
      });
    }
    return this.materializeExpiry(booking);
  }

  async getById(id: string, user: AuthenticatedUser) {
    return this.toDetail(await this.getOwnedBooking(id, user));
  }

  async getByPnr(pnr: string, user: AuthenticatedUser) {
    const booking = await this.findBookingWithRelations({ pnr });
    if (!booking || booking.userId !== user.id) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'رزرو یافت نشد.',
      });
    }
    return this.toDetail(await this.materializeExpiry(booking));
  }

  async getAgencyBooking(reference: string, actor: AuthenticatedUser) {
    const normalized = reference.trim();
    const booking =
      (await this.findBookingWithRelations({ id: normalized })) ??
      (await this.findBookingWithRelations({ pnr: normalized.toUpperCase() }));
    if (
      !booking ||
      booking.channel !== 'AGENCY' ||
      booking.agencyId !== actor.id
    ) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'رزرو یافت نشد.',
      });
    }
    return this.toDetail(await this.materializeExpiry(booking));
  }

  /** Anonymous مدیریت رزرو self-service — PNR + last name instead of a
   * login session. Same generic 404 whether the PNR doesn't exist or the
   * name doesn't match, so brute-forcing PNRs can't distinguish the two. */
  async getByPnrAndLastName(pnr: string, lastName: string) {
    const booking = await this.findBookingWithRelations({
      pnr: pnr.trim().toUpperCase(),
    });
    if (
      !booking ||
      !booking.passengers.some((p) => matchesLastName(p.fullName, lastName))
    ) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'رزرو یافت نشد.',
      });
    }
    return this.toAnonymousDetail(
      await this.materializeExpiry(booking),
      lastName,
    );
  }

  async listMine(user: AuthenticatedUser) {
    const bookings = await this.bookingWithFlightQuery(this.bookingRepo.manager)
      .where('b.userId = :userId', { userId: user.id })
      .orderBy('b.createdAt', 'DESC')
      .getMany();
    return Promise.all(
      bookings.map(async (b) =>
        this.toDetail(await this.loadBookingRelations(b)),
      ),
    );
  }

  /**
   * Re-prices immediately before charging (CLAUDE.md: "ALWAYS re-price
   * immediately before payment; if the price changed, show the new price
   * and require explicit user confirmation") — UNLESS the booking was
   * created against an active PriceLock, whose whole point is shielding the
   * customer from exactly that. Applies an optional promo code, charges via
   * the chosen payment method (sandbox gateway / wallet / club points),
   * transitions HELD -> TICKETED, posts the SALE ledger entry for the
   * actual net amount, and earns club points on real-money payments — all
   * inside one transaction.
   */
  async createAgencyAllotmentBooking(
    actor: AuthenticatedUser,
    allotmentId: string,
    dto: CreateAllotmentBookingDto,
    idempotencyKey?: string,
  ) {
    if (idempotencyKey) {
      const existing = await this.findBookingWithRelations({ idempotencyKey });
      if (existing) {
        if (
          existing.channel !== 'AGENCY' ||
          existing.agencyId !== actor.id ||
          existing.allotmentId !== allotmentId
        ) {
          throw new ConflictException({
            code: ErrorCode.CONFLICT,
            message: 'کلید تکرار برای درخواست دیگری استفاده شده است.',
          });
        }
        return this.toDetail(existing);
      }
    }

    const allotment = await this.allotmentRepo.findOne({
      where: { id: allotmentId, agencyId: actor.id },
      relations: { flightInstance: { flight: true } },
    });
    const instance = allotment?.flightInstance;
    const now = new Date();
    if (
      !allotment ||
      !instance ||
      instance.status !== 'SCHEDULED' ||
      (allotment.type === 'SOFT' &&
        !!allotment.releaseAt &&
        allotment.releaseAt <= now)
    ) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'سهمیه فعال و متعلق به این آژانس یافت نشد.',
      });
    }
    assertSellableForSale(instance);
    if (allotment.cabin && allotment.cabin !== dto.cabin) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'این سهمیه فقط برای کلاس پروازی تخصیص‌یافته قابل استفاده است.',
      });
    }
    validatePassengerManifest(dto.passengers, instance.departureAt);
    if (
      (instance.saleStartsAt && instance.saleStartsAt > now) ||
      (instance.saleEndsAt && instance.saleEndsAt < now)
    ) {
      throw new ConflictException({
        code: ErrorCode.SALE_WINDOW_CLOSED,
        message: 'مهلت فروش این پرواز به پایان رسیده یا هنوز آغاز نشده است.',
      });
    }
    if (
      !resolveSiteVisible(
        parseCommercialPanelSettings(instance.commercialPanelSettings),
      )
    ) {
      throw new ConflictException({
        code: ErrorCode.SALE_WINDOW_CLOSED,
        message: 'این پرواز هنوز برای نمایش و فروش در سایت مجوز ندارد.',
      });
    }

    const map = await this.seatMapRepo.findOneBy({
      aircraftType: resolveAircraftType(instance),
    });
    if (!map) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'نقشه صندلی برای این هواپیما تعریف نشده است.',
      });
    }
    const seatsByCode = new Map(
      enumerateSeats(map).map((seat) => [seat.seatCode, seat]),
    );
    const requestedCodes = dto.passengers.flatMap((passenger) =>
      passenger.seatCode ? [passenger.seatCode] : [],
    );
    if (new Set(requestedCodes).size !== requestedCodes.length) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'صندلی تکراری انتخاب شده است.',
      });
    }
    for (const passenger of dto.passengers) {
      const seat = passenger.seatCode
        ? seatsByCode.get(passenger.seatCode)
        : undefined;
      if (passenger.seatCode && (!seat || seat.cabin !== dto.cabin)) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_FAILED,
          message: `صندلی ${passenger.seatCode} برای کلاس انتخابی معتبر نیست.`,
        });
      }
      if (
        passenger.nationalId &&
        !isValidIranianNationalId(normalizeNationalId(passenger.nationalId))
      ) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_FAILED,
          message: `کد ملی «${passenger.fullName}» معتبر نیست.`,
        });
      }
    }

    const fareClass = allotment.fareClassCode
      ? await this.bookingRepo.manager.findOne(FareRule, {
          where: {
            flightInstanceId: instance.id,
            cabin: dto.cabin,
            classCode: allotment.fareClassCode,
          },
        })
      : await resolveFareClass(
          this.bookingRepo.manager,
          instance.id,
          dto.cabin,
          'AGENCY',
        );
    const unitPriceIrr =
      allotment.contractPriceIrr ??
      (await getCabinPrice(
        this.bookingRepo.manager,
        instance.id,
        dto.cabin,
        'AGENCY',
      ));
    const unitCharges = await calculateActiveCharges(
      this.bookingRepo.manager,
      instance.id,
      unitPriceIrr,
      dto.cabin,
      instance.departureAt,
    );
    const chargePerPax = BigInt(unitCharges.totalChargesIrr);
    const fareRows = passengerFareRows(
      dto.passengers,
      unitPriceIrr,
      (fareClass?.taxIrr ?? 0n) + chargePerPax,
      instance.charterSeats >= instance.capacity ? 'CHARTER' : 'SYSTEM',
    );
    const occupiedSeatCount =
      fareRows.filter((row) => row.occupiesSeat).length +
      fareRows.filter((row) => row.passenger.extraSeatRequested).length;
    const taxIrr: Irr = fareRows.reduce((sum, row) => sum + row.taxIrr, 0n);
    const priceIrr: Irr = fareRows.reduce(
      (sum, row) => sum + row.fareIrr + row.taxIrr + row.extraSeatFareIrr,
      0n,
    );
    const contactUser = await this.userRepo.findOneByOrFail({ id: actor.id });

    const transactionResult = await this.bookingRepo.manager.transaction(
      async (tx) => {
        await tx
          .createQueryBuilder(FlightInstance, 'fi')
          .setLock('pessimistic_write')
          .where('fi.id = :id', { id: instance.id })
          .getOneOrFail();

        await assertNationalIdSeatLimitForFlight(
          tx,
          instance.id,
          dto.passengers,
        );

        const lockedAllotment = await tx.findOne(AgencyAllotment, {
          where: { id: allotmentId, agencyId: actor.id },
          lock: { mode: 'pessimistic_write' },
        });
        if (
          !lockedAllotment ||
          (lockedAllotment.cabin && lockedAllotment.cabin !== dto.cabin) ||
          (lockedAllotment.type === 'SOFT' &&
            !!lockedAllotment.releaseAt &&
            lockedAllotment.releaseAt <= new Date())
        ) {
          throw new ConflictException({
            code: ErrorCode.CONFLICT,
            message: 'سهمیه دیگر فعال نیست.',
          });
        }

        if (idempotencyKey) {
          const concurrentExisting = await tx.findOne(Booking, {
            where: { idempotencyKey },
          });
          if (concurrentExisting) {
            if (
              concurrentExisting.channel !== 'AGENCY' ||
              concurrentExisting.agencyId !== actor.id ||
              concurrentExisting.allotmentId !== allotmentId
            ) {
              throw new ConflictException({
                code: ErrorCode.CONFLICT,
                message: 'کلید تکرار برای درخواست دیگری استفاده شده است.',
              });
            }
            return { booking: concurrentExisting, created: false };
          }
        }

        const taken = await this.search.takenSeatCodes(instance.id);
        const seatConflict = requestedCodes.find((code) => taken.has(code));
        if (seatConflict) {
          throw new ConflictException({
            code: ErrorCode.CONFLICT,
            message: `صندلی ${seatConflict} هم‌اکنون در دسترس نیست.`,
          });
        }

        const { primarySeatCodes, extraSeatCodes } = allocateAdjacentExtraSeats(
          map,
          dto.cabin,
          dto.passengers,
          taken,
        );

        const usedSeatRow = await tx
          .createQueryBuilder(Passenger, 'p')
          .innerJoin(Booking, 'b', 'b.id = p.bookingId')
          .select(
            'COALESCE(SUM(CASE WHEN p."extraSeatCode" IS NULL THEN 1 ELSE 2 END), 0)',
            'count',
          )
          .where('b.allotmentId = :allotmentId', { allotmentId })
          .andWhere(
            `(b.status IN ('PAID', 'TICKETED', 'FLOWN', 'NO_SHOW') OR (b.status = 'HELD' AND b.holdExpiresAt > :now))`,
            { now: new Date() },
          )
          .getRawOne<{ count: string }>();
        const usedSeats = Number(usedSeatRow?.count ?? 0);
        if (usedSeats + occupiedSeatCount > lockedAllotment.seatsAllocated) {
          throw new ConflictException({
            code: ErrorCode.POOL_EXHAUSTED,
            message: 'ظرفیت سهمیه این آژانس تکمیل شده است.',
          });
        }

        const credit = await tx.findOne(AgencyCreditLine, {
          where: { agencyId: actor.id },
          lock: { mode: 'pessimistic_write' },
        });
        if (!credit) {
          throw new ConflictException({
            code: ErrorCode.CONFLICT,
            message: 'خط اعتباری آژانس تعریف نشده است.',
          });
        }
        const ledgerSum = await tx
          .createQueryBuilder(LedgerEntry, 'entry')
          .select('SUM(entry.signedAmountIrr)', 'sum')
          .where('entry.agencyId = :agencyId', { agencyId: actor.id })
          .andWhere('entry.type IN (:...types)', {
            types: ['SALE', 'SETTLEMENT'],
          })
          .getRawOne<{ sum: string | null }>();
        const rawUsedIrr = BigInt(ledgerSum?.sum ?? '0');
        const usedIrr = rawUsedIrr > 0n ? rawUsedIrr : 0n;
        if (priceIrr > credit.limitIrr - usedIrr) {
          throw new ConflictException({
            code: ErrorCode.CONFLICT,
            message: 'اعتبار باقی‌مانده آژانس برای این فروش کافی نیست.',
          });
        }

        const created = await tx.save(
          tx.create(Booking, {
            pnr: generatePnr(),
            flightInstanceId: instance.id,
            channel: 'AGENCY',
            agencyId: actor.id,
            allotmentId,
            status: 'TICKETED',
            cabin: dto.cabin,
            fareClassCode: fareClass?.classCode ?? null,
            priceIrr,
            taxIrr,
            chargeSnapshot: unitCharges,
            userId: null,
            contactPhone: contactUser.phone ?? null,
            holdExpiresAt: null,
            idempotencyKey: idempotencyKey ?? null,
          }),
        );
        await tx.save(
          fareRows.map(
            (
              { passenger, occupiesSeat, fareIrr, taxIrr, extraSeatFareIrr },
              passengerIndex,
            ) => {
              const nationalId = passenger.nationalId
                ? normalizeNationalId(passenger.nationalId)
                : undefined;
              return tx.create(Passenger, {
                bookingId: created.id,
                fullName: passenger.fullName,
                seatCode: primarySeatCodes[passengerIndex],
                extraSeatCode: extraSeatCodes[passengerIndex] ?? null,
                extraSeatFareIrr,
                passengerType: passenger.passengerType,
                birthDate: passenger.birthDate,
                occupiesSeat,
                fareIrr,
                taxIrr,
                gender: passenger.gender ?? null,
                nationalIdEnc: nationalId ? encryptPii(nationalId) : null,
                nationalIdHash: nationalId ? hashPii(nationalId) : null,
                passportNoEnc: passenger.passportNo?.trim()
                  ? encryptPii(passenger.passportNo.trim().toUpperCase())
                  : null,
                mobileEnc: passenger.mobile
                  ? encryptPii(passenger.mobile)
                  : null,
                ticketNo: generateTicketNo(),
                ticketIssuedAt: new Date(),
              });
            },
          ),
        );
        await tx.save(
          tx.create(LedgerEntry, {
            bookingId: created.id,
            agencyId: actor.id,
            type: 'SALE',
            signedAmountIrr: priceIrr,
            createdById: actor.id,
          }),
        );
        return { booking: created, created: true };
      },
    );

    const booking = transactionResult.booking;
    if (transactionResult.created) {
      await this.search.invalidateForInstance(instance.id);
      await this.audit.record({
        actorId: actor.id,
        actorRole: actor.role,
        category: 'RESERVATION',
        action: 'فروش قطعی از سهمیه آژانس',
        detail: `بلیت ${booking.pnr} از سهمیه آژانس برای پرواز ${instance.flight.flightNo} صادر شد.`,
        entityType: 'Booking',
        entityId: booking.id,
        metadata: { allotmentId, priceIrr },
      });
    }
    const saved = await this.findBookingWithRelations({ id: booking.id });
    return this.toDetail(saved!);
  }

  async pay(
    id: string,
    user: AuthenticatedUser,
    options: {
      confirmedPriceIrr?: Irr;
      promoCode?: string;
      paymentMethod?: PaymentMethod;
    } = {},
    idempotencyKey?: string,
  ) {
    if (idempotencyKey) {
      const prior = await this.payIdempotencyRepo.findOneBy({
        idempotencyKey,
      });
      if (prior) {
        if (prior.bookingId !== id || prior.userId !== user.id) {
          throw new ConflictException({
            code: ErrorCode.CONFLICT,
            message: 'کلید یکتایی پرداخت برای رزرو دیگری استفاده شده است.',
          });
        }
        const priorBooking = await this.findBookingWithRelations({
          id: prior.bookingId,
        });
        return {
          priceChanged: false as const,
          booking: this.toDetail(await this.materializeExpiry(priorBooking!)),
          walletBalanceIrr: await this.wallet.getBalance(user.id),
        };
      }
    }

    const booking = await this.getOwnedBooking(id, user);
    if (booking.status === 'EXPIRED') {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message:
          'مهلت نگهداری این رزرو به پایان رسیده است. لطفاً دوباره رزرو کنید.',
      });
    }
    if (booking.status === 'TICKETED' || booking.status === 'PAID') {
      if (idempotencyKey) {
        return {
          priceChanged: false as const,
          booking: this.toDetail(await this.materializeExpiry(booking)),
          walletBalanceIrr: await this.wallet.getBalance(user.id),
        };
      }
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'این رزرو قبلاً پرداخت شده است.',
      });
    }
    if (booking.status !== 'HELD') {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'این رزرو قابل پرداخت نیست.',
      });
    }

    const isLocked =
      !!booking.priceLock && booking.priceLock.status === 'ACTIVE';
    // Re-pricing must include the current tax the same way it was included
    // at creation, or every taxed booking would spuriously look
    // price-changed (untaxed re-quote vs. the tax-inclusive stored total).
    const currentFareClass = isLocked
      ? null
      : await resolveFareClass(
          this.bookingRepo.manager,
          booking.flightInstanceId,
          booking.cabin,
          'SYSTEM',
          booking.id,
        );
    let currentTaxIrr: Irr = 0n;
    let currentPriceIrr: Irr = booking.priceIrr;
    let currentChargeSnapshot = booking.chargeSnapshot;
    if (!isLocked) {
      const unitFare = await getCabinPrice(
        this.bookingRepo.manager,
        booking.flightInstanceId,
        booking.cabin,
        'SYSTEM',
        booking.id,
      );
      const unitCharges = await calculateActiveCharges(
        this.bookingRepo.manager,
        booking.flightInstanceId,
        unitFare,
        booking.cabin,
        booking.flightInstance.departureAt,
      );
      const chargePerPax = BigInt(unitCharges.totalChargesIrr);
      const fareRows = passengerFareRows(
        booking.passengers.map((passenger) => ({
          fullName: passenger.fullName,
          passengerType: passenger.passengerType,
          birthDate: passenger.birthDate,
          seatCode: passenger.seatCode ?? undefined,
          extraSeatRequested: Boolean(passenger.extraSeatCode),
        })),
        unitFare,
        (currentFareClass?.taxIrr ?? 0n) + chargePerPax,
        booking.flightInstance.charterSeats >= booking.flightInstance.capacity
          ? 'CHARTER'
          : booking.channel,
      );
      currentTaxIrr = fareRows.reduce((sum, row) => sum + row.taxIrr, 0n);
      currentPriceIrr =
        fareRows.reduce(
          (sum, row) => sum + row.fareIrr + row.taxIrr + row.extraSeatFareIrr,
          0n,
        ) + booking.extrasIrr;
      currentChargeSnapshot = unitCharges;
    }

    if (!isLocked && currentPriceIrr !== booking.priceIrr) {
      if (options.confirmedPriceIrr !== currentPriceIrr) {
        return {
          priceChanged: true as const,
          previousPriceIrr: booking.priceIrr,
          currentPriceIrr,
        };
      }
    }

    const paymentMethod: PaymentMethod = options.paymentMethod ?? 'GATEWAY';
    const member = await this.clubPoints.findMemberByUserId(user.id);

    // Shetab/IPG handshake happens BEFORE the DB transaction (a real driver
    // is a network call; sandbox approves synchronously). Wallet/points pay
    // internally, so no gateway round-trip for them.
    let gatewayRefId: string | null = null;
    // Phase 13 Part E: written the instant the gateway confirms capture,
    // before the ticketing transaction below even starts — if that
    // transaction later fails for any reason (bad promo, DB hiccup, crash),
    // this PENDING row is the only durable proof the money was taken. See
    // docs/DB_SCHEMA.md.
    let reconciliationId: string | null = null;
    if (paymentMethod === 'GATEWAY') {
      const existingRecon = await this.reconciliationRepo.findOne({
        where: { bookingId: id },
        order: { createdAt: 'DESC' },
      });
      if (existingRecon) {
        gatewayRefId = existingRecon.gatewayRefId;
        reconciliationId = existingRecon.id;
      } else {
        const { authority } = await this.gateway.request(currentPriceIrr, id);
        const verified = await this.gateway.verify(authority, currentPriceIrr);
        if (!verified.ok) {
          throw new ConflictException({
            code: ErrorCode.CONFLICT,
            message: 'پرداخت از سوی درگاه تأیید نشد. مبلغی کسر نشده است.',
          });
        }
        gatewayRefId = verified.refId;
        const reconciliation = await this.reconciliationRepo.save(
          this.reconciliationRepo.create({
            bookingId: id,
            gatewayRefId: verified.refId,
            amountIrr: currentPriceIrr,
          }),
        );
        reconciliationId = reconciliation.id;
      }
    }

    const paid = await this.bookingRepo.manager.transaction(async (tx) => {
      await tx.findOneOrFail(Booking, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      const lockedRaw = await this.bookingWithFlightQuery(tx)
        .where('b.id = :id', { id })
        .getOneOrFail();
      const lockedBooking = await this.loadBookingRelations(lockedRaw, tx);

      // Acquire the wallet lock before inserting idempotency/promo rows that
      // reference this user. This establishes one lock order for concurrent
      // purchases and avoids PostgreSQL FK-lock upgrade deadlocks.
      if (paymentMethod === 'WALLET') {
        await this.wallet.lockForDebit(tx, user.id);
      }

      if (idempotencyKey) {
        const claimed = await tx.findOneBy(PayIdempotencyRecord, {
          idempotencyKey,
        });
        if (claimed) {
          if (claimed.bookingId !== id || claimed.userId !== user.id) {
            throw new ConflictException({
              code: ErrorCode.CONFLICT,
              message: 'کلید یکتایی پرداخت برای رزرو دیگری استفاده شده است.',
            });
          }
          return {
            booking: lockedBooking,
            discountIrr: 0n,
            walletEntryId: null,
            ledgerEntryId: null,
          };
        }
      }

      if (
        lockedBooking.status === 'TICKETED' ||
        lockedBooking.status === 'PAID'
      ) {
        return {
          booking: lockedBooking,
          discountIrr: 0n,
          walletEntryId: null,
          ledgerEntryId: null,
        };
      }
      if (lockedBooking.status !== 'HELD') {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message: 'این رزرو قابل پرداخت نیست.',
        });
      }

      if (idempotencyKey) {
        await tx.save(
          tx.create(PayIdempotencyRecord, {
            idempotencyKey,
            bookingId: id,
            userId: user.id,
          }),
        );
      }

      let finalPriceIrr = currentPriceIrr;
      let discountIrr: Irr = 0n;
      let walletEntryId: string | null = null;
      if (options.promoCode) {
        const result = await applyPromoCode(tx, {
          code: options.promoCode,
          userId: user.id,
          bookingId: id,
          originCode: booking.flightInstance.flight.route.originCode,
          destCode: booking.flightInstance.flight.route.destCode,
          cabin: booking.cabin,
          priceIrr: currentPriceIrr,
        });
        finalPriceIrr = result.finalPriceIrr;
        discountIrr = result.discountIrr;
      }

      if (paymentMethod === 'WALLET') {
        const walletEntry = await this.wallet.charge(
          tx,
          user.id,
          finalPriceIrr,
          id,
          true,
        );
        walletEntryId = walletEntry.id;
      } else if (paymentMethod === 'POINTS') {
        if (!member) {
          throw new BadRequestException({
            code: ErrorCode.VALIDATION_FAILED,
            message: 'پرداخت با امتیاز فقط برای اعضای باشگاه مشتریان است.',
          });
        }
        await this.clubPoints.redeemForPayment(
          tx,
          member.id,
          finalPriceIrr,
          id,
        );
      }

      // Explicit state machine: payment capture flips HELD→PAID, ticket
      // issuance then flips PAID→TICKETED — both inside this transaction,
      // each guarded so a concurrent double-pay hits affected===0 and 409s.
      let captured: UpdateResult;
      if (isLocked) {
        captured = await tx.update(
          Booking,
          { id, status: 'HELD' },
          { status: 'PAID', priceIrr: finalPriceIrr },
        );
      } else {
        captured = await tx
          .createQueryBuilder()
          .update(Booking)
          .set({
            status: 'PAID',
            priceIrr: finalPriceIrr,
            taxIrr: currentTaxIrr,
            chargeSnapshot: currentChargeSnapshot,
          })
          .where('id = :id AND status = :status', { id, status: 'HELD' })
          .execute();
      }
      if ((captured.affected ?? 0) === 0) {
        const latestRaw = await this.bookingWithFlightQuery(tx)
          .where('b.id = :id', { id })
          .getOneOrFail();
        const latest = await this.loadBookingRelations(latestRaw, tx);
        if (latest.status === 'TICKETED' || latest.status === 'PAID') {
          return {
            booking: latest,
            discountIrr: 0n,
            walletEntryId: null,
            ledgerEntryId: null,
          };
        }
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message: 'این رزرو قبلاً پرداخت شده است.',
        });
      }
      const issued = await tx.update(
        Booking,
        { id, status: 'PAID' },
        { status: 'TICKETED' },
      );
      if ((issued.affected ?? 0) === 0) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message: 'صدور بلیط ناموفق بود.',
        });
      }

      const issuedAt = new Date();
      const passengerTickets = await tx.find(Passenger, {
        where: { bookingId: id },
        order: { id: 'ASC' },
      });
      for (const passenger of passengerTickets) {
        if (passenger.ticketNo) continue;
        passenger.ticketNo = generateTicketNo();
        passenger.ticketIssuedAt = issuedAt;
      }
      await tx.save(passengerTickets);

      if (isLocked) {
        await tx.update(
          PriceLock,
          { id: booking.priceLock!.id },
          { status: 'USED' },
        );
      }

      if (reconciliationId) {
        await tx.update(
          PaymentReconciliation,
          { id: reconciliationId },
          { status: 'RESOLVED', resolvedAt: new Date() },
        );
      }

      const ledgerEntry = await tx.save(
        tx.create(LedgerEntry, {
          bookingId: id,
          type: 'SALE',
          signedAmountIrr: finalPriceIrr,
          createdById: user.id,
          agencyId: booking.agencyId,
        }),
      );

      // Public-inventory purchases made by an authenticated agency are still
      // agency-owned financial sales. Materialize the paid invoice in the
      // same transaction as wallet debit, ticket issuance and SALE ledger so
      // every projection either sees the complete purchase or none of it.
      if (lockedBooking.agencyId) {
        const paidAt = new Date();
        await tx.save(
          tx.create(AgencyInvoice, {
            agencyId: lockedBooking.agencyId,
            bookingId: id,
            invoiceNo: `SALE-${lockedBooking.pnr}`,
            issuedById: user.id,
            dueAt: paidAt,
            amountIrr: finalPriceIrr,
            descriptionFa: `فاکتور فروش بلیط ${lockedBooking.pnr}`,
            status: 'PAID',
            paidAt,
          }),
        );
      }

      // Real money spent (gateway/wallet) earns points; redeeming points to
      // pay never earns points back (no redeem-to-earn loophole).
      if (member && paymentMethod !== 'POINTS') {
        await this.clubPoints.earnForPurchase(tx, member.id, finalPriceIrr, id);
      }

      if (booking.userId) {
        await this.customerReferrals.processFirstTicketedBooking(
          tx,
          booking.userId,
          id,
        );
      }

      const finalRaw = await this.bookingWithFlightQuery(tx)
        .where('b.id = :id', { id })
        .getOneOrFail();
      return {
        booking: await this.loadBookingRelations(finalRaw, tx),
        discountIrr,
        walletEntryId,
        ledgerEntryId: ledgerEntry.id,
      };
    });

    await this.audit.record({
      actorId: user.id,
      actorRole: user.role,
      category: 'RESERVATION',
      action: 'پرداخت و صدور بلیط',
      detail: `رزرو ${paid.booking.pnr} پرداخت و بلیط صادر شد.`,
      entityType: 'Booking',
      entityId: paid.booking.id,
      metadata: {
        priceIrr: paid.booking.priceIrr,
        paymentMethod,
        discountIrr: paid.discountIrr,
        gatewayRefId,
        walletEntryId: paid.walletEntryId,
        ledgerEntryId: paid.ledgerEntryId,
      },
    });

    if (paid.booking.userId) {
      const origin =
        paid.booking.flightInstance?.flight?.route?.originCode ?? '';
      const dest = paid.booking.flightInstance?.flight?.route?.destCode ?? '';
      const routeLabel =
        origin && dest
          ? `${origin} → ${dest}`
          : (paid.booking.flightInstance?.flight?.flightNo ?? '');
      await this.notifications.notify(
        ticketedNotificationInput({
          recipientId: paid.booking.userId,
          bookingId: paid.booking.id,
          pnr: paid.booking.pnr,
          routeLabel: routeLabel || undefined,
        }),
      );
    }

    return {
      priceChanged: false as const,
      booking: this.toDetail(paid.booking),
      walletBalanceIrr: await this.wallet.getBalance(user.id),
    };
  }
}
