import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExternalServiceConfig } from '../../database/entities/external-service-config.entity';
import { AuditModule } from '../audit/audit.module';
import { PanelsModule } from '../panels/panels.module';
import { FinancialIntegrationsController } from './financial-integrations.controller';
import { FinancialIntegrationsService } from './financial-integrations.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ExternalServiceConfig]),
    AuditModule,
    PanelsModule,
  ],
  controllers: [FinancialIntegrationsController],
  providers: [FinancialIntegrationsService],
  exports: [FinancialIntegrationsService],
})
export class FinancialIntegrationsModule {}
