import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ErrorCode } from '../../common/errors';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SiteContentService } from './site-content.service';
import {
  AddLibraryAssetDto,
  BLOCK_KEYS,
  CreateDestinationDto,
  CreateRouteDto,
  UpdateContentBlockDto,
  UpdateDestinationDto,
  UpdateRouteDto,
} from './dto/site-content.dtos';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PanelAccessGuard } from '../panels/panel-access.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import type { SiteContentBlockKey } from '../../database/enums';

@ApiTags('site-content')
@Controller('site-content/admin')
@UseGuards(JwtAuthGuard, RolesGuard, PanelAccessGuard)
@Roles('SITE_ADMIN')
export class SiteContentAdminController {
  constructor(private readonly content: SiteContentService) {}

  @Get('library')
  @ApiOperation({ summary: 'کتابخانهٔ تصاویر سایت' })
  async library() {
    return { success: true, data: await this.content.listLibrary() };
  }

  @Post('library')
  @ApiOperation({ summary: 'افزودن تصویر به کتابخانه' })
  async addLibrary(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: AddLibraryAssetDto,
  ) {
    return {
      success: true,
      data: await this.content.addLibraryAsset(actor, dto),
    };
  }

  @Delete('library/:id')
  @ApiOperation({ summary: 'حذف نرم تصویر از کتابخانه' })
  async removeLibrary(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return {
      success: true,
      data: await this.content.deleteLibraryAsset(actor, id),
    };
  }

  @Get('blocks')
  @ApiOperation({ summary: 'بلوک‌های بنر صفحهٔ اصلی' })
  async blocks() {
    return { success: true, data: await this.content.listBlocks() };
  }

  @Patch('blocks/:key')
  @ApiOperation({ summary: 'ویرایش یک بلوک بنر' })
  async updateBlock(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('key') key: SiteContentBlockKey,
    @Body() dto: UpdateContentBlockDto,
  ) {
    if (!BLOCK_KEYS.includes(key)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'کلید نامعتبر',
      });
    }
    return {
      success: true,
      data: await this.content.updateBlock(actor, key, dto),
    };
  }

  @Get('destinations')
  @ApiOperation({ summary: 'مقاصد محبوب' })
  async destinations() {
    return { success: true, data: await this.content.listDestinations() };
  }

  @Post('destinations')
  @ApiOperation({ summary: 'افزودن مقصد محبوب' })
  async createDestination(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateDestinationDto,
  ) {
    return {
      success: true,
      data: await this.content.createDestination(actor, dto),
    };
  }

  @Patch('destinations/:id')
  @ApiOperation({ summary: 'ویرایش مقصد محبوب' })
  async updateDestination(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateDestinationDto,
  ) {
    return {
      success: true,
      data: await this.content.updateDestination(actor, id, dto),
    };
  }

  @Delete('destinations/:id')
  @ApiOperation({ summary: 'حذف مقصد محبوب' })
  async deleteDestination(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return {
      success: true,
      data: await this.content.deleteDestination(actor, id),
    };
  }

  @Get('routes')
  @ApiOperation({ summary: 'مسیرهای پرتردد' })
  async routes() {
    return { success: true, data: await this.content.listRoutes() };
  }

  @Post('routes')
  @ApiOperation({ summary: 'افزودن مسیر پرتردد' })
  async createRoute(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateRouteDto,
  ) {
    return { success: true, data: await this.content.createRoute(actor, dto) };
  }

  @Patch('routes/:id')
  @ApiOperation({ summary: 'ویرایش مسیر پرتردد' })
  async updateRoute(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateRouteDto,
  ) {
    return {
      success: true,
      data: await this.content.updateRoute(actor, id, dto),
    };
  }

  @Delete('routes/:id')
  @ApiOperation({ summary: 'حذف مسیر پرتردد' })
  async deleteRoute(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return { success: true, data: await this.content.deleteRoute(actor, id) };
  }
}
