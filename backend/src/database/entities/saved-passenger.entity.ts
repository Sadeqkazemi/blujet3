import { randomUUID } from 'node:crypto';
import {
  BeforeInsert,
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { User } from './user.entity';

@Index('saved_passengers_userId_createdAt_idx', ['userId', 'createdAt'])
@Index('saved_passengers_userId_nationalIdHash_idx', [
  'userId',
  'nationalIdHash',
])
@Check(
  'saved_passengers_gender_check',
  `"gender" IS NULL OR "gender" IN ('male', 'female')`,
)
@Entity('saved_passengers')
export class SavedPassenger {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'saved_passengers_pkey',
  })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'userId',
    foreignKeyConstraintName: 'saved_passengers_userId_fkey',
  })
  user!: User;

  @Column({ type: 'text' })
  fullName!: string;

  @Column({ type: 'text' })
  latinName!: string;

  @Column({ type: 'text', nullable: true })
  nationalIdEnc!: string | null;

  @Column({ type: 'text', nullable: true })
  nationalIdHash!: string | null;

  @Column({ type: 'text', nullable: true })
  passportNoEnc!: string | null;

  @Column({ type: 'text', nullable: true })
  mobileEnc!: string | null;

  @Column({ type: 'boolean', default: false })
  isChild!: boolean;

  /** `male` | `female` — matches checkout Gender (empty not stored). */
  @Column({ type: 'text', nullable: true })
  gender!: 'male' | 'female' | null;

  @Column({ type: 'date', nullable: true })
  birthDate!: string | null;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;

  @Column({ type: 'timestamp', precision: 3 })
  updatedAt!: Date;
}
