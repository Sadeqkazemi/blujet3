import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { User } from '../../database/entities/user.entity';
import { CustomerReferral } from '../../database/entities/customer-referral.entity';
import { ClubMember } from '../../database/entities/club-member.entity';
import { ClubPointsEntry } from '../../database/entities/club-points-entry.entity';
import { ClubTierRule } from '../../database/entities/club-tier-rule.entity';
import { isUniqueViolation } from '../../database/utils/pg-errors';
import {
  generateReferralCode,
  normalizeReferralCode,
} from '../../common/referral-code.util';
import { resolveTierForPoints } from '../club/club.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { LoyaltyProjectionEventService } from '../loyalty-projection-outbox/loyalty-projection-event.service';

/** Server-side reward per referred friend's first ticketed booking — matches
 * design-reference-v2/پنل کاربر.dc.html copy («۵۰۰ امتیاز»). */
export const REFERRAL_REWARD_POINTS = 500;

@Injectable()
export class CustomerReferralsService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(CustomerReferral)
    private readonly referralRepo: Repository<CustomerReferral>,
    private readonly projection: LoyaltyProjectionEventService,
  ) {}

  private sharePath(code: string): string {
    return `/signin?ref=${encodeURIComponent(code)}`;
  }

  async ensureReferralCode(userId: string, fullName: string): Promise<string> {
    const user = await this.userRepo.findOneByOrFail({ id: userId });
    if (user.referralCode) return user.referralCode;

    for (let attempt = 0; attempt < 8; attempt++) {
      const code = generateReferralCode(fullName, userId);
      try {
        await this.userRepo.update({ id: userId }, { referralCode: code });
        return code;
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        // unique collision — retry
      }
    }
    const fallback = `${userId.slice(0, 8).toUpperCase()}-${Date.now() % 10000}`;
    await this.userRepo.update({ id: userId }, { referralCode: fallback });
    return fallback;
  }

  async getDashboard(user: AuthenticatedUser) {
    const code = await this.ensureReferralCode(user.id, user.fullName);
    const rows = await this.referralRepo
      .createQueryBuilder('r')
      .leftJoin('r.referred', 'referred')
      .addSelect(['referred.id', 'referred.fullName', 'referred.createdAt'])
      .where('r.referrerUserId = :userId', { userId: user.id })
      .orderBy('r.createdAt', 'DESC')
      .getMany();

    const invitedCount = rows.length;
    const successfulBookings = rows.filter(
      (r) => r.status === 'BOOKED' || r.status === 'REWARDED',
    ).length;
    const pointsEarned = rows.reduce((sum, r) => sum + r.pointsAwarded, 0);

    return {
      referralCode: code,
      sharePath: this.sharePath(code),
      stats: {
        invitedCount,
        pointsEarned,
        successfulBookings,
      },
      invites: rows.map((r) => ({
        id: r.id,
        fullName: r.referred.fullName,
        joinedAt: r.referred.createdAt,
        status: r.status,
        pointsAwarded: r.pointsAwarded,
      })),
    };
  }

  /** Called when a brand-new customer account is created via OTP. Invalid or
   * self-referral codes are ignored silently so signup never fails. */
  async applyOnSignup(
    manager: EntityManager,
    referredUserId: string,
    rawCode?: string,
  ): Promise<void> {
    if (!rawCode?.trim()) return;
    const code = normalizeReferralCode(rawCode);
    const referrer = await manager.findOneBy(User, {
      referralCode: code,
      role: 'USER',
      isActive: true,
    });
    if (!referrer || referrer.id === referredUserId) return;

    const already = await manager.findOneBy(CustomerReferral, {
      referredUserId,
    });
    if (already) return;

    const referral = await manager.save(
      manager.create(CustomerReferral, {
        referrerUserId: referrer.id,
        referredUserId,
        status: 'SIGNED_UP',
        updatedAt: new Date(),
      }),
    );
    await this.projection.recordReferral(manager, referral, 'CREATED');
  }

  /** Award referrer when a referred user completes their first ticketed
   * booking. Idempotent — safe to call on every pay() for that user. */
  async processFirstTicketedBooking(
    manager: EntityManager,
    referredUserId: string,
    bookingId: string,
  ): Promise<void> {
    const referral = await manager.findOne(CustomerReferral, {
      where: { referredUserId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!referral || referral.status !== 'SIGNED_UP') return;

    const referrerMember = await manager.findOne(ClubMember, {
      where: {
        userId: referral.referrerUserId,
        deactivatedAt: IsNull(),
      },
      lock: { mode: 'pessimistic_write' },
    });

    let pointsAwarded = 0;
    if (referrerMember) {
      pointsAwarded = REFERRAL_REWARD_POINTS;
      const pointsEntry = await manager.save(
        manager.create(ClubPointsEntry, {
          clubMemberId: referrerMember.id,
          type: 'EARN',
          signedPoints: pointsAwarded,
          bookingId,
        }),
      );
      await this.projection.recordPointsEntry(manager, pointsEntry, 'CREATED');
      const sumRow = await manager
        .createQueryBuilder(ClubPointsEntry, 'e')
        .select('SUM(e."signedPoints")', 'sum')
        .where('e."clubMemberId" = :clubMemberId', {
          clubMemberId: referrerMember.id,
        })
        .getRawOne<{ sum: string | null }>();
      const points = sumRow?.sum ? Number(sumRow.sum) : 0;
      const rule = await manager
        .createQueryBuilder(ClubTierRule, 'r')
        .orderBy('r.createdAt', 'ASC')
        .getOne();
      const level = rule ? resolveTierForPoints(points, rule) : undefined;
      await manager.update(
        ClubMember,
        { id: referrerMember.id },
        { points, ...(level ? { level } : {}) },
      );
      const updatedMember = await manager.findOneByOrFail(ClubMember, {
        id: referrerMember.id,
      });
      await this.projection.recordMember(
        manager,
        updatedMember,
        'POINTS_CHANGED',
      );
    }

    referral.status = 'REWARDED';
    referral.firstBookingId = bookingId;
    referral.pointsAwarded = pointsAwarded;
    referral.rewardedAt = new Date();
    referral.updatedAt = new Date();
    const rewarded = await manager.save(referral);
    await this.projection.recordReferral(manager, rewarded, 'REWARDED');
  }
}
