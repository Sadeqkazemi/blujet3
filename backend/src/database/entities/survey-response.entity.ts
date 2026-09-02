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
import { SurveyInvite } from './survey-invite.entity';

@Index('survey_responses_inviteId_key', ['inviteId'], { unique: true })
@Entity('survey_responses')
export class SurveyResponse {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'survey_responses_pkey',
  })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  inviteId!: string;

  @ManyToOne(() => SurveyInvite, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'inviteId',
    foreignKeyConstraintName: 'survey_responses_inviteId_fkey',
  })
  invite!: SurveyInvite;

  @Column({ type: 'int' })
  rating!: number;

  @Column({ type: 'text', nullable: true })
  comment!: string | null;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;
}
