import { randomUUID } from 'node:crypto';
import {
  createCartableTaskProjectedEvent,
  parseCartableTaskProjectedEvent,
  type CartableProjectionSnapshot,
} from './ops-admin-events';

describe('CartableTaskProjected event', () => {
  const snapshot = (): CartableProjectionSnapshot => ({
    id: 'task-1',
    version: 3,
    assigneeId: 'staff-1',
    category: 'AGENCY',
    sourceType: 'AGENCY_REQUEST',
    sourceId: 'request-1',
    status: 'APPROVED',
    resolvedAt: new Date('2026-09-10T08:05:00.000Z'),
    readAt: new Date('2026-09-10T08:02:00.000Z'),
    createdAt: new Date('2026-09-10T08:00:00.000Z'),
  });
  const context = () => ({
    auditId: 'audit-1',
    correlationId: 'correlation-1',
    idempotencyKey: 'task-1-v3',
  });

  it('builds an exact PII-free full snapshot and uses task ID as aggregate ID', () => {
    const event = createCartableTaskProjectedEvent(snapshot(), context());

    expect(event).toMatchObject({
      eventType: 'CartableTaskProjected',
      eventVersion: 1,
      producer: 'core-ops',
      aggregateType: 'CartableTask',
      aggregateId: 'task-1',
      occurredAt: '2026-09-10T08:05:00.000Z',
      payload: {
        auditId: 'audit-1',
        taskVersion: 3,
        assigneeId: 'staff-1',
        category: 'AGENCY',
        sourceType: 'AGENCY_REQUEST',
        sourceId: 'request-1',
        status: 'APPROVED',
        resolvedAt: '2026-09-10T08:05:00.000Z',
        readAt: '2026-09-10T08:02:00.000Z',
        createdAt: '2026-09-10T08:00:00.000Z',
      },
    });
    expect(Object.keys(event.payload).sort()).toEqual(
      [
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
      ].sort(),
    );
  });

  it('detaches parsed data from the caller-owned payload', () => {
    const event = createCartableTaskProjectedEvent(snapshot(), context());
    const input = JSON.parse(JSON.stringify(event)) as Record<string, unknown>;
    const parsed = parseCartableTaskProjectedEvent(input);
    const payload = input.payload as Record<string, unknown>;
    payload.status = 'REJECTED';
    expect(parsed.payload.status).toBe('APPROVED');
  });

  it.each([
    { taskVersion: 0 },
    { taskVersion: 1.5 },
    { category: 'FINANCE' },
    { sourceType: 'UNKNOWN' },
    { assigneeId: 'bad id' },
    { createdAt: '2026-09-10 08:00:00' },
    { status: 'OPEN', resolvedAt: '2026-09-10T08:05:00.000Z' },
    { status: 'APPROVED', resolvedAt: null },
    { readAt: '2026-09-10T07:59:00.000Z' },
    { resolvedAt: '2026-09-10T07:59:00.000Z' },
  ])('rejects invalid routing snapshot %#', (override) => {
    const valid = createCartableTaskProjectedEvent(snapshot(), context());
    expect(() =>
      parseCartableTaskProjectedEvent({
        ...valid,
        eventId: randomUUID(),
        payload: { ...valid.payload, ...override },
      }),
    ).toThrow('قرارداد رویداد کارتابل معتبر نیست.');
  });

  it('rejects content-bearing and unknown payload fields', () => {
    const valid = createCartableTaskProjectedEvent(snapshot(), context());
    expect(() =>
      parseCartableTaskProjectedEvent({
        ...valid,
        eventId: randomUUID(),
        payload: { ...valid.payload, title: 'secret content' },
      }),
    ).toThrow('قرارداد رویداد کارتابل معتبر نیست.');
  });

  it('supports unresolved OPEN tasks and nullable source references', () => {
    const event = createCartableTaskProjectedEvent(
      {
        ...snapshot(),
        version: 1,
        sourceType: null,
        sourceId: null,
        status: 'OPEN',
        resolvedAt: null,
        readAt: null,
      },
      { ...context(), idempotencyKey: 'task-1-v1' },
    );
    expect(event.payload).toMatchObject({
      taskVersion: 1,
      sourceType: null,
      sourceId: null,
      status: 'OPEN',
      resolvedAt: null,
    });
  });
});
