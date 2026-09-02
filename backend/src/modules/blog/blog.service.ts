import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import { IsNull, LessThanOrEqual, Not, Repository } from 'typeorm';
import { BlogPost } from '../../database/entities/blog-post.entity';
import { StoredFile } from '../../database/entities/stored-file.entity';
import { AuditService } from '../audit/audit.service';
import { ErrorCode } from '../../common/errors';
import { BlogPostStatus } from '../../database/enums';
import type {
  CreateBlogPostDto,
  ListBlogPostsQueryDto,
  ListPublicBlogPostsQueryDto,
  UpdateBlogPostDto,
} from './dto/blog.dtos';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

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
  const base = normalized || `post-${crypto.randomUUID().slice(0, 8)}`;
  return base;
}

function isPubliclyVisible(
  status: BlogPostStatus,
  scheduledAt: Date | null,
  now = new Date(),
): boolean {
  if (status === 'PUBLISHED') return true;
  if (status === 'SCHEDULED' && scheduledAt && scheduledAt <= now) return true;
  return false;
}

@Injectable()
export class BlogService {
  constructor(
    @InjectRepository(BlogPost)
    private readonly blogPostRepo: Repository<BlogPost>,
    @InjectRepository(StoredFile)
    private readonly storedFileRepo: Repository<StoredFile>,
    private readonly audit: AuditService,
  ) {}

  private async uniqueSlug(preferred: string): Promise<string> {
    let slug = preferred;
    let attempt = 0;
    while (attempt < 10) {
      const existing = await this.blogPostRepo.findOne({
        where: { slug },
        select: { id: true },
      });
      if (!existing) return slug;
      slug = `${preferred}-${crypto.randomUUID().slice(0, 6)}`;
      attempt += 1;
    }
    return `${preferred}-${Date.now()}`;
  }

