import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SmsReportService } from './sms-report.service';

@ApiTags('internal-sms')
@Controller('internal/v1/sms-log')
export class SmsController {
  constructor(private readonly reports: SmsReportService) {}

  @Get()
  @ApiOperation({ summary: 'گزارش عملیاتی پیامک با شماره‌های ماسک‌شده' })
  async report() {
    return { success: true, data: await this.reports.report() };
  }
}
