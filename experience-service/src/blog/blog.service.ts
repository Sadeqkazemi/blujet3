import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { IsNull, LessThanOrEqual, Not, Repository } from 'typeorm';
import type { ActorContextDto } from '../common/actor-context.dto';
import {
  BlogPost,
  type BlogPostStatus,
} from '../database/entities/blog-post.entity';
import { StoredFile } from '../database/entities/stored-file.entity';
import type {
  CreateBlogPostDto,
  ListBlogPostsQueryDto,
  ListPublicBlogPostsQueryDto,
  UpdateBlogPostDto,
} from './dto/blog.dto';

const CATEGORY_LABELS_FA: Record<string, string> = {
  NEWS: 'اخبار پرواز',
  GUIDE: 'راهنمای سفر',
  DEST: 'مقاصد',
  OFFERS: 'تخفیف‌ها',
};

const STATUS_LABELS_FA: Record<BlogPostStatus, string> = {
  DRAFT: 'پیش‌نویس',
  PUBLISHED: 'منتشرشده',
  SCHEDULED: 'زمان‌بندی‌شده',
};

function slugify(title: string): string {
  const normalized = title
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}-]/gu, '')
    .slice(0, 80);
  return normalized || `post-${randomUUID().slice(0, 8)}`;
}

function isPubliclyVisible(
  status: BlogPostStatus,
  scheduledAt: Date | null,
  now = new Date(),
): boolean {
  return (
    status === 'PUBLISHED' ||
    (status === 'SCHEDULED' && Boolean(scheduledAt && scheduledAt <= now))
  );
}

@Injectable()
export class BlogService {
  constructor(
    @InjectRepository(BlogPost)
    private readonly blogPostRepo: Repository<BlogPost>,
    @InjectRepository(StoredFile)
    private readonly storedFileRepo: Repository<StoredFile>,
  ) {}

