import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SurveyController } from './survey.controller';
import { SurveyPublicController } from './survey-public.controller';
import { SurveyService } from './survey.service';
import { SmsModule } from '../sms/sms.module';
import { AuditModule } from '../audit/audit.module';
import { AiModule } from '../ai/ai.module';
import { PanelsModule } from '../panels/panels.module';
import { SurveySettings } from '../../database/entities/survey-settings.entity';
import { SurveyQuestion } from '../../database/entities/survey-question.entity';
import { SurveyInvite } from '../../database/entities/survey-invite.entity';
import { SurveyResponse } from '../../database/entities/survey-response.entity';
import { AiUsageLog } from '../../database/entities/ai-usage-log.entity';
import { Booking } from '../../database/entities/booking.entity';
import { Airport } from '../../database/entities/airport.entity';

@Module({
  // SurveyController's static routes (settings/questions/stats/results)
  // must be registered before SurveyPublicController's `/survey/:token`
  // wildcard, or Express would match the wildcard first.
  imports: [
    TypeOrmModule.forFeature([
      SurveySettings,
      SurveyQuestion,
      SurveyInvite,
      SurveyResponse,
      AiUsageLog,
      Booking,
      Airport,
    ]),
    SmsModule,
    AuditModule,
    AiModule,
    PanelsModule,
  ],
  controllers: [SurveyController, SurveyPublicController],
  providers: [SurveyService],
  exports: [SurveyService],
})
export class SurveyModule {}
