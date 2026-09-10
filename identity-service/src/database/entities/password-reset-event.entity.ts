import { randomUUID } from 'node:crypto';
import {
  BeforeInsert,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  Column,
  PrimaryColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('password_reset_events', { schema: 'identity' })
export class PasswordResetEvent {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'password_reset_events_pkey',
  })
  id!: string;

  @BeforeInsert()
  generateId(): void {
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

  @CreateDateColumn({ precision: 3, default: () => 'now()' })
  createdAt!: Date;
}