  private async assertCoverFile(
    actorId: string,
    coverFileId: string,
    excludePostId?: string,
  ) {
    const file = await this.storedFileRepo.findOneBy({ id: coverFileId });
    if (!file) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'فایل کاور یافت نشد.',
      });
    }
    if (file.ownerId !== actorId) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'فقط فایل‌های آپلودشده توسط شما قابل استفاده است.',
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
        code: ErrorCode.CONFLICT,
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
          code: ErrorCode.VALIDATION_FAILED,
          message: 'برای زمان‌بندی انتشار، تاریخ انتشار الزامی است.',
        });
      }
      const at = new Date(scheduledAt);
      if (Number.isNaN(at.getTime()) || at <= new Date()) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_FAILED,
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
      authorName: post.author.fullName,
    };
  }

  async getAdminStats() {
    const [published, draft, viewsRow] = await Promise.all([
      this.blogPostRepo.count({
        where: { deletedAt: IsNull(), status: BlogPostStatus.PUBLISHED },
      }),
      this.blogPostRepo.count({
        where: { deletedAt: IsNull(), status: BlogPostStatus.DRAFT },
      }),
      this.blogPostRepo
        .createQueryBuilder('p')
        .select('SUM(p."viewCount")', 'sum')
        .where('p."deletedAt" IS NULL')
        .getRawOne<{ sum: string | null }>(),
    ]);
    return {
      publishedCount: published,
      draftCount: draft,
      totalViews: viewsRow?.sum ? Number(viewsRow.sum) : 0,
      commentCount: 0,
    };
  }

  async listAdminPosts(query: ListBlogPostsQueryDto) {
    const posts = await this.blogPostRepo.find({
      where: {
        deletedAt: IsNull(),
        ...(query.category && query.category !== 'all'
          ? { category: query.category }
          : {}),
      },
      relations: { author: true },
      order: { updatedAt: 'DESC' },
    });
    return posts.map((p) => this.toAdminRow(p));
  }

  async getAdminPost(id: string) {
    const post = await this.blogPostRepo.findOne({
      where: { id, deletedAt: IsNull() },
      relations: { author: true },
    });
    if (!post) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'مقاله یافت نشد.',
      });
    }
    return this.toAdminRow(post);
  }

  async createPost(actor: AuthenticatedUser, dto: CreateBlogPostDto) {
    if (dto.coverFileId) {
      await this.assertCoverFile(actor.id, dto.coverFileId);
    }
    const status = dto.status ?? BlogPostStatus.DRAFT;
    const statusFields = this.resolveStatusFields(status, dto.scheduledAt);
    const preferredSlug = dto.slug?.trim() || slugify(dto.title);
    const slug = await this.uniqueSlug(preferredSlug);

    const entity = this.blogPostRepo.create({
      title: dto.title.trim(),
      slug,
      body: dto.body,
      category: dto.category,
      status,
      coverFileId: dto.coverFileId ?? null,
      authorId: actor.id,
      updatedAt: new Date(),
      ...statusFields,
    });
    const saved = await this.blogPostRepo.save(entity);

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'CONTENT',
      action: 'ایجاد مقالهٔ بلاگ',
      detail: `${actor.fullName} مقالهٔ «${saved.title}» را ایجاد کرد.`,
      entityType: 'BlogPost',
      entityId: saved.id,
    });

    const withAuthor = await this.blogPostRepo.findOne({
      where: { id: saved.id },
      relations: { author: true },
    });
    return this.toAdminRow(withAuthor!);
  }

  async updatePost(
    actor: AuthenticatedUser,
    id: string,
    dto: UpdateBlogPostDto,
  ) {
    const existing = await this.blogPostRepo.findOne({
      where: { id, deletedAt: IsNull() },
    });
    if (!existing) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'مقاله یافت نشد.',
      });
    }

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

    let slug = existing.slug;
    if (dto.slug && dto.slug !== existing.slug) {
      slug = await this.uniqueSlug(dto.slug.trim());
    }

    if (dto.title !== undefined) existing.title = dto.title.trim();
    if (dto.body !== undefined) existing.body = dto.body;
    if (dto.category !== undefined) existing.category = dto.category;
    if (dto.status !== undefined) existing.status = dto.status;
    if (dto.coverFileId !== undefined) existing.coverFileId = dto.coverFileId;
    if (dto.slug !== undefined) existing.slug = slug;
    if (statusFields.publishedAt !== undefined)
      existing.publishedAt = statusFields.publishedAt;
    if (statusFields.scheduledAt !== undefined)
      existing.scheduledAt = statusFields.scheduledAt;
    existing.updatedAt = new Date();

    const updated = await this.blogPostRepo.save(existing);

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'CONTENT',
      action: 'ویرایش مقالهٔ بلاگ',
      detail: `${actor.fullName} مقالهٔ «${updated.title}» را ویرایش کرد.`,
      entityType: 'BlogPost',
      entityId: updated.id,
    });

    const withAuthor = await this.blogPostRepo.findOne({
      where: { id: updated.id },
      relations: { author: true },
    });
    return this.toAdminRow(withAuthor!);
  }

  async deletePost(actor: AuthenticatedUser, id: string) {
    const existing = await this.blogPostRepo.findOne({
      where: { id, deletedAt: IsNull() },
    });
    if (!existing) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'مقاله یافت نشد.',
      });
    }
    existing.deletedAt = new Date();
    await this.blogPostRepo.save(existing);
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'CONTENT',
      action: 'حذف مقالهٔ بلاگ',
      detail: `${actor.fullName} مقالهٔ «${existing.title}» را حذف کرد.`,
      entityType: 'BlogPost',
      entityId: existing.id,
    });
    return { id };
  }

  private publicWhere(query: ListPublicBlogPostsQueryDto, now = new Date()) {
    const common = {
      deletedAt: IsNull(),
      ...(query.category ? { category: query.category } : {}),
    };
    return [
      { ...common, status: BlogPostStatus.PUBLISHED },
      {
        ...common,
        status: BlogPostStatus.SCHEDULED,
        scheduledAt: LessThanOrEqual(now),
      },
    ];
  }

  async listPublicPosts(query: ListPublicBlogPostsQueryDto) {
    const posts = await this.blogPostRepo.find({
      where: this.publicWhere(query),
      relations: { author: true },
      order: { publishedAt: 'DESC', scheduledAt: 'DESC' },
    });
    return posts.map((p) => ({
      slug: p.slug,
      title: p.title,
      category: p.category,
      categoryLabelFa: CATEGORY_LABELS_FA[p.category] ?? p.category,
      authorName: p.author.fullName,
      publishedAt: p.publishedAt ?? p.scheduledAt,
      viewCount: p.viewCount,
      coverFileId: p.coverFileId,
      excerpt: p.body.slice(0, 200),
    }));
  }

  async getPublicPost(slug: string) {
    const post = await this.blogPostRepo.findOne({
      where: { slug, deletedAt: IsNull() },
      relations: { author: true },
    });
    if (!post || !isPubliclyVisible(post.status, post.scheduledAt)) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'مقاله یافت نشد.',
      });
    }

    await this.blogPostRepo
      .createQueryBuilder()
      .update(BlogPost)
      .set({ viewCount: () => '"viewCount" + 1' })
      .where('id = :id', { id: post.id })
      .execute();
    const updated = await this.blogPostRepo.findOne({
      where: { id: post.id },
      relations: { author: true },
    });

    return {
      slug: updated!.slug,
      title: updated!.title,
      body: updated!.body,
      category: updated!.category,
      categoryLabelFa:
        CATEGORY_LABELS_FA[updated!.category] ?? updated!.category,
      authorName: updated!.author.fullName,
      publishedAt: updated!.publishedAt ?? updated!.scheduledAt,
      viewCount: updated!.viewCount,
      coverFileId: updated!.coverFileId,
    };
  }

  async readPublicCover(fileId: string) {
    const post = await this.blogPostRepo.findOne({
      where: {
        coverFileId: fileId,
        deletedAt: IsNull(),
      },
    });
    if (
      !post ||
      !post.coverFileId ||
      !isPubliclyVisible(post.status, post.scheduledAt)
    ) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'تصویر یافت نشد.',
      });
    }
    const file = await this.storedFileRepo.findOneBy({ id: fileId });
    if (!file || !fs.existsSync(file.path)) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'محتوای تصویر در دسترس نیست.',
      });
    }
    return {
      mimeType: file.mimeType,
      fileName: file.fileName,
      stream: fs.createReadStream(file.path),
    };
  }
}
