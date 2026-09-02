import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('pss_idempotency_records')
@Index(
  'uq_pss_idempotency_caller_operation_key',
  ['caller', 'operation', 'key'],
  {
    unique: true,
  },
)
export class IdempotencyRecord {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 120 })
  caller!: string;

  @Column({ type: 'varchar', length: 120 })
  operation!: string;

  @Column({ type: 'varchar', length: 200 })
  key!: string;

  @Column({ name: 'request_digest', type: 'char', length: 64 })
  requestDigest!: string;

  @Column({ type: 'varchar', length: 20, default: 'COMPLETED' })
  state!: 'COMPLETED';

  @Column({ name: 'response_payload', type: 'jsonb' })
  responsePayload!: unknown;

  @Column({
    name: 'response_reference',
    type: 'varchar',
    length: 200,
    nullable: true,
  })
  responseReference!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;
}
