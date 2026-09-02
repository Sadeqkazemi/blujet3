import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdempotencyRecord } from '../database/entities/idempotency-record.entity';
import { OutboxEvent } from '../database/entities/outbox-event.entity';
import { IdempotentCommandService } from './idempotent-command.service';

@Module({
  imports: [TypeOrmModule.forFeature([IdempotencyRecord, OutboxEvent])],
  providers: [IdempotentCommandService],
  exports: [IdempotentCommandService],
})
export class ReliabilityModule {}
