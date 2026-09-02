import { randomUUID } from 'node:crypto';
import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
} from 'typeorm';

@Entity('survey_settings', { schema: 'experience' })
export class SurveySettings {
  @PrimaryColumn({ type: 'text' })
  id!: string;

  @BeforeInsert()
  generateId(): void {
    this.id ??= randomUUID();
  }

  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  @Column({ type: 'text', default: 'نظرسنجی رضایت مسافران' })
  title!: string;

  @Column({ type: 'text', nullable: true })
  updatedById!: string | null;

  @Column({ type: 'text', nullable: true })
  updatedByName!: string | null;

  @Column({ type: 'timestamp', precision: 3 })
  updatedAt!: Date;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;
}
