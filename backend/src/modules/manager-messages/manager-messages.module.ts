import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ManagerMessage } from '../../database/entities/manager-message.entity';
import { StoredFile } from '../../database/entities/stored-file.entity';
import { ManagerMessagesController } from './manager-messages.controller';
import { ManagerMessagesService } from './manager-messages.service';
import { CartableModule } from '../cartable/cartable.module';
import { PanelsModule } from '../panels/panels.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ManagerMessage, StoredFile]),
    CartableModule,
    PanelsModule,
    AuditModule,
  ],
  controllers: [ManagerMessagesController],
  providers: [ManagerMessagesService],
})
export class ManagerMessagesModule {}
