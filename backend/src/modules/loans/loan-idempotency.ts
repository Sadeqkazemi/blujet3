import { createHash } from 'node:crypto';

/** Stable bank-facing idempotency key — namespaces client key by user. */
export function bankScopedIdempotencyKey(
  userId: string,
  clientKey: string,
): string {
  return createHash('sha256')
    .update(`blujet-loan:${userId}:${clientKey}`)
    .digest('hex');
}
