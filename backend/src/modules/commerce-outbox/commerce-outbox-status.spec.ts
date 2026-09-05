import { DataSource } from 'typeorm';
import { readCommerceOutboxStatus } from './commerce-outbox-status';

describe('commerce outbox status contract', () => {
  const row = {
    capturedAt: '2026-09-05T12:00:00.000Z',
    pending: '0',
    ready: '0',
    scheduled: '0',
    inFlight: '0',
    expiredLease: '0',
    quarantined: '0',
    oldestPendingAgeSeconds: null,
  };
  const query = jest.fn<Promise<unknown>, [string, unknown[]?]>();
  const runner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    query,
    isTransactionActive: true,
  };
  const db = { createQueryRunner: () => runner } as unknown as DataSource;
  beforeEach(() => {
    jest.clearAllMocks();
    query.mockImplementation((sql) =>
      Promise.resolve(sql.startsWith('WITH') ? [row] : []),
    );
  });
  it('returns an empty snapshot, enables read-only/timeout before reading and releases', async () => {
    expect(await readCommerceOutboxStatus(db, false)).toMatchObject({
      status: 'IDLE',
      dispatchConfiguredEnabled: false,
      counts: { pending: '0' },
      oldestPendingAgeSeconds: null,
    });
    expect(query.mock.calls.slice(0, 3).map(([sql]) => sql)).toEqual([
      'SET TRANSACTION READ ONLY',
      "SET LOCAL statement_timeout = '2000ms'",
      "SET LOCAL lock_timeout = '2000ms'",
    ]);
    expect(runner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(runner.release).toHaveBeenCalledTimes(1);
  });
  it.each([
    [false, 'PAUSED', '1', '0'],
    [true, 'PENDING', '1', '0'],
    [false, 'ATTENTION', '1', '1'],
    [true, 'ATTENTION', '0', '1'],
  ])(
    'classifies enabled=%s as %s',
    async (enabled, status, pending, quarantined) => {
      query.mockImplementation((sql) =>
        Promise.resolve(
          sql.startsWith('WITH')
            ? [
                {
                  ...row,
                  pending,
                  ready: pending,
                  quarantined,
                  oldestPendingAgeSeconds: pending === '0' ? null : '1',
                },
              ]
            : [],
        ),
      );
      expect((await readCommerceOutboxStatus(db, enabled)).status).toBe(status);
    },
  );
  it('preserves large exact counts and returns only allowlisted fields', async () => {
    const large = '9007199254740993';
    query.mockImplementation((sql) =>
      Promise.resolve(
        sql.startsWith('WITH')
          ? [
              {
                ...row,
                pending: large,
                ready: large,
                oldestPendingAgeSeconds: '2',
                envelopeEncrypted: 'SECRET',
              },
            ]
          : [],
      ),
    );
    const report = await readCommerceOutboxStatus(db, true);
    expect(report.counts.pending).toBe(large);
    expect(JSON.stringify(report)).not.toContain('SECRET');
  });
  it.each(
    [
      [],
      [{}],
      [{ ...row, ready: 1 }],
      [{ ...row, pending: '-1' }],
      [{ ...row, pending: '1.5' }],
      [{ ...row, pending: '1' }],
      [{ ...row, oldestPendingAgeSeconds: '0' }],
      [{ ...row, capturedAt: 'bad' }],
    ].map((rows) => ({ rows })),
  )('fails closed on malformed aggregate case %#', async ({ rows }) => {
    query.mockImplementation((sql) =>
      Promise.resolve(sql.startsWith('WITH') ? rows : []),
    );
    await expect(readCommerceOutboxStatus(db, true)).rejects.toThrow();
    expect(runner.rollbackTransaction).toHaveBeenCalled();
    expect(runner.release).toHaveBeenCalled();
  });
  it('propagates unavailable storage rather than inventing zero counts', async () => {
    query.mockRejectedValueOnce(new Error('unavailable'));
    await expect(readCommerceOutboxStatus(db, true)).rejects.toThrow(
      'unavailable',
    );
    expect(runner.release).toHaveBeenCalled();
  });
});
