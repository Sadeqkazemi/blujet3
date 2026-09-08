import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { ReportingProjectionModule } from '../modules/reporting/reporting-projection.module';

@Module({
  imports: [ReportingProjectionModule],
  controllers: [HealthController],
})
export class HealthModule {}
