import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as crypto from 'node:crypto';
import { EntityManager, QueryFailedError, Repository } from 'typeorm';
import { RefundRequest } from '../../database/entities/refund-request.entity';
import { RefundPenaltyRule } from '../../database/entities/refund-penalty-rule.entity';
import { Booking } from '../../database/entities/booking.entity';
import { Passenger } from '../../database/entities/passenger.entity';
import { FlightInstance } from '../../database/entities/flight-instance.entity';
import { User } from '../../database/entities/user.entity';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { refundSubmittedNotificationInput } from '../notifications/customer-notification-copy';
import { refundPaidNotificationInput } from '../notifications/customer-notification-copy';
import { ErrorCode } from '../../common/errors';
import { decryptPii, encryptPii } from '../../common/pii-crypto';
import { matchesLastName } from '../../common/passenger-name.util';
import { computePenalty } from './penalty';
import { StepUpService } from '../auth/step-up.service';
import { negateIrr } from '../../common/money';
import type { Irr } from '../../common/money';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { LedgerEntry } from '../../database/entities/ledger-entry.entity';
import type { JsonValue } from '../../database/json-types';
import { SearchService } from '../booking-engine/search.service';

/** List-row shape: no PII at all (the design's cards show none). */
function toListRow(r: RefundRequest) {
  const { nidEnc, mobileEnc, ibanEnc, ...rest } = r;
  void nidEnc;
  void mobileEnc;
  void ibanEnc;
  return rest;
}

/** Customer-facing row: strips PII, flattens the joined booking/flight/route. */
function toCustomerRow(r: RefundRequest) {
  const { nidEnc, mobileEnc, ibanEnc, booking, ...rest } = r;
  void nidEnc;
  void mobileEnc;
  void ibanEnc;
  const instance = booking.flightInstance;
  const flight = instance.flight;
  return {
    ...rest,
    bookingId: booking.id,
    pnr: booking.pnr,
    flightNo: flight.flightNo,
    originCode: flight.route.originCode,
    destCode: flight.route.destCode,
    departureAt: instance.departureAt,
  };
}

