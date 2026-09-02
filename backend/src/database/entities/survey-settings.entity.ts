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

@Entity('survey_settings')
export class SurveySettings {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'survey_settings_pkey',
  })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  @Column({ type: 'text', default: 'نظرسنجی رضایت مسافران' })
  title!: string;

  @Column({ type: 'text', nullable: true })
  updatedById!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'updatedById',
    foreignKeyConstraintName: 'survey_settings_updatedById_fkey',
  })
  updatedBy!: User | null;

  @Column({ type: 'timestamp', precision: 3 })
  updatedAt!: Date;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;
}
