type JsonObject = Record<string, unknown>;

const JSON_SCHEMA_DRAFT = 'https://json-schema.org/draft/2020-12/schema';
const SCHEMA_ID =
  /^blujet\.core-itinerary\.[A-Za-z][A-Za-z0-9]*\.v[1-9][0-9]*$/;

interface IndexedSchema {
  readonly key: string;
  readonly schema: JsonObject;
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseBundle(
  serialized: string,
  label: 'Baseline' | 'Proposed',
): ReadonlyMap<string, IndexedSchema> {
  let value: unknown;
  try {
    value = JSON.parse(serialized) as unknown;
  } catch {
    throw new Error(`${label} event schema bundle is invalid.`);
  }
  if (!isJsonObject(value)) {
    throw new Error(`${label} event schema bundle is invalid.`);
  }

  const schemas = new Map<string, IndexedSchema>();
  for (const [key, schema] of Object.entries(value)) {
    if (
      !isJsonObject(schema) ||
      typeof schema.$id !== 'string' ||
      schema.$schema !== JSON_SCHEMA_DRAFT ||
      schema.type !== 'object'
    ) {
      throw new Error(`${label} event schema bundle is invalid.`);
    }
    const schemaId = schema.$id.trim();
    if (!SCHEMA_ID.test(schemaId)) {
      throw new Error(`${label} event schema bundle is invalid.`);
    }
    if (schemas.has(schemaId)) {
      throw new Error(
        `${label} event schema bundle contains a duplicate identifier.`,
      );
    }
    schemas.set(schemaId, { key, schema });
  }
  if (label === 'Baseline' && schemas.size === 0) {
    throw new Error('Baseline event schema bundle is invalid.');
  }
  return schemas;
}

export function assertEventSchemaCompatibility(
  baselineSerialized: string,
  proposedSerialized: string,
): void {
  const baseline = parseBundle(baselineSerialized, 'Baseline');
  const proposed = parseBundle(proposedSerialized, 'Proposed');

  for (const [schemaId, previous] of baseline) {
    const next = proposed.get(schemaId);
    if (!next || next.key !== previous.key) {
      throw new Error(
        `Existing event schema is missing from proposed bundle: ${previous.key}.`,
      );
    }
    if (JSON.stringify(next.schema) !== JSON.stringify(previous.schema)) {
      throw new Error(
        `Existing event schema changed without a new identifier: ${previous.key}.`,
      );
    }
  }
}
