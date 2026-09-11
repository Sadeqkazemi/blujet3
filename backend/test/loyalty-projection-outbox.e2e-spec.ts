import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { parseLoyaltyProjectionEvent } from '../src/common/events/loyalty-events';
import { decryptPii } from '../src/common/pii-crypto';
import { dataSourceOptions } from '../src/database/data-source.options';
import { ClubTierRule } from '../src/database/entities/club-tier-rule.entity';
import { CommerceOutboxEvent } from '../src/database/entities/commerce-outbox-event.entity';
import { LoyaltyProjectionAudit } from '../src/database/entities/loyalty-projection-audit.entity';
import { LoyaltyProjectionOutboxFoundation1793347200000 } from '../src/database/migrations/1793347200000-LoyaltyProjectionOutboxFoundation';
import { CommerceOutboxService } from '../src/modules/commerce-outbox/commerce-outbox.service';
import { LoyaltyProjectionEventService } from '../src/modules/loyalty-projection-outbox/loyalty-projection-event.service';

describe('Loyalty projection source outbox (PostgreSQL)', () => {
  let db: DataSource;
  const projectionEvents = new LoyaltyProjectionEventService(
    new CommerceOutboxService(),
  );

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? '');
    if (
      !['localhost', '127.0.0.1', 'postgres'].includes(url.hostname) ||
      !url.pathname.endsWith('_test')
    ) {
      throw new Error('Loyalty projection tests require a local test database');
    }
    db = await new DataSource({
      ...dataSourceOptions,
      logging: false,
      extra: { options: '-c timezone=UTC' },
    }).initialize();
  });

  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
  });

  it('writes row, immutable evidence and encrypted outbox atomically', async () => {
    const runner = db.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      const id = randomUUID();
      const first = await runner.manager.save(
        runner.manager.create(ClubTierRule, {
          id,
          goldMinPoints: 5000,
          platinumMinPoints: 15000,
          cardRequestMinPoints: 5000,
          updatedById: null,
          updatedAt: new Date(),
        }),
      );
      expect(first.version).toBe(1);
      await projectionEvents.recordTierRule(runner.manager, first, 'CREATED');

      first.goldMinPoints = 6000;
      first.updatedAt = new Date();
      const second = await runner.manager.save(first);
      expect(second.version).toBe(2);
      await projectionEvents.recordTierRule(runner.manager, second, 'UPDATED');

      const audits = await runner.manager.find(LoyaltyProjectionAudit, {
        where: { aggregateType: 'LoyaltyTierRule', aggregateId: id },
        order: { recordVersion: 'ASC' },
      });
      expect(
        audits.map(({ recordVersion, mutation }) => ({
          recordVersion,
          mutation,
        })),
      ).toEqual([
        { recordVersion: 1, mutation: 'CREATED' },
        { recordVersion: 2, mutation: 'UPDATED' },
      ]);

      const rows = await runner.manager.find(CommerceOutboxEvent, {
        where: { producer: 'core-loyalty' },
        order: { createdAt: 'ASC' },
      });
      const events = rows
        .map((row) =>
          parseLoyaltyProjectionEvent(
            JSON.parse(decryptPii(row.envelopeEncrypted)),
          ),
        )
        .filter((event) => event.aggregateId === id);
      expect(events.map((event) => event.payload.recordVersion)).toEqual([
        1, 2,
      ]);
      expect(rows.every((row) => !row.envelopeEncrypted.includes(id))).toBe(
        true,
      );
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  });

  it('rolls source row, audit and outbox back together', async () => {
    const id = randomUUID();

    await expect(
      db.transaction(async (manager) => {
        const row = await manager.save(
          manager.create(ClubTierRule, {
            id,
            goldMinPoints: 5000,
            platinumMinPoints: 15000,
            cardRequestMinPoints: 5000,
            updatedById: null,
            updatedAt: new Date(),
          }),
        );
        await projectionEvents.recordTierRule(manager, row, 'CREATED');
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');

    expect(await db.getRepository(ClubTierRule).countBy({ id })).toBe(0);
    expect(
      await db.getRepository(LoyaltyProjectionAudit).countBy({
        aggregateType: 'LoyaltyTierRule',
        aggregateId: id,
      }),
    ).toBe(0);
    expect(
      await db.getRepository(CommerceOutboxEvent).countBy({
        producer: 'core-loyalty',
        idempotencyKey: `loyalty-projected:LoyaltyTierRule:${id}:v1`,
      }),
    ).toBe(0);
  });

  it('reverts and reapplies the additive migration in a rollback sandbox', async () => {
    const runner = db.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      const migration = new LoyaltyProjectionOutboxFoundation1793347200000();
      await migration.down(runner);
      expect(await runner.hasColumn('loyalty.club_members', 'version')).toBe(
        false,
      );
      expect(await runner.hasTable('loyalty.loyalty_projection_audits')).toBe(
        false,
      );
      await migration.up(runner);
      expect(await runner.hasColumn('loyalty.club_members', 'version')).toBe(
        true,
      );
      expect(await runner.hasTable('loyalty.loyalty_projection_audits')).toBe(
        true,
      );
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  });
});
