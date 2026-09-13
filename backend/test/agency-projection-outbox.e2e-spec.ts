import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { parseAgencyProjectionEvent } from '../src/common/events/agency-events';
import { decryptPii } from '../src/common/pii-crypto';
import { dataSourceOptions } from '../src/database/data-source.options';
import { AgencyProfile } from '../src/database/entities/agency-profile.entity';
import { AgencyProjectionAudit } from '../src/database/entities/agency-projection-audit.entity';
import { CommerceOutboxEvent } from '../src/database/entities/commerce-outbox-event.entity';
import { User } from '../src/database/entities/user.entity';
import { AgencyTier, Role } from '../src/database/enums';
import { AgencyProjectionOutboxFoundation1793775600000 } from '../src/database/migrations/1793775600000-AgencyProjectionOutboxFoundation';
import { AgencyProjectionEventService } from '../src/modules/agency-projection-outbox/agency-projection-event.service';
import { CommerceOutboxService } from '../src/modules/commerce-outbox/commerce-outbox.service';

describe('Agency projection source outbox (PostgreSQL)', () => {
  let db: DataSource;
  const projectionEvents = new AgencyProjectionEventService(
    new CommerceOutboxService(),
  );

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? '');
    if (
      !['localhost', '127.0.0.1', 'postgres'].includes(url.hostname) ||
      !url.pathname.endsWith('_test')
    ) {
      throw new Error('Agency projection tests require a local test database');
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

  function createUserAndProfile(manager: DataSource['manager'], id: string) {
    const now = new Date();
    const user = manager.create(User, {
      id,
      role: Role.AGENCY,
      phone: null,
      username: null,
      passwordHash: null,
      email: null,
      fullName: 'آژانس تست',
      updatedAt: now,
    });
    const profile = manager.create(AgencyProfile, {
      userId: id,
      licenseNo: `LICENSE-${id}`,
      managerName: 'مدیر تست',
      phone: '09121234567',
      email: '',
      city: '',
      address: '',
      tier: AgencyTier.NORMAL,
      suspendedAt: null,
      suspendReason: null,
    });
    return { user, profile };
  }

  it('writes source revisions, immutable evidence and encrypted outbox atomically', async () => {
    const runner = db.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      const id = randomUUID();
      const { user, profile } = createUserAndProfile(runner.manager, id);
      await runner.manager.save(user);
      const first = await runner.manager.save(profile);
      expect(first.version).toBe(1);
      expect(JSON.stringify(first)).not.toContain('"version"');
      await projectionEvents.recordProfile(runner.manager, first, 'CREATED');

      first.managerName = 'مدیر ویرایش‌شده';
      const second = await runner.manager.save(first);
      expect(second.version).toBe(2);
      await projectionEvents.recordProfile(runner.manager, second, 'UPDATED');

      const audits = await runner.manager.find(AgencyProjectionAudit, {
        where: { aggregateType: 'AgencyProfile', aggregateId: id },
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
        where: { producer: 'core-agency' },
        order: { sequence: 'ASC' },
      });
      const events = rows
        .map((row) =>
          parseAgencyProjectionEvent(
            JSON.parse(decryptPii(row.envelopeEncrypted)),
          ),
        )
        .filter((event) => event.aggregateId === id);
      expect(events.map((event) => event.payload.recordVersion)).toEqual([
        1, 2,
      ]);
      expect(events[0].payload).toMatchObject({
        email: '',
        city: '',
        address: '',
      });
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
        const { user, profile } = createUserAndProfile(manager, id);
        await manager.save(user);
        const row = await manager.save(profile);
        await projectionEvents.recordProfile(manager, row, 'CREATED');
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');

    expect(await db.getRepository(AgencyProfile).countBy({ userId: id })).toBe(
      0,
    );
    expect(
      await db.getRepository(AgencyProjectionAudit).countBy({
        aggregateType: 'AgencyProfile',
        aggregateId: id,
      }),
    ).toBe(0);
    expect(
      await db.getRepository(CommerceOutboxEvent).countBy({
        producer: 'core-agency',
        idempotencyKey: `agency-projected:AgencyProfile:${id}:v1`,
      }),
    ).toBe(0);
    expect(await db.getRepository(User).countBy({ id })).toBe(0);
  });

  it('rejects updates to immutable audit evidence', async () => {
    const id = randomUUID();
    await db.transaction(async (manager) => {
      await manager.insert(AgencyProjectionAudit, {
        id,
        aggregateType: 'AgencyProfile',
        aggregateId: randomUUID(),
        recordVersion: 1,
        mutation: 'CREATED',
      });
    });

    await expect(
      db.transaction(async (manager) => {
        await manager.update(
          AgencyProjectionAudit,
          { id },
          {
            mutation: 'UPDATED',
          },
        );
      }),
    ).rejects.toThrow('append-only table');
  });

  it('reverts and reapplies the additive migration in a rollback sandbox', async () => {
    const runner = db.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      const migration = new AgencyProjectionOutboxFoundation1793775600000();
      await migration.down(runner);
      for (const table of [
        'agency_profiles',
        'agency_invoices',
        'agency_credit_requests',
      ]) {
        expect(await runner.hasColumn(`agency.${table}`, 'version')).toBe(
          false,
        );
      }
      expect(await runner.hasTable('agency.agency_projection_audits')).toBe(
        false,
      );
      await migration.up(runner);
      for (const table of [
        'agency_profiles',
        'agency_invoices',
        'agency_credit_requests',
      ]) {
        expect(await runner.hasColumn(`agency.${table}`, 'version')).toBe(true);
      }
      expect(await runner.hasTable('agency.agency_projection_audits')).toBe(
        true,
      );
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  });
});
