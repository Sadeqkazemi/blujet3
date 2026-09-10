import { createCartableTaskProjectedEvent } from '../../common/events/ops-admin-events';
import {
  CartableCategory,
  CartableSourceType,
  CartableStatus,
} from '../../database/enums';
import { OpsAdminProjectionConsumer } from './ops-admin-projection.consumer';
import type { OpsAdminProjectionStore } from './ops-admin-projection.store';

describe('OpsAdminProjectionConsumer', () => {
  const event = () =>
    createCartableTaskProjectedEvent(
      {
        id: 'task-1',
        version: 1,
        assigneeId: 'operator-1',
        category: CartableCategory.ADMIN,
        sourceType: CartableSourceType.MANAGER_MESSAGE,
        sourceId: 'message-1',
        status: CartableStatus.OPEN,
        resolvedAt: null,
        readAt: null,
        createdAt: new Date('2026-09-10T09:00:00.000Z'),
      },
      {
        auditId: 'audit-1',
        correlationId: 'request-1',
        idempotencyKey: 'cartable-projected:task-1:v1',
      },
    );

  it('parses the strict contract before projecting it', async () => {
    const project = jest.fn().mockResolvedValue('applied');
    const store = { project } as unknown as OpsAdminProjectionStore;
    const consumer = new OpsAdminProjectionConsumer(store);
    const input = event();

    await expect(consumer.consume(input)).resolves.toBe('applied');
    expect(project).toHaveBeenCalledWith(input);
  });

  it('rejects an invalid payload without touching the store', async () => {
    const project = jest.fn().mockResolvedValue('applied');
    const store = { project } as unknown as OpsAdminProjectionStore;
    const consumer = new OpsAdminProjectionConsumer(store);

    await expect(
      consumer.consume({ ...event(), payload: { taskVersion: 1 } }),
    ).rejects.toMatchObject({ status: 400 });
    expect(project).not.toHaveBeenCalled();
  });
});
