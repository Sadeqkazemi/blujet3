import { randomUUID } from 'node:crypto';
import {
  BeforeInsert,
  Check,
  Column,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

@Index('routes_originCode_destCode_key', ['originCode', 'destCode'], {
  unique: true,
})
@Check('routes_distanceKm_check', '"distanceKm" IS NULL OR "distanceKm" > 0')
@Check(
  'routes_distanceSource_check',
  `"distanceSource" IS NULL OR "distanceSource" IN ('AI', 'MANUAL')`,
)
@Entity('routes')
export class Route {
  @PrimaryColumn({ type: 'text', primaryKeyConstraintName: 'routes_pkey' })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  originCode!: string;

  @Column({ type: 'text' })
  destCode!: string;

  @Column({ type: 'int', default: 120 })
  durationMin!: number;

  @Column({ type: 'int', nullable: true })
  distanceKm!: number | null;

  @Column({ type: 'text', nullable: true })
  distanceSource!: 'AI' | 'MANUAL' | null;
}
