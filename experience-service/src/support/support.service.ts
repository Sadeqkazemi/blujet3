import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'node:crypto';
import { Brackets, In, LessThanOrEqual, Repository } from 'typeorm';
import type { ActorContextDto } from '../common/actor-context.dto';
import type { JsonValue } from '../database/entities/job-application.entity';
import { StoredFile } from '../database/entities/stored-file.entity';
import {
  SupportTicket,
  type SupportStatus,
} from '../database/entities/support-ticket.entity';
import type {
  AdminCreateSupportTicketDto,
  ForwardTargetDto,
  ReplySupportTicketDto,
  SubmitSupportTicketDto,
  SupportFiltersDto,
} from './dto/support.dto';

const STAFF_PHONE_SENTINEL = '09000000000';
const AUTO_CLOSE_MS = 5 * 24 * 60 * 60 * 1000;
const SUPPORT_STAFF_ROLES = new Set([
  'EMPLOYEE',
  'IT_MANAGER',
  'COMMERCIAL_MANAGER',
  'OPERATIONS_MANAGER',
  'FINANCE_MANAGER',
  'SENIOR_MANAGER',
  'CEO',
  'BOARD_CHAIR',
  'SITE_ADMIN',
]);

function trackingCode(): string {
  return `TK${randomBytes(4).toString('hex').toUpperCase()}`;
}

function normalizePhone(value: string): string {
  const digits = value
    .trim()
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/\D/g, '');
  if (digits.startsWith('98') && digits.length === 12)
    return `0${digits.slice(2)}`;
  if (digits.startsWith('9') && digits.length === 10) return `0${digits}`;
  return digits;
}

