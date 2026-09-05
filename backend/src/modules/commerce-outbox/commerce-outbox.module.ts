import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommerceOutboxEvent } from '../../database/entities/commerce-outbox-event.entity';
import { KafkaEventPublisher } from '../../common/events/kafka-event-publisher';
import { CommerceOutboxService } from './commerce-outbox.service';
import { CommerceOutboxDispatcher } from './commerce-outbox.dispatcher';

@Module({
  imports: [TypeOrmModule.forFeature([CommerceOutboxEvent])],
  providers: [
    CommerceOutboxService,
    KafkaEventPublisher,
    CommerceOutboxDispatcher,
  ],
  exports: [CommerceOutboxService],
})
export class CommerceOutboxModule {}
