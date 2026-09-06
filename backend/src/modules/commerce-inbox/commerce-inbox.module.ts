import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommerceInboxReceipt } from '../../database/entities/commerce-inbox-receipt.entity';
import { CommerceInboxService } from './commerce-inbox.service';
import { CommerceInboxKafkaHandler } from './commerce-inbox-kafka.handler';

@Module({
  imports: [TypeOrmModule.forFeature([CommerceInboxReceipt])],
  providers: [CommerceInboxService, CommerceInboxKafkaHandler],
  exports: [CommerceInboxService, CommerceInboxKafkaHandler],
})
export class CommerceInboxModule {}
