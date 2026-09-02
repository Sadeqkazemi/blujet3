import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SystemSetting } from '../../database/entities/system-setting.entity';
import { RefundPenaltyRule } from '../../database/entities/refund-penalty-rule.entity';
import { SettingsController } from './settings.controller';
import { SettingsPublicController } from './settings-public.controller';
import { SettingsService } from './settings.service';
import { AuditModule } from '../audit/audit.module';
import { PanelsModule } from '../panels/panels.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SystemSetting, RefundPenaltyRule]),
    AuditModule,
    PanelsModule,
  ],
  controllers: [SettingsController, SettingsPublicController],
  providers: [SettingsService],
})
export class SettingsModule {}
