import { randomUUID } from 'node:crypto';
import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

const bigintTransformer = {
  to: (value?: bigint | null) => value ?? null,
  from: (value?: string | null) => (value == null ? null : BigInt(value)),
};

@Index('site_route_highlights_sortOrder_idx', ['sortOrder'])
@Entity('site_route_highlights')
export class SiteRouteHighlight {
  @PrimaryColumn({ type: 'text' })
  id!: string;

  @BeforeInsert()
  generateId(): void {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  fromAirportCode!: string;

  @Column({ type: 'text' })
  toAirportCode!: string;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  priceIrr!: bigint;

  @Column({ type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  deletedAt!: Date | null;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;

  @Column({ type: 'timestamp', precision: 3 })
  updatedAt!: Date;
}
