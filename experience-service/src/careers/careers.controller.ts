import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { CareersService } from './careers.service';
import {
  ApplyJobCommandDto,
  CareersActorCommandDto,
  CreateJobPostingCommandDto,
  ListApplicationsQueryDto,
  ReferApplicationCommandDto,
  UpdateCareersSettingsCommandDto,
  UpdateJobPostingCommandDto,
} from './dto/careers.dto';

@ApiTags('internal-careers')
@ApiSecurity('internal-token')
@Controller('internal/v1/careers')
export class CareersController {
  constructor(private readonly careers: CareersService) {}

  @Get('public/settings')
  @ApiOperation({ summary: 'خواندن وضعیت نمایش فرصت‌های شغلی' })
  settings() {
    return this.success(this.careers.getSettings());
  }

  @Get('public/jobs')
  @ApiOperation({ summary: 'فهرست فرصت‌های شغلی فعال' })
  jobs() {
    return this.success(this.careers.listActiveJobs());
  }

  @Get('public/jobs/:id')
  @ApiOperation({ summary: 'جزئیات فرصت شغلی فعال' })
  job(@Param('id') id: string) {
    return this.success(this.careers.getPublicJob(id));
  }

  @Post('public/applications')
  @ApiOperation({ summary: 'ثبت درخواست همکاری' })
  apply(@Body() command: ApplyJobCommandDto) {
    return this.success(this.careers.apply(command));
  }

  @Patch('admin/settings')
  @ApiOperation({ summary: 'به‌روزرسانی وضعیت نمایش فرصت‌های شغلی' })
  updateSettings(@Body() command: UpdateCareersSettingsCommandDto) {
    return this.success(
      this.careers.updateSettings(command.actor, command.input),
    );
  }

  @Post('admin/postings/search')
  @ApiOperation({ summary: 'فهرست مدیریتی فرصت‌های شغلی' })
  postings(@Body() command: CareersActorCommandDto) {
    return this.success(this.careers.listPostings(command.actor));
  }

  @Post('admin/postings')
  @ApiOperation({ summary: 'ایجاد فرصت شغلی' })
  createPosting(@Body() command: CreateJobPostingCommandDto) {
    return this.success(
      this.careers.createPosting(command.actor, command.input),
    );
  }

  @Patch('admin/postings/:id')
  @ApiOperation({ summary: 'ویرایش فرصت شغلی' })
  updatePosting(
    @Param('id') id: string,
    @Body() command: UpdateJobPostingCommandDto,
  ) {
    return this.success(
      this.careers.updatePosting(command.actor, id, command.input),
    );
  }

  @Post('admin/applications/search')
  @ApiOperation({ summary: 'فهرست مدیریتی درخواست‌های همکاری' })
  applications(
    @Body() command: CareersActorCommandDto,
    @Query() query: ListApplicationsQueryDto,
  ) {
    return this.success(this.careers.listApplications(command.actor, query));
  }

  @Post('admin/applications/:id/detail')
  @ApiOperation({ summary: 'جزئیات مدیریتی درخواست همکاری' })
  application(
    @Param('id') id: string,
    @Body() command: CareersActorCommandDto,
  ) {
    return this.success(this.careers.getApplication(command.actor, id));
  }

  @Post('admin/applications/:id/resume')
  @ApiOperation({ summary: 'دریافت ایمن رزومه درخواست همکاری' })
  resume(@Param('id') id: string, @Body() command: CareersActorCommandDto) {
    return this.success(this.careers.getResume(command.actor, id));
  }

  @Patch('admin/applications/:id/refer')
  @ApiOperation({ summary: 'ارجاع درخواست همکاری' })
  refer(@Param('id') id: string, @Body() command: ReferApplicationCommandDto) {
    return this.success(this.careers.refer(command.actor, id, command.target));
  }

  @Patch('admin/applications/:id/hire')
  @ApiOperation({ summary: 'تأیید استخدام درخواست‌دهنده' })
  hire(@Param('id') id: string, @Body() command: CareersActorCommandDto) {
    return this.success(this.careers.hire(command.actor, id));
  }

  @Patch('admin/applications/:id/reject')
  @ApiOperation({ summary: 'رد درخواست همکاری' })
  reject(@Param('id') id: string, @Body() command: CareersActorCommandDto) {
    return this.success(this.careers.reject(command.actor, id));
  }

  private async success<T>(data: Promise<T>) {
    return { success: true, data: await data };
  }
}
