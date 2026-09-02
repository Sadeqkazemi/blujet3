import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { User } from './user.entity';

@Entity('panel_access_flags')
export class PanelAccessFlag {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'panel_access_flags_pkey',
  })
  panelKey!: string;

  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  @Column({ type: 'text', nullable: true })
  updatedById!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'updatedById',
    foreignKeyConstraintName: 'panel_access_flags_updatedById_fkey',
  })
  updatedBy!: User | null;

  @Column({ type: 'timestamp', precision: 3 })
  updatedAt!: Date;
}
