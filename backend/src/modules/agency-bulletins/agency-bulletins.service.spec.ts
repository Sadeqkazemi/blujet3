import { BadRequestException } from '@nestjs/common';
import { AgencyBulletinsService } from './agency-bulletins.service';
import {
  AgencyBulletinAudienceMode,
  AgencyBulletinKind,
} from './dto/agency-bulletin.dtos';

const ACTOR = {
  id: '11111111-1111-4111-8111-111111111111',
  role: 'SITE_ADMIN',
  fullName: 'ادمین سایت',
  isSuperAdmin: false,
} as const;

const profiles = [
  {
    userId: '22222222-2222-4222-8222-222222222222',
    managerName: 'مدیر یک',
    city: 'تهران',
    suspendedAt: null,
    joinedAt: new Date(),
    user: {
      role: 'AGENCY',
      fullName: 'آژانس یک',
      isActive: true,
      deletedAt: null,
    },
  },
  {
    userId: '33333333-3333-4333-8333-333333333333',
    managerName: 'مدیر دو',
    city: 'شیراز',
    suspendedAt: null,
    joinedAt: new Date(),
    user: {
      role: 'AGENCY',
      fullName: 'آژانس دو',
      isActive: true,
      deletedAt: null,
    },
  },
];

function buildService(notificationRows: unknown[] = []) {
  const profileRepo = { find: jest.fn().mockResolvedValue(profiles) };
  const notificationRepo = {
    find: jest.fn().mockResolvedValue(notificationRows),
  };
  const notifications = { notify: jest.fn().mockResolvedValue({}) };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  return {
    service: new AgencyBulletinsService(
      profileRepo as never,
      notificationRepo as never,
      notifications as never,
      audit as never,
    ),
    notifications,
    audit,
  };
}

describe('AgencyBulletinsService', () => {
  it('delivers an all-agency notice once to every active agency', async () => {
    const { service, notifications, audit } = buildService();

    const result = await service.create(ACTOR, {
      kind: AgencyBulletinKind.NOTICE,
      title: 'پرواز جدید',
      body: 'دستورالعمل فروش پرواز جدید',
      audienceMode: AgencyBulletinAudienceMode.ALL,
    });

    expect(result.recipientCount).toBe(2);
    expect(notifications.notify).toHaveBeenCalledTimes(2);
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: profiles[0].userId,
        entityType: 'AGENCY_BULLETIN',
        action: 'AGENCY_NOTICE_PUBLISHED',
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'AgencyBulletin' }),
    );
  });

  it('delivers an amendment only to the selected one or many recipients', async () => {
    const { service, notifications } = buildService();

    const result = await service.create(ACTOR, {
      kind: AgencyBulletinKind.AMENDMENT,
      title: 'اصلاح ساعت پرواز',
      body: 'ساعت پرواز اصلاح شد.',
      audienceMode: AgencyBulletinAudienceMode.SELECTED,
      recipientIds: [profiles[0].userId, profiles[1].userId],
    });

    expect(result.recipientCount).toBe(2);
    expect(notifications.notify).toHaveBeenCalledTimes(2);
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: profiles[1].userId,
        action: 'AGENCY_AMENDMENT_PUBLISHED',
      }),
    );
  });

  it('rejects a suspended, unknown or non-agency selected recipient', async () => {
    const { service, notifications } = buildService();

    await expect(
      service.create(ACTOR, {
        kind: AgencyBulletinKind.NOTICE,
        title: 'پیام انتخابی',
        body: 'متن پیام انتخابی',
        audienceMode: AgencyBulletinAudienceMode.SELECTED,
        recipientIds: ['99999999-9999-4999-8999-999999999999'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it('returns persisted dispatch history with exact recipient and read counts', async () => {
    const createdAt = new Date('2026-08-28T08:00:00.000Z');
    const { service } = buildService([
      {
        entityId: 'dispatch-1',
        action: 'AGENCY_NOTICE_PUBLISHED',
        title: 'پرواز جدید',
        body: 'دستورالعمل فروش',
        readAt: createdAt,
        createdAt,
      },
      {
        entityId: 'dispatch-1',
        action: 'AGENCY_NOTICE_PUBLISHED',
        title: 'پرواز جدید',
        body: 'دستورالعمل فروش',
        readAt: null,
        createdAt,
      },
    ]);

    await expect(service.adminHistory()).resolves.toEqual([
      expect.objectContaining({
        id: 'dispatch-1',
        kind: AgencyBulletinKind.NOTICE,
        recipientCount: 2,
        readCount: 1,
      }),
    ]);
  });
});
