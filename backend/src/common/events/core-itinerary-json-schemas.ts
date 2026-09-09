import {
  CoreItineraryEventSchemaCatalog,
  type CoreItinerarySchemaEventType,
} from './core-itinerary-event-schema';

export interface JsonSchema {
  readonly $ref?: string;
  readonly type?: 'object' | 'string' | 'integer' | 'array';
  readonly properties?: Readonly<Record<string, JsonSchema>>;
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean;
  readonly items?: JsonSchema;
  readonly const?: string | number;
  readonly enum?: readonly (string | number)[];
  readonly pattern?: string;
  readonly format?: 'date-time' | 'uuid';
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly minItems?: number;
  readonly maxItems?: number;
  readonly uniqueItems?: boolean;
}

export interface CoreItineraryJsonSchema extends JsonSchema {
  readonly $schema: 'https://json-schema.org/draft/2020-12/schema';
  readonly $id: string;
  readonly title: string;
  readonly type: 'object';
  readonly properties: Readonly<Record<string, JsonSchema>>;
  readonly required: readonly string[];
  readonly additionalProperties: false;
}

const IDENTIFIER: JsonSchema = {
  type: 'string',
  pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$',
};
const AMOUNT: JsonSchema = {
  type: 'string',
  pattern: '^(0|[1-9][0-9]{0,18})$',
  maxLength: 19,
};
const UTC: JsonSchema = { type: 'string', format: 'date-time' };
const PAYLOAD_BASE: Readonly<Record<string, JsonSchema>> = {
  auditId: IDENTIFIER,
  orderVersion: {
    type: 'integer',
    minimum: 1,
    maximum: 2_147_483_647,
  },
  currency: { type: 'string', const: 'IRR' },
};
const ENVELOPE_REQUIRED = [
  'eventId',
  'eventType',
  'eventVersion',
  'occurredAt',
  'producer',
  'aggregateType',
  'aggregateId',
  'correlationId',
  'idempotencyKey',
  'payload',
] as const;
const ENVELOPE_PROPERTIES: Readonly<Record<string, JsonSchema>> = {
  eventId: { type: 'string', format: 'uuid' },
  eventType: { type: 'string' },
  eventVersion: { type: 'integer', const: 1 },
  occurredAt: UTC,
  producer: { type: 'string', const: 'core-commerce' },
  aggregateType: { type: 'string', const: 'CoreItineraryOrder' },
  aggregateId: IDENTIFIER,
  correlationId: IDENTIFIER,
  idempotencyKey: IDENTIFIER,
};

function payloadSchema(
  eventType: CoreItinerarySchemaEventType,
  properties: Readonly<Record<string, JsonSchema>>,
): CoreItineraryJsonSchema {
  const payload = {
    type: 'object' as const,
    properties,
    required: CoreItineraryEventSchemaCatalog[eventType].payloadFields,
    additionalProperties: false as const,
  };
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: CoreItineraryEventSchemaCatalog[eventType].schemaId,
    title: `${eventType} Core itinerary event`,
    type: 'object',
    properties: {
      ...ENVELOPE_PROPERTIES,
      eventType: { type: 'string', const: eventType },
      payload,
    },
    required: ENVELOPE_REQUIRED,
    additionalProperties: false,
  };
}

export const CoreItineraryJsonSchemas = Object.freeze({
  OrderCreated: payloadSchema('OrderCreated', {
    ...PAYLOAD_BASE,
    channel: { type: 'string', enum: ['SYSTEM', 'AGENCY'] },
    status: { type: 'string', const: 'HELD' },
    fareIrr: AMOUNT,
    taxIrr: AMOUNT,
    extrasIrr: AMOUNT,
    totalIrr: AMOUNT,
    holdExpiresAt: UTC,
  }),
  PaymentConfirmed: payloadSchema('PaymentConfirmed', {
    ...PAYLOAD_BASE,
    confirmationId: IDENTIFIER,
    status: { type: 'string', const: 'COMPLETED' },
    amountIrr: AMOUNT,
  }),
  TicketIssued: payloadSchema('TicketIssued', {
    ...PAYLOAD_BASE,
    status: { type: 'string', const: 'TICKETED' },
    ticketDocumentIds: {
      type: 'array',
      items: IDENTIFIER,
      minItems: 1,
      maxItems: 1000,
      uniqueItems: true,
    },
    issuedAt: UTC,
  }),
  RefundRequested: payloadSchema('RefundRequested', {
    ...PAYLOAD_BASE,
    refundId: IDENTIFIER,
    refundReference: IDENTIFIER,
    quoteReference: IDENTIFIER,
    status: { type: 'string', const: 'RECEIVED' },
    grossAmountIrr: AMOUNT,
    penaltyAmountIrr: AMOUNT,
    refundableIrr: AMOUNT,
  }),
});

export type CoreItineraryJsonSchemaBundle = Readonly<
  typeof CoreItineraryJsonSchemas
>;

export function serializeCoreItinerarySchemaBundle(): string {
  return `${JSON.stringify(CoreItineraryJsonSchemas, null, 2)}\n`;
}
