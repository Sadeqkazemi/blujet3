import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { parseCartableTaskProjectedEvent } from '../src/common/events/ops-admin-events';
import { decryptPii } from '../src/common/pii-crypto';
import { dataSourceOptions } from '../src/database/data-source.options';
import { CartableProjectionAudit } from '../src/database/entities/cartable-projection-audit.entity';
import { CartableTask } from '../src/database/entities/cartable-task.entity';
import { CommerceOutboxEvent } from '../src/database/entities/commerce-outbox-event.entity';
import { User } from '../src/database/entities/user.entity';
import { CartableProjectionOutbox1793174400000 } from '../src/database/migrations/1793174400000-CartableProjectionOutbox';
import { CartableProjectionEventService } from '../src/modules/cartable/cartable-projection-event.service';
import { CommerceOutboxService } from '../src/modules/commerce-outbox/commerce-outbox.service';

describe('Cartable projection source outbox (PostgreSQL)', () => {
  let db: DataSource;
  let assigneeId: string;
  const createdTaskIds: string[] = [];
  const projectionEvents = new CartableProjectionEventService(
    new CommerceOutboxService(),
  );

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? '');
    if (
      !['localhost', '127.0.0.1', 'postgres'].includes(url.hostname) ||
      !url.pathname.endsWith('_test')
    ) {
      throw new Error(
        'Cartable projection tests require a local test database',
      );
    }
    db = await new DataSource({
      ...dataSourceOptions,
      logging: false,
      extra: { options: '-c timezone=UTC' },
    }).initialize();
    assigneeId = (
      await db.getRepository(User).findOneOrFail({
        where: { role: 'SITE_ADMIN', isActive: true },
        select: { id: true },
      })
    ).id;
  });

  afterAll(async () => {
    if (!db?.isInitialized) return;
    if (createdTaskIds.length > 0) {
      await db.getRepository(CartableTask).delete(createdTaskIds);
    }
    await db.destroy();
  });

  it('commits create and read snapshots with increasing versions and no content', async () => {
    const taskId = randomUUID();
    createdTaskIds.push(taskId);

    await db.transaction(async (manager) => {
      const task = await manager.save(
        manager.create(CartableTask, {
          id: taskId,
          assigneeId,
          category: 'ADMIN',
          title: 'محتوای محرمانه تست',
          description: 'این متن نباید وارد رویداد شود',
          attachments: ['private-file-id'],
          senderLabelFa: 'فرستنده تست',
        }),
      );
      expect(task.version).toBe(1);
      await projectionEvents.record(manager, task, 'CREATED');
    });

    await db.transaction(async (manager) => {
      const task = await manager
        .createQueryBuilder(CartableTask, 'task')
        .setLock('pessimistic_write')
        .where('task.id = :taskId', { taskId })
        .getOneOrFail();
      task.readAt = new Date();
      const saved = await manager.save(task);
      expect(saved.version).toBe(2);
      await projectionEvents.record(manager, saved, 'READ');
    });

    const audits = await db.getRepository(CartableProjectionAudit).find({
      where: { taskId },
      order: { taskVersion: 'ASC' },
    });
    expect(
      audits.map(({ taskVersion, mutation }) => ({ taskVersion, mutation })),
    ).toEqual([
      { taskVersion: 1, mutation: 'CREATED' },
      { taskVersion: 2, mutation: 'READ' },
    ]);

    const rows = await db.getRepository(CommerceOutboxEvent).find({
      where: { producer: 'core-ops' },
      order: { createdAt: 'ASC' },
    });
    const events = rows
      .map((row) =>
        parseCartableTaskProjectedEvent(
          JSON.parse(decryptPii(row.envelopeEncrypted)),
        ),
      )
      .filter((event) => event.aggregateId === taskId);
    expect(events.map((event) => event.payload.taskVersion)).toEqual([1, 2]);
    expect(JSON.stringify(events)).not.toMatch(
      /محتوای محرمانه|این متن|private-file-id|فرستنده تست/,
    );
  });

  it('rolls task, audit and outbox back together', async () => {
    const taskId = randomUUID();

    await expect(
      db.transaction(async (manager) => {
        const task = await manager.save(
          manager.create(CartableTask, {
            id: taskId,
            assigneeId,
            category: 'MANAGER',
            title: 'rollback',
            description: 'rollback',
          }),
        );
        await projectionEvents.record(manager, task, 'CREATED');
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');

    expect(await db.getRepository(CartableTask).countBy({ id: taskId })).toBe(
      0,
    );
    expect(
      await db.getRepository(CartableProjectionAudit).countBy({ taskId }),
    ).toBe(0);
    expect(
      await db.getRepository(CommerceOutboxEvent).countBy({
        producer: 'core-ops',
        idempotencyKey: `cartable-projected:${taskId}:v1`,
      }),
    ).toBe(0);
  });

  it('enforces immutable projection audit evidence', async () => {
    const audit = await db
      .getRepository(CartableProjectionAudit)
      .findOneOrFail({
        where: { taskId: createdTaskIds[0], taskVersion: 1 },
      });

    await expect(
      db.getRepository(CartableProjectionAudit).update(audit.id, {
        mutation: 'RESOLVED',
      }),
    ).rejects.toThrow();
    await expect(
      db.getRepository(CartableProjectionAudit).delete(audit.id),
    ).rejects.toThrow();
  });

  it('reverts and reapplies the additive migration inside a rollback sandbox', async () => {
    const runner = db.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      const migration = new CartableProjectionOutbox1793174400000();
      await migration.down(runner);
      expect(await runner.hasColumn('ops.cartable_tasks', 'version')).toBe(
        false,
      );
      expect(await runner.hasTable('ops.cartable_projection_audits')).toBe(
        false,
      );
      await migration.up(runner);
      expect(await runner.hasColumn('ops.cartable_tasks', 'version')).toBe(
        true,
      );
      expect(await runner.hasTable('ops.cartable_projection_audits')).toBe(
        true,
      );
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  });
});
