import * as crypto from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource, In } from 'typeorm';
import { AppModule } from '../src/app.module';
import { Notification } from '../src/database/entities/notification.entity';
import { SmsLog } from '../src/database/entities/sms-log.entity';

function encrypt(value: unknown): string {
  const key = Buffer.from(process.env.PII_ENCRYPTION_KEY ?? '', 'hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), 'utf8'),
    cipher.final(),
  ]);
  return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${encrypted.toString('base64')}`;
}

describe('Notify internal contract (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  const eventIds: string[] = [];
  const dedupeKeys: string[] = [];
  const token = () => process.env.NOTIFY_INTERNAL_TOKEN ?? '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    if (eventIds.length > 0) {
      await dataSource
        .getRepository(SmsLog)
        .delete({ sourceEventId: In(eventIds) });
    }
    if (dedupeKeys.length > 0) {
      await dataSource
        .getRepository(Notification)
        .delete({ dedupeKey: In(dedupeKeys) });
    }
    await app.close();
  });

  it('exposes public schema-aware health and propagates request IDs', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .set('x-request-id', 'notify-e2e-request')
      .expect(200)
      .expect('x-request-id', 'notify-e2e-request');
    expect(response.body).toEqual(
      expect.objectContaining({
        status: 'ok',
        service: 'blujet-notify',
        database: 'up',
      }),
    );
    await request(app.getHttpServer())
      .get('/health/live')
      .expect(200, { status: 'ok', service: 'blujet-notify' });
    await request(app.getHttpServer()).get('/health/ready').expect(200);
  });

  it('protects every internal route and rejects unknown contract fields', async () => {
    await request(app.getHttpServer())
      .get('/internal/v1/notifications')
      .expect(401);
    await request(app.getHttpServer())
      .post('/internal/v1/events')
      .set('x-internal-token', token())
      .send({
        eventId: randomUUID(),
        eventType: 'NOTIFICATION_CREATED',
        payloadEncrypted: 'invalid',
        unexpected: true,
      })
      .expect(400);
  });

  it('consumes a notification event once and preserves recipient ownership', async () => {
    const eventId = randomUUID();
    const recipientId = randomUUID();
    const otherRecipientId = randomUUID();
    const dedupeKey = `notify-e2e:${eventId}`;
    eventIds.push(eventId);
    dedupeKeys.push(dedupeKey);
    const body = {
      eventId,
      eventType: 'NOTIFICATION_CREATED',
      payloadEncrypted: encrypt({
        recipientId,
        category: 'SYSTEM',
        action: 'BOOKING_TICKETED',
        title: 'بلیط صادر شد',
        body: 'آماده دریافت است.',
        entityType: 'BOOKING',
        entityId: randomUUID(),
        dedupeKey,
      }),
    };

    const first = await request(app.getHttpServer())
      .post('/internal/v1/events')
      .set('x-internal-token', token())
      .send(body)
      .expect(201);
    const replay = await request(app.getHttpServer())
      .post('/internal/v1/events')
      .set('x-internal-token', token())
      .send(body)
      .expect(201);
    expect(replay.body.data.notificationId).toBe(
      first.body.data.notificationId,
    );
    expect(
      await dataSource
        .getRepository(Notification)
        .count({ where: { dedupeKey } }),
    ).toBe(1);

    const list = await request(app.getHttpServer())
      .get('/internal/v1/notifications')
      .query({ recipientId, role: 'USER' })
      .set('x-internal-token', token())
      .expect(200);
    expect(list.body.data).toEqual([
      expect.objectContaining({ id: first.body.data.notificationId }),
    ]);

    await request(app.getHttpServer())
      .patch(
        `/internal/v1/notifications/${first.body.data.notificationId}/read`,
      )
      .set('x-internal-token', token())
      .send({ recipientId: otherRecipientId, role: 'USER' })
      .expect(404);
    await request(app.getHttpServer())
      .patch(
        `/internal/v1/notifications/${first.body.data.notificationId}/read`,
      )
      .set('x-internal-token', token())
      .send({ recipientId, role: 'USER' })
      .expect(200);
  });

  it('records a mock SMS event once across replay', async () => {
    const eventId = randomUUID();
    eventIds.push(eventId);
    const body = {
      eventId,
      eventType: 'SMS_REQUESTED',
      payloadEncrypted: encrypt({
        phone: '09121234567',
        message: 'کد ورود 12345',
        messageType: 'OTP',
        provider: { mode: 'MOCK' },
      }),
    };
    const first = await request(app.getHttpServer())
      .post('/internal/v1/events')
      .set('x-internal-token', token())
      .send(body)
      .expect(201);
    const replay = await request(app.getHttpServer())
      .post('/internal/v1/events')
      .set('x-internal-token', token())
      .send(body)
      .expect(201);
    expect(replay.body.data.smsLogId).toBe(first.body.data.smsLogId);
    expect(
      await dataSource
        .getRepository(SmsLog)
        .count({ where: { sourceEventId: eventId } }),
    ).toBe(1);
  });
});
