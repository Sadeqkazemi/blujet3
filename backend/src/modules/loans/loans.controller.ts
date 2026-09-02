import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import {
  CreateLoanApplicationDto,
  ListLoansQueryDto,
  StartAccountOpeningDto,
  StartEligibilityDto,
} from './dto/loans.dto';
import { LoansService } from './loans.service';

@ApiTags('loans')
@Controller()
export class LoansController {
  constructor(private readonly loans: LoansService) {}

  @Post('me/loan-applications')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('USER')
  @ApiOperation({ summary: 'ایجاد درخواست وام از طریق API بانک (idempotent)' })
  async create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateLoanApplicationDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.loans.create(actor, dto);
    res.status(result.statusCode);
    return { success: true, data: result.data };
  }

  @Get('me/loan-applications')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('USER')
  @ApiOperation({ summary: 'فهرست درخواست‌های وام کاربر' })
  async listMine(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: ListLoansQueryDto,
  ) {
    const data = await this.loans.listMine(
      actor,
      query.page ?? 1,
      query.pageSize ?? 20,
    );
    return { success: true, data };
  }

  @Get('me/loan-applications/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('USER')
  @ApiOperation({ summary: 'جزئیات درخواست وام کاربر' })
  async getMine(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const data = await this.loans.getMine(actor, id);
    return { success: true, data };
  }

  @Post('me/loan-applications/:id/sync')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('USER')
  @ApiOperation({ summary: 'استعلام وضعیت از بانک برای درخواست کاربر' })
  async syncMine(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const data = await this.loans.syncMine(actor, id);
    return { success: true, data };
  }

  @Get('admin/loan-applications')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SITE_ADMIN')
  @ApiOperation({ summary: 'فهرست فقط‌خواندنی درخواست‌های وام (ادمین سایت)' })
  async listAdmin(@Query() query: ListLoansQueryDto) {
    const data = await this.loans.listAdmin(
      query.page ?? 1,
      query.pageSize ?? 20,
    );
    return { success: true, data };
  }

  @Get('admin/loan-applications/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SITE_ADMIN')
  @ApiOperation({ summary: 'جزئیات فقط‌خواندنی درخواست وام' })
  async getAdmin(@Param('id') id: string) {
    const data = await this.loans.getAdmin(id);
    return { success: true, data };
  }

  @Get('me/loan-profile')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('USER')
  @ApiOperation({ summary: 'وضعیت عضویت بانک، افتتاح حساب و اعتبارسنجی کاربر' })
  async profile(@CurrentUser() actor: AuthenticatedUser) {
    return { success: true, data: await this.loans.getProfile(actor) };
  }

  @Post('me/loan-profile/account-opening')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('USER')
  @ApiOperation({ summary: 'ارسال درخواست افتتاح حساب به بانک سامان' })
  async startAccountOpening(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: StartAccountOpeningDto,
  ) {
    return {
      success: true,
      data: await this.loans.startAccountOpening(actor, dto.idempotencyKey),
    };
  }

  @Post('me/loan-profile/account-opening/sync')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('USER')
  @ApiOperation({ summary: 'استعلام وضعیت افتتاح حساب از بانک سامان' })
  async syncAccountOpening(@CurrentUser() actor: AuthenticatedUser) {
    return {
      success: true,
      data: await this.loans.syncAccountOpening(actor),
    };
  }

  @Post('me/loan-profile/eligibility')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('USER')
  @ApiOperation({ summary: 'ارسال شماره مشتری و شروع اعتبارسنجی بانکی' })
  async startEligibility(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: StartEligibilityDto,
  ) {
    return {
      success: true,
      data: await this.loans.startEligibility(
        actor,
        dto.customerNumber,
        dto.idempotencyKey,
      ),
    };
  }

  @Post('me/loan-profile/eligibility/sync')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('USER')
  @ApiOperation({ summary: 'استعلام نتیجه و سقف ریالی اعتبار از بانک' })
  async syncEligibility(@CurrentUser() actor: AuthenticatedUser) {
    return {
      success: true,
      data: await this.loans.syncEligibility(actor),
    };
  }
}
