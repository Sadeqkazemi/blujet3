import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import {
  AcknowledgeSurveyInviteDto,
  CreateSurveyQuestionCommandDto,
  MaterializeSurveyInvitesCommandDto,
  SurveyActorCommandDto,
  SurveyResponseCommandDto,
  UpdateSurveySettingsCommandDto,
} from './dto/survey.dto';
import { SurveyService } from './survey.service';

@ApiTags('internal-survey')
@ApiSecurity('internal-token')
@Controller('internal/v1/survey')
export class SurveyController {
  constructor(private readonly survey: SurveyService) {}

  @Post('materialize')
  @ApiOperation({
    summary: 'ساخت دعوت‌های نظرسنجی از snapshot پروازهای انجام‌شده',
  })
  materialize(@Body() command: MaterializeSurveyInvitesCommandDto) {
    return this.success(this.survey.materialize(command.bookings));
  }

  @Patch('materialize/ack')
  @ApiOperation({ summary: 'ثبت موفقیت ارسال دعوت نظرسنجی' })
  acknowledge(@Body() command: AcknowledgeSurveyInviteDto) {
    return this.success(this.survey.acknowledgeInvite(command.inviteId));
  }

  @Post('admin/settings/detail')
  @ApiOperation({ summary: 'خواندن تنظیمات نظرسنجی' })
  settings(@Body() command: SurveyActorCommandDto) {
    return this.success(this.survey.getSettings(command.actor));
  }

  @Patch('admin/settings')
  @ApiOperation({ summary: 'به‌روزرسانی تنظیمات نظرسنجی' })
  updateSettings(@Body() command: UpdateSurveySettingsCommandDto) {
    return this.success(
      this.survey.updateSettings(command.actor, command.input),
    );
  }

  @Post('admin/questions/search')
  @ApiOperation({ summary: 'فهرست پرسش‌های نظرسنجی' })
  questions(@Body() command: SurveyActorCommandDto) {
    return this.success(this.survey.listQuestions(command.actor));
  }

  @Post('admin/questions')
  @ApiOperation({ summary: 'افزودن پرسش نظرسنجی' })
  addQuestion(@Body() command: CreateSurveyQuestionCommandDto) {
    return this.success(this.survey.addQuestion(command.actor, command.input));
  }

  @Delete('admin/questions/:id')
  @ApiOperation({ summary: 'حذف پرسش نظرسنجی' })
  removeQuestion(
    @Param('id') id: string,
    @Body() command: SurveyActorCommandDto,
  ) {
    return this.success(this.survey.removeQuestion(command.actor, id));
  }

  @Post('admin/stats')
  @ApiOperation({ summary: 'آمار مدیریتی نظرسنجی' })
  stats(@Body() command: SurveyActorCommandDto) {
    return this.success(this.survey.getStats(command.actor));
  }

  @Post('results/search')
  @ApiOperation({ summary: 'نتایج نظرسنجی به تفکیک پرواز' })
  results(@Body() command: SurveyActorCommandDto) {
    return this.success(this.survey.getResults(command.actor));
  }

  @Post('results/:flightInstanceId/comments')
  @ApiOperation({ summary: 'نظرهای متنی نظرسنجی یک پرواز' })
  comments(
    @Param('flightInstanceId') flightInstanceId: string,
    @Body() command: SurveyActorCommandDto,
  ) {
    return this.success(this.survey.comments(command.actor, flightInstanceId));
  }

  @Get('public/:token')
  @ApiOperation({ summary: 'فرم عمومی نظرسنجی با token دعوت' })
  invite(@Param('token') token: string) {
    return this.success(this.survey.getPublicInvite(token));
  }

  @Post('public/:token')
  @ApiOperation({ summary: 'ثبت یک‌باره پاسخ نظرسنجی' })
  submit(
    @Param('token') token: string,
    @Body() command: SurveyResponseCommandDto,
  ) {
    return this.success(this.survey.submitResponse(token, command.input));
  }

  private async success<T>(data: Promise<T>) {
    return { success: true, data: await data };
  }
}
