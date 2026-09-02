import { SmsDeliveryService } from './sms-delivery.service';

describe('SmsDeliveryService', () => {
  function setup(existing: Record<string, unknown> | null = null) {
    const stored = {
      id: 'sms-1',
      sourceEventId: '11111111-1111-4111-8111-111111111111',
      status: 'SUCCESS',
    };
    const repo = {
      findOneBy: jest
        .fn()
        .mockResolvedValueOnce(existing)
        .mockResolvedValue(stored),
      findOneByOrFail: jest.fn().mockResolvedValue(stored),
      create: jest.fn((value: Record<string, unknown>) => ({
        id: 'sms-1',
        ...value,
      })),
      save: jest
        .fn()
        .mockImplementation((value: unknown) => Promise.resolve(value)),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    return { repo, service: new SmsDeliveryService(repo as never) };
  }

  const payload = {
    phone: '09121234567',
    message: 'کد ورود 12345',
    messageType: 'OTP',
    provider: { mode: 'MOCK' },
  } as const;

  it('does not invoke delivery again for a consumed event', async () => {
    const existing = {
      id: 'sms-existing',
      sourceEventId: '11111111-1111-4111-8111-111111111111',
    };
    const { repo, service } = setup(existing);
    await expect(
      service.deliver(existing.sourceEventId, payload),
    ).resolves.toBe(existing);
    expect(repo.save).not.toHaveBeenCalled();
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('reserves the source event before completing a mock delivery', async () => {
    const { repo, service } = setup();
    await expect(
      service.deliver('11111111-1111-4111-8111-111111111111', payload),
    ).resolves.toMatchObject({ id: 'sms-1' });
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceEventId: '11111111-1111-4111-8111-111111111111',
        status: 'FAILED',
      }),
    );
    expect(repo.update).toHaveBeenCalledWith(
      { id: 'sms-1' },
      { status: 'SUCCESS', failureReason: null },
    );
  });
});
