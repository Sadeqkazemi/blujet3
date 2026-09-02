import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ManagerReferral } from '../../database/entities/manager-referral.entity';
import { ManagerReferralRecipient } from '../../database/entities/manager-referral-recipient.entity';
import { ManagerReferralReport } from '../../database/entities/manager-referral-report.entity';
import { User } from '../../database/entities/user.entity';
import { StoredFile } from '../../database/entities/stored-file.entity';
import { ReferralsController } from './referrals.controller';
import { ReferralsService } from './referrals.service';
import { CartableModule } from '../cartable/cartable.module';
import { PanelsModule } from '../panels/panels.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ManagerReferral,
      ManagerReferralRecipient,
      ManagerReferralReport,
      User,
      StoredFile,
    ]),
    CartableModule,
    PanelsModule,
    AuditModule,
  ],
  controllers: [ReferralsController],
  providers: [ReferralsService],
})
export class ReferralsModule {}
