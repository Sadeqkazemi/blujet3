import { randomUUID } from 'node:crypto';
import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';
import { ExternalServiceMethod } from '../enums';

@Index('external_service_configs_key_key', ['key'], { unique: true })
@Entity('external_service_configs')
export class ExternalServiceConfig {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'external_service_configs_pkey',
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

  @Column({ type: 'text' })
  provider!: string;

  @Column({ type: 'text' })
  endpoint!: string;

  @Column({
    type: 'enum',
    enum: ExternalServiceMethod,
    enumName: 'ExternalServiceMethod',
    default: ExternalServiceMethod.POST,
  })
  method!: ExternalServiceMethod;

  @Column({ type: 'int', default: 30000 })
  timeoutMs!: number;

  @Column({ type: 'text', nullable: true })
  apiKeyEncrypted!: string | null;

  @Column({ type: 'boolean', default: false })
  sandbox!: boolean;

  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  lastTestAt!: Date | null;

  @Column({ type: 'boolean', nullable: true })
  lastTestOk!: boolean | null;

  @Column({ type: 'text', nullable: true })
  lastTestMessage!: string | null;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;

  @Column({ type: 'timestamp', precision: 3 })
  updatedAt!: Date;
}
