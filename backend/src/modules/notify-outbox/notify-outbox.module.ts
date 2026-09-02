import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotifyOutboxEvent } from '../../database/entities/notify-outbox-event.entity';
import { NotifyInternalClient } from './notify-internal.client';
import { NotifyOutboxDispatcher } from './notify-outbox.dispatcher';
import { NotifyOutboxService } from './notify-outbox.service';

@Module({
  imports: [TypeOrmModule.forFeature([NotifyOutboxEvent])],
  providers: [
    NotifyInternalClient,
    NotifyOutboxDispatcher,
    NotifyOutboxService,
  ],
  exports: [NotifyInternalClient, NotifyOutboxService],
})
export class NotifyOutboxModule {}
