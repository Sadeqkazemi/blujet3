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
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import {
  ActorOnlyCommandDto,
  AddLibraryAssetCommandDto,
  ContentBlockParamDto,
  CreateDestinationCommandDto,
  CreateRouteCommandDto,
  PublicContentQueryDto,
  UpdateContentBlockCommandDto,
  UpdateDestinationCommandDto,
  UpdateRouteCommandDto,
} from './dto/site-content.dto';
import { SiteContentService } from './site-content.service';

@ApiTags('internal-site-content')
@ApiSecurity('internal-token')
@Controller('internal/v1/site-content')
export class SiteContentController {
  constructor(private readonly content: SiteContentService) {}

  @Post('admin/library/search')
  @ApiOperation({ summary: 'فهرست کتابخانه رسانه سایت' })
  listLibrary(@Body() command: ActorOnlyCommandDto) {
    return this.success(this.content.listLibrary(command.actor));
  }

  @Post('admin/library')
  @ApiOperation({ summary: 'افزودن رسانه به کتابخانه سایت' })
  addLibrary(@Body() command: AddLibraryAssetCommandDto) {
    return this.success(this.content.addLibrary(command.actor, command.input));
  }

  @Delete('admin/library/:id')
  @ApiOperation({ summary: 'حذف رسانه از کتابخانه سایت' })
  deleteLibrary(@Param('id') id: string, @Body() command: ActorOnlyCommandDto) {
    return this.success(this.content.deleteLibrary(command.actor, id));
  }

  @Post('admin/blocks/search')
  @ApiOperation({ summary: 'فهرست بلوک‌های محتوای سایت' })
  listBlocks(@Body() command: ActorOnlyCommandDto) {
    return this.success(this.content.listBlocks(command.actor));
  }

  @Patch('admin/blocks/:key')
  @ApiOperation({ summary: 'ویرایش بلوک محتوای سایت' })
  updateBlock(
    @Param() params: ContentBlockParamDto,
    @Body() command: UpdateContentBlockCommandDto,
  ) {
    return this.success(
      this.content.updateBlock(command.actor, params.key, command.input),
    );
  }

  @Post('admin/destinations/search')
  @ApiOperation({ summary: 'فهرست مقصدهای برجسته' })
  listDestinations(@Body() command: ActorOnlyCommandDto) {
    return this.success(this.content.listDestinations(command.actor));
  }

  @Post('admin/destinations')
  @ApiOperation({ summary: 'ایجاد مقصد برجسته' })
  createDestination(@Body() command: CreateDestinationCommandDto) {
    return this.success(
      this.content.createDestination(command.actor, command.input),
    );
  }

  @Patch('admin/destinations/:id')
  @ApiOperation({ summary: 'ویرایش مقصد برجسته' })
  updateDestination(
    @Param('id') id: string,
    @Body() command: UpdateDestinationCommandDto,
  ) {
    return this.success(
      this.content.updateDestination(command.actor, id, command.input),
    );
  }

  @Delete('admin/destinations/:id')
  @ApiOperation({ summary: 'حذف مقصد برجسته' })
  deleteDestination(
    @Param('id') id: string,
    @Body() command: ActorOnlyCommandDto,
  ) {
    return this.success(this.content.deleteDestination(command.actor, id));
  }

  @Post('admin/routes/search')
  @ApiOperation({ summary: 'فهرست مسیرهای برجسته' })
  listRoutes(@Body() command: ActorOnlyCommandDto) {
    return this.success(this.content.listRoutes(command.actor));
  }

  @Post('admin/routes')
  @ApiOperation({ summary: 'ایجاد مسیر برجسته' })
  createRoute(@Body() command: CreateRouteCommandDto) {
    return this.success(this.content.createRoute(command.actor, command.input));
  }

  @Patch('admin/routes/:id')
  @ApiOperation({ summary: 'ویرایش مسیر برجسته' })
  updateRoute(@Param('id') id: string, @Body() command: UpdateRouteCommandDto) {
    return this.success(
      this.content.updateRoute(command.actor, id, command.input),
    );
  }

  @Delete('admin/routes/:id')
  @ApiOperation({ summary: 'حذف مسیر برجسته' })
  deleteRoute(@Param('id') id: string, @Body() command: ActorOnlyCommandDto) {
    return this.success(this.content.deleteRoute(command.actor, id));
  }

  @Get('public/home-content')
  @ApiOperation({ summary: 'محتوای فعال صفحه اصلی برای زبان درخواستی' })
  publicContent(@Query() query: PublicContentQueryDto) {
    return this.success(this.content.getPublicContent(query.locale));
  }

  private async success<T>(data: Promise<T>) {
    return { success: true, data: await data };
  }
}
