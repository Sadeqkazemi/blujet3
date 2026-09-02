import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SurveyService } from './survey.service';
import {
  CreateSurveyQuestionDto,
  UpdateSurveySettingsDto,
} from './dto/survey.dtos';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PanelAccessGuard } from '../panels/panel-access.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

const RESULTS_ROLES = ['CEO', 'SENIOR_MANAGER', 'BOARD_CHAIR'] as const;

/** نظرسنجی مسافران — IT_MANAGER config/stats (create/configure) and
 * CEO/SENIOR_MANAGER/BOARD_CHAIR read-only results + AI summary (see
 * docs/API.md's Phase 66). Public submission lives in
 * SurveyPublicController — no guards there. */
@ApiTags('survey')
@Controller('survey')
@UseGuards(JwtAuthGuard, RolesGuard, PanelAccessGuard)
export class SurveyController {
  constructor(private readonly survey: SurveyService) {}

  @Get('settings')
  @Roles('IT_MANAGER')
  @ApiOperation({ summary: 'وضعیت و عنوان نظرسنجی' })
  async getSettings() {
    return { success: true, data: await this.survey.getSettings() };
  }

  @Patch('settings')
  @Roles('IT_MANAGER')
  @ApiOperation({ summary: 'فعال/غیرفعال یا تغییر عنوان نظرسنجی' })
  async updateSettings(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: UpdateSurveySettingsDto,
  ) {
    return {
      success: true,
      data: await this.survey.updateSettings(actor, dto),
    };
  }

  @Get('questions')
  @Roles('IT_MANAGER')
  @ApiOperation({ summary: 'فهرست سؤالات نظرسنجی' })
  async listQuestions() {
    return { success: true, data: await this.survey.listQuestions() };
  }

  @Post('questions')
  @Roles('IT_MANAGER')
  @ApiOperation({ summary: 'افزودن سؤال نظرسنجی' })
  async addQuestion(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateSurveyQuestionDto,
  ) {
    return { success: true, data: await this.survey.addQuestion(actor, dto) };
  }

  @Delete('questions/:id')
  @Roles('IT_MANAGER')
  @ApiOperation({ summary: 'حذف سؤال نظرسنجی' })
  async removeQuestion(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return { success: true, data: await this.survey.removeQuestion(actor, id) };
  }

  @Get('stats')
  @Roles('IT_MANAGER')
  @ApiOperation({ summary: 'آمار کلی نظرسنجی و آخرین پاسخ‌ها' })
  async getStats() {
    return { success: true, data: await this.survey.getStats() };
  }

  @Get('results')
  @Roles(...RESULTS_ROLES)
  @ApiOperation({ summary: 'نتایج نظرسنجی به تفکیک پرواز (فقط خواندنی)' })
  async getResults() {
    return { success: true, data: await this.survey.getResults() };
  }

  @Post('results/:flightInstanceId/analyze')
  @Roles(...RESULTS_ROLES)
  @ApiOperation({ summary: 'خلاصهٔ هوش مصنوعی نظرات یک پرواز' })
  async analyze(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('flightInstanceId') flightInstanceId: string,
  ) {
    return {
      success: true,
      data: await this.survey.analyzeFlight(flightInstanceId, actor),
    };
  }
}
