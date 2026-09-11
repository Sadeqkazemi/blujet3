import type { EachMessagePayload } from 'kafkajs';
import {
  parseKafkaEventDelivery,
  validateKafkaEventSubscription,
} from './kafka-event-message';
import { LoyaltyEventSchemaCatalog } from './loyalty-event-schema';
import { createLoyaltyPointsEntryProjected } from './loyalty-events';
import { OpsAdminEventSchemaCatalog } from './ops-admin-event-schema';
import { createCartableTaskProjectedEvent } from './ops-admin-events';

describe('Kafka event schema admission', () => {
  const event = createCartableTaskProjectedEvent(
    {
      id: 'task-1',
      version: 1,
      assigneeId: 'staff-1',
      category: 'MANAGER',
      sourceType: null,
      sourceId: null,
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
  const subscription = validateKafkaEventSubscription({
    topic: 'blujet.events.v1',
    expectedProducer: 'core-ops',
    requireSchemaId: true,
  });

  function payload(schemaId?: string): EachMessagePayload {
    return {
      topic: subscription.topic,
      partition: 0,
      heartbeat: jest.fn().mockResolvedValue(undefined),
      pause: jest.fn(),
      message: {
        offset: '4',
        key: Buffer.from('core-ops:CartableTask:task-1'),
        value: Buffer.from(JSON.stringify(event)),
        headers: {
          'event-id': Buffer.from(event.eventId),
          'correlation-id': Buffer.from(event.correlationId),
          'event-version': Buffer.from('1'),
          ...(schemaId === undefined
            ? {}
            : { 'event-schema-id': Buffer.from(schemaId) }),
        },
      },
    } as unknown as EachMessagePayload;
  }

  it('accepts the exact Ops/Admin schema ID', () => {
    expect(
      parseKafkaEventDelivery(
        subscription,
        payload(OpsAdminEventSchemaCatalog.CartableTaskProjected.schemaId),
      ).event,
    ).toEqual(event);
  });

  it.each([undefined, 'blujet.ops-admin.CartableTaskProjected.v2'])(
    'rejects missing or mismatched schema identity: %s',
    (schemaId) => {
      expect(() =>
        parseKafkaEventDelivery(subscription, payload(schemaId)),
      ).toThrow('پیام Kafka معتبر نیست.');
    },
  );

  it('keeps missing schema IDs compatible when the subscription flag is off', () => {
    const compatible = validateKafkaEventSubscription({
      topic: 'blujet.events.v1',
      expectedProducer: 'core-ops',
    });
    expect(parseKafkaEventDelivery(compatible, payload()).event).toEqual(event);
  });

  it('accepts the exact Loyalty schema identity and aggregate key', () => {
    const loyalty = createLoyaltyPointsEntryProjected(
      {
        id: 'points-1',
        clubMemberId: 'member-1',
        type: 'EARN',
        signedPoints: 500,
        bookingId: 'booking-1',
        createdAt: new Date('2026-09-11T08:00:00.000Z'),
      },
      {
        auditId: 'audit-1',
        correlationId: 'request-1',
        idempotencyKey: 'points-1-v1',
        occurredAt: new Date('2026-09-11T08:00:00.000Z'),
        recordVersion: 1,
      },
    );
    const loyaltySubscription = validateKafkaEventSubscription({
      topic: 'blujet.events.v1',
      expectedProducer: 'core-loyalty',
      requireSchemaId: true,
    });
    const delivery = {
      topic: loyaltySubscription.topic,
      partition: 1,
      heartbeat: jest.fn().mockResolvedValue(undefined),
      pause: jest.fn(),
      message: {
        offset: '9',
        key: Buffer.from('core-loyalty:LoyaltyPointsEntry:points-1'),
        value: Buffer.from(JSON.stringify(loyalty)),
        headers: {
          'event-id': Buffer.from(loyalty.eventId),
          'correlation-id': Buffer.from(loyalty.correlationId),
          'event-version': Buffer.from('1'),
          'event-schema-id': Buffer.from(
            LoyaltyEventSchemaCatalog.LoyaltyPointsEntryProjected.schemaId,
          ),
        },
      },
    } as unknown as EachMessagePayload;

    expect(
      parseKafkaEventDelivery(loyaltySubscription, delivery).event,
    ).toEqual(loyalty);
  });
});
