import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import {
  ApiOperation,
  ApiProperty,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { ErrorCode } from './common/errors';
import { ErrorResponse } from './common/error.dto';

class HealthView {
  @ApiProperty({ example: 'ok' }) status!: string;
  @ApiProperty({ example: 'blujet-agency' }) service!: string;
  @ApiProperty({ example: '0.1.0' }) version!: string;
  @ApiProperty({ example: 'unknown' }) commit!: string;
}

@ApiTags('health')
@Controller()
export class HealthController {
  constructor(private readonly db: DataSource) {}
  @Get('health')
  @ApiOperation({ summary: 'زنده‌بودن سرویس' })
  @ApiResponse({ status: 200, type: HealthView })
  live(): HealthView {
    return {
      status: 'ok',
      service: 'blujet-agency',
      version: '0.1.0',
      commit: process.env.GIT_COMMIT_SHA ?? 'unknown',
    };
  }

  @Get('ready')
  @ApiOperation({ summary: 'آمادگی ستون‌های خواندنی دیتابیس' })
  @ApiResponse({ status: 200, type: HealthView })
  @ApiResponse({
    status: 503,
    type: ErrorResponse,
    description: 'دیتابیس آماده نیست',
  })
  async ready(): Promise<HealthView> {
    try {
      await this.db.transaction(async (tx) => {
        await tx.query('SET TRANSACTION READ ONLY');
        await tx.query(
          'SELECT "userId", city, tier, "joinedAt", "suspendedAt" FROM agency.agency_profiles LIMIT 0',
        );
        await tx.query(
          'SELECT id, "agencyId", "invoiceNo", "amountIrr", status, "issuedAt", "dueAt", "paidAt" FROM agency.agency_invoices LIMIT 0',
        );
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
