import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { AdminsService } from './admins.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PanelAccessGuard } from '../panels/panel-access.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import type { Role } from '../../database/enums';
import { MANAGER_PANEL_PERMISSION_KEYS } from '../panels/manager-panel-permissions';

const CREATABLE_ROLES = [
  'SENIOR_MANAGER',
  'FINANCE_MANAGER',
  'COMMERCIAL_MANAGER',
  'IT_MANAGER',
  'SITE_ADMIN',
] as const;

export class CreateAdminDto {
  @ApiProperty({ example: 'زهرا کریمی' })
  @IsString()
  @MinLength(2)
  fullName: string;

  @ApiProperty({ example: 'z.karimi@blujet.example' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'z.karimi' })
  @IsString()
  @MinLength(3)
  username: string;

  // ⚑ enum roles only — the design's «نقش سفارشی…» has no authorization
  // backing and is deliberately unsupported (docs/API.md Phase 12).
  @ApiProperty({ enum: CREATABLE_ROLES })
  @IsIn(CREATABLE_ROLES)
  role: Role;

  @ApiProperty({ example: 'Blujet@1404', minLength: 6 })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({ enum: ['sms', 'email'] })
  @IsIn(['sms', 'email'])
  delivery: 'sms' | 'email';

  @ApiProperty({
    description: 'از POST /auth/step-up/request (scope: ADMIN_ROLE_CHANGE)',
  })
  @IsString()
  stepUpChallengeId: string;

  @ApiProperty({ example: '482913' })
  @IsString()
  stepUpCode: string;

  @ApiPropertyOptional({
    enum: MANAGER_PANEL_PERMISSION_KEYS,
    isArray: true,
    description:
      'Subtractive manager-panel permissions; role checks still apply.',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(MANAGER_PANEL_PERMISSION_KEYS, { each: true })
  permissions?: string[];
}

export class SetAdminPermissionsDto {
  @ApiProperty({ enum: MANAGER_PANEL_PERMISSION_KEYS, isArray: true })
  @IsArray()
  @ArrayUnique()
  @IsIn(MANAGER_PANEL_PERMISSION_KEYS, { each: true })
  permissions: string[];

  @ApiProperty({ description: 'From POST /auth/step-up/request.' })
  @IsString()
  stepUpChallengeId: string;

  @ApiProperty({ example: '482913' })
  @IsString()
  stepUpCode: string;
}

export class ResetAdminPasswordDto {
  @ApiPropertyOptional({ minLength: 6 })
  @IsOptional()
  @IsString()
  password?: string;

  @ApiPropertyOptional({ enum: ['sms', 'email'] })
  @IsOptional()
  @IsIn(['sms', 'email'])
  delivery?: 'sms' | 'email';
}

@ApiTags('admins')
@Controller('admins')
@UseGuards(JwtAuthGuard, RolesGuard, PanelAccessGuard)
@Roles('CEO', 'BOARD_CHAIR', 'SENIOR_MANAGER')
export class AdminsController {
  constructor(private readonly admins: AdminsService) {}

  @Get()
  @ApiOperation({
    summary: 'فهرست مدیران و ادمین‌ها — «آنلاین» از نشست‌های واقعی مشتق می‌شود',
  })
  async list(@CurrentUser() actor: AuthenticatedUser) {
    return { success: true, data: await this.admins.list(actor) };
  }

  @Post()
  @ApiOperation({ summary: 'افزودن مدیر / ادمین — فقط نقش‌های enum-backed' })
  async create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateAdminDto,
  ) {
    return { success: true, data: await this.admins.create(actor, dto) };
  }

  @Patch(':id/permissions')
  @ApiOperation({
    summary:
      'Replace manager panel restrictions without expanding the base role',
  })
  async setPermissions(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SetAdminPermissionsDto,
  ) {
    return {
      success: true,
      data: await this.admins.setPermissions(actor, id, dto),
    };
  }

  @Patch(':id/block')
  @ApiOperation({ summary: 'مسدودسازی ورود — واقعاً در login اعمال می‌شود' })
  async block(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return {
      success: true,
      data: await this.admins.setBlocked(actor, id, true),
    };
  }

  @Patch(':id/unblock')
  @ApiOperation({ summary: 'رفع مسدودی ورود' })
  async unblock(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return {
      success: true,
      data: await this.admins.setBlocked(actor, id, false),
    };
  }

  @Post(':id/reset-password')
  @ApiOperation({
    summary: 'بازنشانی رمز مدیر — رمز موقت فقط یک بار برگردانده می‌شود',
  })
  async resetPassword(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ResetAdminPasswordDto,
  ) {
    return {
      success: true,
      data: await this.admins.resetPassword(actor, id, dto),
    };
  }
}
