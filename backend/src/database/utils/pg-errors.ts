import { QueryFailedError } from 'typeorm';

interface PgDriverError {
  code?: string;
  constraint?: string;
}

/** Replaces Prisma's `PrismaClientKnownRequestError` + `P2002` check.
 * Postgres unique_violation is SQLSTATE 23505. */
export function isUniqueViolation(err: unknown): boolean {
  if (!(err instanceof QueryFailedError)) return false;
  const driverError = err.driverError as PgDriverError | undefined;
  return driverError?.code === '23505';
}

/** The violated constraint's name (e.g. `support_tickets_trackingCode_key`)
 * — replaces Prisma's `err.meta?.target` string-matching. Only meaningful
 * when `isUniqueViolation(err)` is true. */
export function constraintName(err: unknown): string | undefined {
  if (!(err instanceof QueryFailedError)) return undefined;
  return (err.driverError as PgDriverError | undefined)?.constraint;
}
