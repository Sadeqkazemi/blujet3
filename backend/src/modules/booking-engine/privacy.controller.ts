import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrivacyService } from './privacy.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

@ApiTags('privacy')
@Controller('my/privacy')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('USER')
export class PrivacyController {
  constructor(private readonly privacy: PrivacyService) {}

  @Get('export')
  @ApiOperation({ summary: 'خروجی کامل داده‌های شخصی من (GDPR)' })
  async export(@CurrentUser() user: AuthenticatedUser) {
    return { success: true, data: await this.privacy.exportMyData(user.id) };
  }

  @Delete('account')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'حذف حساب و اطلاعات شخصی من (GDPR)' })
  async delete(@CurrentUser() user: AuthenticatedUser) {
    await this.privacy.deleteMyAccount(user.id);
    return { success: true, data: { deleted: true } };
  }
}
