import { randomUUID } from 'node:crypto';
import {
  BeforeInsert,
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

export type CommerceSagaType =
  'CORE_ITINERARY_FULFILMENT' | 'CORE_ITINERARY_REFUND';
export type CommerceSagaStatus =
  'STARTED' | 'COMPLETED' | 'COMPENSATION_REQUIRED';

@Entity('commerce_saga_executions', { schema: 'orders' })
@Index('commerce_saga_type_aggregate_key', ['sagaType', 'aggregateId'], {
  unique: true,
})
@Index('commerce_saga_status_updated_idx', ['status', 'updatedAt'])
@Check(
  'commerce_saga_type_check',
  `"sagaType" IN ('CORE_ITINERARY_FULFILMENT', 'CORE_ITINERARY_REFUND')`,
)
@Check(
  'commerce_saga_status_check',
  `"status" IN ('STARTED', 'COMPLETED', 'COMPENSATION_REQUIRED')`,
)
@Check(
  'commerce_saga_failure_check',
  `("status" = 'COMPENSATION_REQUIRED' AND "failureCode" IS NOT NULL) OR ("status" != 'COMPENSATION_REQUIRED' AND "failureCode" IS NULL)`,
)
export class CommerceSagaExecution {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'commerce_saga_executions_pkey',
  })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  sagaType!: CommerceSagaType;

  @Column({ type: 'text' })
  aggregateId!: string;

  @Column({ type: 'text' })
  correlationId!: string;

  @Column({ type: 'text' })
  idempotencyKey!: string;

  @Column({ type: 'text', default: 'STARTED' })
  status!: CommerceSagaStatus;

  @Column({ type: 'text' })
  currentStep!: string;

  @Column({ type: 'text', nullable: true })
  failureCode!: string | null;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;

  @UpdateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  updatedAt!: Date;
}
