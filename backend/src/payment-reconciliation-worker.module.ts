import 'dotenv/config';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  paymentReconciliationWorkerDataSourceOptions,
  validatePaymentReconciliationWorkerEnv,
} from './config/payment-reconciliation-worker.config';
import { PaymentReconciliationModule } from './modules/payment-reconciliation/payment-reconciliation.module';
import { PaymentReconciliationWorkerHealthController } from './payment-reconciliation-worker-health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validatePaymentReconciliationWorkerEnv,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        customProps: () => ({ service: 'blujet-payment-reconciliation' }),
        redact: ['req.headers.x-internal-token'],
      },
    }),
    TypeOrmModule.forRoot(paymentReconciliationWorkerDataSourceOptions()),
    PaymentReconciliationModule,
  ],
  controllers: [PaymentReconciliationWorkerHealthController],
})
export class PaymentReconciliationWorkerModule {}
