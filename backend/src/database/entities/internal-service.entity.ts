import { randomUUID } from 'node:crypto';
import { BeforeInsert, Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Index('internal_services_key_key', ['key'], { unique: true })
@Entity('internal_services')
export class InternalService {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'internal_services_pkey',
  })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  key!: string;

  @Column({ type: 'text' })
  nameFa!: string;

  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  @Column({ type: 'float', default: 100 })
  uptimePct!: number;

  @Column({ type: 'timestamp', precision: 3 })
  updatedAt!: Date;
}
