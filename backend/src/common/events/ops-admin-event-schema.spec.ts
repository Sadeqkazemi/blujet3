import { createCanonicalEvent } from './canonical-events';
import { knownEventSchema } from './event-schema';
import {
  OpsAdminEventSchemaCatalog,
  opsAdminEventSchema,
} from './ops-admin-event-schema';
import { createCartableTaskProjectedEvent } from './ops-admin-events';

describe('OpsAdminEventSchemaCatalog', () => {
  it('freezes the v1 cartable routing contract', () => {
    expect(OpsAdminEventSchemaCatalog.CartableTaskProjected).toEqual({
      schemaId: 'blujet.ops-admin.CartableTaskProjected.v1',
      eventType: 'CartableTaskProjected',
      eventVersion: 1,
      producer: 'core-ops',
      aggregateType: 'CartableTask',
      payloadFields: [
        'auditId',
        'taskVersion',
        'assigneeId',
        'category',
        'sourceType',
        'sourceId',
        'status',
        'resolvedAt',
        'readAt',
        'createdAt',
      ],
    });
  });

  it('resolves only the exact Ops/Admin producer and aggregate', () => {
    const event = createCartableTaskProjectedEvent(
      {
        id: 'task-1',
        version: 1,
        assigneeId: 'staff-1',
        category: 'MANAGER',
        sourceType: 'MANAGER_REFERRAL',
        sourceId: 'referral-1',
        status: 'OPEN',
        resolvedAt: null,
        readAt: null,
        createdAt: new Date('2026-09-10T08:00:00.000Z'),
      },
      {
        auditId: 'audit-1',
        correlationId: 'request-1',
        idempotencyKey: 'task-1-v1',
      },
    );
    expect(opsAdminEventSchema(event)).toBe(
      OpsAdminEventSchemaCatalog.CartableTaskProjected,
    );
    expect(knownEventSchema(event)).toBe(
      OpsAdminEventSchemaCatalog.CartableTaskProjected,
    );
    expect(
      opsAdminEventSchema(
        createCanonicalEvent({
          eventType: 'CartableTaskProjected',
          producer: 'other',
          aggregateType: 'CartableTask',
          aggregateId: 'task-1',
          correlationId: 'request-1',
          idempotencyKey: 'task-1-v1',
          payload: {},
        }),
      ),
    ).toBeUndefined();
  });
});
