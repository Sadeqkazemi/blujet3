import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { EmployeePermissionGuard } from '../../common/guards/employee-permission.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

@ApiTags('audit')
@Controller('audit')
@UseGuards(JwtAuthGuard, RolesGuard, EmployeePermissionGuard)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get('manager-reports')
  @Roles('CEO', 'BOARD_CHAIR', 'SENIOR_MANAGER')
  @ApiOperation({
    summary:
      'Cross-manager oversight feed — role-scoped exclusions applied server-side. Supports pagination + actor/action/resource/dateFrom/dateTo filters.',
  })
  async managerReports(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AuditLogQueryDto,
  ) {
    const { items, total, page, limit } = await this.audit.managerReports(
      user.role,
      query,
    );
    return { success: true, data: items, meta: { total, page, limit } };
  }

  // Phase 31: EMPLOYEE holding lg_view reaches this — it's already scoped
  // to SYSTEM/ACCOUNT categories only (see AuditService.systemLogs), not
  // the financial/strategic audit trail ceoSystemEvents() exposes.
  @Get('logs')
  @Roles('IT_MANAGER', 'EMPLOYEE')
  @RequiresPermission('lg_view')
  @ApiOperation({
    summary:
      "IT Manager's system event log. Supports pagination + actor/action/resource/dateFrom/dateTo filters.",
  })
  async systemLogs(@Query() query: AuditLogQueryDto) {
    const { items, total, page, limit } = await this.audit.systemLogs(query);
    return { success: true, data: items, meta: { total, page, limit } };
  }

  @Get('logs/export')
  @Roles('IT_MANAGER', 'EMPLOYEE')
  @RequiresPermission('lg_export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="system-logs.csv"')
  @ApiOperation({ summary: 'خروجی CSV لاگ‌های سامانه برای کاربر مجاز' })
  async exportSystemLogs(@Query() query: AuditLogQueryDto) {
    // Keep exports bounded to avoid an unbounded audit-table download while
    // applying all supplied filters on the server.
    const { items } = await this.audit.systemLogs({
      ...query,
      page: 1,
      limit: 100,
    });
    const csvCell = (value: unknown) => {
      const normalized =
        value == null
          ? ''
          : typeof value === 'string'
            ? value
            : typeof value === 'object'
              ? JSON.stringify(value) ?? ''
              : typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint'
                ? value.toString()
                : '';
      return `"${normalized.replace(/"/g, '""')}"`;
    };
    const rows = [
      ['زمان', 'کاربر', 'رویداد', 'واحد', 'سطح'],
      ...items.map((item) => [
        item.createdAt,
        item.actorName,
        `${item.action} — ${item.detail}`,
        item.unit,
        item.level,
      ]),
    ];
    return `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
  }

  @Get('logs/badge-count')
  @Roles('IT_MANAGER')
  @ApiOperation({ summary: 'شمارندهٔ badge سایدبار لاگ IT (۷ روز اخیر)' })
  async logsBadgeCount() {
    const count = await this.audit.systemLogsBadgeCount();
    return { success: true, data: { count } };
  }

  @Get('system-events')
  @Roles('CEO')
  @ApiOperation({
    summary:
      'CEO لاگ و رویدادها — ردیف‌های واقعی AuditLog با سطح presentational. Supports pagination + actor/action/resource/dateFrom/dateTo filters.',
  })
  async ceoSystemEvents(@Query() query: AuditLogQueryDto) {
    const { items, total, page, limit } =
      await this.audit.ceoSystemEvents(query);
    return { success: true, data: items, meta: { total, page, limit } };
  }
}
