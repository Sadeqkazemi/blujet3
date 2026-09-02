import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CareersSettings } from '../database/entities/careers-settings.entity';
import { JobApplication } from '../database/entities/job-application.entity';
import { JobPosting } from '../database/entities/job-posting.entity';
import { StoredFile } from '../database/entities/stored-file.entity';
import { CareersController } from './careers.controller';
import { CareersService } from './careers.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CareersSettings,
      JobPosting,
      JobApplication,
      StoredFile,
    ]),
  ],
  controllers: [CareersController],
  providers: [CareersService],
})
export class CareersModule {}
