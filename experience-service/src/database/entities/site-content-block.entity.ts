import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

export const SITE_CONTENT_BLOCK_KEYS = [
  'HERO_BANNER',
  'ANNOUNCEMENT_BAR',
  'PROMO_BANNER',
] as const;
export type SiteContentBlockKey = (typeof SITE_CONTENT_BLOCK_KEYS)[number];

@Index('site_content_blocks_imageFileId_key', ['imageFileId'], { unique: true })
@Entity('site_content_blocks', { schema: 'experience' })
export class SiteContentBlock {
  @PrimaryColumn({
    type: 'enum',
    enum: SITE_CONTENT_BLOCK_KEYS,
    enumName: 'SiteContentBlockKey',
    primaryKeyConstraintName: 'site_content_blocks_pkey',
  })
  key!: SiteContentBlockKey;

  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  @Column({ type: 'text', default: '' })
  title!: string;

  @Column({ type: 'text', default: '' })
  subtitle!: string;

  @Column({ type: 'text', default: '' })
  buttonText!: string;

  @Column({ type: 'text', default: '' })
  badgeText!: string;

  @Column({ type: 'text', nullable: true })
  imageFileId!: string | null;

  @Column({ type: 'text', nullable: true })
  updatedById!: string | null;

  @Column({ type: 'timestamp', precision: 3 })
  updatedAt!: Date;
}
