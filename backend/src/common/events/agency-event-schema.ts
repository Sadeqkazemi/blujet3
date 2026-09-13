import type { CanonicalEvent } from './canonical-events';

export type AgencySchemaEventType =
  | 'AgencyProfileProjected'
  | 'AgencyInvoiceProjected'
  | 'AgencyCreditRequestProjected';

type AgencyAggregateType =
  'AgencyProfile' | 'AgencyInvoice' | 'AgencyCreditRequest';

function schema<TFields extends readonly string[]>(
  eventType: AgencySchemaEventType,
  aggregateType: AgencyAggregateType,
  payloadFields: TFields,
) {
  return Object.freeze({
    schemaId: `blujet.agency.${eventType}.v1` as const,
    eventType,
    eventVersion: 1 as const,
    producer: 'core-agency' as const,
    aggregateType,
    payloadFields: Object.freeze(payloadFields),
  });
}

export const AgencyEventSchemaCatalog = Object.freeze({
  AgencyProfileProjected: schema('AgencyProfileProjected', 'AgencyProfile', [
    'auditId',
    'recordVersion',
    'licenseNo',
    'managerName',
    'phone',
    'email',
    'city',
    'address',
    'tier',
    'suspendedAt',
    'suspendReason',
    'joinedAt',
  ] as const),
  AgencyInvoiceProjected: schema('AgencyInvoiceProjected', 'AgencyInvoice', [
    'auditId',
    'recordVersion',
    'agencyId',
    'invoiceNo',
    'issuedById',
    'issuedAt',
    'dueAt',
    'amountIrr',
    'status',
    'paidAt',
    'descriptionFa',
    'bookingId',
  ] as const),
  AgencyCreditRequestProjected: schema(
    'AgencyCreditRequestProjected',
    'AgencyCreditRequest',
    [
      'auditId',
      'recordVersion',
      'agencyId',
      'requestedLimitIrr',
      'note',
      'status',
      'decidedById',
      'decidedAt',
      'createdAt',
    ] as const,
  ),
});

export type AgencyEventSchema =
  (typeof AgencyEventSchemaCatalog)[AgencySchemaEventType];

export function agencyEventSchema(
  event: CanonicalEvent,
): AgencyEventSchema | undefined {
  if (event.producer !== 'core-agency' || event.eventVersion !== 1)
    return undefined;
  const candidate =
    AgencyEventSchemaCatalog[
      event.eventType as keyof typeof AgencyEventSchemaCatalog
    ];
  if (!candidate || candidate.aggregateType !== event.aggregateType)
    return undefined;
  return candidate;
}
