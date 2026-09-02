import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SupportTicketsController } from './support-tickets.controller';
import { MySupportTicketsController } from './my-support-tickets.controller';
import { SupportTicketsService } from './support-tickets.service';
import { AuditModule } from '../audit/audit.module';
import { StaffDirectoryModule } from '../staff-directory/staff-directory.module';
import { SupportTicket } from '../../database/entities/support-ticket.entity';
import { User } from '../../database/entities/user.entity';
import { StoredFile } from '../../database/entities/stored-file.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([SupportTicket, User, StoredFile]),
    AuditModule,
    StaffDirectoryModule,
  ],
  controllers: [SupportTicketsController, MySupportTicketsController],
  providers: [SupportTicketsService],
  exports: [SupportTicketsService],
})
export class SupportTicketsModule {}
