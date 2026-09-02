import { Module } from '@nestjs/common';
import { FinanceReportsController } from './finance-reports.controller';
import { FinanceReportsService } from './finance-reports.service';
import { PanelsModule } from '../panels/panels.module';

@Module({
  imports: [PanelsModule],
  controllers: [FinanceReportsController],
  providers: [FinanceReportsService],
  exports: [FinanceReportsService],
})
export class FinanceReportsModule {}
