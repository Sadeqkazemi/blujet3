import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AncillaryServiceCategory } from '../enums';
import { bigintTransformer } from '../transformers/bigint.transformer';
import { User } from './user.entity';

@Index('ancillary_services_category_enabled_idx', ['category', 'enabled'])
@Entity('ancillary_services')
export class AncillaryService {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'ancillary_services_pkey',
  })
  key!: string;

  @Column({
    type: 'enum',
    enum: AncillaryServiceCategory,
    enumName: 'AncillaryServiceCategory',
  })
  category!: AncillaryServiceCategory;

  @Column({ type: 'text' })
  titleFa!: string;

  @Column({ type: 'text', default: '' })
  descriptionFa!: string;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  priceIrr!: bigint;

  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  @Column({ type: 'boolean', default: false })
  isCustom!: boolean;

  @Column({ type: 'text', nullable: true })
  updatedById!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'updatedById',
    foreignKeyConstraintName: 'ancillary_services_updatedById_fkey',
  })
  updatedBy!: User | null;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;

  @UpdateDateColumn({ precision: 3 })
  updatedAt!: Date;
}
