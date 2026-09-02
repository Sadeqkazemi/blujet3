import type { ValueTransformer } from 'typeorm';

/**
 * TypeORM returns `bigint` columns as `string` by default. `src/common/
 * money.ts` is built entirely on `bigint` (`export type Irr = bigint`), so
 * every money column needs this transformer to convert both ways.
 */
export const bigintTransformer: ValueTransformer = {
  to: (value?: bigint | null) => value ?? null,
  from: (value?: string | null) => (value == null ? null : BigInt(value)),
};
