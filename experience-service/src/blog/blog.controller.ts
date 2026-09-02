import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { BlogService } from './blog.service';
import { ActorContextDto } from '../common/actor-context.dto';
import {
  CreateBlogCommandDto,
  DeleteBlogCommandDto,
  ListBlogPostsQueryDto,
  ListPublicBlogPostsQueryDto,
  UpdateBlogCommandDto,
} from './dto/blog.dto';

@ApiTags('internal-blog')
@ApiSecurity('internal-token')
@Controller('internal/v1/blog')
export class BlogController {
  constructor(private readonly blog: BlogService) {}

  @Post('admin/stats')
  @ApiOperation({ summary: 'آمار مدیریت بلاگ' })
  @ApiResponse({ status: 200, description: 'KPIهای بلاگ.' })
  stats(@Body() actor: ActorContextDto) {
    return this.success(this.blog.getAdminStats(actor));
  }

  @Post('admin/posts/search')
  @ApiOperation({ summary: 'فهرست مدیریت بلاگ' })
  @ApiResponse({ status: 200, description: 'فهرست مقالات مدیریت.' })
  listAdmin(
    @Body() actor: ActorContextDto,
    @Query() query: ListBlogPostsQueryDto,
  ) {
    return this.success(this.blog.listAdminPosts(actor, query));
  }

  @Post('admin/posts/:id/detail')
  @ApiOperation({ summary: 'جزئیات مدیریت مقاله' })
  @ApiResponse({ status: 200, description: 'جزئیات مقاله.' })
  getAdmin(@Body() actor: ActorContextDto, @Param('id') id: string) {
    return this.success(this.blog.getAdminPost(actor, id));
  }

  @Post('admin/posts')
  @ApiOperation({ summary: 'ایجاد مقاله' })
  @ApiResponse({ status: 201, description: 'مقاله ایجاد شد.' })
  create(@Body() command: CreateBlogCommandDto) {
    return this.success(this.blog.createPost(command.actor, command.input));
  }

  @Patch('admin/posts/:id')
  @ApiOperation({ summary: 'ویرایش مقاله' })
  @ApiResponse({ status: 200, description: 'مقاله ویرایش شد.' })
  update(@Param('id') id: string, @Body() command: UpdateBlogCommandDto) {
    return this.success(this.blog.updatePost(command.actor, id, command.input));
  }

  @Delete('admin/posts/:id')
  @ApiOperation({ summary: 'حذف نرم مقاله' })
  @ApiResponse({ status: 200, description: 'مقاله حذف شد.' })
  remove(@Param('id') id: string, @Body() command: DeleteBlogCommandDto) {
    return this.success(this.blog.deletePost(command.actor, id));
  }

  @Get('public/posts')
  @ApiOperation({ summary: 'فهرست مقالات منتشرشده' })
  @ApiResponse({ status: 200, description: 'فهرست عمومی مقالات.' })
  listPublic(@Query() query: ListPublicBlogPostsQueryDto) {
    return this.success(this.blog.listPublicPosts(query));
  }

  @Get('public/posts/:slug')
  @ApiOperation({ summary: 'جزئیات مقاله منتشرشده' })
  @ApiResponse({ status: 200, description: 'مقاله عمومی.' })
  getPublic(@Param('slug') slug: string) {
    return this.success(this.blog.getPublicPost(slug));
  }

  private async success<T>(data: Promise<T>) {
    return { success: true, data: await data };
  }
}
