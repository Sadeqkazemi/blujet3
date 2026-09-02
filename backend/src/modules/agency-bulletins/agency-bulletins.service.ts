import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgencyProfile } from '../../database/entities/agency-profile.entity';
import { Notification } from '../../database/entities/notification.entity';
import { ErrorCode } from '../../common/errors';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { NotificationCategory } from '../../database/enums';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  AgencyBulletinAudienceMode,
  AgencyBulletinKind,
  type CreateAgencyBulletinDto,
} from './dto/agency-bulletin.dtos';

const AGENCY_BULLETIN_ENTITY = 'AGENCY_BULLETIN';

@Injectable()
export class AgencyBulletinsService {
  constructor(
    @InjectRepository(AgencyProfile)
    private readonly profileRepo: Repository<AgencyProfile>,
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  async recipients() {
    const profiles = await this.profileRepo.find({
      relations: { user: true },
      order: { joinedAt: 'DESC' },
    });
    return profiles
      .filter(
        (profile) =>
          profile.user.role === 'AGENCY' &&
          profile.user.isActive &&
          !profile.user.deletedAt &&
          !profile.suspendedAt,
      )
      .map((profile) => ({
        id: profile.userId,
        fullName: profile.user.fullName,
        managerName: profile.managerName,
        city: profile.city,
      }));
  }

  async create(actor: AuthenticatedUser, dto: CreateAgencyBulletinDto) {
    const eligible = await this.recipients();
    const byId = new Map(eligible.map((agency) => [agency.id, agency]));
    const recipientIds =
      dto.audienceMode === AgencyBulletinAudienceMode.ALL
        ? eligible.map((agency) => agency.id)
        : [...new Set(dto.recipientIds ?? [])];

    if (recipientIds.length === 0) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'حداقل یک آژانس فعال باید به‌عنوان گیرنده انتخاب شود.',
      });
    }
    const invalidIds = recipientIds.filter((id) => !byId.has(id));
    if (invalidIds.length > 0) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'یک یا چند آژانس انتخاب‌شده فعال یا معتبر نیستند.',
      });
    }

    const dispatchId = randomUUID();
    const title = dto.title.trim();
    const body = dto.body.trim();
    const action =
      dto.kind === AgencyBulletinKind.AMENDMENT
        ? 'AGENCY_AMENDMENT_PUBLISHED'
        : 'AGENCY_NOTICE_PUBLISHED';

    await Promise.all(
      recipientIds.map((recipientId) =>
        this.notifications.notify({
          recipientId,
          category: NotificationCategory.MESSAGE,
          action,
          title,
          body,
          entityType: AGENCY_BULLETIN_ENTITY,
          entityId: dispatchId,
          dedupeKey: `${AGENCY_BULLETIN_ENTITY}:${dispatchId}:${recipientId}`,
        }),
      ),
    );

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'SYSTEM',
      action:
        dto.kind === AgencyBulletinKind.AMENDMENT
          ? 'ارسال اصلاحیه به آژانس‌ها'
          : 'ارسال اطلاعیه به آژانس‌ها',
      detail: `«${title}» برای ${recipientIds.length} آژانس ارسال شد.`,
      entityType: 'AgencyBulletin',
      entityId: dispatchId,
    });

    return {
      id: dispatchId,
      kind: dto.kind,
      title,
      body,
      recipientCount: recipientIds.length,
      createdAt: new Date().toISOString(),
    };
  }

  async adminHistory() {
    const rows = await this.notificationRepo.find({
      where: { entityType: AGENCY_BULLETIN_ENTITY },
      order: { createdAt: 'DESC' },
    });
    const groups = new Map<
      string,
      {
        id: string;
        kind: AgencyBulletinKind;
        title: string;
        body: string;
        recipientCount: number;
        readCount: number;
        createdAt: string;
      }
    >();
    for (const row of rows) {
      if (!row.entityId) continue;
      const current = groups.get(row.entityId);
      if (current) {
        current.recipientCount += 1;
        if (row.readAt) current.readCount += 1;
        if (row.createdAt.toISOString() < current.createdAt) {
          current.createdAt = row.createdAt.toISOString();
        }
        continue;
      }
      groups.set(row.entityId, {
        id: row.entityId,
        kind:
          row.action === 'AGENCY_AMENDMENT_PUBLISHED'
            ? AgencyBulletinKind.AMENDMENT
            : AgencyBulletinKind.NOTICE,
        title: row.title,
        body: row.body ?? '',
        recipientCount: 1,
        readCount: row.readAt ? 1 : 0,
        createdAt: row.createdAt.toISOString(),
      });
    }
    return [...groups.values()].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  }
}
