import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import type { JsonValue } from '../json-types';
import { User } from './user.entity';

@Entity('system_settings')
export class SystemSetting {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'system_settings_pkey',
  })
  key!: string;

  @Column({ type: 'jsonb' })
  value!: JsonValue;

  @Column({ type: 'text', nullable: true })
  updatedById!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'updatedById',
    foreignKeyConstraintName: 'system_settings_updatedById_fkey',
  })
  updatedBy!: User | null;

  @Column({ type: 'timestamp', precision: 3 })
  updatedAt!: Date;
}
