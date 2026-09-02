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
import { AgencyDocumentStatus, AgencyDocumentType } from '../enums';
import { User } from './user.entity';
import { StoredFile } from './stored-file.entity';

@Index('agency_documents_agencyId_idx', ['agencyId'])
@Index('agency_documents_fileId_key', ['fileId'], { unique: true })
@Entity('agency_documents')
export class AgencyDocument {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'agency_documents_pkey',
  })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  agencyId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'agencyId',
    foreignKeyConstraintName: 'agency_documents_agencyId_fkey',
  })
  agency!: User;

  @Column({ type: 'text' })
  fileId!: string;

  @ManyToOne(() => StoredFile, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'fileId',
    foreignKeyConstraintName: 'agency_documents_fileId_fkey',
  })
  file!: StoredFile;

  @Column({
    type: 'enum',
    enum: AgencyDocumentType,
    enumName: 'AgencyDocumentType',
  })
  docType!: AgencyDocumentType;

  @Column({
    type: 'enum',
    enum: AgencyDocumentStatus,
    enumName: 'AgencyDocumentStatus',
    default: AgencyDocumentStatus.PENDING,
  })
  status!: AgencyDocumentStatus;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;
}
