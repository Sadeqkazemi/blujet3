import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as crypto from 'node:crypto';
import { In, LessThanOrEqual, Repository } from 'typeorm';
import { SupportTicket } from '../../database/entities/support-ticket.entity';
import { User } from '../../database/entities/user.entity';
import { StoredFile } from '../../database/entities/stored-file.entity';
import type { JsonValue } from '../../database/json-types';
import { AuditService } from '../audit/audit.service';
import { StaffDirectoryService } from '../staff-directory/staff-directory.module';
import { ErrorCode } from '../../common/errors';
import { normalizeIranPhone } from '../../common/normalize-iran-phone';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { SupportTicketDept, SupportTicketStatus } from '../../database/enums';
import type {
  SubmitSupportTicketDto,
  AdminCreateSupportTicketDto,
  ReplySupportTicketDto,
} from './dto/support-ticket.dtos';

/** Staff-created tickets without a phone use this sentinel (schema requires a string). */
const STAFF_TICKET_PHONE_SENTINEL = '09000000000';
const ANSWER_INACTIVITY_DAYS = 5;
const SUPPORT_LIFECYCLE_SWEEP_MS = 60 * 60 * 1000;

function generateTrackingCode(): string {
  return `TK${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

const CUSTOMER_TICKET_SELECT = {
  id: true,
  trackingCode: true,
  subject: true,
  body: true,
  requesterName: true,
  status: true,
  history: true,
  createdAt: true,
  updatedAt: true,
  attachments: true,
} as const;

@Injectable()
export class SupportTicketsService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(SupportTicketsService.name);
  private lifecycleTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @InjectRepository(SupportTicket)
    private readonly ticketRepo: Repository<SupportTicket>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(StoredFile)
    private readonly storedFileRepo: Repository<StoredFile>,
    private readonly audit: AuditService,
    private readonly staffDirectory: StaffDirectoryService,
  ) {}

  onApplicationBootstrap() {
    void this.autoCloseAnsweredTickets().catch((error: unknown) => {
      this.logger.error('Support ticket lifecycle sweep failed', error);
    });
    this.lifecycleTimer = setInterval(() => {
      void this.autoCloseAnsweredTickets().catch((error: unknown) => {
        this.logger.error('Support ticket lifecycle sweep failed', error);
      });
    }, SUPPORT_LIFECYCLE_SWEEP_MS);
    this.lifecycleTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.lifecycleTimer) clearInterval(this.lifecycleTimer);
    this.lifecycleTimer = null;
  }

  async autoCloseAnsweredTickets(now = new Date()) {
    const inactivityThreshold = new Date(
      now.getTime() - ANSWER_INACTIVITY_DAYS * 24 * 60 * 60 * 1000,
    );
    const staleTickets = await this.ticketRepo.find({
      where: {
        status: SupportTicketStatus.ANSWERED,
        updatedAt: LessThanOrEqual(inactivityThreshold),
      },
    });
    for (const ticket of staleTickets) {
      if (ticket.status !== SupportTicketStatus.ANSWERED) continue;
      const history = Array.isArray(ticket.history)
        ? [...(ticket.history as unknown[])]
        : [];
      history.push({
        step: 'auto_closed',
        labelFa: 'بستن خودکار پس از ۵ روز بدون پاسخ درخواست‌کننده',
        at: now.toISOString(),
      });
      ticket.history = history as JsonValue;
      ticket.status = SupportTicketStatus.CLOSED;
      ticket.updatedAt = now;
      await this.ticketRepo.save(ticket);
    }
    return staleTickets.length;
  }

  async submit(dto: SubmitSupportTicketDto) {
    const ticket = await this.ticketRepo.save(
      this.ticketRepo.create({
        trackingCode: generateTrackingCode(),
        requesterName: dto.requesterName,
        requesterPhone: normalizeIranPhone(dto.requesterPhone),
        subject: dto.subject,
        body: dto.body,
        updatedAt: new Date(),
        history: [
          {
            step: 'submitted',
            labelFa: 'ثبت تیکت توسط کاربر',
            at: new Date().toISOString(),
          },
        ],
      }),
    );
    return { id: ticket.id, trackingCode: ticket.trackingCode };
  }

  /** SITE_ADMIN create-ticket modal — sets dept/priority at insert time. */
  async createAsAdmin(
    actor: AuthenticatedUser,
    dto: AdminCreateSupportTicketDto,
  ) {
    await this.assertOwnedAttachments(actor, dto.attachmentIds);
    const phoneRaw = dto.requesterPhone?.trim();
    const phone = phoneRaw
      ? normalizeIranPhone(phoneRaw)
      : STAFF_TICKET_PHONE_SENTINEL;
    const ticket = await this.ticketRepo.save(
      this.ticketRepo.create({
        trackingCode: generateTrackingCode(),
        requesterName: dto.requesterName,
        requesterPhone: phone,
        subject: dto.subject,
        body: dto.body,
        dept: dto.dept,
        priority: dto.priority,
        attachments: dto.attachmentIds ?? [],
        updatedAt: new Date(),
        history: [
          {
            step: 'submitted',
            labelFa: `ثبت تیکت توسط ${actor.fullName} (ادمین سایت)`,
            at: new Date().toISOString(),
          },
        ],
      }),
    );

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'SYSTEM',
      action: 'ثبت تیکت پشتیبانی توسط ادمین',
      detail: `تیکت ${ticket.trackingCode} («${ticket.subject}») توسط ${actor.fullName} ثبت شد.`,
      entityType: 'SupportTicket',
      entityId: ticket.id,
    });

    return ticket;
  }

  async submitForUser(actor: AuthenticatedUser, dto: SubmitSupportTicketDto) {
    await this.assertOwnedAttachments(actor, dto.attachmentIds);
    const isAgency = actor.role === 'AGENCY';
    const ticket = await this.ticketRepo.save(
      this.ticketRepo.create({
        userId: actor.id,
        trackingCode: generateTrackingCode(),
        requesterName: dto.requesterName,
        requesterPhone: normalizeIranPhone(dto.requesterPhone),
        subject: dto.subject,
        body: dto.body,
        dept: isAgency ? SupportTicketDept.AGENCY : SupportTicketDept.SITE,
        attachments: dto.attachmentIds ?? [],
        updatedAt: new Date(),
        history: [
          {
            step: 'submitted',
            labelFa: isAgency ? 'ثبت تیکت توسط آژانس' : 'ثبت تیکت توسط کاربر',
            at: new Date().toISOString(),
          },
        ],
      }),
    );
    return { id: ticket.id, trackingCode: ticket.trackingCode };
  }

  private async assertOwnedAttachments(
    actor: AuthenticatedUser,
    attachmentIds?: string[],
  ) {
    if (!attachmentIds || attachmentIds.length === 0) return;
    const owned = await this.storedFileRepo.count({
      where: { id: In(attachmentIds), ownerId: actor.id },
    });
    if (owned !== attachmentIds.length) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'فایل پیوست معتبر نیست.',
      });
    }
  }

  private async resolveAttachments(raw: unknown) {
    const ids = Array.isArray(raw) ? (raw as string[]) : [];
    if (ids.length === 0) return [];
    const files = await this.storedFileRepo.find({
      where: { id: In(ids) },
      select: { id: true, fileName: true, mimeType: true, sizeBytes: true },
    });
    const byId = new Map(files.map((file) => [file.id, file]));
    return ids
      .map((id) => byId.get(id))
      .filter((file): file is NonNullable<typeof file> => Boolean(file));
  }

  private async withResolvedAttachments<T extends { attachments: unknown }>(
    ticket: T,
  ) {
    const history = Array.isArray((ticket as { history?: unknown }).history)
      ? ((ticket as unknown as { history: unknown[] }).history ?? [])
      : [];
    const messageAttachmentIds = history.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return [];
      const ids = (entry as { attachmentIds?: unknown }).attachmentIds;
      return Array.isArray(ids)
        ? ids.filter((id): id is string => typeof id === 'string')
        : [];
    });
    const allAttachments = await this.resolveAttachments([
      ...(Array.isArray(ticket.attachments)
        ? (ticket.attachments as string[])
        : []),
      ...messageAttachmentIds,
    ]);
    const attachmentsById = new Map(
      allAttachments.map((file) => [file.id, file]),
    );
    const initialAttachments = Array.isArray(ticket.attachments)
      ? (ticket.attachments as string[])
          .map((id) => attachmentsById.get(id))
          .filter((file): file is NonNullable<typeof file> => Boolean(file))
      : [];
    const initialAt = (ticket as { createdAt?: Date | string }).createdAt;
    const requesterName =
      (ticket as { requesterName?: string }).requesterName || 'کاربر';
    const conversation = [
      {
        id: 'initial',
        body: (ticket as { body?: string }).body ?? '',
        senderType: 'REQUESTER' as const,
        senderLabel: requesterName,
        createdAt:
          initialAt instanceof Date
            ? initialAt.toISOString()
            : String(initialAt ?? ''),
        attachments: initialAttachments,
      },
      ...history.flatMap((entry, index) => {
        if (!entry || typeof entry !== 'object') return [];
        const message = entry as {
          step?: unknown;
          body?: unknown;
          senderType?: unknown;
          senderLabel?: unknown;
          at?: unknown;
          attachmentIds?: unknown;
        };
        if (message.step !== 'message' || typeof message.body !== 'string')
          return [];
        const ids = Array.isArray(message.attachmentIds)
          ? message.attachmentIds.filter(
              (id): id is string => typeof id === 'string',
            )
          : [];
        return [
          {
            id: `message-${index}`,
            body: message.body,
            senderType:
              message.senderType === 'STAFF'
                ? ('STAFF' as const)
                : ('REQUESTER' as const),
            senderLabel:
              typeof message.senderLabel === 'string'
                ? message.senderLabel
                : message.senderType === 'STAFF'
                  ? 'پشتیبانی blujet'
                  : requesterName,
            createdAt: typeof message.at === 'string' ? message.at : '',
            attachments: ids
              .map((id) => attachmentsById.get(id))
              .filter((file): file is NonNullable<typeof file> =>
                Boolean(file),
              ),
          },
        ];
      }),
    ];
    return {
      ...ticket,
      attachments: initialAttachments,
      conversation,
    };
  }

  private async callerPhone(userId: string): Promise<string | null> {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: { phone: true },
    });
    return user?.phone ?? null;
  }

  private customerTicketQuery(userId: string, phone: string | null) {
    const qb = this.ticketRepo
      .createQueryBuilder('t')
      .select(Object.keys(CUSTOMER_TICKET_SELECT).map((k) => `t.${k}`));
    if (phone) {
      qb.where(
        '(t."userId" = :userId OR (t."userId" IS NULL AND t."requesterPhone" = :phone))',
        { userId, phone },
      );
    } else {
      qb.where('t."userId" = :userId', { userId });
    }
    return qb;
  }

  async listMine(actor: AuthenticatedUser) {
    const phone = await this.callerPhone(actor.id);
    const tickets = await this.customerTicketQuery(actor.id, phone)
      .orderBy('t.createdAt', 'DESC')
      .getMany();
    return Promise.all(
      tickets.map((ticket) => this.withResolvedAttachments(ticket)),
    );
  }

  async getMine(actor: AuthenticatedUser, id: string) {
    return this.withResolvedAttachments(await this.findOwnedTicket(actor, id));
  }

  private async findOwnedTicket(actor: AuthenticatedUser, id: string) {
    const phone = await this.callerPhone(actor.id);
    const ticket = await this.customerTicketQuery(actor.id, phone)
      .andWhere('t.id = :id', { id })
      .getOne();
    if (!ticket) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'تیکت یافت نشد.',
      });
    }
    return ticket;
  }

  async replyMine(
    actor: AuthenticatedUser,
    id: string,
    dto: ReplySupportTicketDto,
  ) {
    const ticket = await this.findOwnedTicket(actor, id);
    if (ticket.status === SupportTicketStatus.CLOSED) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'این تیکت بسته شده و امکان ارسال پاسخ جدید ندارد.',
      });
    }
    await this.assertOwnedAttachments(actor, dto.attachmentIds);
    this.appendMessage(ticket, {
      body: dto.body.trim(),
      senderType: 'REQUESTER',
      senderLabel: actor.fullName,
      attachmentIds: dto.attachmentIds ?? [],
    });
    ticket.status = SupportTicketStatus.OPEN;
    ticket.updatedAt = new Date();
    const saved = await this.ticketRepo.save(ticket);
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'SYSTEM',
      action: 'پاسخ به تیکت پشتیبانی',
      detail: `پاسخ جدید در تیکت ${ticket.trackingCode} توسط ${actor.fullName} ثبت شد.`,
      entityType: 'SupportTicket',
      entityId: ticket.id,
    });
    return this.withResolvedAttachments(saved);
  }

  async feedbackMine(actor: AuthenticatedUser, id: string, satisfied: boolean) {
    const ticket = await this.findOwnedTicket(actor, id);
    if (ticket.status !== SupportTicketStatus.ANSWERED) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'ثبت رضایت فقط پس از پاسخ پشتیبانی امکان‌پذیر است.',
      });
    }

    const history = Array.isArray(ticket.history)
      ? [...(ticket.history as unknown[])]
      : [];
    history.push({
      step: satisfied ? 'satisfied' : 'dissatisfied',
      labelFa: satisfied
        ? 'تأیید رضایت و بستن تیکت توسط درخواست‌کننده'
        : 'ثبت نارضایتی و بازگشایی تیکت توسط درخواست‌کننده',
      at: new Date().toISOString(),
    });
    ticket.history = history as JsonValue;
    ticket.status = satisfied
      ? SupportTicketStatus.CLOSED
      : SupportTicketStatus.OPEN;
    ticket.updatedAt = new Date();
    const saved = await this.ticketRepo.save(ticket);
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'SYSTEM',
      action: satisfied
        ? 'ثبت رضایت از پاسخ پشتیبانی'
        : 'ثبت نارضایتی از پاسخ پشتیبانی',
      detail: satisfied
        ? `تیکت ${ticket.trackingCode} با رضایت ${actor.fullName} بسته شد.`
        : `تیکت ${ticket.trackingCode} با نارضایتی ${actor.fullName} برای پیگیری مجدد باز شد.`,
      entityType: 'SupportTicket',
      entityId: ticket.id,
    });
    return this.withResolvedAttachments(saved);
  }

  async replyAsStaff(
    actor: AuthenticatedUser,
    id: string,
    dto: ReplySupportTicketDto,
  ) {
    const ticket = await this.getAccessibleTicket(actor, id);
    if (ticket.status === SupportTicketStatus.CLOSED) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'این تیکت بسته شده و امکان ارسال پاسخ جدید ندارد.',
      });
    }
    await this.assertOwnedAttachments(actor, dto.attachmentIds);
    this.appendMessage(ticket, {
      body: dto.body.trim(),
      senderType: 'STAFF',
      senderLabel: actor.fullName,
      attachmentIds: dto.attachmentIds ?? [],
    });
    ticket.status = SupportTicketStatus.ANSWERED;
    ticket.updatedAt = new Date();
    await this.ticketRepo.save(ticket);
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'SYSTEM',
      action: 'پاسخ پشتیبانی به تیکت',
      detail: `پاسخ پشتیبانی در تیکت ${ticket.trackingCode} توسط ${actor.fullName} ثبت شد.`,
      entityType: 'SupportTicket',
      entityId: ticket.id,
    });
    return this.withResolvedAttachments(await this.getOrThrow(id));
  }

  private appendMessage(
    ticket: SupportTicket,
    message: {
      body: string;
      senderType: 'REQUESTER' | 'STAFF';
      senderLabel: string;
      attachmentIds: string[];
    },
  ) {
    const history = Array.isArray(ticket.history)
      ? [...(ticket.history as unknown[])]
      : [];
    history.push({
      step: 'message',
      labelFa:
        message.senderType === 'STAFF' ? 'پاسخ پشتیبانی' : 'پاسخ درخواست‌کننده',
      at: new Date().toISOString(),
      ...message,
    });
    ticket.history = history as JsonValue;
  }

  async list(
    actor: AuthenticatedUser,
    filters: {
      status?: SupportTicketStatus;
      dept?: 'SITE' | 'AGENCY';
    },
  ) {
    const tickets = await this.ticketRepo.find({
      where: {
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.dept ? { dept: filters.dept } : {}),
        ...(!actor.isSuperAdmin && actor.role !== 'SITE_ADMIN'
          ? { forwardedToId: actor.id }
          : {}),
      },
      relations: { forwardedTo: true },
      order: { createdAt: 'DESC' },
    });
    return Promise.all(
      tickets.map((ticket) => this.withResolvedAttachments(ticket)),
    );
  }

  private async getOrThrow(id: string) {
    const ticket = await this.ticketRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.forwardedTo', 'forwardedTo')
      .where('t.id = :id', { id })
      .getOne();
    if (!ticket) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'تیکت یافت نشد.',
      });
    }
    return ticket;
  }

  private async getAccessibleTicket(actor: AuthenticatedUser, id: string) {
    const ticket = await this.getOrThrow(id);
    if (
      !actor.isSuperAdmin &&
      actor.role !== 'SITE_ADMIN' &&
      ticket.forwardedToId !== actor.id
    ) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'تیکت یافت نشد.',
      });
    }
    return ticket;
  }

  async detail(actor: AuthenticatedUser, id: string) {
    return this.withResolvedAttachments(
      await this.getAccessibleTicket(actor, id),
    );
  }

  /** Forwarding-target picker, scoped to this ticket system rather than
   * widening StaffDirectoryController's own EXEC_ROLES-only endpoint (see
   * docs/API.md's Phase 20 note). */
  async forwardTargets(actor: AuthenticatedUser) {
    return this.staffDirectory.list(actor.id);
  }

  async forward(actor: AuthenticatedUser, id: string, targetUserId: string) {
    const ticket = await this.getAccessibleTicket(actor, id);
    const targets = await this.staffDirectory.list(actor.id);
    const target = targets.find((t) => t.id === targetUserId);
    if (!target) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'کارمند مقصد ارجاع معتبر نیست.',
      });
    }

    const history = Array.isArray(ticket.history)
      ? [...(ticket.history as unknown[])]
      : [];
    history.push({
      step: 'forwarded',
      labelFa: `ارجاع به ${target.fullName} (${target.roleLabelFa}) توسط ${actor.fullName}`,
      at: new Date().toISOString(),
    });

    ticket.forwardedToId = targetUserId;
    ticket.status =
      ticket.status === SupportTicketStatus.OPEN
        ? SupportTicketStatus.IN_PROGRESS
        : ticket.status;
    ticket.history = history as JsonValue;
    ticket.updatedAt = new Date();
    await this.ticketRepo.save(ticket);
    const updated = await this.getOrThrow(id);

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'SYSTEM',
      action: 'ارجاع تیکت پشتیبانی',
      detail: `تیکت «${ticket.subject}» توسط ${actor.fullName} به ${target.fullName} ارجاع شد.`,
      entityType: 'SupportTicket',
      entityId: id,
    });

    return updated;
  }

  async updateStatus(
    actor: AuthenticatedUser,
    id: string,
    status: SupportTicketStatus,
  ) {
    const ticket = await this.getAccessibleTicket(actor, id);

    const history = Array.isArray(ticket.history)
      ? [...(ticket.history as unknown[])]
      : [];
    history.push({
      step: status.toLowerCase(),
      labelFa: `تغییر وضعیت به «${status}» توسط ${actor.fullName}`,
      at: new Date().toISOString(),
    });

    ticket.status = status;
    ticket.history = history as JsonValue;
    ticket.updatedAt = new Date();
    await this.ticketRepo.save(ticket);
    const updated = await this.getOrThrow(id);

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'SYSTEM',
      action: 'تغییر وضعیت تیکت پشتیبانی',
      detail: `وضعیت تیکت «${ticket.subject}» توسط ${actor.fullName} به «${status}» تغییر کرد.`,
      entityType: 'SupportTicket',
      entityId: id,
    });

    return updated;
  }
}
