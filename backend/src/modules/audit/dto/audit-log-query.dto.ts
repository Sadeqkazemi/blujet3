import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { AuditCategory, Role } from '../../../database/enums';

/**
 * Shared query contract for every audit/log listing endpoint (manager
 * reports, IT system logs, CEO system events) — see docs/API.md "Audit &
 * Logs". `actor` filters by exact actorId; `action`/`resource` are partial
 * (ILike) matches on `action`/`entityType`; `dateFrom`/`dateTo` bound
 * `createdAt`. Pagination is additive: omitting page/limit preserves each
 * endpoint's previous first-page-of-100 behavior.
 */
export class AuditLogQueryDto {
  @ApiPropertyOptional({ enum: Object.values(AuditCategory) })
  @IsOptional()
  @IsIn(Object.values(AuditCategory))
  category?: AuditCategory;

  @ApiPropertyOptional({ enum: Object.values(Role) })
  @IsOptional()
  @IsIn(Object.values(Role))
  actorRole?: Role;

  @ApiPropertyOptional({ description: 'شناسهٔ کاربر انجام‌دهنده (actorId)' })
  @IsOptional()
  @IsString()
  actor?: string;

  @ApiPropertyOptional({ description: 'جستجوی جزئی در عنوان اقدام' })
  @IsOptional()
  @IsString()
  action?: string;

  @ApiPropertyOptional({
    description:
      'نوع موجودیت مرتبط (entityType) — مثلاً User، FlightDefinition',
    example: 'User',
  })
  @IsOptional()
  @IsString()
  resource?: string;

  @ApiPropertyOptional({ description: 'از تاریخ (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'تا تاریخ (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({ description: 'جستجوی آزاد در عنوان/شرح/نام کاربر' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
