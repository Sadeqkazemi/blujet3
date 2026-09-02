import { randomUUID } from 'node:crypto';
import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
} from 'typeorm';

@Entity('stored_files', { schema: 'experience' })
export class StoredFile {
  @PrimaryColumn({ type: 'text' })
  id!: string;

  @BeforeInsert()
  generateId(): void {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  ownerId!: string;

  @Column({ type: 'text' })
  fileName!: string;

  @Column({ type: 'text' })
  mimeType!: string;

  @Column({ type: 'text' })
  path!: string;

  @Column({ type: 'int' })
  sizeBytes!: number;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;
}
