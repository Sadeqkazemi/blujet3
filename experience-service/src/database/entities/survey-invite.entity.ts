import { randomUUID } from 'node:crypto';
import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

@Index('survey_invites_bookingId_key', ['bookingId'], { unique: true })
@Index('survey_invites_flightInstanceId_idx', ['flightInstanceId'])
@Index('survey_invites_token_key', ['token'], { unique: true })
@Entity('survey_invites')
export class SurveyInvite {
  @PrimaryColumn({ type: 'text' })
  id!: string;

  @BeforeInsert()
  generateIds(): void {
    this.id ??= randomUUID();
    this.token ??= randomUUID();
  }

  @Column({ type: 'text' })
  bookingId!: string;

  @Column({ type: 'text' })
  flightInstanceId!: string;

  @Column({ type: 'text', nullable: true })
  contactPhoneSnapshot!: string | null;

  @Column({ type: 'text', nullable: true })
  flightNoSnapshot!: string | null;

  @Column({ type: 'text', nullable: true })
  originCityFaSnapshot!: string | null;

  @Column({ type: 'text', nullable: true })
  destCityFaSnapshot!: string | null;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  departureAtSnapshot!: Date | null;

  @Column({ type: 'text' })
  token!: string;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  smsSentAt!: Date | null;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  respondedAt!: Date | null;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;
}
