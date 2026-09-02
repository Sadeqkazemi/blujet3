/** Shared alias for `jsonb` columns — matches Prisma's `Json` type
 * (effectively `unknown`, no compile-time shape) so the migration stays
 * behaviour-neutral. Several columns have documented-but-untyped shapes in
 * service code comments (e.g. `FlightInstance.aiSuggestion`); giving them
 * real interfaces is a follow-up, not part of this mechanical port. */
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/**
 * Converts application values into a shape PostgreSQL json/jsonb columns can
 * persist. JavaScript's native JSON serializer rejects bigint values, while
 * monetary values in this codebase intentionally use bigint end-to-end.
 * Keeping the conversion at the JSON boundary prevents a successful business
 * transaction from being followed by a failing audit insert.
 */
export function toJsonValue(value: unknown): JsonValue {
  const serialized = JSON.stringify(value, (_key, nested: unknown) =>
    typeof nested === 'bigint' ? nested.toString() : nested,
  );
  return serialized === undefined
    ? null
    : (JSON.parse(serialized) as JsonValue);
}
