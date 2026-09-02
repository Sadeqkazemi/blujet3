import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StoredFile } from '../database/entities/stored-file.entity';
import { SupportTicket } from '../database/entities/support-ticket.entity';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';

@Module({
  imports: [TypeOrmModule.forFeature([SupportTicket, StoredFile])],
  controllers: [SupportController],
  providers: [SupportService],
})
export class SupportModule {}
