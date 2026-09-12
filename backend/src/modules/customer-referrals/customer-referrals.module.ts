import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../database/entities/user.entity';
import { CustomerReferral } from '../../database/entities/customer-referral.entity';
import { ClubMember } from '../../database/entities/club-member.entity';
import { ClubPointsEntry } from '../../database/entities/club-points-entry.entity';
import { ClubTierRule } from '../../database/entities/club-tier-rule.entity';
import { CustomerReferralsService } from './customer-referrals.service';
import { MyReferralController } from './my-referral.controller';
import { LoyaltyProjectionOutboxModule } from '../loyalty-projection-outbox/loyalty-projection-outbox.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      CustomerReferral,
      ClubMember,
      ClubPointsEntry,
      ClubTierRule,
    ]),
    LoyaltyProjectionOutboxModule,
  ],
  controllers: [MyReferralController],
  providers: [CustomerReferralsService],
  exports: [CustomerReferralsService],
})
export class CustomerReferralsModule {}
