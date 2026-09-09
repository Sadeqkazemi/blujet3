import 'dotenv/config';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  inventoryWorkerDataSourceOptions,
  validateInventoryWorkerEnv,
} from './config/inventory-worker.config';
import { InventoryWorkerHealthController } from './inventory-worker-health.controller';
import { InventoryController } from './modules/inventory/inventory.controller';
import { InventoryInternalAuthGuard } from './modules/inventory/inventory-internal-auth.guard';
import { InventoryReadService } from './modules/inventory/inventory-read.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateInventoryWorkerEnv,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        customProps: () => ({ service: 'blujet-inventory' }),
        redact: ['req.headers.x-internal-token'],
      },
    }),
    TypeOrmModule.forRoot(inventoryWorkerDataSourceOptions()),
  ],
  controllers: [InventoryController, InventoryWorkerHealthController],
  providers: [InventoryReadService, InventoryInternalAuthGuard],
})
export class InventoryWorkerModule {}
