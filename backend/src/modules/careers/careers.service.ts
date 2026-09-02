import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { In, Repository } from 'typeorm';
import { CareersSettings } from '../../database/entities/careers-settings.entity';
import { JobPosting } from '../../database/entities/job-posting.entity';
import { JobApplication } from '../../database/entities/job-application.entity';
import { StoredFile } from '../../database/entities/stored-file.entity';
import { User } from '../../database/entities/user.entity';
import type { JsonValue } from '../../database/json-types';
import { AuditService } from '../audit/audit.service';
import { ErrorCode } from '../../common/errors';
import { JobApplicationStatus } from '../../database/enums';
import { ROLE_LABELS_FA } from '../../common/exec-roles';
import {
  encryptPii,
  hashPii,
  isValidIranianNationalId,
  normalizeNationalId,
  tryDecryptPii,
} from '../../common/pii-crypto';
import type {
  ApplyJobDto,
  CreateJobPostingDto,
  ListApplicationsQueryDto,
  ReferApplicationDto,
  UpdateCareersSettingsDto,
  UpdateJobPostingDto,
} from './dto/careers.dtos';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

export const RESUME_ALLOWED_MIME = 'application/pdf';
export const RESUME_MAX_BYTES = 3 * 1024 * 1024;
const RESUME_DIR = process.env.UPLOAD_DIR
  ? path.join(process.env.UPLOAD_DIR, 'resumes')
  : path.join(process.cwd(), 'uploads', 'resumes');

const REFERRAL_ROLES = ['COMMERCIAL_MANAGER', 'FINANCE_MANAGER'] as const;
const SINGLETON_REFERRAL_ROLES = ['CEO', 'SENIOR_MANAGER'] as const;
const CAN_ACT_STATUSES = ['SUBMITTED', 'REFERRED'] as const;
const MAX_JSON_ENTRIES = 20;

function parseEntries(raw: string | undefined): JsonValue {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, MAX_JSON_ENTRIES) as JsonValue;
  } catch {
    return [];
  }
}

@Injectable()
export class CareersService {
  constructor(
    @InjectRepository(CareersSettings)
    private readonly settingsRepo: Repository<CareersSettings>,
    @InjectRepository(JobPosting)
    private readonly jobPostingRepo: Repository<JobPosting>,
    @InjectRepository(JobApplication)
    private readonly jobApplicationRepo: Repository<JobApplication>,
    @InjectRepository(StoredFile)
    private readonly storedFileRepo: Repository<StoredFile>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly audit: AuditService,
  ) {}

  // ── CareersSettings (footer-visibility toggle) ──────────────────────
  private async getOrCreateSettings() {
    const existing = await this.settingsRepo.findOne({
      where: {},
      order: { createdAt: 'ASC' },
    });
    if (existing) return existing;
    return this.settingsRepo.save(
      this.settingsRepo.create({ updatedAt: new Date() }),
    );
  }

  async getSettings() {
    const s = await this.getOrCreateSettings();
    return { enabled: s.enabled };
  }

