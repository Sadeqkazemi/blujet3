import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { ErrorCode } from './common/errors';

@ApiTags('health')
@Controller()
export class HealthController {
  constructor(
    private readonly db: DataSource,
    private readonly config: ConfigService,
  ) {}

  @Get('health')
  @ApiOperation({ summary: 'زنده‌بودن سرویس بدون اطلاعات حساس' })
  @ApiResponse({ status: 200, description: 'زنده' })
  live() {
    return {
      status: 'ok',
      service: 'blujet-loyalty',
      version: '0.1.0',
      commit: process.env.GIT_COMMIT_SHA ?? 'unknown',
    };
  }

  @Get('ready')
  @ApiOperation({ summary: 'آمادگی دیتابیس و قرارداد خواندن' })
  @ApiResponse({ status: 200, description: 'آماده' })
  @ApiResponse({ status: 503, description: 'دیتابیس آماده نیست' })
  async ready() {
    try {
      await this.db.transaction(async (tx) => {
        await tx.query('SET TRANSACTION READ ONLY');
        await tx.query(
          'SELECT id, "userId", level, "cardStatus", "deactivatedAt" FROM loyalty.club_members LIMIT 0',
        );
        await tx.query(
          'SELECT "clubMemberId", "signedPoints" FROM loyalty.club_points_entries LIMIT 0',
        );
        await tx.query(
          'SELECT id, "userId", "flightInstanceId", cabin, "lockedPriceIrr", "feeIrr", status, "expiresAt", "createdAt", "bookingId" FROM loyalty.price_locks LIMIT 0',
        );
        if (
          this.config.get<string>('LOYALTY_MEMBERSHIP_PROJECTION_ENABLED') ===
          'true'
        ) {
          await tx.query('SELECT "cardNo" FROM loyalty.club_members LIMIT 0');
          await tx.query(
            'SELECT id, "memberId", status, history, "cardNo", "createdAt" FROM loyalty.club_card_requests LIMIT 0',
          );
          await tx.query(
            'SELECT "goldMinPoints", "platinumMinPoints", "cardRequestMinPoints", "createdAt" FROM loyalty.club_tier_rules LIMIT 0',
          );
        }
        if (
          this.config.get<string>('LOYALTY_TIER_RULES_PROJECTION_ENABLED') ===
          'true'
        ) {
          await tx.query(
            'SELECT "goldMinPoints", "platinumMinPoints", "cardRequestMinPoints", "updatedAt", "updatedById", "createdAt" FROM loyalty.club_tier_rules LIMIT 0',
          );
        }
        if (
          this.config.get<string>('LOYALTY_MEMBERS_LIST_PROJECTION_ENABLED') ===
          'true'
        ) {
          await tx.query(
            'SELECT id, "userId", "fullName", email, "birthDate", "joinDate", points, level, "cardStatus", "cardNo", "issuedByLabelFa", "createdAt", "deactivatedAt" FROM loyalty.club_members LIMIT 0',
          );
          await tx.query(
            'SELECT status FROM loyalty.club_card_requests LIMIT 0',
          );
        }
      });
      return this.live();
    } catch {
      throw new ServiceUnavailableException({
        code: ErrorCode.SERVICE_UNAVAILABLE,
        message: 'سرویس آماده پاسخگویی نیست.',
      });
    }
  }
}
