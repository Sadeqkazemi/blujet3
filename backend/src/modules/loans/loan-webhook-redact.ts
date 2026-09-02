import type { JsonValue } from '../../database/json-types';

const SENSITIVE_KEY =
  /^(authorization|api[_-]?key|token|secret|signature|password|pan|cvv|otp|national.?id|passport|card|account.?number)$/i;

/**
 * Persist only non-sensitive scalar/summary fields for bank webhook audit.
 */
export function redactWebhookPayload(
  input: Record<string, unknown> | null | undefined,
): JsonValue | null {
  if (input == null) return null;
  const out: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(input)) {
    if (SENSITIVE_KEY.test(key)) {
      out[key] = '[REDACTED]';
      continue;
    }
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value === null
    ) {
      out[key] = value;
      continue;
    }
    if (Array.isArray(value)) {
      const items: JsonValue[] = [];
      for (const item of value) {
        if (typeof item === 'string') items.push(item);
        else if (typeof item === 'number') items.push(item);
        else if (typeof item === 'boolean') items.push(item);
        else if (item === null) items.push(null);
        else items.push('[OMITTED]');
      }
      out[key] = items;
      continue;
    }
    if (typeof value === 'object') {
      out[key] = '[OMITTED_OBJECT]';
    }
  }
  return out;
}
