import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReportingService } from './reporting.service';
import { SalesChartQueryDto } from './dto/sales-chart-query.dto';
import { PeriodQueryDto } from './dto/period-query.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { PanelAccessGuard } from '../panels/panel-access.guard';
import { EmployeePermissionGuard } from '../../common/guards/employee-permission.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';

const REPORTING_ROLES = [
  'CEO',
  'BOARD_CHAIR',
  'SENIOR_MANAGER',
  'FINANCE_MANAGER',
  'COMMERCIAL_MANAGER',
] as const;

@ApiTags('reporting')
@Controller('reporting')
@UseGuards(JwtAuthGuard, RolesGuard, PanelAccessGuard, EmployeePermissionGuard)
@Roles(...REPORTING_ROLES)
export class ReportingController {
  constructor(private readonly reporting: ReportingService) {}

  @Get('sales-chart')
  @Roles(
    'CEO',
    'BOARD_CHAIR',
    'SENIOR_MANAGER',
    'FINANCE_MANAGER',
    'COMMERCIAL_MANAGER',
    'EMPLOYEE',
  )
  @RequiresPermission('rp_sales')
  @ApiOperation({
    summary:
      'Channel-split sales bars, shared identically by all 6 panels dashboards',
  })
  async salesChart(@Query() query: SalesChartQueryDto) {
    const data = await this.reporting.salesChart(query.granularity, query);
    return { success: true, data };
  }

  @Get('flight-sales')
  @Roles(
    'CEO',
    'BOARD_CHAIR',
    'SENIOR_MANAGER',
    'FINANCE_MANAGER',
    'COMMERCIAL_MANAGER',
    'EMPLOYEE',
  )
  @RequiresPermission('rp_sales')
  @ApiOperation({
    summary:
      'Departed flights with per-channel sales — «شماره پرواز» picker on analytic مالی',
  })
  async flightSales() {
    const data = await this.reporting.flightSales();
    return { success: true, data };
  }

  @Get('kpis')
  @ApiOperation({
    summary:
      'Revenue/profit/cost KPI boxes — re-scopes to periodKey when provided',
  })
  async kpis(@Query() query: PeriodQueryDto) {
    const data = await this.reporting.kpis(query.granularity, query);
    return { success: true, data };
  }

  @Get('completed-flights-summary')
  @ApiOperation({
    summary:
      'Completed-flight seat stats, synced to the same period as the sales chart',
  })
  async completedFlightsSummary(@Query() query: PeriodQueryDto) {
    const data = await this.reporting.completedFlightsSummary(
      query.granularity,
      query,
    );
    return { success: true, data };
  }

  @Get('low-sales-alerts')
  @ApiOperation({ summary: 'Flights <72h out with occupancy below threshold' })
  async lowSalesAlerts() {
    const data = await this.reporting.lowSalesAlerts();
    return { success: true, data };
  }

  @Get('finance-dashboard-stats')
  @Roles('CEO', 'BOARD_CHAIR', 'SENIOR_MANAGER', 'FINANCE_MANAGER', 'EMPLOYEE')
  @RequiresPermission('fn_dashboard')
  @ApiOperation({
    summary:
      'کارت‌های داشبورد اجرایی/مالی — آژانس/مسافر/بلیط/درآمد ماه جاری با روند (پنل مدیر عامل و هم‌ترازها + مدیر مالی)',
  })
  async financeDashboardStats() {
    const data = await this.reporting.financeDashboardStats();
    return { success: true, data };
  }

  @Get('commercial-overview')
  @Roles('COMMERCIAL_MANAGER', 'EMPLOYEE')
  @RequiresPermission('rp_sales')
  @ApiOperation({
    summary:
      'Commercial Manager dashboard KPI row — active agencies, passengers this month, pending cooperation requests',
  })
  async commercialOverview() {
    const data = await this.reporting.commercialOverview();
    return { success: true, data };
  }

  @Get('site-admin-overview')
  @Roles('SITE_ADMIN')
  @ApiOperation({
    summary:
      'SITE_ADMIN dashboard KPI row — active agencies, passengers/tickets this month, pending actions',
  })
  async siteAdminOverview() {
    const data = await this.reporting.siteAdminOverview();
    return { success: true, data };
  }

  @Get('recent-transactions')
  @Roles('FINANCE_MANAGER', 'EMPLOYEE')
  @RequiresPermission('fn_transactions')
  @ApiOperation({
    summary: 'تراکنش‌های مالی اخیر — فقط پنل مدیر مالی (per design)',
  })
  async recentTransactions() {
    const data = await this.reporting.recentTransactions();
    return { success: true, data };
  }

  @Get('revenue-mix')
  @Roles(
    'CEO',
    'BOARD_CHAIR',
    'SENIOR_MANAGER',
    'FINANCE_MANAGER',
    'COMMERCIAL_MANAGER',
    'EMPLOYEE',
  )
  @RequiresPermission('rp_sales')
  @ApiOperation({ summary: 'ترکیب درآمد بر اساس کانال فروش' })
  async revenueMix(@Query() query: PeriodQueryDto) {
    const data = await this.reporting.revenueMix(query.granularity, query);
    return { success: true, data };
  }

  @Get('agency-settlements')
  @Roles('FINANCE_MANAGER', 'EMPLOYEE')
  @RequiresPermission('fn_settlements')
  @ApiOperation({
    summary: 'تسویه‌حساب آژانس‌های همکار — فقط پنل مدیر مالی (per design)',
  })
  async agencySettlements() {
    const data = await this.reporting.agencySettlements();
    return { success: true, data };
  }
}
