import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ErrorCode } from '../common/errors';
import { LockView, MemberView } from './loyalty.dto';

@Injectable()
export class LoyaltyService {
  constructor(private readonly db: DataSource) {}

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
}
