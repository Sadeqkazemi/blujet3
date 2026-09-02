import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReconciliationController } from './reconciliation.controller';
import { ReconciliationService } from './reconciliation.service';
import { AuditModule } from '../audit/audit.module';
import { PanelsModule } from '../panels/panels.module';
import { PaymentReconciliation } from '../../database/entities/payment-reconciliation.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([PaymentReconciliation]),
    AuditModule,
    PanelsModule,
  ],
  controllers: [ReconciliationController],
  providers: [ReconciliationService],
})
export class ReconciliationModule {}
