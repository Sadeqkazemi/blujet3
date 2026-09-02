import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SurveyInvite } from '../database/entities/survey-invite.entity';
import { SurveyQuestion } from '../database/entities/survey-question.entity';
import { SurveyResponse } from '../database/entities/survey-response.entity';
import { SurveySettings } from '../database/entities/survey-settings.entity';
import { SurveyController } from './survey.controller';
import { SurveyService } from './survey.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SurveySettings,
      SurveyQuestion,
      SurveyInvite,
      SurveyResponse,
    ]),
  ],
  controllers: [SurveyController],
  providers: [SurveyService],
})
export class SurveyModule {}
