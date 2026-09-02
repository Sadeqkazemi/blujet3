/**
 * Single money-arithmetic utility (CLAUDE.md: "Money is NEVER a float. All
 * arithmetic through a single money utility module."). Every IRR-denominated
 * column is a Postgres `bigint` (Prisma `BigInt`, JS `bigint`) — Int32 tops
 * out at ~2.1B IRR (~214M toman), which real aggregates (KPI revenue, agency
 * credit lines, wallet balances) can exceed. `bigint` cannot mix with
 * `number` via `+`/`-`/`*`, so all money math goes through here instead of
 * being reimplemented ad hoc at each call site.
 *
 * Wire format: BigInt.prototype.toJSON (see main.ts) serializes every IRR
 * field as a decimal string in API responses — JSON.stringify throws on a
 * raw bigint, and a JS `number` can't safely hold values above 2^53 anyway.
 */

export type Irr = bigint;

export const ZERO_IRR: Irr = 0n;

/** Parses a DTO/query value (number or numeric string) into an Irr. Throws
 * on non-integer numbers so a stray float can never enter a money field. */
export function toIrr(value: Irr | number | string): Irr {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) {
      throw new Error('IRR amounts must be whole numbers');
    }
    return BigInt(value);
  }
  return BigInt(value);
}

export function addIrr(...amounts: Irr[]): Irr {
  return amounts.reduce((sum, a) => sum + a, ZERO_IRR);
}

export function subIrr(a: Irr, b: Irr): Irr {
  return a - b;
}

export function negateIrr(a: Irr): Irr {
  return -a;
}

export function absIrr(a: Irr): Irr {
  return a < ZERO_IRR ? -a : a;
}

/** Integer-percent of an amount, rounded half-away-from-zero (matches the
 * rounding the app already used for penalty/discount percentages). */
export function pctOfIrr(amount: Irr, pct: number): Irr {
  if (!Number.isInteger(pct)) {
    throw new Error('percentage must be an integer');
  }
  const numerator = amount * BigInt(pct);
  const quotient = numerator / 100n;
  const remainder = numerator % 100n;
  if (remainder === 0n) return quotient;
  const absRemainderTimes2 = (remainder < 0n ? -remainder : remainder) * 2n;
  if (absRemainderTimes2 >= 100n) {
    return quotient + (numerator < 0n ? -1n : 1n);
  }
  return quotient;
}

export function isPositiveIrr(a: Irr): boolean {
  return a > ZERO_IRR;
}

export function isNegativeIrr(a: Irr): boolean {
  return a < ZERO_IRR;
}

export function isZeroIrr(a: Irr): boolean {
  return a === ZERO_IRR;
}

export function maxIrr(a: Irr, b: Irr): Irr {
  return a > b ? a : b;
}

export function minIrr(a: Irr, b: Irr): Irr {
  return a < b ? a : b;
}

/** Rounds to the nearest multiple of `step` (half away from zero) — e.g.
 * the business-cabin multiplier rounds its result to the nearest 100,000
 * IRR "round number" price. */
export function roundIrrTo(amount: Irr, step: Irr): Irr {
  const quotient = amount / step;
  const remainder = amount % step;
  if (remainder === 0n) return quotient * step;
  const absRemainderTimes2 = (remainder < 0n ? -remainder : remainder) * 2n;
  const rounded =
    absRemainderTimes2 >= step ? quotient + (amount < 0n ? -1n : 1n) : quotient;
  return rounded * step;
}

export function compareIrr(a: Irr, b: Irr): -1 | 0 | 1 {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Rounds a bigint quotient to the nearest integer, half away from zero —
 * the general bigint-division building block behind pctOfIrr/roundIrrTo
 * above, exposed directly for the two other shapes call sites need:
 * (1) an Irr divided by a plain count (e.g. average fare per ticket —
 * result is still an Irr), and (2) a ratio of two Irr amounts expressed as
 * a percentage (e.g. profit margin — result is a plain number, NOT an Irr,
 * since it's a percentage rather than a money amount). Never routes through
 * a float. Returns 0n if `denominator` is 0. */
export function divRoundBigInt(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) return 0n;
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  if (remainder === 0n) return quotient;
  const absRemainderTimes2 = (remainder < 0n ? -remainder : remainder) * 2n;
  const absDenominator = denominator < 0n ? -denominator : denominator;
  if (absRemainderTimes2 >= absDenominator) {
    const negativeResult = numerator < 0n !== denominator < 0n;
    return quotient + (negativeResult ? -1n : 1n);
  }
  return quotient;
}
