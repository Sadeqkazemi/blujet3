import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export const BLOG_CATEGORIES = ['NEWS', 'GUIDE', 'DEST', 'OFFERS'] as const;
export const BLOG_STATUSES = ['DRAFT', 'PUBLISHED', 'SCHEDULED'] as const;

export class CreateBlogPostDto {
  @ApiProperty({ example: 'راهنمای کامل چک‌این آنلاین پروازهای داخلی' })
  @IsString()
  @MinLength(1)
  title: string;

  @ApiProperty({ example: 'متن مقاله…' })
  @IsString()
  @MinLength(1)
  body: string;

  @ApiProperty({ enum: BLOG_CATEGORIES })
  @IsIn(BLOG_CATEGORIES)
  category: (typeof BLOG_CATEGORIES)[number];

  @ApiPropertyOptional({ enum: BLOG_STATUSES, default: 'DRAFT' })
  @IsOptional()
  @IsIn(BLOG_STATUSES)
  status?: (typeof BLOG_STATUSES)[number];

  @ApiPropertyOptional({ description: 'StoredFile id from POST /files' })
  @IsOptional()
  @IsUUID()
  coverFileId?: string;

  @ApiPropertyOptional({
    description: 'Required when status is SCHEDULED (ISO 8601 UTC)',
  })
  @IsOptional()
  @IsISO8601()
  scheduledAt?: string;

  @ApiPropertyOptional({ description: 'URL slug — auto-generated if omitted' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  slug?: string;
}

export class UpdateBlogPostDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  body?: string;

  @ApiPropertyOptional({ enum: BLOG_CATEGORIES })
  @IsOptional()
  @IsIn(BLOG_CATEGORIES)
  category?: (typeof BLOG_CATEGORIES)[number];

  @ApiPropertyOptional({ enum: BLOG_STATUSES })
  @IsOptional()
  @IsIn(BLOG_STATUSES)
  status?: (typeof BLOG_STATUSES)[number];

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUUID()
  coverFileId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  scheduledAt?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  slug?: string;
}

export class ListBlogPostsQueryDto {
  @ApiPropertyOptional({ enum: [...BLOG_CATEGORIES, 'all'] })
  @IsOptional()
  @IsIn([...BLOG_CATEGORIES, 'all'])
  category?: (typeof BLOG_CATEGORIES)[number] | 'all';
}

export class ListPublicBlogPostsQueryDto {
  @ApiPropertyOptional({ enum: BLOG_CATEGORIES })
  @IsOptional()
  @IsIn(BLOG_CATEGORIES)
  category?: (typeof BLOG_CATEGORIES)[number];
}
