import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { IdentityVerificationService } from './identity-verification.service';
import { RejectIdentityVerificationDto } from './dto/identity-admin.dtos';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PanelAccessGuard } from '../panels/panel-access.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

/** SITE_ADMIN review queue for customer KYC submissions (`kyc` panel tab) —
 * the staff side of /my/identity. */
@ApiTags('profile')
@Controller('identity-verifications')
@UseGuards(JwtAuthGuard, RolesGuard, PanelAccessGuard)
@Roles('SITE_ADMIN')
export class IdentityAdminController {
  constructor(private readonly identity: IdentityVerificationService) {}

  @Get()
  @ApiOperation({ summary: 'فهرست درخواست‌های احراز هویت مشتریان' })
  async list() {
    return { success: true, data: await this.identity.adminList() };
  }

  @Get(':id/id-card')
  @ApiOperation({ summary: 'دریافت تصویر کارت ملی یک درخواست' })
  async getIdCard(@Param('id') id: string, @Res() res: Response) {
    const { fileName, mimeType, stream } =
      await this.identity.adminGetIdCard(id);
    res.setHeader('Content-Type', mimeType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );
    stream.pipe(res);
  }

  @Patch(':id/approve')
  @ApiOperation({ summary: 'تأیید احراز هویت مشتری' })
  async approve(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return { success: true, data: await this.identity.adminApprove(actor, id) };
  }

  @Patch(':id/reject')
  @ApiOperation({ summary: 'رد احراز هویت مشتری با ذکر دلیل' })
  async reject(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RejectIdentityVerificationDto,
  ) {
    return {
      success: true,
      data: await this.identity.adminReject(actor, id, dto.rejectReason),
    };
  }
}
