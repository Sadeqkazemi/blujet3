import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as fs from 'node:fs';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { User } from '../../database/entities/user.entity';
import { StoredFile } from '../../database/entities/stored-file.entity';
import { CustomerIdentityVerification } from '../../database/entities/customer-identity-verification.entity';
import { findOneOrThrow } from '../../database/utils/find-one-or-throw';
import { ErrorCode } from '../../common/errors';
import { FilesService } from '../files/files.service';
import { AuditService } from '../audit/audit.service';
import { tryDecryptPii } from '../../common/pii-crypto';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import type { CustomerIdentityStatus } from '../../database/enums';

@Injectable()
export class IdentityVerificationService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(StoredFile)
    private readonly storedFileRepo: Repository<StoredFile>,
    @InjectRepository(CustomerIdentityVerification)
    private readonly civRepo: Repository<CustomerIdentityVerification>,
    private readonly files: FilesService,
    private readonly audit: AuditService,
  ) {}

  private profileIdentityComplete(user: {
    fullName: string;
    nationalIdEnc: string | null;
    birthDate: Date | null;
  }): boolean {
    return Boolean(
      user.fullName?.trim() && user.nationalIdEnc && user.birthDate,
    );
  }

  private async getOrCreateRow(userId: string) {
    const existing = await this.civRepo.findOneBy({ userId });
    if (existing) return existing;
    return this.civRepo.save(
      this.civRepo.create({ userId, updatedAt: new Date() }),
    );
  }

  private shape(
    user: {
      fullName: string;
      nationalIdEnc: string | null;
      birthDate: Date | null;
    },
    row: {
      status: CustomerIdentityStatus;
      idCardFileId: string | null;
      submittedAt: Date | null;
      rejectReason: string | null;
    },
    idCardFile: { id: string; fileName: string; sizeBytes: number } | null,
  ) {
    const profileDone = this.profileIdentityComplete(user);
    const idCardDone = Boolean(row.idCardFileId);
    const steps = [
      {
        key: 'profile' as const,
        done: profileDone,
      },
      {
        key: 'id_card' as const,
        done: idCardDone,
      },
    ];
    const canSubmit =
      profileDone &&
      idCardDone &&
      (row.status === 'NOT_STARTED' || row.status === 'REJECTED');
    const isComplete = row.status === 'APPROVED';

    return {
      status: row.status,
      isComplete,
      canSubmit,
      submittedAt: row.submittedAt,
      rejectReason: row.rejectReason,
      steps,
      idCardFile,
    };
  }

  async getMine(user: AuthenticatedUser) {
    const dbUser = await findOneOrThrow(this.userRepo, {
      where: { id: user.id },
      select: { fullName: true, nationalIdEnc: true, birthDate: true },
    });
    const row = await this.getOrCreateRow(user.id);
    let idCardFile: { id: string; fileName: string; sizeBytes: number } | null =
      null;
    if (row.idCardFileId) {
      const file = await this.storedFileRepo.findOne({
        where: { id: row.idCardFileId },
        select: { id: true, fileName: true, sizeBytes: true, ownerId: true },
      });
      if (file && file.ownerId === user.id) {
        idCardFile = {
          id: file.id,
          fileName: file.fileName,
          sizeBytes: file.sizeBytes,
        };
      }
    }
    return this.shape(dbUser, row, idCardFile);
  }

  async uploadIdCard(user: AuthenticatedUser, file: Express.Multer.File) {
    const row = await this.getOrCreateRow(user.id);
    if (row.status === 'SUBMITTED' || row.status === 'APPROVED') {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'در وضعیت فعلی امکان تغییر مدارک نیست.',
      });
    }
    const stored = await this.files.store(user, file);
    await this.civRepo.update(
      { userId: user.id },
      {
        idCardFileId: stored.id,
        status: row.status === 'REJECTED' ? 'REJECTED' : 'NOT_STARTED',
        updatedAt: new Date(),
      },
    );
    return stored;
  }

  async submit(user: AuthenticatedUser) {
    const dbUser = await findOneOrThrow(this.userRepo, {
      where: { id: user.id },
      select: { fullName: true, nationalIdEnc: true, birthDate: true },
    });
    const row = await this.getOrCreateRow(user.id);
    if (!this.profileIdentityComplete(dbUser)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'ابتدا نام، کد ملی و تاریخ تولد را در پروفایل تکمیل کنید.',
      });
    }
    if (!row.idCardFileId) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'تصویر کارت ملی بارگذاری نشده است.',
      });
    }
    if (row.status === 'SUBMITTED') {
      throw new BadRequestException({
        code: ErrorCode.CONFLICT,
        message: 'درخواست شما قبلاً ثبت شده و در حال بررسی است.',
      });
    }
    if (row.status === 'APPROVED') {
      throw new BadRequestException({
        code: ErrorCode.CONFLICT,
        message: 'احراز هویت شما قبلاً تأیید شده است.',
      });
    }

    await this.civRepo.update(
      { userId: user.id },
      {
        status: 'SUBMITTED',
        submittedAt: new Date(),
        rejectReason: null,
        updatedAt: new Date(),
      },
    );
    return this.getMine(user);
  }

  // ── SITE_ADMIN review queue ─────────────────────────────────────────

  /** NOT_STARTED rows (customer opened the tab but never submitted) are
   * not reviewable — the admin queue only lists submitted/decided ones. */
  async adminList() {
    const rows = await this.civRepo.find({
      where: { status: Not('NOT_STARTED') },
      relations: { user: true },
      select: {
        user: {
          fullName: true,
          phone: true,
          nationalIdEnc: true,
          birthDate: true,
        },
      },
      order: { submittedAt: 'DESC' },
    });
    const fileIds = rows
      .map((r) => r.idCardFileId)
      .filter((id): id is string => Boolean(id));
    const files = fileIds.length
      ? await this.storedFileRepo.find({
          where: { id: In(fileIds) },
          select: { id: true, fileName: true },
        })
      : [];
    const fileNameById = new Map(files.map((f) => [f.id, f.fileName]));

    return rows.map((r) => ({
      id: r.id,
      fullName: r.user.fullName,
      phone: r.user.phone,
      nationalId: tryDecryptPii(r.user.nationalIdEnc),
      birthDate: r.user.birthDate,
      status: r.status,
      submittedAt: r.submittedAt,
      reviewedAt: r.reviewedAt,
      rejectReason: r.rejectReason,
      idCardFileName: r.idCardFileId
        ? (fileNameById.get(r.idCardFileId) ?? null)
        : null,
    }));
  }

  private async adminRequireRow(id: string) {
    const row = await this.civRepo.findOne({
      where: { id },
      relations: { user: true },
      select: { user: { fullName: true, phone: true } },
    });
    if (!row) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'درخواست احراز هویت یافت نشد.',
      });
    }
    return row;
  }

  /** Streams the customer's id-card by verification id after the SITE_ADMIN
   * role guard — a dedicated staff surface like careers' resume download,
   * instead of loosening the general /files ACL for all staff. */
  async adminGetIdCard(id: string) {
    const row = await this.adminRequireRow(id);
    if (!row.idCardFileId) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'برای این درخواست کارت ملی بارگذاری نشده است.',
      });
    }
    const stored = await this.storedFileRepo.findOneBy({
      id: row.idCardFileId,
    });
    if (!stored || !fs.existsSync(stored.path)) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'محتوای فایل در دسترس نیست.',
      });
    }
    return {
      fileName: stored.fileName,
      mimeType: stored.mimeType,
      stream: fs.createReadStream(stored.path),
    };
  }

  private async adminRequireSubmitted(id: string) {
    const row = await this.adminRequireRow(id);
    if (row.status !== 'SUBMITTED') {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'فقط درخواست‌های در انتظار بررسی قابل تأیید یا رد هستند.',
      });
    }
    return row;
  }

  async adminApprove(actor: AuthenticatedUser, id: string) {
    const row = await this.adminRequireSubmitted(id);
    await this.civRepo.update(
      { id },
      {
        status: 'APPROVED',
        reviewedAt: new Date(),
        rejectReason: null,
        updatedAt: new Date(),
      },
    );
    const updated = await findOneOrThrow(this.civRepo, { where: { id } });
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'ACCOUNT',
      action: 'تأیید احراز هویت مشتری',
      detail: `${actor.fullName} احراز هویت «${row.user.fullName}» را تأیید کرد.`,
      entityType: 'CustomerIdentityVerification',
      entityId: updated.id,
    });
    return { id: updated.id, status: updated.status };
  }

  async adminReject(
    actor: AuthenticatedUser,
    id: string,
    rejectReason: string,
  ) {
    const row = await this.adminRequireSubmitted(id);
    await this.civRepo.update(
      { id },
      {
        status: 'REJECTED',
        reviewedAt: new Date(),
        rejectReason,
        updatedAt: new Date(),
      },
    );
    const updated = await findOneOrThrow(this.civRepo, { where: { id } });
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'ACCOUNT',
      action: 'رد احراز هویت مشتری',
      detail: `${actor.fullName} احراز هویت «${row.user.fullName}» را رد کرد: ${rejectReason}`,
      entityType: 'CustomerIdentityVerification',
      entityId: updated.id,
    });
    return { id: updated.id, status: updated.status };
  }
}
