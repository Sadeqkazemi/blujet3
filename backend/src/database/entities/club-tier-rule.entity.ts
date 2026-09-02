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

@Entity('club_tier_rules')
export class ClubTierRule {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'club_tier_rules_pkey',
  })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'int', default: 5000 })
  goldMinPoints!: number;

  @Column({ type: 'int', default: 15000 })
  platinumMinPoints!: number;

  @Column({ type: 'int', default: 5000 })
  cardRequestMinPoints!: number;

  @Column({ type: 'text', nullable: true })
  updatedById!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'updatedById',
    foreignKeyConstraintName: 'club_tier_rules_updatedById_fkey',
  })
  updatedBy!: User | null;

  @Column({ type: 'timestamp', precision: 3 })
  updatedAt!: Date;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;
}
