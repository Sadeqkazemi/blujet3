import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommerceInboxReceipt } from '../../database/entities/commerce-inbox-receipt.entity';
import { CommerceInboxService } from './commerce-inbox.service';

@Module({
  imports: [TypeOrmModule.forFeature([CommerceInboxReceipt])],
  providers: [CommerceInboxService],
  exports: [CommerceInboxService],
})
export class CommerceInboxModule {}
