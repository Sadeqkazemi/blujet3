import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
} from 'typeorm';

@Check('club_tier_rules_version_check', '"version" > 0')
@Entity('club_tier_rules', { schema: 'loyalty' })
export class ClubTierRule {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'club_tier_rules_pkey',
  })
  id!: string;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @Column({ type: 'int', default: 5000 })
  goldMinPoints!: number;

  @Column({ type: 'int', default: 15000 })
  platinumMinPoints!: number;

  @Column({ type: 'int', default: 5000 })
  cardRequestMinPoints!: number;

  @Column({ type: 'text', nullable: true })
  updatedById!: string | null;

  @Column({ type: 'timestamp', precision: 3 })
  updatedAt!: Date;

  @CreateDateColumn({ type: 'timestamp', precision: 3, default: () => 'now()' })
  createdAt!: Date;
}
