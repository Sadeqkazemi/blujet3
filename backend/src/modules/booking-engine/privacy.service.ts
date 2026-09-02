import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { User } from '../../database/entities/user.entity';
import { Booking } from '../../database/entities/booking.entity';
import { Passenger } from '../../database/entities/passenger.entity';
import { RefundRequest } from '../../database/entities/refund-request.entity';
import { WalletEntry } from '../../database/entities/wallet-entry.entity';
import { PriceLock } from '../../database/entities/price-lock.entity';
import { ClubMember } from '../../database/entities/club-member.entity';
import { ClubPointsEntry } from '../../database/entities/club-points-entry.entity';
import { RefreshToken } from '../../database/entities/refresh-token.entity';
import { decryptPii } from '../../common/pii-crypto';

/**
 * GDPR-equivalent export/delete for the public purchase engine
 * (CLAUDE.md: "implement passenger data export and deletion flows").
 */
@Injectable()
export class PrivacyService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,
    @InjectRepository(Passenger)
    private readonly passengerRepo: Repository<Passenger>,
    @InjectRepository(RefundRequest)
    private readonly refundRepo: Repository<RefundRequest>,
    @InjectRepository(WalletEntry)
    private readonly walletRepo: Repository<WalletEntry>,
    @InjectRepository(PriceLock)
    private readonly priceLockRepo: Repository<PriceLock>,
    @InjectRepository(ClubMember)
    private readonly clubMemberRepo: Repository<ClubMember>,
    @InjectRepository(ClubPointsEntry)
    private readonly pointsRepo: Repository<ClubPointsEntry>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
  ) {}

  async exportMyData(userId: string) {
    const [user, bookings, refunds, walletEntries, priceLocks, member] =
      await Promise.all([
        this.userRepo.findOneByOrFail({ id: userId }),
        this.bookingRepo
          .createQueryBuilder('b')
          .leftJoinAndSelect('b.flightInstance', 'flightInstance')
          .leftJoinAndSelect('flightInstance.flight', 'flight')
          .leftJoinAndSelect('flight.route', 'route')
          .where('b.userId = :userId', { userId })
          .orderBy('b.createdAt', 'DESC')
          .getMany(),
        // RefundRequest has a recursive JsonValue `history` column, which
        // makes bare find/findOneBy/update hit TS2589 — query-builder
        // sidesteps it (same fix as refunds.service.ts).
        this.refundRepo
          .createQueryBuilder('r')
          .innerJoin('r.booking', 'b')
          .where('b.userId = :userId', { userId })
          .orderBy('r.createdAt', 'DESC')
          .getMany(),
        this.walletRepo.find({
          where: { userId },
          order: { createdAt: 'DESC' },
        }),
        this.priceLockRepo.find({
          where: { userId },
          order: { createdAt: 'DESC' },
        }),
        this.clubMemberRepo.findOneBy({ userId }),
      ]);

    const bookingIds = bookings.map((b) => b.id);
    const passengers = bookingIds.length
      ? await this.passengerRepo.find({
          where: { bookingId: In(bookingIds) },
        })
      : [];
    const passengersByBooking = new Map<string, Passenger[]>();
    for (const p of passengers) {
      const list = passengersByBooking.get(p.bookingId) ?? [];
      list.push(p);
      passengersByBooking.set(p.bookingId, list);
    }

    const pointsEntries = member
      ? await this.pointsRepo.find({
          where: { clubMemberId: member.id },
          order: { createdAt: 'DESC' },
        })
      : [];

    return {
      user: {
        id: user.id,
        phone: user.phone,
        fullName: user.fullName,
        email: user.email,
        nationalId: user.nationalIdEnc ? decryptPii(user.nationalIdEnc) : null,
        passportNo: user.passportNoEnc ? decryptPii(user.passportNoEnc) : null,
        birthDate: user.birthDate,
        address: user.addressEnc ? decryptPii(user.addressEnc) : null,
        createdAt: user.createdAt,
      },
      bookings: bookings.map((b) => ({
        id: b.id,
        pnr: b.pnr,
        status: b.status,
        cabin: b.cabin,
        priceIrr: b.priceIrr,
        contactPhone: b.contactPhone,
        flightNo: b.flightInstance.flight.flightNo,
        originCode: b.flightInstance.flight.route.originCode,
        destCode: b.flightInstance.flight.route.destCode,
        departureAt: b.flightInstance.departureAt,
        createdAt: b.createdAt,
        passengers: (passengersByBooking.get(b.id) ?? []).map((p) => ({
          fullName: p.fullName,
          seatCode: p.seatCode,
          nationalId: p.nationalIdEnc ? decryptPii(p.nationalIdEnc) : null,
          mobile: p.mobileEnc ? decryptPii(p.mobileEnc) : null,
        })),
      })),
      refunds: refunds.map((r) => ({
        id: r.id,
        bookingId: r.bookingId,
        status: r.status,
        penaltyPct: r.penaltyPct,
        refundableIrr: r.refundableIrr,
        createdAt: r.createdAt,
      })),
      walletEntries,
      clubPoints: member
        ? {
            level: member.level,
            balance: member.points,
            entries: pointsEntries,
          }
        : null,
      priceLocks,
    };
  }

  /**
   * Soft-deletes the account and anonymizes passenger PII on the customer's
   * own bookings. Booking/ledger rows themselves are kept (financial audit
   * trail — CLAUDE.md's booking rules require soft delete there, hard
   * deletes only through this GDPR flow, which we still don't apply to the
   * financial rows, only to the PII fields). All refresh tokens are
   * revoked so no session survives the deletion.
   */
  async deleteMyAccount(userId: string) {
    const bookings = await this.bookingRepo.find({
      where: { userId },
      select: { id: true },
    });
    const bookingIds = bookings.map((b) => b.id);

    await this.userRepo.manager.transaction(async (tx) => {
      if (bookingIds.length) {
        await tx.update(
          Passenger,
          { bookingId: In(bookingIds) },
          {
            fullName: 'کاربر حذف‌شده',
            nationalIdEnc: null,
            nationalIdHash: null,
            mobileEnc: null,
            deletedAt: new Date(),
          },
        );
        await tx.update(
          Booking,
          { id: In(bookingIds) },
          { contactPhone: null },
        );
      }
      await tx.update(
        RefreshToken,
        { userId, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );
      await tx.update(
        User,
        { id: userId },
        {
          isActive: false,
          deletedAt: new Date(),
          phone: null,
          email: null,
          fullName: 'کاربر حذف‌شده',
          nationalIdEnc: null,
          nationalIdHash: null,
          passportNoEnc: null,
          birthDate: null,
          addressEnc: null,
          updatedAt: new Date(),
        },
      );
    });
  }
}
