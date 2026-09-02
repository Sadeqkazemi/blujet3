import { randomUUID } from 'node:crypto';
import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

@Index('permissions_dept_key_key', ['dept', 'key'], { unique: true })
@Entity('permissions')
export class Permission {
  @PrimaryColumn({ type: 'text', primaryKeyConstraintName: 'permissions_pkey' })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  dept!: string;

  @Column({ type: 'text' })
  sectionKey!: string;

  @Column({ type: 'text' })
  sectionLabelFa!: string;

  @Column({ type: 'text' })
  key!: string;

  @Column({ type: 'text' })
  labelFa!: string;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;
}
