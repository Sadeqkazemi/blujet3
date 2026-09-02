import { NotFoundException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  function setup(existing: Record<string, unknown> | null = null) {
    const repo = {
      findOneBy: jest.fn().mockResolvedValue(existing),
      findOneByOrFail: jest.fn().mockResolvedValue(existing),
      create: jest.fn((value: unknown) => value),
      save: jest.fn((value: unknown) => Promise.resolve(value)),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    return { repo, service: new NotificationsService(repo as never) };
  }

  it('returns the existing row for a repeated dedupe key', async () => {
    const existing = { id: 'notification-1', dedupeKey: 'booking:1:ticketed' };
    const { repo, service } = setup(existing);
    await expect(
      service.create({
        recipientId: '11111111-1111-4111-8111-111111111111',
        category: 'SYSTEM',
        action: 'BOOKING_TICKETED',
        title: 'بلیط صادر شد',
        dedupeKey: 'booking:1:ticketed',
      }),
    ).resolves.toBe(existing);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('does not allow another recipient to mark a notification read', async () => {
    const { repo, service } = setup(null);
    await expect(
      service.markRead(
        '22222222-2222-4222-8222-222222222222',
        'USER',
        '11111111-1111-4111-8111-111111111111',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('enforces the external-role entity allowlist while marking read', async () => {
    const hidden = {
      id: '11111111-1111-4111-8111-111111111111',
      recipientId: '22222222-2222-4222-8222-222222222222',
      entityType: 'EMPLOYEE_PRIVATE',
      readAt: null,
    };
    const { repo, service } = setup(hidden);
    await expect(
      service.markRead(hidden.recipientId, 'USER', hidden.id),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.update).not.toHaveBeenCalled();
  });
});
