import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ErrorCode } from '../common/errors';
import { ExecutiveCardRequestView } from './card-requests.dto';
import {
  CardRequestView,
  LockHistoryView,
  LockView,
  MembershipView,
  MemberView,
  TierRulesView,
  TierRulesProjection,
  MembersListItem,
  MembersListView,
} from './loyalty.dto';

interface MemberViewWithCard extends MemberView {
  cardNo: string | null;
}

interface MemberAggregateRow {
  totalMembers: string;
  issuedCards: string;
  silver: string;
  gold: string;
  platinum: string;
}

interface RequestAggregateRow {
  pendingRequests: string;
  submittedRequests: string;
}

function safeCount(value: string | undefined): number {
  if (!value || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))
    throw new ConflictException({
      code: ErrorCode.CONFLICT,
      message: 'شمارش اعضای باشگاه بیش از حد مجاز است.',
    });
  return Number(value);
}

@Injectable()
export class LoyaltyService {
  constructor(private readonly db: DataSource) {}

  private validCardHistory(value: unknown): boolean {
    return (
      Array.isArray(value) &&
      value.length <= 32 &&
      value.every((entry) => {
        if (typeof entry !== 'object' || entry === null || Array.isArray(entry))
          return false;
        const item = entry as Record<string, unknown>;
        return (
          Object.keys(item).sort().join(',') === 'at,labelFa,step' &&
          typeof item.step === 'string' &&
          item.step.length > 0 &&
          item.step.length <= 64 &&
          typeof item.labelFa === 'string' &&
          item.labelFa.length > 0 &&
          item.labelFa.length <= 2048 &&
          typeof item.at === 'string' &&
          item.at.length > 0 &&
          item.at.length <= 128
        );
      })
    );
  }

  async cardRequests(): Promise<ExecutiveCardRequestView[]> {
    const rows = await this.db.transaction('REPEATABLE READ', async (tx) => {
      await tx.query('SET TRANSACTION READ ONLY');
      return tx.query<ExecutiveCardRequestView[]>(
        `SELECT r.id, r."memberId", r.level, r.points, r.status,
          r."assignedTo", r."decidedById",
          CASE WHEN r."decidedAt" IS NULL THEN NULL ELSE to_char(r."decidedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END AS "decidedAt",
          r."cardNo", r.history,
          to_char(r."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
          CASE WHEN m.id IS NULL THEN NULL ELSE jsonb_build_object(
            'id', m.id, 'fullName', m."fullName", 'email', m.email,
            'points', m.points, 'level', m.level) END AS member
         FROM loyalty.club_card_requests r
         LEFT JOIN loyalty.club_members m ON m.id = r."memberId"
         WHERE r.status IN ('REFERRED', 'APPROVED', 'REJECTED')
         ORDER BY r."createdAt" DESC LIMIT 1001`,
      );
    });
    if (
      rows.length > 1000 ||
      rows.some((row) => !this.validCardHistory(row.history)) ||
      Buffer.byteLength(JSON.stringify({ success: true, data: rows }), 'utf8') >
        512 * 1024
    )
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'حجم صف درخواست کارت بیش از حد مجاز است.',
      });
    return rows;
  }

  async membersList(query: {
    level?: 'SILVER' | 'GOLD' | 'PLATINUM';
    q?: string;
  }): Promise<MembersListView> {
    const projection = await this.db.transaction(
      'REPEATABLE READ',
      async (tx) => {
        await tx.query('SET TRANSACTION READ ONLY');
        const params: string[] = [];
        const conditions = ['m."deactivatedAt" IS NULL'];
        if (query.level) {
          params.push(query.level);
          conditions.push(`m.level = $${params.length}`);
        }
        if (query.q !== undefined) {
          params.push('%' + query.q.trim() + '%');
          conditions.push(
            `(m."fullName" ILIKE $${params.length} OR m.email ILIKE $${params.length} OR m."cardNo" ILIKE $${params.length})`,
          );
        }
        const members = await tx.query<MembersListItem[]>(
          `SELECT m.id, m."userId", m."fullName", m.email,
            CASE WHEN m."birthDate" IS NULL THEN NULL ELSE to_char(m."birthDate", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END AS "birthDate",
            to_char(m."joinDate", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "joinDate",
            m.points, m.level, m."cardStatus", m."cardNo", m."issuedByLabelFa",
            to_char(m."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"
           FROM loyalty.club_members m
           WHERE ${conditions.join(' AND ')}
           ORDER BY m."joinDate" DESC LIMIT 1001`,
          params,
        );
        const memberAggregates = await tx.query<MemberAggregateRow[]>(
          `SELECT COUNT(*)::text AS "totalMembers",
            COUNT(*) FILTER (WHERE "cardStatus" = 'ISSUED')::text AS "issuedCards",
            COUNT(*) FILTER (WHERE level = 'SILVER')::text AS silver,
            COUNT(*) FILTER (WHERE level = 'GOLD')::text AS gold,
            COUNT(*) FILTER (WHERE level = 'PLATINUM')::text AS platinum
           FROM loyalty.club_members WHERE "deactivatedAt" IS NULL`,
        );
        const requestAggregates = await tx.query<RequestAggregateRow[]>(
          `SELECT COUNT(*) FILTER (WHERE status = 'REFERRED')::text AS "pendingRequests",
            COUNT(*) FILTER (WHERE status = 'SUBMITTED')::text AS "submittedRequests"
           FROM loyalty.club_card_requests`,
        );
        return {
          members,
          memberAggregates: memberAggregates[0],
          requestAggregates: requestAggregates[0],
        };
      },
    );
    if (projection.members.length > 1000)
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'تعداد اعضای باشگاه بیش از حد مجاز است.',
      });
    const members = projection.members;
    const result: MembersListView = {
      members,
      kpis: {
        totalMembers: safeCount(projection.memberAggregates?.totalMembers),
        issuedCards: safeCount(projection.memberAggregates?.issuedCards),
        pendingRequests: safeCount(
          projection.requestAggregates?.pendingRequests,
        ),
        submittedRequests: safeCount(
          projection.requestAggregates?.submittedRequests,
        ),
        tierCounts: {
          SILVER: safeCount(projection.memberAggregates?.silver),
          GOLD: safeCount(projection.memberAggregates?.gold),
          PLATINUM: safeCount(projection.memberAggregates?.platinum),
        },
      },
    };
    if (Buffer.byteLength(JSON.stringify(result), 'utf8') > 512 * 1024)
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'حجم فهرست اعضای باشگاه بیش از حد مجاز است.',
      });
    return result;
  }

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
