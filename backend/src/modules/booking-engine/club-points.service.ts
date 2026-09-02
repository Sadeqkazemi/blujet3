import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { ClubMember } from '../../database/entities/club-member.entity';
import { ClubPointsEntry } from '../../database/entities/club-points-entry.entity';
import { ClubTierRule } from '../../database/entities/club-tier-rule.entity';
import { ErrorCode } from '../../common/errors';
import { resolveTierForPoints } from '../club/club.service';
import type { Irr } from '../../common/money';

/** Server-side config (CLAUDE.md: "conversion rate is server-side config")
 * — documented constants rather than a SystemSetting key, since no other
 * Phase 13 rate lives there yet either. */
const IRR_PER_EARNED_POINT = 100_000;
const IRR_PER_REDEEMED_POINT = 10_000;

@Injectable()
export class ClubPointsService {
  constructor(
    @InjectRepository(ClubMember)
    private readonly clubMemberRepo: Repository<ClubMember>,
    @InjectRepository(ClubPointsEntry)
    private readonly pointsRepo: Repository<ClubPointsEntry>,
  ) {}

  async findMemberByUserId(userId: string) {
    return this.clubMemberRepo.findOneBy({
      userId,
      deactivatedAt: IsNull(),
    });
  }

  private async sumPoints(
    manager: EntityManager,
    clubMemberId: string,
  ): Promise<number> {
    const row = await manager
      .createQueryBuilder(ClubPointsEntry, 'e')
      .select('SUM(e."signedPoints")', 'sum')
      .where('e."clubMemberId" = :clubMemberId', { clubMemberId })
      .getRawOne<{ sum: string | null }>();
    return row?.sum ? Number(row.sum) : 0;
  }

  async getBalance(clubMemberId: string): Promise<number> {
    return this.sumPoints(this.pointsRepo.manager, clubMemberId);
  }

  /** Only called for GATEWAY/WALLET payments (real money spent) — never
   * when the purchase itself was paid with points, to avoid a
   * redeem-to-earn loophole. */
  async earnForPurchase(
    manager: EntityManager,
    clubMemberId: string,
    paidIrr: Irr,
    bookingId: string,
  ) {
    // Whole-IRR BigInt division (truncates, same as the old Math.floor) —
    // never routes the amount through a float.
    const points = Number(paidIrr / BigInt(IRR_PER_EARNED_POINT));
    if (points <= 0) return;
    await manager.save(
      manager.create(ClubPointsEntry, {
        clubMemberId,
        type: 'EARN',
        signedPoints: points,
        bookingId,
      }),
    );
    await this.syncCache(manager, clubMemberId);
  }

  /** "Pay with points" — the design's payment method for club members
   * (CLAUDE.md). Redeems exactly enough points to cover priceIrr; throws
   * if the member doesn't have enough. */
  async redeemForPayment(
    manager: EntityManager,
    clubMemberId: string,
    priceIrr: Irr,
    bookingId: string,
  ): Promise<number> {
    // BigInt ceiling division — (a + b - 1) / b — same semantics as the old
    // Math.ceil, no float involved.
    const rate = BigInt(IRR_PER_REDEEMED_POINT);
    const pointsNeeded = Number((priceIrr + rate - 1n) / rate);
    const balance = await this.sumPoints(manager, clubMemberId);
    if (balance < pointsNeeded) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'امتیاز باشگاه کافی نیست.',
      });
    }
    await manager.save(
      manager.create(ClubPointsEntry, {
        clubMemberId,
        type: 'REDEEM',
        signedPoints: -pointsNeeded,
        bookingId,
      }),
    );
    await this.syncCache(manager, clubMemberId);
    return pointsNeeded;
  }

  /** Keeps ClubMember.points (Phase 5's staff-facing display cache) in
   * sync — write-only from here, never read as the source of truth.
   * Phase 65: also recomputes ClubMember.level from the manager-configured
   * ClubTierRule thresholds every time points change, so tier promotion
   * (and demotion, on a redemption) is real rather than a manual-only
   * staff action. */
  private async syncCache(manager: EntityManager, clubMemberId: string) {
    const points = await this.sumPoints(manager, clubMemberId);
    const rule = await manager
      .createQueryBuilder(ClubTierRule, 'r')
      .orderBy('r.createdAt', 'ASC')
      .getOne();
    const level = rule ? resolveTierForPoints(points, rule) : undefined;
    await manager.update(
      ClubMember,
      { id: clubMemberId },
      { points, ...(level ? { level } : {}) },
    );
  }
}
