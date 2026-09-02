import { randomUUID } from 'node:crypto';
import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('password_reset_events')
export class PasswordResetEvent {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'password_reset_events_pkey',
  })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  employeeId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'employeeId',
    foreignKeyConstraintName: 'password_reset_events_employeeId_fkey',
  })
  employee!: User;

  @Column({ type: 'text' })
  resetById!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'resetById',
    foreignKeyConstraintName: 'password_reset_events_resetById_fkey',
  })
  resetBy!: User;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;
}
