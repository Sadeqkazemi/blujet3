import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StoredFile } from '../../database/entities/stored-file.entity';
import { ManagerReferral } from '../../database/entities/manager-referral.entity';
import { ManagerReferralReport } from '../../database/entities/manager-referral-report.entity';
import { ManagerMessage } from '../../database/entities/manager-message.entity';
import { CartableTask } from '../../database/entities/cartable-task.entity';
import { SupportTicket } from '../../database/entities/support-ticket.entity';
import { AgencyMessage } from '../../database/entities/agency-message.entity';
import { CartableSourceType } from '../../database/enums';
import { AuditService } from '../audit/audit.service';
import { ErrorCode } from '../../common/errors';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { STAFF_ROLES } from '../../common/exec-roles';

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
];
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

const UPLOAD_DIR =
  process.env.UPLOAD_DIR ?? path.join(process.cwd(), 'uploads');

@Injectable()
export class FilesService {
  constructor(
    @InjectRepository(StoredFile)
    private readonly storedFileRepo: Repository<StoredFile>,
    @InjectRepository(ManagerReferral)
    private readonly referralRepo: Repository<ManagerReferral>,
    @InjectRepository(ManagerReferralReport)
    private readonly reportRepo: Repository<ManagerReferralReport>,
    @InjectRepository(ManagerMessage)
    private readonly messageRepo: Repository<ManagerMessage>,
    @InjectRepository(CartableTask)
    private readonly cartableTaskRepo: Repository<CartableTask>,
    @InjectRepository(SupportTicket)
    private readonly supportTicketRepo: Repository<SupportTicket>,
    @InjectRepository(AgencyMessage)
    private readonly agencyMessageRepo: Repository<AgencyMessage>,
    private readonly audit: AuditService,
  ) {}

