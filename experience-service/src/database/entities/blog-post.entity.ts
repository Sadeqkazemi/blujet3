import { randomUUID } from 'node:crypto';
import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

export const BLOG_CATEGORIES = ['NEWS', 'GUIDE', 'DEST', 'OFFERS'] as const;
export type BlogCategory = (typeof BLOG_CATEGORIES)[number];
export const BLOG_STATUSES = ['DRAFT', 'PUBLISHED', 'SCHEDULED'] as const;
export type BlogPostStatus = (typeof BLOG_STATUSES)[number];

@Index('blog_posts_authorId_idx', ['authorId'])
@Index('blog_posts_category_idx', ['category'])
@Index('blog_posts_coverFileId_key', ['coverFileId'], { unique: true })
@Index('blog_posts_slug_key', ['slug'], { unique: true })
@Index('blog_posts_status_deletedAt_idx', ['status', 'deletedAt'])
@Entity('blog_posts', { schema: 'experience' })
export class BlogPost {
  @PrimaryColumn({ type: 'text', primaryKeyConstraintName: 'blog_posts_pkey' })
  id!: string;

  @BeforeInsert()
  generateId(): void {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  title!: string;

  @Column({ type: 'text' })
  slug!: string;

  @Column({ type: 'text' })
  body!: string;

  @Column({ type: 'enum', enum: BLOG_CATEGORIES, enumName: 'BlogCategory' })
  category!: BlogCategory;

  @Column({
    type: 'enum',
    enum: BLOG_STATUSES,
    enumName: 'BlogPostStatus',
    default: 'DRAFT',
  })
  status!: BlogPostStatus;

  @Column({ type: 'text', nullable: true })
  coverFileId!: string | null;

  @Column({ type: 'text' })
  authorId!: string;

  @Column({ type: 'text', nullable: true })
  authorName!: string | null;

  @Column({ type: 'int', default: 0 })
  viewCount!: number;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  publishedAt!: Date | null;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  scheduledAt!: Date | null;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  deletedAt!: Date | null;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;

  @Column({ type: 'timestamp', precision: 3 })
  updatedAt!: Date;
}
