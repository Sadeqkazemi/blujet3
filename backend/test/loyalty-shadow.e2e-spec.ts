import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { dataSourceOptions } from '../src/database/data-source.options';
import { readLocalLoyalty } from '../src/modules/loyalty-shadow/local-loyalty-projection';

describe('Loyalty shadow local projection (PostgreSQL regression)', () => {
  let db: DataSource;
  beforeAll(async () => {
    if (!new URL(process.env.DATABASE_URL ?? '').pathname.endsWith('_test')) {
      throw new Error('An isolated _test database is required');
    }
    db = await new DataSource({
      ...dataSourceOptions,
      synchronize: false,
      migrationsRun: false,
      extra: {
        connectionTimeoutMillis: 2000,
        statement_timeout: 2000,
        options: '-c default_transaction_read_only=on -c timezone=UTC',
      },
    }).initialize();
  });
  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
  });

  it('executes quoted bigint casts and both member/lock queries, even for an absent owner', async () => {
    // PostgreSQL still resolves every selected column for an empty result.
    // An unquoted camelCase ::text cast must fail here, not silently become UNAVAILABLE.
    expect(await readLocalLoyalty(db, randomUUID(), new Date())).toEqual({
      member: null,
      locks: [],
    });
  });

  it('executes the independent ledger aggregation for a seeded member', async () => {
    const members = await db.query<Array<{ id: string; userId: string }>>(
      'SELECT id, "userId" FROM loyalty.club_members WHERE "userId" IS NOT NULL AND "deactivatedAt" IS NULL ORDER BY id LIMIT 1',
    );
    expect(members).toHaveLength(1);
    const points = await db.query<Array<{ points: string }>>(
      'SELECT COALESCE(SUM("signedPoints"),0)::text AS points FROM loyalty.club_points_entries WHERE "clubMemberId"=$1',
      [members[0].id],
    );
    const view = await readLocalLoyalty(db, members[0].userId, new Date());
    expect(view.member).toMatchObject({
      id: members[0].id,
      userId: members[0].userId,
      points: points[0].points,
    });
  });
});
