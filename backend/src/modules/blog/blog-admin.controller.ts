import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { BlogService } from './blog.service';
import {
  CreateBlogPostDto,
  ListBlogPostsQueryDto,
  UpdateBlogPostDto,
} from './dto/blog.dtos';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PanelAccessGuard } from '../panels/panel-access.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

/** مدیریت بلاگ — SITE_ADMIN CRUD (`blog` panel tab). Public listing lives
 * in BlogPublicController. See docs/API.md Phase D. */
@ApiTags('blog')
@Controller('blog/admin')
@UseGuards(JwtAuthGuard, RolesGuard, PanelAccessGuard)
@Roles('SITE_ADMIN')
export class BlogAdminController {
  constructor(private readonly blog: BlogService) {}

  @Get('stats')
  @ApiOperation({ summary: 'آمار KPI بلاگ (منتشرشده، پیش‌نویس، بازدید)' })
  async stats() {
    return { success: true, data: await this.blog.getAdminStats() };
  }

  @Get('posts')
  @ApiOperation({ summary: 'فهرست همهٔ مقالات (با فیلتر دسته‌بندی)' })
  async list(@Query() query: ListBlogPostsQueryDto) {
    return { success: true, data: await this.blog.listAdminPosts(query) };
  }

  @Get('posts/:id')
  @ApiOperation({ summary: 'جزئیات یک مقاله برای ویرایش' })
  async getOne(@Param('id') id: string) {
    return { success: true, data: await this.blog.getAdminPost(id) };
  }

  @Post('posts')
  @ApiOperation({ summary: 'ایجاد مقالهٔ جدید' })
  async create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateBlogPostDto,
  ) {
    return { success: true, data: await this.blog.createPost(actor, dto) };
  }

  @Patch('posts/:id')
  @ApiOperation({ summary: 'ویرایش مقاله' })
  async update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateBlogPostDto,
  ) {
    return { success: true, data: await this.blog.updatePost(actor, id, dto) };
  }

  @Delete('posts/:id')
  @ApiOperation({ summary: 'حذف نرم مقاله' })
  async remove(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return { success: true, data: await this.blog.deletePost(actor, id) };
  }
}
