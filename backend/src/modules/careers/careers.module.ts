import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CareersController } from './careers.controller';
import { CareersPublicController } from './careers-public.controller';
import { CareersService } from './careers.service';
import { AuditModule } from '../audit/audit.module';
import { PanelsModule } from '../panels/panels.module';
import { CareersSettings } from '../../database/entities/careers-settings.entity';
import { JobPosting } from '../../database/entities/job-posting.entity';
import { JobApplication } from '../../database/entities/job-application.entity';
import { StoredFile } from '../../database/entities/stored-file.entity';
import { User } from '../../database/entities/user.entity';

@Module({
  // CareersController's static /careers/postings, /careers/settings and
  // /careers/applications routes must be registered before
  // CareersPublicController's /careers/jobs* routes — no overlap today,
  // but keeping the same order as SurveyModule for consistency/safety.
  imports: [
    TypeOrmModule.forFeature([
      CareersSettings,
      JobPosting,
      JobApplication,
      StoredFile,
      User,
    ]),
    AuditModule,
    PanelsModule,
  ],
  controllers: [CareersController, CareersPublicController],
  providers: [CareersService],
  exports: [CareersService],
})
export class CareersModule {}
