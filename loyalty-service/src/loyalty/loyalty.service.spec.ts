import { ConflictException } from '@nestjs/common';
import { LoyaltyService } from './loyalty.service';

function member(fullName = 'عضو تست') {
  return {
    id: 'member-1',
    userId: null,
    fullName,
    email: 'member@example.com',
    birthDate: null,
    joinDate: '2026-09-05T10:00:00.000Z',
    points: 6200,
    level: 'GOLD',
    cardStatus: 'ISSUED',
    cardNo: 'GOLD-1001',
    issuedByLabelFa: 'مدیر عامل',
    createdAt: '2026-09-05T10:00:00.000Z',
  };
}

function service(rows: ReturnType<typeof member>[], total = '1') {
  const query = jest
    .fn()
    .mockResolvedValueOnce(undefined)
    .mockResolvedValueOnce(rows)
    .mockResolvedValueOnce([
      {
        totalMembers: total,
        issuedCards: total,
        silver: '0',
        gold: total,
        platinum: '0',
      },
    ])
    .mockResolvedValueOnce([{ pendingRequests: '0', submittedRequests: '0' }]);
  const transaction = jest.fn(
    (_isolation: string, work: (tx: { query: jest.Mock }) => unknown) =>
      Promise.resolve(work({ query })),
  );
  return {
    loyalty: new LoyaltyService({ transaction } as never),
    query,
  };
}

describe('LoyaltyService members-list boundary', () => {
  it('uses one repeatable-read, read-only transaction and parameterized filters', async () => {
    const { loyalty, query } = service([member()]);
    await expect(
      loyalty.membersList({ level: 'GOLD', q: "member%' OR true--" }),
    ).resolves.toMatchObject({
      members: [{ fullName: 'عضو تست' }],
      kpis: { totalMembers: 1, tierCounts: { GOLD: 1 } },
    });
    expect(query).toHaveBeenNthCalledWith(1, 'SET TRANSACTION READ ONLY');
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('m.level = $1'),
      ['GOLD', "%member%' OR true--%"],
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('ILIKE $2'),
      ['GOLD', "%member%' OR true--%"],
    );
  });

  it('rejects more than 1000 rows instead of returning a partial list', async () => {
    const rows = Array.from({ length: 1001 }, () => member());
    await expect(
      service(rows, '1001').loyalty.membersList({}),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects an oversized response instead of truncating fields', async () => {
    const oversized = member('x'.repeat(513 * 1024));
    await expect(
      service([oversized]).loyalty.membersList({}),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects unsafe aggregate values', async () => {
    await expect(
      service([member()], '9007199254740992').loyalty.membersList({}),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('LoyaltyService card-request bounds', () => {
  function cards(rows: unknown[]) {
    const query = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(rows);
    return new LoyaltyService({
      transaction: (
        _isolation: string,
        work: (tx: { query: jest.Mock }) => unknown,
      ) => work({ query }),
    } as never);
  }
  const history = [{ step: 'referred', labelFa: 'ارجاع', at: 'اکنون' }];

  it('returns empty results and accepts exactly 1000 rows', async () => {
    await expect(cards([]).cardRequests()).resolves.toEqual([]);
    const rows = Array.from({ length: 1000 }, () => ({ history }));
    await expect(cards(rows).cardRequests()).resolves.toHaveLength(1000);
  });
  it('rejects excess rows without truncating', async () => {
    await expect(
      cards(Array.from({ length: 1001 }, () => ({ history }))).cardRequests(),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it('rejects response byte overflow', async () => {
    await expect(
      cards([
        { history, member: { fullName: 'x'.repeat(513 * 1024) } },
      ]).cardRequests(),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it.each([
    null,
    [{}],
    [{ ...history[0], privateField: 'secret' }],
    Array.from({ length: 33 }, () => history[0]),
  ])('rejects malformed or excessive history', async (invalidHistory) => {
    await expect(
      cards([{ history: invalidHistory }]).cardRequests(),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
