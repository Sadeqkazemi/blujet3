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
import { ManagerMessageDept } from '../enums';
import type { JsonValue } from '../json-types';
import { User } from './user.entity';

@Index('manager_messages_fromId_createdAt_idx', ['fromId', 'createdAt'])
@Entity('manager_messages')
export class ManagerMessage {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'manager_messages_pkey',
  })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  fromId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'fromId',
    foreignKeyConstraintName: 'manager_messages_fromId_fkey',
  })
  from!: User;

  @Column({
    type: 'enum',
    enum: ManagerMessageDept,
    enumName: 'ManagerMessageDept',
  })
  toDept!: ManagerMessageDept;

  @Column({ type: 'text' })
  subject!: string;

  @Column({ type: 'text' })
  body!: string;

  @Column({ type: 'jsonb', nullable: true })
  attachments!: JsonValue | null;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;
}
