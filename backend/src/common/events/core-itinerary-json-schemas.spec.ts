import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createItineraryOrderCreated } from './core-itinerary-events';
import {
  CoreItineraryJsonSchemas,
  serializeCoreItinerarySchemaBundle,
} from './core-itinerary-json-schemas';
import { parseCoreItineraryEvent } from './core-itinerary-events';

describe('Core itinerary JSON Schema bundle', () => {
  it('matches the committed deterministic artifact byte-for-byte', () => {
    const artifact = readFileSync(
      resolve(
        __dirname,
        '../../../../docs/events/schema-registry/core-itinerary-v1.json',
      ),
      'utf8',
    );
    expect(serializeCoreItinerarySchemaBundle()).toBe(artifact);
    expect(createHash('sha256').update(artifact).digest('hex')).toMatch(
      /^[a-f0-9]{64}$/,
    );
  });

  it('keeps v1 IDs, required fields and PII-free properties aligned', () => {
    for (const [eventType, schema] of Object.entries(
      CoreItineraryJsonSchemas,
    )) {
      const catalog = `blujet.core-itinerary.${eventType}.v1`;
      expect(schema.$id).toBe(catalog);
      expect(schema.properties.payload.additionalProperties).toBe(false);
      expect(schema.required).toEqual(
        expect.arrayContaining(['eventId', 'occurredAt', 'payload']),
      );
      const serialized = JSON.stringify(schema);
      expect(serialized).not.toMatch(
        /phone|passport|national|cardNumber|cvv|password|secret/i,
      );
    }
  });

  it('keeps a real builder event accepted by the existing strict parser', () => {
    const event = createItineraryOrderCreated(
      {
        id: 'schema-order-1',
        version: 1,
        status: 'HELD',
        channel: 'SYSTEM',
        currency: 'IRR',
        fareIrr: 100n,
        taxIrr: 20n,
        extrasIrr: 0n,
        totalIrr: 120n,
        createdAt: new Date('2026-09-09T00:00:00.000Z'),
        holdExpiresAt: new Date('2026-09-09T00:15:00.000Z'),
      },
      {
        auditId: 'schema-audit-1',
        correlationId: 'schema-request-1',
        idempotencyKey: 'schema-idempotency-1',
      },
    );
    expect(parseCoreItineraryEvent(event)).toEqual(event);
  });

  it('does not register the input-gated FlightDisrupted contract', () => {
    expect(CoreItineraryJsonSchemas).not.toHaveProperty('FlightDisrupted');
  });
});
