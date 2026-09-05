import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ErrorCode } from '../common/errors';
import {
  CardRequestView,
  LockHistoryView,
  LockView,
  MembershipView,
  MemberView,
  TierRulesView,
  TierRulesProjection,
} from './loyalty.dto';

interface MemberViewWithCard extends MemberView {
  cardNo: string | null;
}

@Injectable()
export class LoyaltyService {
  constructor(private readonly db: DataSource) {}

  async tierRules(): Promise<TierRulesProjection | null> {
    const rows = await this.db.transaction('REPEATABLE READ', async (tx) => {
      await tx.query('SET TRANSACTION READ ONLY');
      return tx.query<TierRulesProjection[]>(
        `SELECT "goldMinPoints", "platinumMinPoints", "cardRequestMinPoints",
          to_char("updatedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "updatedAt",
          "updatedById"
         FROM loyalty.club_tier_rules ORDER BY "createdAt" ASC LIMIT 1`,
      );
    });
    return rows[0] ?? null;
  }

  private assertOwner(userId: string, callerId: string | undefined): void {
    if (callerId !== userId)
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'دسترسی به اطلاعات این مالک مجاز نیست.',
      });
  }

  async member(
    userId: string,
    callerId: string | undefined,
  ): Promise<MemberView> {
    this.assertOwner(userId, callerId);
    const rows = await this.db.transaction(async (tx) => {
      await tx.query('SET TRANSACTION READ ONLY');
      return tx.query<MemberView[]>(
        `
        SELECT m.id, m."userId", m.level, m."cardStatus",
          COALESCE((SELECT SUM(e."signedPoints") FROM loyalty.club_points_entries e
            WHERE e."clubMemberId" = m.id), 0)::text AS points
        FROM loyalty.club_members m
        WHERE m."userId" = $1 AND m."deactivatedAt" IS NULL`,
        [userId],
      );
    });
    if (!rows[0])
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'عضویت فعال یافت نشد.',
      });
    return rows[0];
  }

  async membership(
    userId: string,
    callerId: string | undefined,
  ): Promise<MembershipView> {
    this.assertOwner(userId, callerId);
    const projection = await this.db.transaction(
      'REPEATABLE READ',
      async (tx) => {
        await tx.query('SET TRANSACTION READ ONLY');
        const rules = await tx.query<TierRulesView[]>(
          `SELECT "goldMinPoints", "platinumMinPoints", "cardRequestMinPoints"
         FROM loyalty.club_tier_rules ORDER BY "createdAt" ASC LIMIT 1`,
        );
        const members = await tx.query<MemberViewWithCard[]>(
          `SELECT m.id, m."userId", m.level, m."cardStatus", m."cardNo",
          COALESCE((SELECT SUM(e."signedPoints") FROM loyalty.club_points_entries e
            WHERE e."clubMemberId" = m.id), 0)::text AS points
         FROM loyalty.club_members m
         WHERE m."userId" = $1 AND m."deactivatedAt" IS NULL`,
          [userId],
        );
        let request: CardRequestView | null = null;
        if (members[0]) {
          const requests = await tx.query<CardRequestView[]>(
            `SELECT id, status, history, "cardNo",
            to_char("createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"
           FROM loyalty.club_card_requests
           WHERE "memberId" = $1 AND status IN ('SUBMITTED','REFERRED','APPROVED')
           ORDER BY "createdAt" DESC LIMIT 1`,
            [members[0].id],
          );
          request = requests[0] ?? null;
        }
        return { rules: rules[0], member: members[0], request };
      },
    );
    const tierRules = projection.rules ?? {
      goldMinPoints: 5000,
      platinumMinPoints: 15000,
      cardRequestMinPoints: 5000,
    };
    const member = projection.member;
    if (!member)
      return {
        userId,
        isMember: false,
        level: null,
        balance: '0',
        cardStatus: null,
        cardNo: null,
        tierRules,
        cardRequest: null,
        canRequestCard: false,
        pointsNeededForCard: String(tierRules.cardRequestMinPoints),
      };
    if (
      projection.request &&
      (!Array.isArray(projection.request.history) ||
        projection.request.history.length > 32)
    )
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'تاریخچه درخواست کارت بیش از حد مجاز است.',
      });
    const balance = BigInt(member.points);
    const cardThreshold = BigInt(tierRules.cardRequestMinPoints);
    const canRequestCard =
      member.cardStatus === 'NONE' &&
      balance >= cardThreshold &&
      !projection.request;
    return {
      userId,
      isMember: true,
      level: member.level,
      balance: member.points,
      cardStatus: member.cardStatus,
      cardNo: member.cardNo,
      tierRules,
      cardRequest: projection.request,
      canRequestCard,
      pointsNeededForCard:
        balance >= cardThreshold ? '0' : String(cardThreshold - balance),
    };
  }

  async locks(
    userId: string,
    callerId: string | undefined,
    at = new Date(),
  ): Promise<LockView[]> {
    this.assertOwner(userId, callerId);
    const rows = await this.db.transaction(async (tx) => {
      await tx.query('SET TRANSACTION READ ONLY');
      return tx.query<LockView[]>(
        `
        SELECT id, "flightInstanceId", cabin, "lockedPriceIrr"::text, "feeIrr"::text,
          status, to_char("expiresAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "expiresAt",
          to_char("createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt", "bookingId"
        FROM loyalty.price_locks
        WHERE "userId" = $1 AND status = 'ACTIVE' AND "expiresAt" > $2
        ORDER BY id LIMIT 1001`,
        [userId, at.toISOString()],
      );
    });
    if (rows.length > 1000)
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'تعداد نتایج بیش از حد مجاز مقایسه است.',
      });
    return rows;
  }

  async lockHistory(
    userId: string,
    callerId: string | undefined,
  ): Promise<LockHistoryView> {
    this.assertOwner(userId, callerId);
    const locks = await this.db.transaction(async (tx) => {
      await tx.query('SET TRANSACTION READ ONLY');
      return tx.query<LockView[]>(
        `
        SELECT id, "flightInstanceId", cabin, "lockedPriceIrr"::text, "feeIrr"::text,
          status, to_char("expiresAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "expiresAt",
          to_char("createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt", "bookingId"
        FROM loyalty.price_locks
        WHERE "userId" = $1
        ORDER BY "createdAt" DESC, id DESC LIMIT 1001`,
        [userId],
      );
    });
    if (locks.length > 1000)
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'تعداد نتایج بیش از حد مجاز است.',
      });
    return { userId, locks };
  }
}
