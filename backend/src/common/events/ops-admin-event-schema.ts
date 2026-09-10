import type { CanonicalEvent } from './canonical-events';

export const OpsAdminEventSchemaCatalog = Object.freeze({
  CartableTaskProjected: Object.freeze({
    schemaId: 'blujet.ops-admin.CartableTaskProjected.v1' as const,
    eventType: 'CartableTaskProjected' as const,
    eventVersion: 1 as const,
    producer: 'core-ops' as const,
    aggregateType: 'CartableTask' as const,
    payloadFields: Object.freeze([
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
    ] as const),
  }),
});

export type OpsAdminEventSchema =
  (typeof OpsAdminEventSchemaCatalog)['CartableTaskProjected'];

export function opsAdminEventSchema(
  event: CanonicalEvent,
): OpsAdminEventSchema | undefined {
  if (
    event.eventType !== 'CartableTaskProjected' ||
    event.eventVersion !== 1 ||
    event.producer !== 'core-ops' ||
    event.aggregateType !== 'CartableTask'
  )
    return undefined;
  return OpsAdminEventSchemaCatalog.CartableTaskProjected;
}
