import * as crypto from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { EventsService } from './events.service';

const KEY = '3a6dfd91b775e9cd09be8a576889adfe518a31ad1064af3d63c21ce9aadbdf10';

function encrypt(value: unknown): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(
    'aes-256-gcm',
    Buffer.from(KEY, 'hex'),
    iv,
  );
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), 'utf8'),
    cipher.final(),
  ]);
  return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${encrypted.toString('base64')}`;
}

describe('EventsService', () => {
  const originalKey = process.env.PII_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.PII_ENCRYPTION_KEY = KEY;
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.PII_ENCRYPTION_KEY;
    else process.env.PII_ENCRYPTION_KEY = originalKey;
  });

  it('decrypts and routes a notification without exposing its payload', async () => {
    const notifications = {
      create: jest.fn().mockResolvedValue({ id: 'notification-1' }),
    };
    const sms = { deliver: jest.fn() };
    const service = new EventsService(notifications as never, sms as never);
    const eventId = '11111111-1111-4111-8111-111111111111';

    await expect(
      service.consume({
        eventId,
        eventType: 'NOTIFICATION_CREATED',
        payloadEncrypted: encrypt({
          recipientId: '22222222-2222-4222-8222-222222222222',
          category: 'SYSTEM',
          action: 'BOOKING_TICKETED',
          title: 'بلیط صادر شد',
        }),
      }),
    ).resolves.toEqual({ eventId, notificationId: 'notification-1' });
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ dedupeKey: `outbox:${eventId}` }),
    );
    expect(sms.deliver).not.toHaveBeenCalled();
  });

  it('rejects malformed encrypted or decrypted payloads', async () => {
    const service = new EventsService({} as never, {} as never);
    await expect(
      service.consume({
        eventId: '11111111-1111-4111-8111-111111111111',
        eventType: 'NOTIFICATION_CREATED',
        payloadEncrypted: 'not-ciphertext',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.consume({
        eventId: '11111111-1111-4111-8111-111111111111',
        eventType: 'NOTIFICATION_CREATED',
        payloadEncrypted: encrypt({ title: 'missing recipient' }),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
