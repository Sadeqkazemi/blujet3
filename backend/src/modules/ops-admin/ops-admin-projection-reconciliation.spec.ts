import type { DataSource } from 'typeorm';
import { reconcileOpsAdminProjection } from './ops-admin-projection-reconciliation';

const row = (overrides: Record<string, unknown> = {}) => ({
  id: 'task-1',
  assigneeId: 'operator-1',
  category: 'ADMIN',
  sourceType: 'MANAGER_MESSAGE',
  sourceId: 'message-1',
  status: 'OPEN',
  resolvedAt: null,
  readAt: null,
  createdAt: new Date('2026-09-10T09:00:00.000Z'),
  taskVersion: 2,
  auditId: 'audit-2',
  ...overrides,
});

function database(count: string, rows: unknown[]): DataSource {
  return {
    query: jest
      .fn()
      .mockResolvedValueOnce([{ count }])
      .mockResolvedValueOnce(rows),
  } as unknown as DataSource;
}

describe('reconcileOpsAdminProjection', () => {
  it('reports a complete match without returning identifiers', async () => {
    const source = database('1', [row()]);
    const projection = database('1', [row()]);
    const report = await reconcileOpsAdminProjection(source, projection, 100);

    expect(report).toMatchObject({
      status: 'MATCH',
      sourceCount: '1',
      projectionCount: '1',
      missing: 0,
      unexpected: 0,
      stale: 0,
      divergent: 0,
    });
    expect(JSON.stringify(report)).not.toContain('task-1');
    expect(JSON.stringify(report)).not.toContain('operator-1');
    for (const dataSource of [source, projection]) {
      const calls = (dataSource.query as jest.Mock).mock.calls;
      expect(calls).toHaveLength(2);
      expect(calls.every(([sql]) => /^SELECT /i.test(String(sql).trim()))).toBe(
        true,
      );
    }
  });

  it('counts missing, unexpected, stale and divergent rows', async () => {
    const source = [
      row({ id: 'missing' }),
      row({ id: 'stale' }),
      row({ id: 'divergent' }),
      row({ id: 'ahead' }),
    ];
    const projection = [
      row({ id: 'stale', taskVersion: 1 }),
      row({ id: 'divergent', assigneeId: 'operator-2' }),
      row({ id: 'ahead', taskVersion: 3 }),
      row({ id: 'unexpected' }),
    ];

    await expect(
      reconcileOpsAdminProjection(
        database('4', source),
        database('4', projection),
        100,
      ),
    ).resolves.toMatchObject({
      status: 'MISMATCH',
      missing: 1,
      unexpected: 1,
      stale: 1,
      divergent: 2,
    });
  });

  it('is inconclusive when the bounded sample omits rows', async () => {
    await expect(
      reconcileOpsAdminProjection(
        database('10001', [row()]),
        database('10001', [row()]),
        10_000,
      ),
    ).resolves.toMatchObject({ status: 'INCONCLUSIVE', limit: 10_000 });
  });

  it.each([0, 10_001, 1.5])('rejects unsafe limits', async (limit) => {
    await expect(
      reconcileOpsAdminProjection(database('0', []), database('0', []), limit),
    ).rejects.toThrow('limit must be 1-10000');
  });
});
