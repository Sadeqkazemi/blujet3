import { randomUUID } from 'node:crypto';
import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';
import { CabinClass, PromoType } from '../enums';
import { bigintTransformer } from '../transformers/bigint.transformer';

@Index('promo_codes_code_key', ['code'], { unique: true })
@Entity('promo_codes')
export class PromoCode {
  @PrimaryColumn({ type: 'text', primaryKeyConstraintName: 'promo_codes_pkey' })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  code!: string;

  @Column({ type: 'enum', enum: PromoType, enumName: 'PromoType' })
  type!: PromoType;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  value!: bigint;

  @Column({ type: 'text', nullable: true })
  originCode!: string | null;

  @Column({ type: 'text', nullable: true })
  destCode!: string | null;

  @Column({
    type: 'enum',
    enum: CabinClass,
    enumName: 'CabinClass',
    nullable: true,
  })
  cabin!: CabinClass | null;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  startsAt!: Date | null;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  endsAt!: Date | null;

  @Column({ type: 'int', nullable: true })
  maxRedemptions!: number | null;

  @Column({ type: 'int', nullable: true })
  maxPerUser!: number | null;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;
}
