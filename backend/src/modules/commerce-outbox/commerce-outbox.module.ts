import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommerceOutboxEvent } from '../../database/entities/commerce-outbox-event.entity';
import { KafkaEventPublisher } from '../../common/events/kafka-event-publisher';
import { CommerceOutboxService } from './commerce-outbox.service';
import { CommerceOutboxDispatcher } from './commerce-outbox.dispatcher';
import { CommerceSagaExecution } from '../../database/entities/commerce-saga-execution.entity';
import { CommerceSagaService } from './commerce-saga.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([CommerceOutboxEvent, CommerceSagaExecution]),
  ],
  providers: [
    CommerceOutboxService,
    KafkaEventPublisher,
    CommerceOutboxDispatcher,
    CommerceSagaService,
  ],
  exports: [CommerceOutboxService, CommerceSagaService],
})
export class CommerceOutboxModule {}