function newTrackingCode(): string {
  return `RF-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

function isUniqueViolation(err: unknown, constraintName: string): boolean {
  if (!(err instanceof QueryFailedError)) return false;
  const driverErr = err.driverError as { code?: string; constraint?: string };
  return driverErr.code === '23505' && driverErr.constraint === constraintName;
}

export function bookingBelongsToActor(
  booking: Pick<Booking, 'userId' | 'agencyId'>,
  actorId: string,
): boolean {
  return booking.userId === actorId || booking.agencyId === actorId;
}

@Injectable()
export class RefundsService {
  constructor(
    @InjectRepository(RefundRequest)
    private readonly refundRepo: Repository<RefundRequest>,
    @InjectRepository(RefundPenaltyRule)
    private readonly ruleRepo: Repository<RefundPenaltyRule>,
    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,
    @InjectRepository(Passenger)
    private readonly passengerRepo: Repository<Passenger>,
    @InjectRepository(FlightInstance)
    private readonly flightInstanceRepo: Repository<FlightInstance>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly audit: AuditService,
    private readonly stepUp: StepUpService,
    private readonly notifications: NotificationsService,
    private readonly search: SearchService,
  ) {}

  /** RefundRequest has a recursive JsonValue `history` column, which makes
   * TypeScript choke (TS2589) on any `find`/`findOneBy`/`update` call —
   * query-builder `.getCount()` sidesteps the deep-generic inference. */
  private async hasRefundRequest(
    bookingId: string,
    manager: EntityManager = this.refundRepo.manager,
  ): Promise<boolean> {
    const count = await manager
      .createQueryBuilder(RefundRequest, 'r')
      .where('r.bookingId = :bookingId', { bookingId })
      .getCount();
    return count > 0;
  }

  private staffDetailQuery() {
    return this.refundRepo
      .createQueryBuilder('r')
      .leftJoin('r.assignee', 'assignee')
      .addSelect(['assignee.id', 'assignee.fullName', 'assignee.role'])
      .leftJoin('r.processedBy', 'processedBy')
      .addSelect(['processedBy.id', 'processedBy.fullName', 'processedBy.role'])
      .leftJoinAndSelect('r.booking', 'booking')
      .leftJoinAndSelect('booking.flightInstance', 'flightInstance')
      .leftJoinAndSelect('flightInstance.flight', 'flight')
      .leftJoinAndSelect('flight.route', 'route');
  }

  private async getOrThrow(id: string) {
    const request = await this.staffDetailQuery()
      .where('r.id = :id', { id })
      .getOne();
    if (!request) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'درخواست استرداد یافت نشد.',
      });
    }
    return request;
  }

  async list() {
    const requests = await this.staffDetailQuery()
      .orderBy('r.createdAt', 'DESC')
      .getMany();

    const kpis = {
      payoutQueue: requests.filter((r) => r.status === 'FINANCE').length,
      paid: requests.filter((r) => r.status === 'PAID').length,
      awaitingAdmin: requests.filter(
        (r) => r.status === 'SUBMITTED' || r.status === 'REVIEW',
      ).length,
    };

    return { requests: requests.map(toListRow), kpis };
  }

  /** Detail for the modal — the only surface that receives the decrypted شبا/PII. */
  async detail(id: string) {
    const r = await this.getOrThrow(id);
    const { nidEnc, mobileEnc, ibanEnc, ...rest } = r;
    return {
      ...rest,
      nationalId: nidEnc ? decryptPii(nidEnc) : null,
      mobile: mobileEnc ? decryptPii(mobileEnc) : null,
      iban: decryptPii(ibanEnc),
    };
  }

  async refer(actor: AuthenticatedUser, id: string, assigneeId: string) {
    const request = await this.getOrThrow(id);
    if (request.status === 'PAID') {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'پرونده این درخواست بسته شده است.',
      });
    }

    const assignee = await this.userRepo.findOneBy({ id: assigneeId });
    if (
      !assignee ||
      !assignee.isActive ||
      !(
        assignee.role === 'FINANCE_MANAGER' ||
        (assignee.role === 'EMPLOYEE' && assignee.dept === 'finance')
      )
    ) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'مقصد ارجاع باید مدیر مالی یا کارمند فعال واحد مالی باشد.',
      });
    }

    const history = Array.isArray(request.history)
      ? [...(request.history as unknown[])]
      : [];
    const advancesToFinance =
      actor.role === 'SITE_ADMIN' &&
      (request.status === 'SUBMITTED' || request.status === 'REVIEW');
    const now = new Date().toISOString();
    if (advancesToFinance) {
      history.push(
        {
          step: 'review',
          labelFa: `بررسی درخواست توسط ${actor.fullName} (ادمین سایت)`,
          at: now,
        },
        {
          step: 'finance',
          labelFa: `ارجاع به ${assignee.fullName} (واحد مالی)`,
          at: now,
        },
      );
    } else {
      history.push({
        step: request.status.toLowerCase(),
        labelFa: `تغییر مسئول پرونده به ${assignee.fullName} توسط ${actor.fullName}`,
        at: now,
      });
    }

    request.assigneeId = assigneeId;
    request.status = advancesToFinance ? 'FINANCE' : request.status;
    request.history = history as JsonValue;
    await this.refundRepo.save(request);

    const updated = await this.refundRepo
      .createQueryBuilder('r')
      .leftJoin('r.assignee', 'assignee')
      .addSelect(['assignee.id', 'assignee.fullName', 'assignee.role'])
      .where('r.id = :id', { id })
      .getOneOrFail();

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'REFUND',
      action: 'ارجاع درخواست استرداد',
      detail: `درخواست استرداد «${request.passengerName}» توسط ${actor.fullName} به ${assignee.fullName} ارجاع شد.`,
      entityType: 'RefundRequest',
      entityId: id,
    });

    return toListRow(updated);
  }

  async pay(
    actor: AuthenticatedUser,
    id: string,
    stepUpChallengeId: string,
    stepUpCode: string,
  ) {
    await this.stepUp.verify(
      actor,
      stepUpChallengeId,
      stepUpCode,
      'REFUND_PAYOUT',
    );
    const request = await this.getOrThrow(id);
    if (request.status !== 'FINANCE') {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message:
          request.status === 'PAID'
            ? 'این درخواست قبلاً پرداخت شده است.'
            : 'در انتظار ادمین',
      });
    }

    const history = Array.isArray(request.history)
      ? [...(request.history as unknown[])]
      : [];
    history.push({
      step: 'paid',
      labelFa: `تأیید، واریز وجه و بستن پرونده توسط ${request.assignee?.fullName ?? actor.fullName}`,
      at: new Date().toISOString(),
    });

    // ⚑ Real financial effect, one transaction: ledger reversal + booking
    // REFUNDED + request PAID. The conditional update is the double-pay guard.
    await this.refundRepo.manager.transaction(async (tx) => {
      const result = await tx
        .createQueryBuilder()
        .update(RefundRequest)
        .set({
          status: 'PAID',
          processedById: actor.id,
          paidAt: new Date(),
        })
        .where('id = :id', { id })
        .andWhere('status = :status', { status: 'FINANCE' })
        .execute();
      if ((result.affected ?? 0) === 0) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message: 'این درخواست قبلاً پرداخت شده است.',
        });
      }
      // `history` is a recursive JsonValue column — including it directly in
      // a query-builder `.set()` triggers TS2589, so it's persisted via a
      // fresh-fetch + entity mutation + `save()` instead (safe now that the
      // guarded status flip above already won the double-pay race).
      const freshEntity = await tx
        .createQueryBuilder(RefundRequest, 'r')
        .where('r.id = :id', { id })
        .getOneOrFail();
      freshEntity.history = history as JsonValue;
      await tx.save(freshEntity);
      await tx.save(
        tx.create(LedgerEntry, {
          bookingId: request.bookingId,
          agencyId: request.booking?.agencyId ?? null,
          type: 'REFUND',
          signedAmountIrr: negateIrr(request.refundableIrr),
          createdById: actor.id,
        }),
      );
      await tx.update(
        Booking,
        { id: request.bookingId },
        { status: 'REFUNDED' },
      );
    });
    await this.search.invalidateForInstance(request.booking.flightInstanceId);

    const updated = await this.refundRepo
      .createQueryBuilder('r')
      .leftJoin('r.processedBy', 'processedBy')
      .addSelect(['processedBy.id', 'processedBy.fullName', 'processedBy.role'])
      .where('r.id = :id', { id })
      .getOneOrFail();

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'REFUND',
      action: 'تأیید و واریز استرداد',
      detail: `استرداد «${request.passengerName}» به مبلغ ${request.refundableIrr} ریال توسط ${actor.fullName} پرداخت و پرونده بسته شد.`,
      entityType: 'RefundRequest',
      entityId: id,
      metadata: {
        refundableIrr: request.refundableIrr,
        bookingId: request.bookingId,
      },
    });

    const refundRecipientId =
      request.booking?.userId ?? request.booking?.agencyId ?? null;
    if (refundRecipientId) {
      await this.notifications.notify(
        refundPaidNotificationInput({
          recipientId: refundRecipientId,
          refundId: id,
          pnr: request.booking.pnr,
        }),
      );
    }

    return toListRow(updated);
  }

  /** Public purchase engine: the customer's own submission — CLAUDE.md's
   * "fare-rule–driven penalty calculation, user-visible breakdown before
   * confirmation." Booking must be TICKETED and owned by the caller; only
   * one request per booking (enforced by the unique index on `bookingId`,
   * backstopping the application-level check below against races). */
  private previewForBooking(
    booking: Pick<Booking, 'id' | 'priceIrr'> & {
      flightInstance: Pick<FlightInstance, 'departureAt'>;
    },
    rules: RefundPenaltyRule[],
  ) {
    const hoursLeft =
      (booking.flightInstance.departureAt.getTime() - Date.now()) / 3_600_000;
    const penalty = computePenalty(rules, hoursLeft, booking.priceIrr);
    return {
      bookingId: booking.id,
      totalPaidIrr: booking.priceIrr,
      hoursLeft: Math.max(0, hoursLeft),
      penaltyPct: penalty.penaltyPct,
      penaltyAmountIrr: penalty.penaltyAmountIrr,
      refundableIrr: penalty.refundableIrr,
      refundable: hoursLeft > 0 && penalty.penaltyPct < 100,
    };
  }

  private assertRefundable(
    booking: Pick<Booking, 'id' | 'priceIrr' | 'status'> & {
      flightInstance: Pick<FlightInstance, 'departureAt'>;
    },
    rules: RefundPenaltyRule[],
    hasExistingRequest: boolean,
  ) {
    if (booking.status !== 'TICKETED' && booking.status !== 'PAID') {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'این رزرو واجد شرایط استرداد نیست.',
      });
    }
    if (hasExistingRequest) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'برای این رزرو قبلاً درخواست استرداد ثبت شده است.',
      });
    }
    const preview = this.previewForBooking(booking, rules);
    if (!preview.refundable) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'با کمتر از ۳ ساعت زمان تا پرواز، استرداد مجاز نیست.',
      });
    }
    return preview;
  }

  private bookingWithFlightQuery() {
    return this.bookingRepo
      .createQueryBuilder('b')
      .leftJoinAndSelect('b.flightInstance', 'flightInstance')
      .leftJoinAndSelect('flightInstance.flight', 'flight')
      .leftJoinAndSelect('flight.route', 'route');
  }

  async listEligibleBookings(userId: string) {
    const [bookings, rules] = await Promise.all([
      this.bookingWithFlightQuery()
        .where('(b.userId = :userId OR b.agencyId = :userId)', { userId })
        .andWhere('b.status IN (:...statuses)', {
          statuses: ['TICKETED', 'PAID'],
        })
        .andWhere(
          'NOT EXISTS (SELECT 1 FROM refund_requests rr WHERE rr."bookingId" = b.id)',
        )
        .orderBy('flightInstance.departureAt', 'ASC')
        .getMany(),
      this.ruleRepo.find(),
    ]);

    return bookings.flatMap((booking) => {
      const preview = this.previewForBooking(booking, rules);
      if (!preview.refundable) return [];
      const flight = booking.flightInstance.flight;
      return [
        {
          ...preview,
          pnr: booking.pnr,
          flightNo: flight.flightNo,
          originCode: flight.route.originCode,
          destCode: flight.route.destCode,
          departureAt: booking.flightInstance.departureAt,
        },
      ];
    });
  }

  async listCustomerRules() {
    const rules = await this.ruleRepo.find({
      order: { minHoursBeforeDeparture: 'DESC' },
    });
    return rules.map((rule) => ({
      minHoursBeforeDeparture: rule.minHoursBeforeDeparture,
      penaltyPct: rule.penaltyPct,
      labelFa: rule.labelFa,
      isRefundable: rule.penaltyPct < 100,
    }));
  }

  async previewMine(userId: string, bookingId: string) {
    const [booking, rules] = await Promise.all([
      this.bookingWithFlightQuery()
        .where('b.id = :bookingId', { bookingId })
        .getOne(),
      this.ruleRepo.find(),
    ]);
    if (!booking || !bookingBelongsToActor(booking, userId)) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'رزرو یافت نشد.',
      });
    }
    const existing = await this.hasRefundRequest(booking.id);
    return this.assertRefundable(booking, rules, existing);
  }

  async submitFromCustomer(
    actor: AuthenticatedUser,
    dto: { bookingId: string; iban: string },
  ) {
    let request: RefundRequest | null = null;
    for (let attempt = 0; attempt < 3 && !request; attempt += 1) {
      try {
        request = await this.refundRepo.manager.transaction(async (tx) => {
          const booking = await tx
            .createQueryBuilder(Booking, 'b')
            .leftJoinAndSelect('b.flightInstance', 'flightInstance')
            .leftJoinAndSelect('flightInstance.flight', 'flight')
            .leftJoinAndSelect('flight.route', 'route')
            .where('b.id = :id', { id: dto.bookingId })
            .getOne();
          if (!booking || !bookingBelongsToActor(booking, actor.id)) {
            throw new NotFoundException({
              code: ErrorCode.NOT_FOUND,
              message: 'رزرو یافت نشد.',
            });
          }
          const rules = await tx.find(RefundPenaltyRule);
          const existing = await this.hasRefundRequest(booking.id, tx);
          const preview = this.assertRefundable(booking, rules, existing);
          const passenger = await tx.findOneBy(Passenger, {
            bookingId: booking.id,
          });
          const saved = await tx.save(
            tx.create(RefundRequest, {
              trackingCode: newTrackingCode(),
              bookingId: booking.id,
              passengerName: passenger?.fullName ?? actor.fullName,
              nidEnc: passenger?.nationalIdEnc ?? null,
              mobileEnc: passenger?.mobileEnc ?? null,
              ibanEnc: encryptPii(dto.iban),
              totalPaidIrr: preview.totalPaidIrr,
              penaltyPct: preview.penaltyPct,
              penaltyAmountIrr: preview.penaltyAmountIrr,
              refundableIrr: preview.refundableIrr,
              history: [
                {
                  step: 'submitted',
                  labelFa: 'ثبت درخواست استرداد توسط مشتری',
                  at: new Date().toISOString(),
                },
              ],
            }),
          );
          saved.booking = booking;
          return saved;
        });
      } catch (err) {
        if (isUniqueViolation(err, 'refund_requests_trackingCode_key')) {
          if (attempt < 2) continue;
          throw new ConflictException({
            code: ErrorCode.CONFLICT,
            message: 'برای این رزرو قبلاً درخواست استرداد ثبت شده است.',
          });
        }
        if (isUniqueViolation(err, 'refund_requests_bookingId_key')) {
          throw new ConflictException({
            code: ErrorCode.CONFLICT,
            message: 'برای این رزرو قبلاً درخواست استرداد ثبت شده است.',
          });
        }
        throw err;
      }
    }
    if (!request) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'ثبت درخواست انجام نشد؛ لطفاً دوباره تلاش کنید.',
      });
    }

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'REFUND',
      action: 'ثبت درخواست استرداد',
      detail: `درخواست استرداد رزرو ${request.booking.pnr} توسط مشتری ثبت شد.`,
      entityType: 'RefundRequest',
      entityId: request.id,
    });

    await this.notifications.notify(
      refundSubmittedNotificationInput({
        recipientId: actor.id,
        refundId: request.id,
        pnr: request.booking.pnr,
      }),
    );

    return toCustomerRow(request);
  }

  /** Anonymous مدیریت رزرو self-service — same generic 404 whether the
   * PNR doesn't exist or the last name doesn't match (no audit row: an
   * anonymous caller has no real `actorId` — same precedent as Phase 16's
   * anonymous agency pre-registration). */
  async submitAnonymous(pnr: string, lastName: string, iban: string) {
    const booking = await this.bookingWithFlightQuery()
      .where('b.pnr = :pnr', { pnr: pnr.trim().toUpperCase() })
      .getOne();
    if (!booking) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'رزرو یافت نشد.',
      });
    }
    const passengers = await this.passengerRepo.find({
      where: { bookingId: booking.id },
    });
    const matchedPassenger = passengers.find((p) =>
      matchesLastName(p.fullName, lastName),
    );
    if (!matchedPassenger) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'رزرو یافت نشد.',
      });
    }

    const existing = await this.hasRefundRequest(booking.id);
    const rules = await this.ruleRepo.find();
    const preview = this.assertRefundable(booking, rules, existing);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const saved = await this.refundRepo.save(
          this.refundRepo.create({
            trackingCode: newTrackingCode(),
            bookingId: booking.id,
            passengerName: matchedPassenger.fullName,
            nidEnc: matchedPassenger.nationalIdEnc,
            mobileEnc: matchedPassenger.mobileEnc,
            ibanEnc: encryptPii(iban),
            totalPaidIrr: preview.totalPaidIrr,
            penaltyPct: preview.penaltyPct,
            penaltyAmountIrr: preview.penaltyAmountIrr,
            refundableIrr: preview.refundableIrr,
            history: [
              {
                step: 'submitted',
                labelFa: 'ثبت درخواست استرداد توسط مشتری',
                at: new Date().toISOString(),
              },
            ],
          }),
        );
        saved.booking = booking;
        if (booking.userId) {
          await this.notifications.notify(
            refundSubmittedNotificationInput({
              recipientId: booking.userId,
              refundId: saved.id,
              pnr: booking.pnr,
            }),
          );
        }
        return toCustomerRow(saved);
      } catch (err) {
        if (isUniqueViolation(err, 'refund_requests_trackingCode_key')) {
          if (attempt < 2) continue;
          throw new ConflictException({
            code: ErrorCode.CONFLICT,
            message: 'برای این رزرو قبلاً درخواست استرداد ثبت شده است.',
          });
        }
        if (isUniqueViolation(err, 'refund_requests_bookingId_key')) {
          throw new ConflictException({
            code: ErrorCode.CONFLICT,
            message: 'برای این رزرو قبلاً درخواست استرداد ثبت شده است.',
          });
        }
        throw err;
      }
    }
    throw new ConflictException({
      code: ErrorCode.CONFLICT,
      message: 'ثبت درخواست انجام نشد؛ لطفاً دوباره تلاش کنید.',
    });
  }

  async listMine(userId: string) {
    const requests = await this.refundRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.booking', 'booking')
      .leftJoinAndSelect('booking.flightInstance', 'flightInstance')
      .leftJoinAndSelect('flightInstance.flight', 'flight')
      .leftJoinAndSelect('flight.route', 'route')
      .where('(booking.userId = :userId OR booking.agencyId = :userId)', {
        userId,
      })
      .orderBy('r.createdAt', 'DESC')
      .getMany();
    return requests.map(toCustomerRow);
  }

  async getMine(userId: string, id: string) {
    const request = await this.refundRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.booking', 'booking')
      .leftJoinAndSelect('booking.flightInstance', 'flightInstance')
      .leftJoinAndSelect('flightInstance.flight', 'flight')
      .leftJoinAndSelect('flight.route', 'route')
      .where('r.id = :id', { id })
      .getOne();
    if (!request || !bookingBelongsToActor(request.booking, userId)) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'درخواست استرداد یافت نشد.',
      });
    }
    return toCustomerRow(request);
  }

  /**
   * Non-production only: creates a fresh TICKETED booking + FINANCE-status
   * request so Playwright always has a payable row (submission belongs to
   * the customer track). 404s in production.
   */
  async createTestRequest() {
    if (process.env.NODE_ENV === 'production') {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'یافت نشد.',
      });
    }
    const instance = await this.flightInstanceRepo.findOne({
      order: { departureAt: 'DESC' },
    });
    if (!instance) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'یافت نشد.',
      });
    }
    const totalPaidIrr: Irr = 30_000_000n;
    const booking = await this.bookingRepo.save(
      this.bookingRepo.create({
        pnr: `RF${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
        flightInstanceId: instance.id,
        channel: 'SYSTEM',
        status: 'TICKETED',
        priceIrr: totalPaidIrr,
      }),
    );
    const rules = await this.ruleRepo.find();
    const hoursLeft = (instance.departureAt.getTime() - Date.now()) / 3_600_000;
    const penalty = computePenalty(rules, hoursLeft, totalPaidIrr);

    return this.refundRepo.save(
      this.refundRepo.create({
        trackingCode: newTrackingCode(),
        bookingId: booking.id,
        passengerName: `مسافر آزمایشی ${crypto.randomUUID().slice(0, 4)}`,
        nidEnc: encryptPii('0012345679'),
        mobileEnc: encryptPii('09121112233'),
        ibanEnc: encryptPii('IR820170000000332211009900'),
        totalPaidIrr,
        penaltyPct: penalty.penaltyPct,
        penaltyAmountIrr: penalty.penaltyAmountIrr,
        refundableIrr: penalty.refundableIrr,
        status: 'FINANCE',
        history: [
          {
            step: 'submitted',
            labelFa: 'ثبت درخواست کنسلی توسط مشتری',
            at: 'اکنون',
          },
          {
            step: 'finance',
            labelFa: 'ارجاع به مدیر مالی توسط ادمین سایت',
            at: 'اکنون',
          },
        ],
      }),
    );
  }
}
