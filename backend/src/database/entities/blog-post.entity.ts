import { randomUUID } from 'node:crypto';
import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { BlogCategory, BlogPostStatus } from '../enums';
import { StoredFile } from './stored-file.entity';
import { User } from './user.entity';

@Index('blog_posts_authorId_idx', ['authorId'])
@Index('blog_posts_category_idx', ['category'])
@Index('blog_posts_coverFileId_key', ['coverFileId'], { unique: true })
@Index('blog_posts_slug_key', ['slug'], { unique: true })
@Index('blog_posts_status_deletedAt_idx', ['status', 'deletedAt'])
@Entity('blog_posts')
export class BlogPost {
  @PrimaryColumn({ type: 'text', primaryKeyConstraintName: 'blog_posts_pkey' })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  title!: string;

  @Column({ type: 'text' })
  slug!: string;

  @Column({ type: 'text' })
  body!: string;

  @Column({ type: 'enum', enum: BlogCategory, enumName: 'BlogCategory' })
  category!: BlogCategory;

  @Column({
    type: 'enum',
    enum: BlogPostStatus,
    enumName: 'BlogPostStatus',
    default: BlogPostStatus.DRAFT,
  })
  status!: BlogPostStatus;

  @Column({ type: 'text', nullable: true })
  coverFileId!: string | null;

  @ManyToOne(() => StoredFile, { onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'coverFileId',
    foreignKeyConstraintName: 'blog_posts_coverFileId_fkey',
  })
  coverFile!: StoredFile | null;

  @Column({ type: 'text' })
  authorId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'authorId',
    foreignKeyConstraintName: 'blog_posts_authorId_fkey',
  })
  author!: User;

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
