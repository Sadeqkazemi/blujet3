import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { PanelAccessGuard } from '../panels/panel-access.guard';
import { EmployeePermissionGuard } from '../../common/guards/employee-permission.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { FinanceReportsService } from './finance-reports.service';
import {
  FinanceFlightSearchQueryDto,
  FinanceReportExportQueryDto,
  FinanceReportQueryDto,
  FinanceSalesExportQueryDto,
  FinanceSalesQueryDto,
} from './dto/finance-report-query.dto';

@ApiTags('finance-reports')
@ApiBearerAuth()
@Controller('reporting')
@UseGuards(JwtAuthGuard, RolesGuard, PanelAccessGuard, EmployeePermissionGuard)
@Roles('FINANCE_MANAGER', 'EMPLOYEE')
export class FinanceReportsController {
  constructor(private readonly reports: FinanceReportsService) {}

  @Get('finance-sales')
  @Roles('FINANCE_MANAGER', 'EMPLOYEE')
  @RequiresPermission('rp_finance')
  @ApiOperation({ summary: 'موتور گزارش تفصیلی فروش با فیلترهای مالی' })
  async sales(@Query() query: FinanceSalesQueryDto) {
    return { success: true, data: await this.reports.salesReport(query) };
  }

  @Get('finance-sales/export')
  @Roles('FINANCE_MANAGER', 'EMPLOYEE')
  @RequiresPermission('rp_exports')
  @ApiOperation({ summary: 'خروجی CSV، Excel یا PDF موتور گزارش فروش' })
  @ApiProduces(
    'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
  )
  async salesExport(
    @Query() query: FinanceSalesExportQueryDto,
    @Res() res: Response,
  ) {
    const file = await this.reports.salesExport(query, query.format);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="finance-sales.${file.extension}"`,
    );
    res.send(file.body);
  }

  @Get('finance-reports')
  @Roles('FINANCE_MANAGER', 'EMPLOYEE')
  @RequiresPermission('rp_finance')
  @ApiOperation({
    summary: 'گزارش واقعی آژانس، چارتر و مشتریان برای پنل مدیر مالی',
  })
  @ApiBadRequestResponse({ description: 'فیلتر تاریخ یا دوره نامعتبر است.' })
  async report(@Query() query: FinanceReportQueryDto) {
    return { success: true, data: await this.reports.report(query) };
  }

  @Get('finance-reports/export')
  @Roles('FINANCE_MANAGER', 'EMPLOYEE')
  @RequiresPermission('rp_exports')
  @ApiOperation({
    summary: 'دانلود CSV، Excel یا PDF از گزارش فیلترشده مدیر مالی',
  })
  @ApiProduces(
    'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
  )
  @ApiBadRequestResponse({ description: 'فرمت یا فیلتر گزارش نامعتبر است.' })
  async export(
    @Query() query: FinanceReportExportQueryDto,
    @Res() res: Response,
  ) {
    const file = await this.reports.export(query, query.format);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="finance-report.${file.extension}"`,
    );
    res.send(file.body);
  }

  @Get('finance-flight-search')
  @Roles('FINANCE_MANAGER', 'EMPLOYEE')
  @RequiresPermission('rp_finance')
  @ApiOperation({ summary: 'جستجوی پروازهای انجام‌شده برای گزارش مالی' })
  @ApiBadRequestResponse({ description: 'فیلتر جستجو نامعتبر است.' })
  async searchFlights(@Query() query: FinanceFlightSearchQueryDto) {
    return { success: true, data: await this.reports.searchFlights(query) };
  }

  @Get('finance-flight-search/:flightInstanceId')
  @Roles('FINANCE_MANAGER', 'EMPLOYEE')
  @RequiresPermission('rp_finance')
  @ApiOperation({ summary: 'جزئیات فروش و بدهی آژانس‌های یک پرواز' })
  @ApiNotFoundResponse({ description: 'پرواز یافت نشد.' })
  async flightDetail(@Param('flightInstanceId', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.reports.flightDetail(id) };
  }
}
