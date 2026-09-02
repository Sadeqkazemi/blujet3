import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { BlogService } from './blog.service';
import { ListPublicBlogPostsQueryDto } from './dto/blog.dtos';

/** Public blog listing + detail — no auth. Separate controller so
 * BlogAdminController's guards never apply here. */
@ApiTags('blog')
@Controller('blog')
export class BlogPublicController {
  constructor(private readonly blog: BlogService) {}

  @Get('posts')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'فهرست مقالات منتشرشده' })
  async list(@Query() query: ListPublicBlogPostsQueryDto) {
    return { success: true, data: await this.blog.listPublicPosts(query) };
  }

  @Get('posts/:slug')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'جزئیات یک مقالهٔ منتشرشده' })
  async detail(@Param('slug') slug: string) {
    return { success: true, data: await this.blog.getPublicPost(slug) };
  }

  @Get('covers/:fileId')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @ApiOperation({ summary: 'دریافت تصویر کاور مقالهٔ منتشرشده' })
  async cover(@Param('fileId') fileId: string, @Res() res: Response) {
    const { mimeType, fileName, stream } =
      await this.blog.readPublicCover(fileId);
    res.setHeader('Content-Type', mimeType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );
    stream.pipe(res);
  }
}