  async updateSettings(
    actor: AuthenticatedUser,
    dto: UpdateCareersSettingsDto,
  ) {
    const current = await this.getOrCreateSettings();
    current.enabled = dto.enabled;
    current.updatedAt = new Date();
    const updated = await this.settingsRepo.save(current);
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'CONTENT',
      action: 'تغییر وضعیت انتشار فرصت‌های شغلی',
      detail: `${actor.fullName} انتشار لینک «فرصت‌های شغلی» در فوتر را ${
        dto.enabled ? 'فعال' : 'غیرفعال'
      } کرد.`,
      entityType: 'CareersSettings',
      entityId: updated.id,
    });
    return { enabled: updated.enabled };
  }

  // ── Public job listing ──────────────────────────────────────────────
  private mediaUrl(fileId: string | null): string | null {
    return fileId ? `/careers/media/${fileId}` : null;
  }

  private serializePosting<
    T extends {
      id: string;
      title: string;
      dept: string;
      city: string;
      type: string;
      description: string;
      generalReqs: string[] | null;
      specialReqs: string[] | null;
      active: boolean;
      imageFileId: string | null;
      createdAt: Date;
      updatedAt: Date;
    },
  >(j: T) {
    return {
      id: j.id,
      title: j.title,
      dept: j.dept,
      city: j.city,
      type: j.type,
      description: j.description,
      // Always a real array on the wire — generalReqs/specialReqs are
      // nullable at the DB level (defense-in-depth for hand-written rows),
      // but frontend code (e.g. `job.generalReqs.length`) assumes string[].
      generalReqs: j.generalReqs ?? [],
      specialReqs: j.specialReqs ?? [],
      active: j.active,
      imageFileId: j.imageFileId,
      imageUrl: this.mediaUrl(j.imageFileId),
      createdAt: j.createdAt,
      updatedAt: j.updatedAt,
    };
  }

  private async assertImageFile(ownerId: string, fileId: string) {
    const file = await this.storedFileRepo.findOneBy({ id: fileId, ownerId });
    if (!file || !file.mimeType.startsWith('image/')) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'تصویر آگهی معتبر نیست یا متعلق به شما نیست.',
      });
    }
  }

  async listActiveJobs() {
    const jobs = await this.jobPostingRepo.find({
      where: { active: true },
      order: { createdAt: 'DESC' },
    });
    return jobs.map((j) => ({
      id: j.id,
      title: j.title,
      dept: j.dept,
      city: j.city,
      type: j.type,
      description: j.description,
      imageFileId: j.imageFileId,
      imageUrl: this.mediaUrl(j.imageFileId),
    }));
  }

  async getPublicJob(id: string) {
    const job = await this.jobPostingRepo.findOneBy({ id });
    if (!job || !job.active) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'این فرصت شغلی یافت نشد یا دیگر فعال نیست.',
      });
    }
    return {
      id: job.id,
      title: job.title,
      dept: job.dept,
      city: job.city,
      type: job.type,
      description: job.description,
      generalReqs: job.generalReqs ?? [],
      specialReqs: job.specialReqs ?? [],
      imageFileId: job.imageFileId,
      imageUrl: this.mediaUrl(job.imageFileId),
    };
  }

  async readPublicMedia(fileId: string) {
    const file = await this.storedFileRepo.findOneBy({ id: fileId });
    if (!file || !fs.existsSync(file.path)) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'تصویر یافت نشد.',
      });
    }
    const linked = await this.jobPostingRepo.countBy({ imageFileId: fileId });
    if (linked === 0) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'تصویر یافت نشد.',
      });
    }
    return {
      mimeType: file.mimeType,
      fileName: file.fileName,
      stream: fs.createReadStream(file.path),
    };
  }

  // ── SITE_ADMIN: job-posting CRUD ─────────────────────────────────────
  async listAllPostings() {
    const rows = await this.jobPostingRepo.find({
      order: { createdAt: 'DESC' },
    });
    return rows.map((j) => this.serializePosting(j));
  }

  async createPosting(actor: AuthenticatedUser, dto: CreateJobPostingDto) {
    if (dto.imageFileId) {
      await this.assertImageFile(actor.id, dto.imageFileId);
    }
    const posting = await this.jobPostingRepo.save(
      this.jobPostingRepo.create({
        title: dto.title,
        dept: dto.dept,
        city: dto.city,
        type: dto.type,
        generalReqs: dto.generalReqs,
        specialReqs: dto.specialReqs,
        description: dto.description ?? '',
        imageFileId: dto.imageFileId ?? null,
        updatedAt: new Date(),
      }),
    );
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'CONTENT',
      action: 'ایجاد فرصت شغلی',
      detail: `${actor.fullName} فرصت شغلی «${posting.title}» را ایجاد کرد.`,
      entityType: 'JobPosting',
      entityId: posting.id,
    });
    return this.serializePosting(posting);
  }

  async updatePosting(
    actor: AuthenticatedUser,
    id: string,
    dto: UpdateJobPostingDto,
  ) {
    const existing = await this.jobPostingRepo.findOneBy({ id });
    if (!existing) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'فرصت شغلی یافت نشد.',
      });
    }
    if (dto.imageFileId) {
      await this.assertImageFile(actor.id, dto.imageFileId);
    }
    Object.assign(existing, dto, { updatedAt: new Date() });
    const updated = await this.jobPostingRepo.save(existing);
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'CONTENT',
      action: 'ویرایش فرصت شغلی',
      detail: `${actor.fullName} فرصت شغلی «${updated.title}» را ویرایش کرد.`,
      entityType: 'JobPosting',
      entityId: updated.id,
    });
    return this.serializePosting(updated);
  }

  // ── Public application submission ───────────────────────────────────
  private writeResume(file: Express.Multer.File): {
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    path: string;
  } {
    fs.mkdirSync(RESUME_DIR, { recursive: true });
    const diskName = `${crypto.randomUUID()}.pdf`;
    const diskPath = path.join(RESUME_DIR, diskName);
    fs.writeFileSync(diskPath, file.buffer);
    const fileName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    return {
      fileName,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      path: diskPath,
    };
  }

  async apply(
    jobId: string,
    dto: ApplyJobDto,
    file: Express.Multer.File | undefined,
  ) {
    const job = await this.jobPostingRepo.findOneBy({ id: jobId });
    if (!job || !job.active) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'این فرصت شغلی یافت نشد یا دیگر فعال نیست.',
      });
    }

    if (file) {
      if (file.mimetype !== RESUME_ALLOWED_MIME) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_FAILED,
          message: 'فقط فایل PDF برای رزومه مجاز است.',
        });
      }
      if (file.size > RESUME_MAX_BYTES) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_FAILED,
          message: 'حداکثر حجم مجاز فایل رزومه ۳ مگابایت است.',
        });
      }
    }

    const nationalId = normalizeNationalId(dto.nationalId);
    if (!isValidIranianNationalId(nationalId)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'کد ملی معتبر نیست.',
      });
    }

    const resume = file ? this.writeResume(file) : null;

    const application = await this.jobApplicationRepo.save(
      this.jobApplicationRepo.create({
        jobPostingId: job.id,
        jobTitleSnapshot: job.title,
        firstName: dto.firstName,
        lastName: dto.lastName,
        nationalIdEnc: encryptPii(nationalId),
        nationalIdHash: hashPii(nationalId),
        fatherName: dto.fatherName,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
        birthProvince: dto.birthProvince,
        birthCity: dto.birthCity,
        gender: dto.gender,
        marital: dto.marital,
        military: dto.military,
        exemptionType: dto.exemptionType,
        phone: dto.phone,
        email: dto.email,
        residenceProvince: dto.residenceProvince,
        residenceAddress: dto.residenceAddress,
        eduEntries: parseEntries(dto.eduEntries),
        workEntries: parseEntries(dto.workEntries),
        langEntries: parseEntries(dto.langEntries),
        skills: dto.skills,
        otherLangs: dto.otherLangs,
        resumeFileName: resume?.fileName,
        resumeMimeType: resume?.mimeType,
        resumeSizeBytes: resume?.sizeBytes,
        resumePath: resume?.path,
        history: [
          {
            step: 'submitted',
            label: 'ثبت درخواست توسط متقاضی',
            at: new Date().toISOString(),
          },
        ],
      }),
    );
    return { id: application.id };
  }

  // ── SITE_ADMIN: application review ──────────────────────────────────
  private async referralTargets() {
    const staff = await this.userRepo.find({
      where: { role: In([...REFERRAL_ROLES]), isActive: true },
      select: { id: true, fullName: true, role: true },
    });
    const singletons = await this.userRepo.find({
      where: { role: In([...SINGLETON_REFERRAL_ROLES]), isActive: true },
      select: { id: true, fullName: true, role: true },
    });
    return [...staff, ...singletons].map((u) => ({
      id: u.id,
      labelFa: `${u.fullName} (${ROLE_LABELS_FA[u.role]})`,
    }));
  }

  private applicationQuery() {
    return this.jobApplicationRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.assignee', 'assignee');
  }

  async listApplications(query: ListApplicationsQueryDto) {
    const qb = this.applicationQuery().orderBy('a.createdAt', 'DESC');
    if (query.jobTitle) {
      qb.andWhere('a.jobTitleSnapshot = :jobTitle', {
        jobTitle: query.jobTitle,
      });
    }
    const rows = await qb.getMany();

    const q = query.q?.trim().toLowerCase();
    const filtered = q
      ? rows.filter((a) => {
          const nid = tryDecryptPii(a.nationalIdEnc) ?? '';
          const hay =
            `${a.firstName} ${a.lastName} ${nid} ${a.phone} ${a.email ?? ''}`.toLowerCase();
          return hay.includes(q);
        })
      : rows;

    return filtered.map((a) => ({
      id: a.id,
      name: `${a.firstName} ${a.lastName}`,
      jobTitle: a.jobTitleSnapshot,
      nationalId: tryDecryptPii(a.nationalIdEnc),
      phone: a.phone,
      email: a.email,
      at: a.createdAt,
      status: a.status,
      hasResume: !!a.resumeFileName,
      eduCount: Array.isArray(a.eduEntries) ? a.eduEntries.length : 0,
      workCount: Array.isArray(a.workEntries) ? a.workEntries.length : 0,
      assigneeLabelFa: a.assignee?.fullName ?? null,
    }));
  }

  async getApplicationDetail(id: string) {
    const a = await this.applicationQuery()
      .where('a.id = :id', { id })
      .getOne();
    if (!a) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'درخواست استخدام یافت نشد.',
      });
    }
    return {
      id: a.id,
      name: `${a.firstName} ${a.lastName}`,
      jobTitle: a.jobTitleSnapshot,
      nationalId: tryDecryptPii(a.nationalIdEnc),
      fatherName: a.fatherName,
      birthDate: a.birthDate,
      phone: a.phone,
      email: a.email,
      residenceAddress: a.residenceAddress,
      gender: a.gender,
      military: a.military,
      exemptionType: a.exemptionType,
      skills: a.skills,
      eduEntries: a.eduEntries,
      workEntries: a.workEntries,
      langEntries: a.langEntries,
      hasResume: !!a.resumeFileName,
      resumeFileName: a.resumeFileName,
      status: a.status,
      canAct: (CAN_ACT_STATUSES as readonly string[]).includes(a.status),
      history: a.history,
      referralTargets: await this.referralTargets(),
    };
  }

  async getResume(id: string) {
    const a = await this.jobApplicationRepo
      .createQueryBuilder('a')
      .where('a.id = :id', { id })
      .getOne();
    if (!a || !a.resumePath || !fs.existsSync(a.resumePath)) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'رزومه‌ای برای این درخواست ثبت نشده است.',
      });
    }
    return {
      fileName: a.resumeFileName ?? 'resume.pdf',
      mimeType: a.resumeMimeType ?? 'application/pdf',
      stream: fs.createReadStream(a.resumePath),
    };
  }

  private async requireActionable(id: string) {
    const a = await this.jobApplicationRepo
      .createQueryBuilder('a')
      .where('a.id = :id', { id })
      .getOne();
    if (!a) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'درخواست استخدام یافت نشد.',
      });
    }
    if (!(CAN_ACT_STATUSES as readonly string[]).includes(a.status)) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'وضعیت این درخواست دیگر قابل تغییر نیست.',
      });
    }
    return a;
  }

  /** Json fields have no server-side "push" operator (unlike `String[]`
   * scalar-list columns elsewhere in this schema) — the array is read,
   * appended to in JS, and written back whole. */
  private appendHistory(
    existing: unknown,
    step: string,
    label: string,
  ): JsonValue {
    const list: unknown[] = Array.isArray(existing) ? existing : [];
    return [
      ...list,
      { step, label, at: new Date().toISOString() },
    ] as JsonValue;
  }

  async referApplication(
    actor: AuthenticatedUser,
    id: string,
    dto: ReferApplicationDto,
  ) {
    const existing = await this.requireActionable(id);
    const assignee = await this.userRepo.findOneBy({ id: dto.assigneeId });
    if (!assignee) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'گیرندهٔ ارجاع نامعتبر است.',
      });
    }
    existing.status = JobApplicationStatus.REFERRED;
    existing.assigneeId = assignee.id;
    existing.history = this.appendHistory(
      existing.history,
      'referred',
      `ارجاع به ${assignee.fullName} توسط ادمین سایت`,
    );
    const updated = await this.jobApplicationRepo.save(existing);
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'CONTENT',
      action: 'ارجاع درخواست استخدام',
      detail: `${actor.fullName} درخواست «${updated.firstName} ${updated.lastName}» را به ${assignee.fullName} ارجاع داد.`,
      entityType: 'JobApplication',
      entityId: updated.id,
    });
    return { id: updated.id, status: updated.status };
  }

  async hireApplication(actor: AuthenticatedUser, id: string) {
    const existing = await this.requireActionable(id);
    existing.status = JobApplicationStatus.HIRED;
    existing.history = this.appendHistory(
      existing.history,
      'hired',
      'نتیجهٔ استخدام: پذیرفته شد',
    );
    const updated = await this.jobApplicationRepo.save(existing);
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'CONTENT',
      action: 'استخدام متقاضی',
      detail: `${actor.fullName} درخواست «${existing.firstName} ${existing.lastName}» را استخدام کرد.`,
      entityType: 'JobApplication',
      entityId: updated.id,
    });
    return { id: updated.id, status: updated.status };
  }

  async rejectApplication(actor: AuthenticatedUser, id: string) {
    const existing = await this.requireActionable(id);
    existing.status = JobApplicationStatus.REJECTED;
    existing.history = this.appendHistory(
      existing.history,
      'rejected',
      'نتیجهٔ استخدام: رد شد',
    );
    const updated = await this.jobApplicationRepo.save(existing);
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'CONTENT',
      action: 'رد درخواست استخدام',
      detail: `${actor.fullName} درخواست «${existing.firstName} ${existing.lastName}» را رد کرد.`,
      entityType: 'JobApplication',
      entityId: updated.id,
    });
    return { id: updated.id, status: updated.status };
  }
}
