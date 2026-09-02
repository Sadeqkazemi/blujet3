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
import { bigintTransformer } from '../transformers/bigint.transformer';
import { StoredFile } from './stored-file.entity';

@Index('site_destination_highlights_imageFileId_key', ['imageFileId'], {
  unique: true,
})
@Index('site_destination_highlights_sortOrder_idx', ['sortOrder'])
@Entity('site_destination_highlights')
export class SiteDestinationHighlight {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'site_destination_highlights_pkey',
  })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  airportCode!: string;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  priceIrr!: bigint;

  @Column({ type: 'text', nullable: true })
  imageFileId!: string | null;

  @ManyToOne(() => StoredFile, { onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'imageFileId',
    foreignKeyConstraintName: 'site_destination_highlights_imageFileId_fkey',
  })
  imageFile!: StoredFile | null;

  @Column({ type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  deletedAt!: Date | null;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;

  @Column({ type: 'timestamp', precision: 3 })
  updatedAt!: Date;
}
