import { Module } from '@nestjs/common';
import { PaymentReconciliationController } from './payment-reconciliation.controller';
import { PaymentReconciliationInternalAuthGuard } from './payment-reconciliation-internal-auth.guard';
import { PaymentReconciliationReadService } from './payment-reconciliation-read.service';

@Module({
  controllers: [PaymentReconciliationController],
  providers: [
    PaymentReconciliationReadService,
    PaymentReconciliationInternalAuthGuard,
  ],
})
export class PaymentReconciliationModule {}
