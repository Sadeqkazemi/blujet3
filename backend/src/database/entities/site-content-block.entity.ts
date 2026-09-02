import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { SiteContentBlockKey } from '../enums';
import { StoredFile } from './stored-file.entity';
import { User } from './user.entity';

@Index('site_content_blocks_imageFileId_key', ['imageFileId'], { unique: true })
@Entity('site_content_blocks')
export class SiteContentBlock {
  @PrimaryColumn({
    type: 'enum',
    enum: SiteContentBlockKey,
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

  @ManyToOne(() => StoredFile, { onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'imageFileId',
    foreignKeyConstraintName: 'site_content_blocks_imageFileId_fkey',
  })
  imageFile!: StoredFile | null;

  @Column({ type: 'text', nullable: true })
  updatedById!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'updatedById',
    foreignKeyConstraintName: 'site_content_blocks_updatedById_fkey',
  })
  updatedBy!: User | null;

  @Column({ type: 'timestamp', precision: 3 })
  updatedAt!: Date;
}
