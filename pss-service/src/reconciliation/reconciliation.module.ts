import { Module } from '@nestjs/common';
import { ReconciliationController } from './reconciliation.controller';
import { ShadowReconciliationService } from './shadow-reconciliation.service';

@Module({
  controllers: [ReconciliationController],
  providers: [ShadowReconciliationService],
  exports: [ShadowReconciliationService],
})
export class ReconciliationModule {}
