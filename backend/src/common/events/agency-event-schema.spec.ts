import { createCanonicalEvent } from './canonical-events';
import { knownEventSchema } from './event-schema';
import {
  AgencyEventSchemaCatalog,
  agencyEventSchema,
} from './agency-event-schema';

describe('AgencyEventSchemaCatalog', () => {
  it('freezes all three v1 Agency schema identities and aggregate mappings', () => {
    expect(
      Object.values(AgencyEventSchemaCatalog).map((entry) => ({
        schemaId: entry.schemaId,
        eventType: entry.eventType,
        producer: entry.producer,
        aggregateType: entry.aggregateType,
        payloadFields: entry.payloadFields,
      })),
    ).toEqual([
      {
        schemaId: 'blujet.agency.AgencyProfileProjected.v1',
        eventType: 'AgencyProfileProjected',
        producer: 'core-agency',
        aggregateType: 'AgencyProfile',
        payloadFields: [
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
        ],
      },
      {
        schemaId: 'blujet.agency.AgencyInvoiceProjected.v1',
        eventType: 'AgencyInvoiceProjected',
        producer: 'core-agency',
        aggregateType: 'AgencyInvoice',
        payloadFields: [
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
        ],
      },
      {
        schemaId: 'blujet.agency.AgencyCreditRequestProjected.v1',
        eventType: 'AgencyCreditRequestProjected',
        producer: 'core-agency',
        aggregateType: 'AgencyCreditRequest',
        payloadFields: [
          'auditId',
          'recordVersion',
          'agencyId',
          'requestedLimitIrr',
          'note',
          'status',
          'decidedById',
          'decidedAt',
          'createdAt',
        ],
      },
    ]);
    expect(Object.isFrozen(AgencyEventSchemaCatalog)).toBe(true);
    expect(
      Object.values(AgencyEventSchemaCatalog).every((entry) =>
        Object.isFrozen(entry.payloadFields),
      ),
    ).toBe(true);
  });

  it.each([
    ['AgencyProfileProjected', 'AgencyProfile'],
    ['AgencyInvoiceProjected', 'AgencyInvoice'],
    ['AgencyCreditRequestProjected', 'AgencyCreditRequest'],
  ] as const)('resolves the exact %s contract', (eventType, aggregateType) => {
    const event = createCanonicalEvent({
      eventType,
      producer: 'core-agency',
      aggregateType,
      aggregateId: 'record-1',
      correlationId: 'request-1',
      idempotencyKey: 'record-1-v1',
      payload: {},
    });
    expect(agencyEventSchema(event)).toBe(AgencyEventSchemaCatalog[eventType]);
    expect(knownEventSchema(event)).toBe(AgencyEventSchemaCatalog[eventType]);
    expect(
      agencyEventSchema({ ...event, aggregateType: 'WrongAggregate' }),
    ).toBeUndefined();
    expect(
      agencyEventSchema({ ...event, producer: 'other-service' }),
    ).toBeUndefined();
  });
});
