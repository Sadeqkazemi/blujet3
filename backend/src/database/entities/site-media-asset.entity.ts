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
import { StoredFile } from './stored-file.entity';
import { User } from './user.entity';

@Index('site_media_assets_storedFileId_key', ['storedFileId'], { unique: true })
@Index('site_media_assets_uploadedById_idx', ['uploadedById'])
@Entity('site_media_assets')
export class SiteMediaAsset {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'site_media_assets_pkey',
  })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  storedFileId!: string;

  @ManyToOne(() => StoredFile, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'storedFileId',
    foreignKeyConstraintName: 'site_media_assets_storedFileId_fkey',
  })
  storedFile!: StoredFile;

  @Column({ type: 'text' })
  label!: string;

  @Column({ type: 'text' })
  uploadedById!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'uploadedById',
    foreignKeyConstraintName: 'site_media_assets_uploadedById_fkey',
  })
  uploadedBy!: User;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  deletedAt!: Date | null;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;
}
