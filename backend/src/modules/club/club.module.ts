import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClubController } from './club.controller';
import { MyClubController } from './my-club.controller';
import { ClubService } from './club.service';
import { PanelsModule } from '../panels/panels.module';
import { AuditModule } from '../audit/audit.module';
import { ClubTierRule } from '../../database/entities/club-tier-rule.entity';
import { ClubMember } from '../../database/entities/club-member.entity';
import { ClubCardRequest } from '../../database/entities/club-card-request.entity';
import { ClubPointsEntry } from '../../database/entities/club-points-entry.entity';
import { User } from '../../database/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ClubTierRule,
      ClubMember,
      ClubCardRequest,
      ClubPointsEntry,
      User,
    ]),
    PanelsModule,
    AuditModule,
  ],
  controllers: [ClubController, MyClubController],
  providers: [ClubService],
  exports: [ClubService],
})
export class ClubModule {}