  private assertSiteAdmin(actor: ActorContextDto): void {
    if (actor.role !== 'SITE_ADMIN' && !actor.isSuperAdmin) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'دسترسی به مدیریت بلاگ مجاز نیست.',
      });
    }
  }

  private async uniqueSlug(preferred: string): Promise<string> {
    let slug = preferred;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const existing = await this.blogPostRepo.findOne({
        where: { slug },
        select: { id: true },
      });
      if (!existing) return slug;
      slug = `${preferred}-${randomUUID().slice(0, 6)}`;
    }
    return `${preferred}-${Date.now()}`;
  }

  private async assertCoverFile(
    actorId: string,
    coverFileId: string,
    excludePostId?: string,
  ): Promise<void> {
    const file = await this.storedFileRepo.findOneBy({ id: coverFileId });
    if (!file || file.ownerId !== actorId) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'فایل کاور معتبر و متعلق به شما نیست.',
      });
    }
    const usedElsewhere = await this.blogPostRepo.findOne({
      where: {
        coverFileId,
        deletedAt: IsNull(),
        ...(excludePostId ? { id: Not(excludePostId) } : {}),
      },
    });
    if (usedElsewhere) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'این تصویر کاور قبلاً برای مقالهٔ دیگری استفاده شده است.',
      });
    }
  }

  private resolveStatusFields(
    status: BlogPostStatus,
    scheduledAt?: string | null,
  ): { publishedAt?: Date | null; scheduledAt?: Date | null } {
    if (status === 'PUBLISHED') {
      return { publishedAt: new Date(), scheduledAt: null };
    }
    if (status === 'SCHEDULED') {
      if (!scheduledAt) {
        throw new BadRequestException({
          code: 'VALIDATION_FAILED',
          message: 'برای زمان‌بندی انتشار، تاریخ انتشار الزامی است.',
        });
      }
      const at = new Date(scheduledAt);
      if (Number.isNaN(at.getTime()) || at <= new Date()) {
        throw new BadRequestException({
          code: 'VALIDATION_FAILED',
          message: 'تاریخ زمان‌بندی باید در آینده باشد.',
        });
      }
      return { publishedAt: null, scheduledAt: at };
    }
    return { publishedAt: null, scheduledAt: null };
  }

  private toAdminRow(post: BlogPost) {
    return {
      id: post.id,
      title: post.title,
      slug: post.slug,
      body: post.body,
      category: post.category,
      categoryLabelFa: CATEGORY_LABELS_FA[post.category] ?? post.category,
      status: post.status,
      statusLabelFa: STATUS_LABELS_FA[post.status],
      viewCount: post.viewCount,
      publishedAt: post.publishedAt,
      scheduledAt: post.scheduledAt,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      coverFileId: post.coverFileId,
      authorName: post.authorName ?? 'blujet',
    };
  }

  async getAdminStats(actor: ActorContextDto) {
    this.assertSiteAdmin(actor);
    const [published, draft, viewsRow] = await Promise.all([
      this.blogPostRepo.count({
        where: { deletedAt: IsNull(), status: 'PUBLISHED' },
      }),
      this.blogPostRepo.count({
        where: { deletedAt: IsNull(), status: 'DRAFT' },
      }),
      this.blogPostRepo
        .createQueryBuilder('post')
        .select('SUM(post."viewCount")', 'sum')
        .where('post."deletedAt" IS NULL')
        .getRawOne<{ sum: string | null }>(),
    ]);
    return {
      publishedCount: published,
      draftCount: draft,
      totalViews: viewsRow?.sum ? Number(viewsRow.sum) : 0,
      commentCount: 0,
    };
  }

  async listAdminPosts(actor: ActorContextDto, query: ListBlogPostsQueryDto) {
    this.assertSiteAdmin(actor);
    const posts = await this.blogPostRepo.find({
      where: {
        deletedAt: IsNull(),
        ...(query.category && query.category !== 'all'
          ? { category: query.category }
          : {}),
      },
      order: { updatedAt: 'DESC' },
    });
    return posts.map((post) => this.toAdminRow(post));
  }

  async getAdminPost(actor: ActorContextDto, id: string) {
    this.assertSiteAdmin(actor);
    const post = await this.blogPostRepo.findOne({
      where: { id, deletedAt: IsNull() },
    });
    if (!post) this.notFound();
    return this.toAdminRow(post);
  }

  async createPost(actor: ActorContextDto, dto: CreateBlogPostDto) {
    this.assertSiteAdmin(actor);
    if (dto.coverFileId) {
      await this.assertCoverFile(actor.id, dto.coverFileId);
    }
    const status = dto.status ?? 'DRAFT';
    const statusFields = this.resolveStatusFields(status, dto.scheduledAt);
    const slug = await this.uniqueSlug(dto.slug?.trim() || slugify(dto.title));
    const saved = await this.blogPostRepo.save(
      this.blogPostRepo.create({
        title: dto.title.trim(),
        slug,
        body: dto.body,
        category: dto.category,
        status,
        coverFileId: dto.coverFileId ?? null,
        authorId: actor.id,
        authorName: actor.fullName,
        updatedAt: new Date(),
        ...statusFields,
      }),
    );
    return this.toAdminRow(saved);
  }

  async updatePost(actor: ActorContextDto, id: string, dto: UpdateBlogPostDto) {
    this.assertSiteAdmin(actor);
    const existing = await this.blogPostRepo.findOne({
      where: { id, deletedAt: IsNull() },
    });
    if (!existing) this.notFound();
    if (dto.coverFileId) {
      await this.assertCoverFile(actor.id, dto.coverFileId, id);
    }

    const nextStatus = dto.status ?? existing.status;
    const scheduledInput =
      dto.scheduledAt !== undefined
        ? dto.scheduledAt
        : existing.scheduledAt?.toISOString();
    const statusFields =
      dto.status !== undefined || dto.scheduledAt !== undefined
        ? this.resolveStatusFields(nextStatus, scheduledInput)
        : {};
    if (dto.title !== undefined) existing.title = dto.title.trim();
    if (dto.body !== undefined) existing.body = dto.body;
    if (dto.category !== undefined) existing.category = dto.category;
    if (dto.status !== undefined) existing.status = dto.status;
    if (dto.coverFileId !== undefined) existing.coverFileId = dto.coverFileId;
    if (dto.slug !== undefined && dto.slug !== existing.slug) {
      existing.slug = await this.uniqueSlug(dto.slug.trim());
    }
    if (statusFields.publishedAt !== undefined) {
      existing.publishedAt = statusFields.publishedAt;
    }
    if (statusFields.scheduledAt !== undefined) {
      existing.scheduledAt = statusFields.scheduledAt;
    }
    existing.updatedAt = new Date();
    return this.toAdminRow(await this.blogPostRepo.save(existing));
  }

  async deletePost(actor: ActorContextDto, id: string) {
    this.assertSiteAdmin(actor);
    const existing = await this.blogPostRepo.findOne({
      where: { id, deletedAt: IsNull() },
    });
    if (!existing) this.notFound();
    existing.deletedAt = new Date();
    await this.blogPostRepo.save(existing);
    return { id };
  }

  async listPublicPosts(query: ListPublicBlogPostsQueryDto) {
    const common = {
      deletedAt: IsNull(),
      ...(query.category ? { category: query.category } : {}),
    };
    const posts = await this.blogPostRepo.find({
      where: [
        { ...common, status: 'PUBLISHED' as const },
        {
          ...common,
          status: 'SCHEDULED' as const,
          scheduledAt: LessThanOrEqual(new Date()),
        },
      ],
      order: { publishedAt: 'DESC', scheduledAt: 'DESC' },
    });
    return posts.map((post) => ({
      slug: post.slug,
      title: post.title,
      category: post.category,
      categoryLabelFa: CATEGORY_LABELS_FA[post.category] ?? post.category,
      authorName: post.authorName ?? 'blujet',
      publishedAt: post.publishedAt ?? post.scheduledAt,
      viewCount: post.viewCount,
      coverFileId: post.coverFileId,
      excerpt: post.body.slice(0, 200),
    }));
  }

  async getPublicPost(slug: string) {
    const post = await this.blogPostRepo.findOne({
      where: { slug, deletedAt: IsNull() },
    });
    if (!post || !isPubliclyVisible(post.status, post.scheduledAt)) {
      this.notFound();
    }
    await this.blogPostRepo.increment({ id: post.id }, 'viewCount', 1);
    const updated = await this.blogPostRepo.findOneByOrFail({ id: post.id });
    return {
      slug: updated.slug,
      title: updated.title,
      body: updated.body,
      category: updated.category,
      categoryLabelFa: CATEGORY_LABELS_FA[updated.category] ?? updated.category,
      authorName: updated.authorName ?? 'blujet',
      publishedAt: updated.publishedAt ?? updated.scheduledAt,
      viewCount: updated.viewCount,
      coverFileId: updated.coverFileId,
    };
  }

  private notFound(): never {
    throw new NotFoundException({
      code: 'NOT_FOUND',
      message: 'مقاله یافت نشد.',
    });
  }
}
