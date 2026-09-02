import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import type { ActorContextDto } from '../common/actor-context.dto';
import {
  encryptPii,
  hashPii,
  isValidIranianNationalId,
  normalizeNationalId,
  tryDecryptPii,
} from '../common/pii-crypto';
import { CareersSettings } from '../database/entities/careers-settings.entity';
import {
  JobApplication,
  type JsonValue,
} from '../database/entities/job-application.entity';
import { JobPosting } from '../database/entities/job-posting.entity';
import { StoredFile } from '../database/entities/stored-file.entity';
import type {
  ApplyJobCommandDto,
  CreateJobPostingDto,
  ListApplicationsQueryDto,
  ReferralTargetDto,
  UpdateCareersSettingsDto,
  UpdateJobPostingDto,
} from './dto/careers.dto';

const RESUME_MAX_BYTES = 3 * 1024 * 1024;
const CAN_ACT = ['SUBMITTED', 'REFERRED'] as const;
const RESUME_DIR = process.env.EXPERIENCE_UPLOAD_DIR
  ? path.join(process.env.EXPERIENCE_UPLOAD_DIR, 'resumes')
  : path.join(process.cwd(), 'uploads', 'resumes');

function parseEntries(raw?: string): JsonValue {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? (value.slice(0, 20) as JsonValue) : [];
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
    private readonly postingRepo: Repository<JobPosting>,
    @InjectRepository(JobApplication)
    private readonly applicationRepo: Repository<JobApplication>,
    @InjectRepository(StoredFile)
    private readonly fileRepo: Repository<StoredFile>,
  ) {}

  private assertSiteAdmin(actor: ActorContextDto): void {
    if (actor.role !== 'SITE_ADMIN' && !actor.isSuperAdmin) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'دسترسی به مدیریت فرصت‌های شغلی مجاز نیست.',
      });
    }
  }

  private async settings(): Promise<CareersSettings> {
    const current = await this.settingsRepo.findOne({
      where: {},
      order: { createdAt: 'ASC' },
    });
    return (
      current ??
      this.settingsRepo.save(
        this.settingsRepo.create({ enabled: true, updatedAt: new Date() }),
      )
    );
  }

  async getSettings() {
    return { enabled: (await this.settings()).enabled };
  }

  async updateSettings(actor: ActorContextDto, dto: UpdateCareersSettingsDto) {
    this.assertSiteAdmin(actor);
    const row = await this.settings();
    row.enabled = dto.enabled;
    row.updatedAt = new Date();
    return { enabled: (await this.settingsRepo.save(row)).enabled };
  }

  private mediaUrl(fileId: string | null): string | null {
    return fileId ? `/careers/media/${fileId}` : null;
  }

  private serializePosting(posting: JobPosting) {
    return {
      id: posting.id,
      title: posting.title,
      dept: posting.dept,
      city: posting.city,
      type: posting.type,
      description: posting.description,
      generalReqs: posting.generalReqs ?? [],
      specialReqs: posting.specialReqs ?? [],
      active: posting.active,
      imageFileId: posting.imageFileId,
      imageUrl: this.mediaUrl(posting.imageFileId),
      createdAt: posting.createdAt,
      updatedAt: posting.updatedAt,
    };
  }

  private async assertImage(actorId: string, fileId: string): Promise<void> {
    const file = await this.fileRepo.findOneBy({ id: fileId });
    if (
      !file ||
      file.ownerId !== actorId ||
      !file.mimeType.startsWith('image/')
    ) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'تصویر آگهی معتبر نیست یا متعلق به شما نیست.',
      });
    }
  }

  async listActiveJobs() {
    const rows = await this.postingRepo.find({
      where: { active: true },
      order: { createdAt: 'DESC' },
    });
    return rows.map((row) => {
      const posting = this.serializePosting(row);
      return {
        id: posting.id,
        title: posting.title,
        dept: posting.dept,
        city: posting.city,
        type: posting.type,
        description: posting.description,
        imageFileId: posting.imageFileId,
        imageUrl: posting.imageUrl,
      };
    });
  }

  async getPublicJob(id: string) {
    const row = await this.postingRepo.findOneBy({ id });
    if (!row || !row.active)
      this.notFound('این فرصت شغلی یافت نشد یا دیگر فعال نیست.');
    return this.serializePosting(row);
  }

  async listPostings(actor: ActorContextDto) {
    this.assertSiteAdmin(actor);
    const rows = await this.postingRepo.find({ order: { createdAt: 'DESC' } });
    return rows.map((row) => this.serializePosting(row));
  }

  async createPosting(actor: ActorContextDto, dto: CreateJobPostingDto) {
    this.assertSiteAdmin(actor);
    if (dto.imageFileId) await this.assertImage(actor.id, dto.imageFileId);
    const row = await this.postingRepo.save(
      this.postingRepo.create({
        ...dto,
        description: dto.description ?? '',
        imageFileId: dto.imageFileId ?? null,
        active: true,
        updatedAt: new Date(),
      }),
    );
    return this.serializePosting(row);
  }

  async updatePosting(
    actor: ActorContextDto,
    id: string,
    dto: UpdateJobPostingDto,
  ) {
    this.assertSiteAdmin(actor);
    const row = await this.postingRepo.findOneBy({ id });
    if (!row) this.notFound('فرصت شغلی یافت نشد.');
    if (dto.imageFileId) await this.assertImage(actor.id, dto.imageFileId);
    Object.assign(row, dto, { updatedAt: new Date() });
    return this.serializePosting(await this.postingRepo.save(row));
  }

  async apply(command: ApplyJobCommandDto) {
    const posting = await this.postingRepo.findOneBy({ id: command.jobId });
    if (!posting || !posting.active) {
      this.notFound('این فرصت شغلی یافت نشد یا دیگر فعال نیست.');
    }
    const nationalId = normalizeNationalId(command.input.nationalId);
    if (!isValidIranianNationalId(nationalId)) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'کد ملی معتبر نیست.',
      });
    }
    const resume = this.writeResume(command.resume);
    const input = command.input;
    const row = await this.applicationRepo.save(
      this.applicationRepo.create({
        jobPostingId: posting.id,
        jobTitleSnapshot: posting.title,
        firstName: input.firstName,
        lastName: input.lastName,
        nationalIdEnc: encryptPii(nationalId),
        nationalIdHash: hashPii(nationalId),
        fatherName: input.fatherName ?? null,
        birthDate: input.birthDate ? new Date(input.birthDate) : null,
        birthProvince: input.birthProvince ?? null,
        birthCity: input.birthCity ?? null,
        gender: input.gender ?? null,
        marital: input.marital ?? null,
        military: input.military ?? null,
        exemptionType: input.exemptionType ?? null,
        phone: input.phone,
        email: input.email ?? null,
        residenceProvince: input.residenceProvince ?? null,
        residenceAddress: input.residenceAddress ?? null,
        eduEntries: parseEntries(input.eduEntries),
        workEntries: parseEntries(input.workEntries),
        langEntries: parseEntries(input.langEntries),
        skills: input.skills ?? null,
        otherLangs: input.otherLangs ?? null,
        resumeFileName: resume?.fileName ?? null,
        resumeMimeType: resume?.mimeType ?? null,
        resumeSizeBytes: resume?.sizeBytes ?? null,
        resumePath: resume?.path ?? null,
        status: 'SUBMITTED',
        assigneeId: null,
        assigneeName: null,
        history: [
          {
            step: 'submitted',
            label: 'ثبت درخواست توسط متقاضی',
            at: new Date().toISOString(),
          },
        ],
      }),
    );
    return { id: row.id };
  }

  private writeResume(resume?: ApplyJobCommandDto['resume']) {
    if (!resume) return null;
    const buffer = Buffer.from(resume.contentBase64, 'base64');
    if (
      resume.mimeType !== 'application/pdf' ||
      resume.sizeBytes > RESUME_MAX_BYTES ||
      buffer.length !== resume.sizeBytes
    ) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'فایل رزومه معتبر نیست یا بیش از ۳ مگابایت است.',
      });
    }
    fs.mkdirSync(RESUME_DIR, { recursive: true });
    const diskPath = path.join(RESUME_DIR, `${randomUUID()}.pdf`);
    fs.writeFileSync(diskPath, buffer);
    return {
      fileName: resume.originalName,
      mimeType: resume.mimeType,
      sizeBytes: buffer.length,
      path: diskPath,
    };
  }

  async listApplications(
    actor: ActorContextDto,
    query: ListApplicationsQueryDto,
  ) {
    this.assertSiteAdmin(actor);
    const rows = await this.applicationRepo.find({
      where: query.jobTitle ? { jobTitleSnapshot: query.jobTitle } : {},
      order: { createdAt: 'DESC' },
    });
    const search = query.q?.trim().toLowerCase();
    return rows
      .filter((row) => {
        if (!search) return true;
        const nationalId = tryDecryptPii(row.nationalIdEnc) ?? '';
        return `${row.firstName} ${row.lastName} ${nationalId} ${row.phone} ${row.email ?? ''}`
          .toLowerCase()
          .includes(search);
      })
      .map((row) => ({
        id: row.id,
        name: `${row.firstName} ${row.lastName}`,
        jobTitle: row.jobTitleSnapshot,
        nationalId: tryDecryptPii(row.nationalIdEnc),
        phone: row.phone,
        email: row.email,
        at: row.createdAt,
        status: row.status,
        hasResume: Boolean(row.resumeFileName),
        eduCount: Array.isArray(row.eduEntries) ? row.eduEntries.length : 0,
        workCount: Array.isArray(row.workEntries) ? row.workEntries.length : 0,
        assigneeLabelFa: row.assigneeName,
      }));
  }

  async getApplication(
    actor: ActorContextDto,
    id: string,
  ): Promise<Record<string, unknown>> {
    this.assertSiteAdmin(actor);
    const row = await this.findApplication(id);
    if (!row) this.notFound('درخواست استخدام یافت نشد.');
    return {
      id: row.id,
      name: `${row.firstName} ${row.lastName}`,
      jobTitle: row.jobTitleSnapshot,
      nationalId: tryDecryptPii(row.nationalIdEnc),
      fatherName: row.fatherName,
      birthDate: row.birthDate,
      phone: row.phone,
      email: row.email,
      residenceAddress: row.residenceAddress,
      gender: row.gender,
      military: row.military,
      exemptionType: row.exemptionType,
      skills: row.skills,
      eduEntries: row.eduEntries,
      workEntries: row.workEntries,
      langEntries: row.langEntries,
      hasResume: Boolean(row.resumeFileName),
      resumeFileName: row.resumeFileName,
      status: row.status,
      canAct: (CAN_ACT as readonly string[]).includes(row.status),
      history: row.history,
    };
  }

  async getResume(actor: ActorContextDto, id: string) {
    this.assertSiteAdmin(actor);
    const row = await this.findApplication(id);
    if (!row?.resumePath || !fs.existsSync(row.resumePath)) {
      this.notFound('رزومه‌ای برای این درخواست ثبت نشده است.');
    }
    return {
      fileName: row.resumeFileName ?? 'resume.pdf',
      mimeType: row.resumeMimeType ?? 'application/pdf',
      contentBase64: fs.readFileSync(row.resumePath).toString('base64'),
    };
  }

  private async actionable(actor: ActorContextDto, id: string) {
    this.assertSiteAdmin(actor);
    const row = await this.findApplication(id);
    if (!row) this.notFound('درخواست استخدام یافت نشد.');
    if (!(CAN_ACT as readonly string[]).includes(row.status)) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'وضعیت این درخواست دیگر قابل تغییر نیست.',
      });
    }
    return row;
  }

  private findApplication(id: string): Promise<JobApplication | null> {
    return this.applicationRepo
      .createQueryBuilder('application')
      .where('application.id = :id', { id })
      .getOne();
  }

  private appendHistory(row: JobApplication, step: string, label: string) {
    const history = Array.isArray(row.history) ? row.history : [];
    row.history = [
      ...history,
      { step, label, at: new Date().toISOString() },
    ] as JsonValue;
  }

  async refer(actor: ActorContextDto, id: string, target: ReferralTargetDto) {
    const row = await this.actionable(actor, id);
    row.status = 'REFERRED';
    row.assigneeId = target.id;
    row.assigneeName = target.fullName;
    this.appendHistory(
      row,
      'referred',
      `ارجاع به ${target.fullName} توسط ادمین سایت`,
    );
    await this.applicationRepo.save(row);
    return { id: row.id, status: row.status };
  }

  async hire(actor: ActorContextDto, id: string) {
    const row = await this.actionable(actor, id);
    row.status = 'HIRED';
    this.appendHistory(row, 'hired', 'نتیجهٔ استخدام: پذیرفته شد');
    await this.applicationRepo.save(row);
    return { id: row.id, status: row.status };
  }

  async reject(actor: ActorContextDto, id: string) {
    const row = await this.actionable(actor, id);
    row.status = 'REJECTED';
    this.appendHistory(row, 'rejected', 'نتیجهٔ استخدام: رد شد');
    await this.applicationRepo.save(row);
    return { id: row.id, status: row.status };
  }

  private notFound(message: string): never {
    throw new NotFoundException({ code: 'NOT_FOUND', message });
  }
}
