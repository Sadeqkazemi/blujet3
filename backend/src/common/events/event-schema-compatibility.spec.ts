import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertEventSchemaCompatibility } from './event-schema-compatibility';

const BASELINE_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'blujet.core-itinerary.OrderCreated.v1',
  type: 'object',
  properties: {
    payload: {
      type: 'object',
      required: ['orderVersion', 'currency'],
      properties: {
        currency: { type: 'string', const: 'IRR' },
        channel: { type: 'string', enum: ['SYSTEM', 'AGENCY'] },
      },
    },
  },
};
const BASELINE = JSON.stringify({ OrderCreated: BASELINE_SCHEMA });

describe('event schema compatibility', () => {
  it('accepts an unchanged baseline and an additive versioned schema', () => {
    expect(() =>
      assertEventSchemaCompatibility(BASELINE, BASELINE),
    ).not.toThrow();

    const proposed = JSON.stringify({
      OrderCreated: BASELINE_SCHEMA,
      OrderCreatedV2: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        $id: 'blujet.core-itinerary.OrderCreated.v2',
        type: 'object',
      },
    });
    expect(() =>
      assertEventSchemaCompatibility(BASELINE, proposed),
    ).not.toThrow();
  });

  it('rejects removal, key rename and identifier replacement', () => {
    expect(() => assertEventSchemaCompatibility(BASELINE, '{}')).toThrow(
      'Existing event schema is missing from proposed bundle: OrderCreated.',
    );
    expect(() =>
      assertEventSchemaCompatibility(
        BASELINE,
        JSON.stringify({ OrderAccepted: BASELINE_SCHEMA }),
      ),
    ).toThrow(
      'Existing event schema is missing from proposed bundle: OrderCreated.',
    );
    expect(() =>
      assertEventSchemaCompatibility(
        BASELINE,
        BASELINE.replace('OrderCreated.v1', 'OrderCreated.v2'),
      ),
    ).toThrow(
      'Existing event schema is missing from proposed bundle: OrderCreated.',
    );
  });

  it('rejects nested contract changes under the existing identifier', () => {
    for (const changed of [
      BASELINE.replace('"type":"string"', '"type":"integer"'),
      BASELINE.replace('"const":"IRR"', '"const":"USD"'),
      BASELINE.replace('"SYSTEM","AGENCY"', '"SYSTEM"'),
      BASELINE.replace('"currency"]', '"currency","status"]'),
    ]) {
      expect(() => assertEventSchemaCompatibility(BASELINE, changed)).toThrow(
        'Existing event schema changed without a new identifier: OrderCreated.',
      );
    }
  });

  it('rejects malformed bundles without exposing their content', () => {
    expect(() => assertEventSchemaCompatibility('{secret', BASELINE)).toThrow(
      'Baseline event schema bundle is invalid.',
    );
    expect(() => assertEventSchemaCompatibility('{}', BASELINE)).toThrow(
      'Baseline event schema bundle is invalid.',
    );
    expect(() => assertEventSchemaCompatibility(BASELINE, '[]')).toThrow(
      'Proposed event schema bundle is invalid.',
    );
    expect(() =>
      assertEventSchemaCompatibility(
        BASELINE,
        BASELINE.replace('draft/2020-12', 'draft/invalid'),
      ),
    ).toThrow('Proposed event schema bundle is invalid.');
  });

  it('rejects duplicate schema identifiers', () => {
    const proposed = JSON.stringify({
      OrderCreated: BASELINE_SCHEMA,
      Duplicate: BASELINE_SCHEMA,
    });
    expect(() => assertEventSchemaCompatibility(BASELINE, proposed)).toThrow(
      'Proposed event schema bundle contains a duplicate identifier.',
    );
  });

  it('wires the PR gate to the exact target commit', () => {
    const workflow = readFileSync(
      resolve(__dirname, '../../../../.github/workflows/ci.yml'),
      'utf8',
    );
    expect(workflow).toContain(
      'EVENT_SCHEMA_BASE_SHA: ${{ github.event.pull_request.base.sha }}',
    );
    expect(workflow).toContain(
      'git fetch --no-tags --depth=1 origin "$EVENT_SCHEMA_BASE_SHA"',
    );
    expect(workflow).toContain('npm run events:schema:compat --');
  });
});
