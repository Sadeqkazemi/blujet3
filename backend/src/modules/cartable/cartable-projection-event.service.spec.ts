import { ConflictException } from '@nestjs/common';
import type { EntityManager, Repository } from 'typeorm';
import { CartableProjectionAudit } from '../../database/entities/cartable-projection-audit.entity';
import type { CartableTask } from '../../database/entities/cartable-task.entity';
import type { CartableTaskProjectedEvent } from '../../common/events/ops-admin-events';
import { CartableProjectionEventService } from './cartable-projection-event.service';

function task(overrides: Partial<CartableTask> = {}): CartableTask {
  return {
    id: 'task-1',
    version: 2,
    assigneeId: 'assignee-1',
    category: 'ADMIN',
    sourceType: 'MANAGER_MESSAGE',
    sourceId: 'message-1',
    status: 'OPEN',
    resolvedAt: null,
    readAt: null,
    createdAt: new Date('2030-01-01T00:00:00.000Z'),
    ...overrides,
  } as CartableTask;
}

function setup(existing: CartableProjectionAudit | null = null) {
  const findOneBy = jest
    .fn<Promise<CartableProjectionAudit | null>, [object]>()
    .mockResolvedValue(existing);
  const insert = jest.fn<Promise<object>, [object]>().mockResolvedValue({});
  const audits = {
    findOneBy,
    insert,
  } as unknown as Repository<CartableProjectionAudit>;
  const manager = {
    queryRunner: { isTransactionActive: true },
    query: jest.fn().mockResolvedValue([]),
    getRepository: jest.fn().mockReturnValue(audits),
  } as unknown as EntityManager;
  const enqueueCartable = jest
    .fn<
      Promise<{ eventId: string }>,
      [EntityManager, CartableTaskProjectedEvent]
    >()
    .mockResolvedValue({ eventId: 'event-1' });
  const outbox = { enqueueCartable };
  const service = new CartableProjectionEventService(outbox as never);
  return { service, manager, findOneBy, insert, enqueueCartable };
}

describe('CartableProjectionEventService', () => {
  it('records content-free audit evidence and an exact versioned event', async () => {
    const { service, manager, insert, enqueueCartable } = setup();

    const result = await service.record(manager, task(), 'READ');

    expect(result.eventId).toBe('event-1');
    expect(typeof result.auditId).toBe('string');
    expect(insert).toHaveBeenCalledWith({
      id: result.auditId,
      taskId: 'task-1',
      taskVersion: 2,
      mutation: 'READ',
    });
    const event = enqueueCartable.mock.calls[0][1];
    expect(event).toMatchObject({
      eventType: 'CartableTaskProjected',
      producer: 'core-ops',
      aggregateId: 'task-1',
      idempotencyKey: 'cartable-projected:task-1:v2',
      payload: {
        auditId: result.auditId,
        taskVersion: 2,
        assigneeId: 'assignee-1',
      },
    });
    expect(JSON.stringify(event)).not.toMatch(
      /title|description|attachments|senderId|conversationId|resolutionNote/,
    );
  });

  it('reuses the durable audit id for an idempotent replay', async () => {
    const existing = {
      id: 'audit-1',
      taskId: 'task-1',
      taskVersion: 2,
      mutation: 'READ',
    } as CartableProjectionAudit;
    const { service, manager, insert, enqueueCartable } = setup(existing);

    await service.record(manager, task(), 'READ');

    expect(insert).not.toHaveBeenCalled();
    expect(enqueueCartable).toHaveBeenCalledTimes(1);
    expect(enqueueCartable.mock.calls[0][0]).toBe(manager);
    expect(enqueueCartable.mock.calls[0][1].payload.auditId).toBe('audit-1');
  });

  it('rejects a different mutation reusing the same task version', async () => {
    const existing = {
      id: 'audit-1',
      taskId: 'task-1',
      taskVersion: 2,
      mutation: 'READ',
    } as CartableProjectionAudit;
    const { service, manager, enqueueCartable } = setup(existing);

    await expect(
      service.record(manager, task(), 'RESOLVED'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(enqueueCartable).not.toHaveBeenCalled();
  });

  it('requires the caller transaction', async () => {
    const { service, manager } = setup();
    Object.assign(manager, { queryRunner: undefined });

    await expect(service.record(manager, task(), 'CREATED')).rejects.toThrow(
      'active Core transaction',
    );
  });
});
