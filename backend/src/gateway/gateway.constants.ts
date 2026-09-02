export const API_V1_PREFIX = '/api/v1';
export const DEFAULT_BODY_LIMIT_BYTES = 10 * 1024 * 1024;
export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
export const DEFAULT_RATE_LIMIT_MAX = 300;
export const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;

export function positiveInteger(
  value: string | undefined,
  fallback: number,
): number {
  if (!value || !/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function nonNegativeInteger(
  value: string | undefined,
  fallback: number,
): number {
  if (!value || !/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : fallback;
}
