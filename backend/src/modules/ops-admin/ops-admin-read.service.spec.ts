import type { DataSource } from 'typeorm';
import { OpsAdminReadService } from './ops-admin-read.service';

describe('OpsAdminReadService', () => {
  it('maps aggregate queue state without task content', async () => {
    const query = jest.fn().mockResolvedValue([
      {
        category: 'ADMIN',
        status: 'OPEN',
        count: 3,
        unread: 2,
        oldestCreatedAt: '2026-09-09T08:00:00.000Z',
      },
    ]);
    const result = await new OpsAdminReadService({
      query,
    } as unknown as DataSource).cartableSummary();

    expect(result.groups).toEqual([
      {
        category: 'ADMIN',
        status: 'OPEN',
        count: 3,
        unread: 2,
        oldestCreatedAt: '2026-09-09T08:00:00.000Z',
      },
    ]);
    expect(query).toHaveBeenCalledWith(
      expect.not.stringMatching(/title|description|attachments|senderId/i),
    );
  });

  it('returns only bounded routing metadata', async () => {
    const query = jest.fn().mockResolvedValue([
      {
        id: 'task-1',
        assigneeId: 'user-1',
        category: 'MANAGER',
        sourceType: 'MANAGER_REFERRAL',
        sourceId: 'referral-1',
        status: 'OPEN',
        resolvedAt: null,
        readAt: null,
        createdAt: '2026-09-09T08:00:00.000Z',
      },
    ]);
    const result = await new OpsAdminReadService({
      query,
    } as unknown as DataSource).listCartableTasks('OPEN', 'MANAGER', 25);

    expect(result).toEqual([
      expect.objectContaining({
        id: 'task-1',
        assigneeId: 'user-1',
        createdAt: '2026-09-09T08:00:00.000Z',
      }),
    ]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('LIMIT $3'), [
      'OPEN',
      'MANAGER',
      25,
    ]);
    expect(JSON.stringify(result)).not.toMatch(
      /title|description|attachments|senderLabel|resolutionNote|conversation/i,
    );
  });
});