  async store(actor: AuthenticatedUser, file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'فایلی ارسال نشده است.',
      });
    }
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'فقط PDF یا تصویر (PNG/JPG) مجاز است.',
      });
    }
    if (file.size > MAX_FILE_BYTES) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'حداکثر حجم مجاز فایل ۵ مگابایت است.',
      });
    }

    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    const ext =
      file.mimetype === 'application/pdf'
        ? '.pdf'
        : file.mimetype === 'image/png'
          ? '.png'
          : '.jpg';
    const diskName = `${crypto.randomUUID()}${ext}`;
    const diskPath = path.join(UPLOAD_DIR, diskName);
    fs.writeFileSync(diskPath, file.buffer);

    // multer/busboy decode multipart header bytes as latin1 by default —
    // browsers send the raw UTF-8 bytes for non-ASCII filenames (e.g.
    // Persian), so re-decoding here is required or they come out as
    // mojibake. A no-op for pure-ASCII names.
    const fileName = Buffer.from(file.originalname, 'latin1').toString('utf8');

    const stored = await this.storedFileRepo.save(
      this.storedFileRepo.create({
        ownerId: actor.id,
        fileName,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        path: diskPath,
      }),
    );
    return {
      id: stored.id,
      fileName: stored.fileName,
      sizeBytes: stored.sizeBytes,
    };
  }

  /** Owner always may read; otherwise the caller must be a participant of a
   * referral/message the file is attached to (sender, recipient, or the
   * assignee of a cartable task the message materialized into). */
  private async canRead(
    actor: AuthenticatedUser,
    fileId: string,
    ownerId: string,
  ): Promise<boolean> {
    if (ownerId === actor.id) return true;

    // Postgres jsonb "contains" (@>) — replaces Prisma's array_contains
    // filter, which has no direct TypeORM find-options equivalent.
    const fileIdJson = JSON.stringify([fileId]);

    const referrals = await this.referralRepo
      .createQueryBuilder('referral')
      .leftJoinAndSelect('referral.recipients', 'recipients')
      .where('referral.attachments @> :fileIdJson::jsonb', { fileIdJson })
      .getMany();
    for (const r of referrals) {
      if (
        r.fromId === actor.id ||
        r.recipients.some((x) => x.recipientId === actor.id)
      )
        return true;
    }

    const reports = await this.reportRepo
      .createQueryBuilder('report')
      .leftJoinAndSelect('report.referral', 'referral')
      .leftJoinAndSelect('referral.recipients', 'recipients')
      .where('report.attachments @> :fileIdJson::jsonb', { fileIdJson })
      .getMany();
    for (const rep of reports) {
      if (
        rep.fromId === actor.id ||
        rep.referral.fromId === actor.id ||
        rep.referral.recipients.some((x) => x.recipientId === actor.id)
      )
        return true;
    }

    const messages = await this.messageRepo
      .createQueryBuilder('message')
      .select(['message.id', 'message.fromId'])
      .where('message.attachments @> :fileIdJson::jsonb', { fileIdJson })
      .getMany();
    for (const m of messages) {
      if (m.fromId === actor.id) return true;
      const delivered = await this.cartableTaskRepo.count({
        where: {
          sourceType: CartableSourceType.MANAGER_MESSAGE,
          sourceId: m.id,
          assigneeId: actor.id,
        },
      });
      if (delivered > 0) return true;
    }

    const directTask = await this.cartableTaskRepo
      .createQueryBuilder('task')
      .where('task.attachments @> :fileIdJson::jsonb', { fileIdJson })
      .andWhere(
        '(task."senderId" = :actorId OR task."assigneeId" = :actorId)',
        {
          actorId: actor.id,
        },
      )
      .getOne();
    if (directTask) return true;

    const supportTicket = await this.supportTicketRepo
      .createQueryBuilder('ticket')
      .select(['ticket.id', 'ticket.userId', 'ticket.forwardedToId'])
      .where('ticket.attachments @> :fileIdJson::jsonb', { fileIdJson })
      .getOne();
    if (
      supportTicket &&
      (supportTicket.userId === actor.id ||
        supportTicket.forwardedToId === actor.id ||
        actor.role === 'SITE_ADMIN')
    )
      return true;

    const agencyMessage = await this.agencyMessageRepo
      .createQueryBuilder('message')
      .where('message.attachments @> :fileIdJson::jsonb', { fileIdJson })
      .getOne();
    if (
      agencyMessage &&
      (agencyMessage.senderId === actor.id ||
        agencyMessage.agencyId === actor.id ||
        STAFF_ROLES.some((role) => role === actor.role))
    )
      return true;

    return false;
  }

  async read(actor: AuthenticatedUser, id: string) {
    const stored = await this.storedFileRepo.findOne({ where: { id } });
    if (!stored) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'فایل یافت نشد.',
      });
    }
    if (!(await this.canRead(actor, id, stored.ownerId))) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'دسترسی به این فایل برای شما مجاز نیست.',
      });
    }
    if (!fs.existsSync(stored.path)) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'محتوای فایل در دسترس نیست.',
      });
    }
    return { stored, stream: fs.createReadStream(stored.path) };
  }

  /** Owner-only delete — stricter than read()'s participant access, since
   * this permanently removes the underlying content. Deletes the DB row
   * first (source of truth), then best-effort removes the on-disk file —
   * `force: true` tolerates the file already being gone, so a retried call
   * (or a call after manual disk cleanup) never throws. A second delete of
   * the same id 404s (the row is gone), which is standard, safe idempotent
   * DELETE behavior: the end state after N calls is identical to after 1.
   * Any FK referencing this file with `ON DELETE SET NULL` (e.g.
   * JobPosting.imageFileId) is cleared by Postgres itself. */
  async delete(actor: AuthenticatedUser, id: string) {
    const stored = await this.storedFileRepo.findOne({ where: { id } });
    if (!stored) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'فایل یافت نشد.',
      });
    }
    if (stored.ownerId !== actor.id) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'فقط مالک فایل مجاز به حذف آن است.',
      });
    }

    await this.storedFileRepo.delete({ id });
    fs.rmSync(stored.path, { force: true });

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'CONTENT',
      action: 'حذف پیوست',
      detail: `${actor.fullName} پیوست «${stored.fileName}» را حذف کرد.`,
      entityType: 'StoredFile',
      entityId: id,
    });

    return { id };
  }
}
