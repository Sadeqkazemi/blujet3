import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { App } from 'supertest/types';
import { AuditLog } from '../src/database/entities/audit-log.entity';
import { NotifyOutboxEvent } from '../src/database/entities/notify-outbox-event.entity';
import { User } from '../src/database/entities/user.entity';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { createTestApp } from './helpers/app.helper';

describe('Notify outbox transaction boundary (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let notifications: NotificationsService;
  const auditIds: string[] = [];
  const dedupeKeys: string[] = [];
  const previousEnv = {
    enabled: process.env.NOTIFY_INTEGRATION_ENABLED,
    url: process.env.NOTIFY_SERVICE_URL,
    token: process.env.NOTIFY_INTERNAL_TOKEN,
  };

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    notifications = app.get(NotificationsService);
    // The dispatcher was intentionally bootstrapped disabled. Enabling the
    // write adapter now proves a domain transaction does not contact the
    // unavailable URL and leaves a durable pending event.
    process.env.NOTIFY_INTEGRATION_ENABLED = 'true';
    process.env.NOTIFY_SERVICE_URL = 'http://127.0.0.1:1';
    process.env.NOTIFY_INTERNAL_TOKEN =
      'test-notify-internal-token-at-least-32-characters';
  });

  afterAll(async () => {
    if (dedupeKeys.length > 0) {
      await dataSource
        .getRepository(NotifyOutboxEvent)
        .delete(dedupeKeys.map((dedupeKey) => ({ dedupeKey })));
    }
    if (auditIds.length > 0) {
      await dataSource
        .getRepository(AuditLog)
        .delete(auditIds.map((id) => ({ id })));
    }
    if (previousEnv.enabled === undefined) {
      delete process.env.NOTIFY_INTEGRATION_ENABLED;
    } else process.env.NOTIFY_INTEGRATION_ENABLED = previousEnv.enabled;
    if (previousEnv.url === undefined) delete process.env.NOTIFY_SERVICE_URL;
    else process.env.NOTIFY_SERVICE_URL = previousEnv.url;
    if (previousEnv.token === undefined) {
      delete process.env.NOTIFY_INTERNAL_TOKEN;
    } else process.env.NOTIFY_INTERNAL_TOKEN = previousEnv.token;
    await app.close();
  });

  it('commits the domain record and encrypted pending event without calling notify', async () => {
    const actor = await dataSource.getRepository(User).findOneByOrFail({
      role: 'SITE_ADMIN',
    });
    const auditId = randomUUID();
    const dedupeKey = `notify-atomic:${auditId}`;
    auditIds.push(auditId);
    dedupeKeys.push(dedupeKey);

    await dataSource.transaction(async (manager) => {
      await manager.save(
        manager.create(AuditLog, {
          id: auditId,
          actorId: actor.id,
          actorRole: actor.role,
          category: 'RESERVATION',
          action: 'notify-outbox-e2e',
          detail: 'atomic booking-domain marker',
          entityType: 'Booking',
          entityId: auditId,
          metadata: null,
          requestId: null,
        }),
      );
      await notifications.notify(
        {
          recipientId: actor.id,
          category: 'SYSTEM',
          action: 'BOOKING_TICKETED',
          title: 'بلیط صادر شد',
          body: 'متن محرمانه',
          entityType: 'Booking',
          entityId: auditId,
          dedupeKey,
        },
        manager,
      );
    });

    expect(
      await dataSource.getRepository(AuditLog).countBy({ id: auditId }),
    ).toBe(1);
    const event = await dataSource
      .getRepository(NotifyOutboxEvent)
      .findOneByOrFail({ dedupeKey });
    expect(event.deliveredAt).toBeNull();
    expect(event.payloadEncrypted).not.toContain('متن محرمانه');
  });

  it('rolls back both the domain record and event together', async () => {
    const actor = await dataSource.getRepository(User).findOneByOrFail({
      role: 'SITE_ADMIN',
    });
    const auditId = randomUUID();
    const dedupeKey = `notify-rollback:${auditId}`;

    await expect(
      dataSource.transaction(async (manager) => {
        await manager.save(
          manager.create(AuditLog, {
            id: auditId,
            actorId: actor.id,
            actorRole: actor.role,
            category: 'RESERVATION',
            action: 'notify-outbox-rollback-e2e',
            detail: 'must roll back',
            entityType: 'Booking',
            entityId: auditId,
            metadata: null,
            requestId: null,
          }),
        );
        await notifications.notify(
          {
            recipientId: actor.id,
            category: 'SYSTEM',
            action: 'BOOKING_TICKETED',
            title: 'نباید باقی بماند',
            dedupeKey,
          },
          manager,
        );
        throw new Error('force rollback');
      }),
    ).rejects.toThrow('force rollback');

    expect(
      await dataSource.getRepository(AuditLog).countBy({ id: auditId }),
    ).toBe(0);
    expect(
      await dataSource.getRepository(NotifyOutboxEvent).countBy({ dedupeKey }),
    ).toBe(0);
  });
});