@Injectable()
export class SupportService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(SupportService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @InjectRepository(SupportTicket)
    private readonly ticketRepo: Repository<SupportTicket>,
    @InjectRepository(StoredFile)
    private readonly fileRepo: Repository<StoredFile>,
  ) {}

  onApplicationBootstrap(): void {
    void this.autoClose().catch((error: unknown) =>
      this.logger.error('Support lifecycle sweep failed', error),
    );
    this.timer = setInterval(
      () => {
        void this.autoClose().catch((error: unknown) =>
          this.logger.error('Support lifecycle sweep failed', error),
        );
      },
      60 * 60 * 1000,
    );
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async autoClose(now = new Date()): Promise<number> {
    const rows = await this.ticketRepo.find({
      where: {
        status: 'ANSWERED',
        updatedAt: LessThanOrEqual(new Date(now.getTime() - AUTO_CLOSE_MS)),
      },
    });
    for (const row of rows) {
      this.appendHistory(row, {
        step: 'auto_closed',
        labelFa: 'بستن خودکار پس از ۵ روز بدون پاسخ درخواست‌کننده',
        at: now.toISOString(),
      });
      row.status = 'CLOSED';
      row.updatedAt = now;
      await this.ticketRepo.save(row);
    }
    return rows.length;
  }

  async submit(dto: SubmitSupportTicketDto) {
    const row = await this.ticketRepo.save(
      this.ticketRepo.create({
        trackingCode: trackingCode(),
        requesterName: dto.requesterName,
        requesterPhone: normalizePhone(dto.requesterPhone),
        subject: dto.subject,
        body: dto.body,
        userId: null,
        dept: 'SITE',
        priority: 'MEDIUM',
        status: 'OPEN',
        forwardedToId: null,
        forwardedToName: null,
        attachments: [],
        history: [
          {
            step: 'submitted',
            labelFa: 'ثبت تیکت توسط کاربر',
            at: new Date().toISOString(),
          },
        ],
        updatedAt: new Date(),
      }),
    );
    return { id: row.id, trackingCode: row.trackingCode };
  }

  async createAdmin(actor: ActorContextDto, dto: AdminCreateSupportTicketDto) {
    this.assertSiteAdmin(actor);
    await this.assertAttachments(actor.id, dto.attachmentIds);
    const row = await this.ticketRepo.save(
      this.ticketRepo.create({
        trackingCode: trackingCode(),
        requesterName: dto.requesterName,
        requesterPhone: dto.requesterPhone
          ? normalizePhone(dto.requesterPhone)
          : STAFF_PHONE_SENTINEL,
        subject: dto.subject,
        body: dto.body,
        userId: null,
        dept: dto.dept,
        priority: dto.priority,
        status: 'OPEN',
        forwardedToId: null,
        forwardedToName: null,
        attachments: dto.attachmentIds ?? [],
        history: [
          {
            step: 'submitted',
            labelFa: `ثبت تیکت توسط ${actor.fullName} (ادمین سایت)`,
            at: new Date().toISOString(),
          },
        ],
        updatedAt: new Date(),
      }),
    );
    return this.serialize(row, true);
  }

  async submitForUser(actor: ActorContextDto, dto: SubmitSupportTicketDto) {
    await this.assertAttachments(actor.id, dto.attachmentIds);
    const row = await this.ticketRepo.save(
      this.ticketRepo.create({
        trackingCode: trackingCode(),
        requesterName: dto.requesterName,
        requesterPhone: normalizePhone(dto.requesterPhone),
        subject: dto.subject,
        body: dto.body,
        userId: actor.id,
        dept: actor.role === 'AGENCY' ? 'AGENCY' : 'SITE',
        priority: 'MEDIUM',
        status: 'OPEN',
        forwardedToId: null,
        forwardedToName: null,
        attachments: dto.attachmentIds ?? [],
        history: [
          {
            step: 'submitted',
            labelFa:
              actor.role === 'AGENCY'
                ? 'ثبت تیکت توسط آژانس'
                : 'ثبت تیکت توسط کاربر',
            at: new Date().toISOString(),
          },
        ],
        updatedAt: new Date(),
      }),
    );
    return { id: row.id, trackingCode: row.trackingCode };
  }

  async listMine(actor: ActorContextDto, callerPhone?: string) {
    const query = this.ticketRepo.createQueryBuilder('ticket');
    query.where('ticket."userId" = :userId', { userId: actor.id });
    if (callerPhone) {
      query.orWhere(
        '(ticket."userId" IS NULL AND ticket."requesterPhone" = :phone)',
        { phone: normalizePhone(callerPhone) },
      );
    }
    const rows = await query.orderBy('ticket.createdAt', 'DESC').getMany();
    return Promise.all(rows.map((row) => this.serialize(row, false)));
  }

  async getMine(actor: ActorContextDto, id: string, callerPhone?: string) {
    return this.serialize(await this.owned(actor, id, callerPhone), false);
  }

  async replyMine(
    actor: ActorContextDto,
    id: string,
    dto: ReplySupportTicketDto,
    callerPhone?: string,
  ) {
    const row = await this.owned(actor, id, callerPhone);
    this.assertOpen(row);
    await this.assertAttachments(actor.id, dto.attachmentIds);
    this.appendMessage(row, dto, 'REQUESTER', actor.fullName);
    row.status = 'OPEN';
    row.updatedAt = new Date();
    return this.serialize(await this.ticketRepo.save(row), false);
  }

  async feedback(
    actor: ActorContextDto,
    id: string,
    satisfied: boolean,
    callerPhone?: string,
  ) {
    const row = await this.owned(actor, id, callerPhone);
    if (row.status !== 'ANSWERED') {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'ثبت رضایت فقط پس از پاسخ پشتیبانی امکان‌پذیر است.',
      });
    }
    this.appendHistory(row, {
      step: satisfied ? 'satisfied' : 'dissatisfied',
      labelFa: satisfied
        ? 'تأیید رضایت و بستن تیکت توسط درخواست‌کننده'
        : 'ثبت نارضایتی و بازگشایی تیکت توسط درخواست‌کننده',
      at: new Date().toISOString(),
    });
    row.status = satisfied ? 'CLOSED' : 'OPEN';
    row.updatedAt = new Date();
    return this.serialize(await this.ticketRepo.save(row), false);
  }

  async list(actor: ActorContextDto, filters: SupportFiltersDto) {
    this.assertSupportStaff(actor);
    const rows = await this.ticketRepo.find({
      where: {
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.dept ? { dept: filters.dept } : {}),
        ...(!actor.isSuperAdmin && actor.role !== 'SITE_ADMIN'
          ? { forwardedToId: actor.id }
          : {}),
      },
      order: { createdAt: 'DESC' },
    });
    return Promise.all(rows.map((row) => this.serialize(row, true)));
  }

  async detail(actor: ActorContextDto, id: string) {
    return this.serialize(await this.accessible(actor, id), true);
  }

  async replyStaff(
    actor: ActorContextDto,
    id: string,
    dto: ReplySupportTicketDto,
  ) {
    const row = await this.accessible(actor, id);
    this.assertOpen(row);
    await this.assertAttachments(actor.id, dto.attachmentIds);
    this.appendMessage(row, dto, 'STAFF', actor.fullName);
    row.status = 'ANSWERED';
    row.updatedAt = new Date();
    return this.serialize(await this.ticketRepo.save(row), true);
  }

  async forward(actor: ActorContextDto, id: string, target: ForwardTargetDto) {
    this.assertSiteAdmin(actor);
    const row = await this.accessible(actor, id);
    row.forwardedToId = target.id;
    row.forwardedToName = target.fullName;
    if (row.status === 'OPEN') row.status = 'IN_PROGRESS';
    this.appendHistory(row, {
      step: 'forwarded',
      labelFa: `ارجاع به ${target.fullName} (${target.roleLabelFa}) توسط ${actor.fullName}`,
      at: new Date().toISOString(),
    });
    row.updatedAt = new Date();
    return this.serialize(await this.ticketRepo.save(row), true);
  }

  async updateStatus(
    actor: ActorContextDto,
    id: string,
    status: SupportStatus,
  ) {
    this.assertSiteAdmin(actor);
    const row = await this.accessible(actor, id);
    row.status = status;
    this.appendHistory(row, {
      step: status.toLowerCase(),
      labelFa: `تغییر وضعیت به «${status}» توسط ${actor.fullName}`,
      at: new Date().toISOString(),
    });
    row.updatedAt = new Date();
    return this.serialize(await this.ticketRepo.save(row), true);
  }

  private async owned(
    actor: ActorContextDto,
    id: string,
    callerPhone?: string,
  ): Promise<SupportTicket> {
    const query = this.ticketRepo
      .createQueryBuilder('ticket')
      .where('ticket.id = :id', { id })
      .andWhere(
        new Brackets((scope) => {
          scope.where('ticket."userId" = :userId', { userId: actor.id });
          if (callerPhone) {
            scope.orWhere(
              '(ticket."userId" IS NULL AND ticket."requesterPhone" = :phone)',
              { phone: normalizePhone(callerPhone) },
            );
          }
        }),
      );
    const row = await query.getOne();
    if (!row) this.notFound();
    return row;
  }

  private async accessible(
    actor: ActorContextDto,
    id: string,
  ): Promise<SupportTicket> {
    this.assertSupportStaff(actor);
    const row = await this.ticketRepo
      .createQueryBuilder('ticket')
      .where('ticket.id = :id', { id })
      .getOne();
    if (
      !row ||
      (!actor.isSuperAdmin &&
        actor.role !== 'SITE_ADMIN' &&
        row.forwardedToId !== actor.id)
    ) {
      this.notFound();
    }
    return row;
  }

  private async assertAttachments(
    actorId: string,
    attachmentIds?: string[],
  ): Promise<void> {
    if (!attachmentIds?.length) return;
    const count = await this.fileRepo.count({
      where: { id: In(attachmentIds), ownerId: actorId },
    });
    if (count !== attachmentIds.length) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'فایل پیوست معتبر نیست.',
      });
    }
  }

  private async serialize(
    row: SupportTicket,
    includePhone: boolean,
  ): Promise<Record<string, unknown>> {
    const history = Array.isArray(row.history) ? row.history : [];
    const messageIds = history.flatMap((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry))
        return [];
      const ids = (entry as { attachmentIds?: unknown }).attachmentIds;
      return Array.isArray(ids)
        ? ids.filter((id): id is string => typeof id === 'string')
        : [];
    });
    const initialIds = Array.isArray(row.attachments) ? row.attachments : [];
    const files =
      initialIds.length + messageIds.length > 0
        ? await this.fileRepo.find({
            where: { id: In([...initialIds, ...messageIds]) },
            select: {
              id: true,
              fileName: true,
              mimeType: true,
              sizeBytes: true,
            },
          })
        : [];
    const byId = new Map(files.map((file) => [file.id, file]));
    const attachments = initialIds
      .map((id) => byId.get(id))
      .filter((file): file is StoredFile => Boolean(file));
    const conversation = [
      {
        id: 'initial',
        body: row.body,
        senderType: 'REQUESTER',
        senderLabel: row.requesterName,
        createdAt: row.createdAt.toISOString(),
        attachments,
      },
      ...history.flatMap((entry, index) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry))
          return [];
        const message = entry as Record<string, unknown>;
        if (message.step !== 'message' || typeof message.body !== 'string') {
          return [];
        }
        const ids = Array.isArray(message.attachmentIds)
          ? message.attachmentIds.filter(
              (id): id is string => typeof id === 'string',
            )
          : [];
        return [
          {
            id: `message-${index}`,
            body: message.body,
            senderType: message.senderType === 'STAFF' ? 'STAFF' : 'REQUESTER',
            senderLabel:
              typeof message.senderLabel === 'string'
                ? message.senderLabel
                : 'پشتیبانی blujet',
            createdAt: typeof message.at === 'string' ? message.at : '',
            attachments: ids
              .map((id) => byId.get(id))
              .filter((file): file is StoredFile => Boolean(file)),
          },
        ];
      }),
    ];
    return {
      id: row.id,
      trackingCode: row.trackingCode,
      subject: row.subject,
      body: row.body,
      requesterName: row.requesterName,
      ...(includePhone ? { requesterPhone: row.requesterPhone } : {}),
      userId: row.userId,
      dept: row.dept,
      priority: row.priority,
      status: row.status,
      forwardedToId: row.forwardedToId,
      forwardedTo: row.forwardedToId
        ? { id: row.forwardedToId, fullName: row.forwardedToName }
        : null,
      history: row.history,
      attachments,
      conversation,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private appendMessage(
    row: SupportTicket,
    dto: ReplySupportTicketDto,
    senderType: 'REQUESTER' | 'STAFF',
    senderLabel: string,
  ): void {
    this.appendHistory(row, {
      step: 'message',
      labelFa: senderType === 'STAFF' ? 'پاسخ پشتیبانی' : 'پاسخ درخواست‌کننده',
      at: new Date().toISOString(),
      body: dto.body.trim(),
      senderType,
      senderLabel,
      attachmentIds: dto.attachmentIds ?? [],
    });
  }

  private appendHistory(
    row: SupportTicket,
    entry: Record<string, JsonValue>,
  ): void {
    const history = Array.isArray(row.history) ? row.history : [];
    row.history = [...history, entry];
  }

  private assertOpen(row: SupportTicket): void {
    if (row.status === 'CLOSED') {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'این تیکت بسته شده و امکان ارسال پاسخ جدید ندارد.',
      });
    }
  }

  private assertSiteAdmin(actor: ActorContextDto): void {
    if (actor.role !== 'SITE_ADMIN' && !actor.isSuperAdmin) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'دسترسی به مدیریت تیکت‌ها مجاز نیست.',
      });
    }
  }

  private assertSupportStaff(actor: ActorContextDto): void {
    if (!actor.isSuperAdmin && !SUPPORT_STAFF_ROLES.has(actor.role)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'دسترسی به مدیریت تیکت‌ها مجاز نیست.',
      });
    }
  }

  private notFound(): never {
    throw new NotFoundException({
      code: 'NOT_FOUND',
      message: 'تیکت یافت نشد.',
    });
  }
}
