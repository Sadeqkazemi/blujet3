import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ActorContextDto } from '../../common/actor-context.dto';
import {
  BLOG_CATEGORIES,
  BLOG_STATUSES,
  type BlogCategory,
  type BlogPostStatus,
} from '../../database/entities/blog-post.entity';

export class CreateBlogPostDto {
  @ApiProperty({
    example: 'راهنمای کامل چک‌این آنلاین پروازهای داخلی',
    description: 'عنوان مقاله',
  })
  @IsString()
  @MinLength(1)
  title!: string;

  @ApiProperty({ example: 'متن مقاله…', description: 'محتوای مقاله' })
  @IsString()
  @MinLength(1)
  body!: string;

  @ApiProperty({
    enum: BLOG_CATEGORIES,
    example: 'GUIDE',
    description: 'دسته‌بندی مقاله',
  })
  @IsIn(BLOG_CATEGORIES)
  category!: BlogCategory;

  @ApiPropertyOptional({
    enum: BLOG_STATUSES,
    default: 'DRAFT',
    example: 'DRAFT',
    description: 'وضعیت انتشار',
  })
  @IsOptional()
  @IsIn(BLOG_STATUSES)
  status?: BlogPostStatus;

  @ApiPropertyOptional({
    format: 'uuid',
    example: '11111111-1111-4111-8111-111111111111',
    description: 'شناسه فایل کاور Experience',
  })
  @IsOptional()
  @IsUUID()
  coverFileId?: string;

  @ApiPropertyOptional({
    format: 'date-time',
    example: '2026-09-03T08:00:00.000Z',
    description: 'زمان انتشار برنامه‌ریزی‌شده UTC',
  })
  @IsOptional()
  @IsISO8601()
  scheduledAt?: string;

  @ApiPropertyOptional({
    example: 'online-checkin-guide',
    description: 'slug مقاله',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  slug?: string;
}

export class UpdateBlogPostDto {
  @ApiPropertyOptional({ example: 'عنوان جدید', description: 'عنوان مقاله' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @ApiPropertyOptional({ example: 'محتوای جدید', description: 'محتوای مقاله' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  body?: string;

  @ApiPropertyOptional({
    enum: BLOG_CATEGORIES,
    example: 'NEWS',
    description: 'دسته‌بندی مقاله',
  })
  @IsOptional()
  @IsIn(BLOG_CATEGORIES)
  category?: BlogCategory;

  @ApiPropertyOptional({
    enum: BLOG_STATUSES,
    example: 'PUBLISHED',
    description: 'وضعیت انتشار',
  })
  @IsOptional()
  @IsIn(BLOG_STATUSES)
  status?: BlogPostStatus;

  @ApiPropertyOptional({
    nullable: true,
    format: 'uuid',
    example: null,
    description: 'شناسه فایل کاور',
  })
  @IsOptional()
  @IsUUID()
  coverFileId?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    format: 'date-time',
    example: null,
    description: 'زمان انتشار برنامه‌ریزی‌شده UTC',
  })
  @IsOptional()
  @IsISO8601()
  scheduledAt?: string | null;

  @ApiPropertyOptional({ example: 'new-slug', description: 'slug مقاله' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  slug?: string;
}

export class BlogActorCommandDto<TInput> {
  @ApiProperty({
    type: ActorContextDto,
    description: 'هویت احرازشده فراخواننده',
  })
  @ValidateNested()
  @Type(() => ActorContextDto)
  actor!: ActorContextDto;

  input!: TInput;
}

export class CreateBlogCommandDto extends BlogActorCommandDto<CreateBlogPostDto> {
  @ApiProperty({ type: CreateBlogPostDto, description: 'اطلاعات مقاله جدید' })
  @ValidateNested()
  @Type(() => CreateBlogPostDto)
  declare input: CreateBlogPostDto;
}

export class UpdateBlogCommandDto extends BlogActorCommandDto<UpdateBlogPostDto> {
  @ApiProperty({ type: UpdateBlogPostDto, description: 'تغییرات مقاله' })
  @ValidateNested()
  @Type(() => UpdateBlogPostDto)
  declare input: UpdateBlogPostDto;
}

export class DeleteBlogCommandDto {
  @ApiProperty({
    type: ActorContextDto,
    description: 'هویت احرازشده فراخواننده',
  })
  @ValidateNested()
  @Type(() => ActorContextDto)
  actor!: ActorContextDto;
}

export class ListBlogPostsQueryDto {
  @ApiPropertyOptional({
    enum: [...BLOG_CATEGORIES, 'all'],
    example: 'all',
    description: 'فیلتر دسته‌بندی مدیریتی',
  })
  @IsOptional()
  @IsIn([...BLOG_CATEGORIES, 'all'])
  category?: BlogCategory | 'all';
}

export class ListPublicBlogPostsQueryDto {
  @ApiPropertyOptional({
    enum: BLOG_CATEGORIES,
    example: 'GUIDE',
    description: 'فیلتر دسته‌بندی عمومی',
  })
  @IsOptional()
  @IsIn(BLOG_CATEGORIES)
  category?: BlogCategory;
}
