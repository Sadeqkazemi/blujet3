import { decryptPii } from '../../common/pii-crypto';
import { NotifyOutboxEventType } from './notify-outbox.contract';
import { NotifyOutboxService } from './notify-outbox.service';

describe('NotifyOutboxService', () => {
  const originalKey = process.env.PII_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.PII_ENCRYPTION_KEY =
      '3a6dfd91b775e9cd09be8a576889adfe518a31ad1064af3d63c21ce9aadbdf10';
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.PII_ENCRYPTION_KEY;
    else process.env.PII_ENCRYPTION_KEY = originalKey;
  });

  function setup(existing: { id: string } | null = null) {
    const repo = {
      findOneBy: jest.fn().mockResolvedValue(existing),
      create: jest.fn((value: unknown) => value),
      save: jest.fn((value: { id: string }) => Promise.resolve(value)),
    };
    return { repo, service: new NotifyOutboxService(repo as never) };
  }

  it('persists only an encrypted notification payload', async () => {
    const { repo, service } = setup();
    await service.enqueue(
      NotifyOutboxEventType.NOTIFICATION_CREATED,
      {
        recipientId: '11111111-1111-4111-8111-111111111111',
        category: 'SYSTEM',
        action: 'BOOKING_TICKETED',
        title: 'بلیط صادر شد',
        body: 'متن محرمانه اعلان',
      },
      'booking:1:ticketed',
    );

    const created = repo.create.mock.calls[0]?.[0] as {
      payloadEncrypted: string;
      dedupeKey: string;
    };
    expect(created.payloadEncrypted).not.toContain('متن محرمانه اعلان');
    expect(JSON.parse(decryptPii(created.payloadEncrypted))).toMatchObject({
      title: 'بلیط صادر شد',
      body: 'متن محرمانه اعلان',
    });
    expect(created.dedupeKey).toBe('booking:1:ticketed');
  });

  it('returns the first event for an existing dedupe key', async () => {
    const { repo, service } = setup({ id: 'existing-event' });
    await expect(
      service.enqueue(
        NotifyOutboxEventType.SMS_REQUESTED,
        {
          phone: '09121234567',
          message: 'کد ورود',
          messageType: 'OTP',
          provider: { mode: 'MOCK' },
        },
        'otp:challenge-1',
      ),
    ).resolves.toEqual({ eventId: 'existing-event', queued: true });
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('uses the caller transaction repository for atomic domain writes', async () => {
    const { repo, service } = setup();
    const manager = { getRepository: jest.fn().mockReturnValue(repo) };
    await service.enqueue(
      NotifyOutboxEventType.NOTIFICATION_CREATED,
      {
        recipientId: '11111111-1111-4111-8111-111111111111',
        category: 'SYSTEM',
        action: 'BOOKING_TICKETED',
        title: 'بلیط صادر شد',
      },
      'booking:1:ticketed',
      manager as never,
    );
    expect(manager.getRepository).toHaveBeenCalled();
    expect(repo.save).toHaveBeenCalledTimes(1);
  });
});
