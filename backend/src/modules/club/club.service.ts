import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as crypto from 'node:crypto';
import { IsNull, Repository } from 'typeorm';
import type { JsonValue } from '../../database/json-types';
import { ClubTierRule } from '../../database/entities/club-tier-rule.entity';
import { ClubMember } from '../../database/entities/club-member.entity';
import { ClubCardRequest } from '../../database/entities/club-card-request.entity';
import { ClubPointsEntry } from '../../database/entities/club-points-entry.entity';
import { User } from '../../database/entities/user.entity';
import { AuditService } from '../audit/audit.service';
import { ErrorCode } from '../../common/errors';
import {
  encryptPii,
  hashPii,
  tryDecryptPii,
  decryptPii,
  isValidIranianNationalId,
  normalizeNationalId,
} from '../../common/pii-crypto';
import { ROLE_LABELS_FA } from '../../common/exec-roles';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import {
  ClubCardStatus,
  ClubCardRequestStatus,
  ClubTier,
} from '../../database/enums';

const CARD_PREFIX: Record<ClubTier, string> = {
  SILVER: 'SILV',
  GOLD: 'GOLD',
  PLATINUM: 'PLAT',
};

function tierRulePreview(rule: ClubTierRule) {
  return [
    {
      tier: 'SILVER' as const,
      minPoints: 0,
      maxPoints: rule.goldMinPoints - 1,
    },
    {
      tier: 'GOLD' as const,
      minPoints: rule.goldMinPoints,
      maxPoints: rule.platinumMinPoints - 1,
    },
    {
      tier: 'PLATINUM' as const,
      minPoints: rule.platinumMinPoints,
      maxPoints: null,
    },
  ];
}

function toTierRuleView(rule: ClubTierRule, updatedByLabelFa: string | null) {
  return {
    goldMinPoints: rule.goldMinPoints,
    platinumMinPoints: rule.platinumMinPoints,
    cardRequestMinPoints: rule.cardRequestMinPoints,
    updatedAt: rule.updatedAt,
    updatedByLabelFa,
    preview: tierRulePreview(rule),
  };
}

/** Highest tier whose threshold the given points satisfy. Exported so
 * ClubPointsService.syncCache can reuse the exact same logic when
 * recomputing a member's level after a points change. */
export function resolveTierForPoints(
  points: number,
  rule: Pick<ClubTierRule, 'goldMinPoints' | 'platinumMinPoints'>,
): ClubTier {
  if (points >= rule.platinumMinPoints) return ClubTier.PLATINUM;
  if (points >= rule.goldMinPoints) return ClubTier.GOLD;
  return ClubTier.SILVER;
}

function generateCardNo(tier: ClubTier): string {
  return `${CARD_PREFIX[tier]}-${crypto.randomInt(1000, 10000)}`;
}

/** Public shape — the encrypted/hash columns never leave the service. */
function toMemberView(m: ClubMember) {
  const {
    nationalIdEnc,
    nationalIdHash,
    deactivatedAt,
    deactivatedById,
    deactivatedBy,
    ...rest
  } = m;
  void nationalIdEnc;
  void nationalIdHash;
  void deactivatedAt;
  void deactivatedById;
  void deactivatedBy;
  return rest;
}

@Injectable()
export class ClubService {
  constructor(
    @InjectRepository(ClubTierRule)
    private readonly tierRuleRepo: Repository<ClubTierRule>,
    @InjectRepository(ClubMember)
    private readonly clubMemberRepo: Repository<ClubMember>,
    @InjectRepository(ClubCardRequest)
    private readonly cardRequestRepo: Repository<ClubCardRequest>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly audit: AuditService,
  ) {}

  // ── Phase 65: club tier rules (singleton config) ────────────────────────

  private async getOrCreateTierRule(): Promise<ClubTierRule> {
    const existing = await this.tierRuleRepo.findOne({
      where: {},
      order: { createdAt: 'ASC' },
    });
    if (existing) return existing;
    // Defense in depth only — src/database/seed.ts creates this row normally.
    return this.tierRuleRepo.save(
      this.tierRuleRepo.create({ updatedAt: new Date() }),
    );
  }

  async getTierRules() {
    const rule = await this.getOrCreateTierRule();
    let updatedByLabelFa: string | null = null;
    if (rule.updatedById) {
      const updater = await this.userRepo.findOne({
        where: { id: rule.updatedById },
        select: { role: true },
      });
      updatedByLabelFa = updater ? ROLE_LABELS_FA[updater.role] : null;
    }
    return toTierRuleView(rule, updatedByLabelFa);
  }

  async updateTierRules(
    actor: AuthenticatedUser,
    dto: {
      goldMinPoints: number;
      platinumMinPoints: number;
      cardRequestMinPoints: number;
    },
  ) {
    if (dto.goldMinPoints >= dto.platinumMinPoints) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'حد نصاب طلایی باید کمتر از حد نصاب پلاتین باشد.',
      });
    }

    const before = await this.getOrCreateTierRule();
    const beforeSnapshot = { ...before };
    before.goldMinPoints = dto.goldMinPoints;
    before.platinumMinPoints = dto.platinumMinPoints;
    before.cardRequestMinPoints = dto.cardRequestMinPoints;
    before.updatedById = actor.id;
    before.updatedAt = new Date();
    const updated = await this.tierRuleRepo.save(before);

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'CLUB',
      action: 'تغییر قوانین باشگاه مشتریان',
      detail:
        `قوانین باشگاه مشتریان توسط ${actor.fullName} تغییر کرد: ` +
        `حد نصاب طلایی از ${beforeSnapshot.goldMinPoints} به ${updated.goldMinPoints}، ` +
        `حد نصاب پلاتین از ${beforeSnapshot.platinumMinPoints} به ${updated.platinumMinPoints}، ` +
        `حد نصاب کارت از ${beforeSnapshot.cardRequestMinPoints} به ${updated.cardRequestMinPoints}.`,
      entityType: 'ClubTierRule',
      entityId: updated.id,
    });

    return toTierRuleView(updated, ROLE_LABELS_FA[actor.role]);
  }

  private async getMemberOrThrow(id: string): Promise<ClubMember> {
    const member = await this.clubMemberRepo.findOneBy({
      id,
      deactivatedAt: IsNull(),
    });
    if (!member) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'عضو باشگاه یافت نشد.',
      });
    }
    return member;
  }

  async listMembers(
    query: { level?: ClubTier; q?: string },
    actor?: AuthenticatedUser,
  ) {
    const qb = this.clubMemberRepo
      .createQueryBuilder('m')
      .where('m."deactivatedAt" IS NULL');
    if (query.level) qb.andWhere('m.level = :level', { level: query.level });
    if (query.q) {
      const q = query.q.trim();
      const normalized = normalizeNationalId(q);
      const nidClause = /^\d{10}$/.test(normalized)
        ? ` OR m."nationalIdHash" = :nidHash`
        : '';
      qb.andWhere(
        `(m."fullName" ILIKE :q OR m.email ILIKE :q OR m."cardNo" ILIKE :q${nidClause})`,
        { q: `%${q}%`, nidHash: hashPii(normalized) },
      );
    }

    const [members, all, pendingRequests, submittedRequests] =
      await Promise.all([
        qb.clone().orderBy('m.joinDate', 'DESC').getMany(),
        this.clubMemberRepo.find({
          where: { deactivatedAt: IsNull() },
          select: { level: true, cardStatus: true },
        }),
        this.cardRequestRepo.count({
          where: { status: ClubCardRequestStatus.REFERRED },
        }),
        this.cardRequestRepo.count({
          where: { status: ClubCardRequestStatus.SUBMITTED },
        }),
      ]);

    // KPI cards always summarize the whole club, unfiltered (per design).
    const tierCounts = { SILVER: 0, GOLD: 0, PLATINUM: 0 };
    let issuedCards = 0;
    for (const m of all) {
      tierCounts[m.level] += 1;
      if (m.cardStatus === ClubCardStatus.ISSUED) issuedCards += 1;
    }

    const includeNationalId = actor?.role === 'SITE_ADMIN';

    return {
      members: members.map((m) => ({
        ...toMemberView(m),
        ...(includeNationalId
          ? { nationalId: tryDecryptPii(m.nationalIdEnc) }
          : {}),
      })),
      kpis: {
        totalMembers: all.length,
        issuedCards,
        pendingRequests,
        submittedRequests,
        tierCounts,
      },
    };
  }

  async createMember(
    actor: AuthenticatedUser,
    dto: {
      fullName: string;
      email: string;
      birthDate?: string;
      nationalId: string;
      level: ClubTier;
      points?: number;
    },
  ) {
    const nationalId = normalizeNationalId(dto.nationalId);
    if (!isValidIranianNationalId(nationalId)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'کد ملی واردشده معتبر نیست.',
      });
    }
    const duplicate = await this.clubMemberRepo.findOne({
      where: { nationalIdHash: hashPii(nationalId) },
    });
    if (duplicate) {
      if (duplicate.deactivatedAt) {
        duplicate.fullName = dto.fullName;
        duplicate.email = dto.email;
        duplicate.birthDate = dto.birthDate ? new Date(dto.birthDate) : null;
        duplicate.level = dto.level;
        duplicate.points = dto.points ?? duplicate.points;
        duplicate.deactivatedAt = null;
        duplicate.deactivatedById = null;
        const restored = await this.clubMemberRepo.save(duplicate);
        await this.audit.record({
          actorId: actor.id,
          actorRole: actor.role,
          category: 'CLUB',
          action: 'بازگردانی مشتری VIP',
          detail: `عضویت VIP «${dto.fullName}» توسط ${actor.fullName} دوباره فعال شد.`,
          entityType: 'ClubMember',
          entityId: restored.id,
        });
        return toMemberView(restored);
      }
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'عضوی با این کد ملی قبلاً ثبت شده است.',
      });
    }

    const member = await this.clubMemberRepo.save(
      this.clubMemberRepo.create({
        fullName: dto.fullName,
        email: dto.email,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
        nationalIdEnc: encryptPii(nationalId),
        nationalIdHash: hashPii(nationalId),
        level: dto.level,
        points: dto.points ?? 0,
      }),
    );

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'CLUB',
      action: 'تعریف مشتری VIP جدید',
      detail: `عضو «${dto.fullName}» با سطح ${dto.level} توسط ${actor.fullName} به باشگاه افزوده شد.`,
      entityType: 'ClubMember',
      entityId: member.id,
    });

    return toMemberView(member);
  }

  async deactivateMember(actor: AuthenticatedUser, id: string) {
    const member = await this.getMemberOrThrow(id);
    member.deactivatedAt = new Date();
    member.deactivatedById = actor.id;
    await this.clubMemberRepo.save(member);

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'CLUB',
      action: 'غیرفعال‌سازی مشتری VIP',
      detail: `عضویت VIP «${member.fullName}» توسط ${actor.fullName} غیرفعال شد؛ مزایا متوقف و تمام سوابق مشتری حفظ شد.`,
      entityType: 'ClubMember',
      entityId: member.id,
    });

    return {
      id: member.id,
      isActive: false,
      deactivatedAt: member.deactivatedAt,
    };
  }

  async updateLevel(actor: AuthenticatedUser, id: string, level: ClubTier) {
    const member = await this.getMemberOrThrow(id);
    const previousLevel = member.level;
    member.level = level;
    const updated = await this.clubMemberRepo.save(member);

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'CLUB',
      action: 'تغییر سطح عضویت',
      detail: `سطح عضویت «${member.fullName}» توسط ${actor.fullName} از ${previousLevel} به ${level} تغییر کرد.`,
      entityType: 'ClubMember',
      entityId: id,
    });

    return toMemberView(updated);
  }

  async issueCardDirect(actor: AuthenticatedUser, id: string) {
    const member = await this.getMemberOrThrow(id);
    if (member.cardStatus === ClubCardStatus.ISSUED) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'برای این عضو قبلاً کارت صادر شده است.',
      });
    }

    const roleLabel = ROLE_LABELS_FA[actor.role];
    member.cardStatus = ClubCardStatus.ISSUED;
    member.cardNo = generateCardNo(member.level);
    member.issuedByLabelFa = `${roleLabel} (صدور مستقیم)`;
    const updated = await this.clubMemberRepo.save(member);

    // The mocks issue silently with no trail — the real system audits (⚑).
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'CLUB',
      action: 'صدور مستقیم کارت عضویت',
      detail: `کارت ${updated.cardNo} برای «${member.fullName}» توسط ${actor.fullName} صادر شد (صدور مستقیم).`,
      entityType: 'ClubMember',
      entityId: id,
    });

    return toMemberView(updated);
  }

  /**
   * Non-production only: lets Playwright E2E runs create a fresh member +
   * REFERRED request (request creation belongs to the site-admin/public
   * tracks, so the exec panels have no real creation path to drive).
   * Always 404s in production — enforced here AND by the controller.
   */
  async createTestRequest(assignedTo: 'SENIOR' | 'CHAIR') {
    if (process.env.NODE_ENV === 'production') {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'یافت نشد.',
      });
    }
    let nid = '';
    for (;;) {
      const base = Array.from({ length: 9 }, () =>
        crypto.randomInt(0, 10),
      ).join('');
      if (/^(\d)\1{8}$/.test(base)) continue;
      const sum = base
        .split('')
        .reduce((acc, d, i) => acc + Number(d) * (10 - i), 0);
      const r = sum % 11;
      nid = base + String(r < 2 ? r : 11 - r);
      break;
    }
    const member = await this.clubMemberRepo.save(
      this.clubMemberRepo.create({
        fullName: `عضو آزمایشی ${crypto.randomUUID().slice(0, 6)}`,
        email: `${crypto.randomUUID().slice(0, 8)}@e2e.example`,
        nationalIdEnc: encryptPii(nid),
        nationalIdHash: hashPii(nid),
        points: 6000,
        level: ClubTier.GOLD,
        cardStatus: ClubCardStatus.REVIEW,
      }),
    );
    return this.cardRequestRepo.save(
      this.cardRequestRepo.create({
        memberId: member.id,
        level: ClubTier.GOLD,
        points: 6000,
        status: ClubCardRequestStatus.REFERRED,
        assignedTo,
        history: [
          {
            step: 'submitted',
            labelFa: 'رسیدن به حد امتیاز و ثبت درخواست صدور کارت',
            at: 'اکنون',
          },
          {
            step: 'referred',
            labelFa: `ارجاع به ${assignedTo === 'SENIOR' ? 'مدیر ارشد' : 'رئیس هیئت مدیره'} توسط ادمین سایت`,
            at: 'اکنون',
          },
        ],
      }),
    );
  }

  // ── Card requests ─────────────────────────────────────────────────────

  async listRequests() {
    // SUBMITTED lives in the site-admin track — the exec panels only ever
    // see REFERRED/APPROVED/REJECTED (confirmed against all three designs).
    const requests = await this.cardRequestRepo
      .createQueryBuilder('r')
      .leftJoin('r.member', 'member')
      .addSelect([
        'member.id',
        'member.fullName',
        'member.email',
        'member.points',
        'member.level',
      ])
      .where('r.status IN (:...statuses)', {
        statuses: [
          ClubCardRequestStatus.REFERRED,
          ClubCardRequestStatus.APPROVED,
          ClubCardRequestStatus.REJECTED,
        ],
      })
      .orderBy('r.createdAt', 'DESC')
      .getMany();
    return requests;
  }

  /** SITE_ADMIN track: all card requests (refer only allowed on SUBMITTED). */
  async listSubmittedRequests() {
    const requests = await this.cardRequestRepo
      .createQueryBuilder('r')
      .leftJoin('r.member', 'member')
      .addSelect([
        'member.id',
        'member.fullName',
        'member.email',
        'member.points',
        'member.level',
        'member.birthDate',
        'member.joinDate',
        'member.nationalIdEnc',
      ])
      .orderBy('r.createdAt', 'DESC')
      .getMany();
    return requests.map((r) => ({
      id: r.id,
      memberId: r.memberId,
      member: {
        id: r.member.id,
        fullName: r.member.fullName,
        email: r.member.email,
        points: r.member.points,
        level: r.member.level,
        birthDate: r.member.birthDate,
        joinDate: r.member.joinDate,
        nationalId: tryDecryptPii(r.member.nationalIdEnc),
      },
      level: r.level,
      points: r.points,
      status: r.status,
      assignedTo: r.assignedTo,
      cardNo: r.cardNo,
      history: r.history,
      createdAt: r.createdAt,
    }));
  }

  /** SITE_ADMIN refers a SUBMITTED request to senior managers for approval. */
  async referRequest(
    actor: AuthenticatedUser,
    id: string,
    assignedTo: 'SENIOR' | 'CHAIR',
  ) {
    const request = await this.cardRequestRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.member', 'member')
      .where('r.id = :id', { id })
      .getOne();
    if (!request) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'درخواست یافت نشد.',
      });
    }
    if (request.status !== ClubCardRequestStatus.SUBMITTED) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'این درخواست قبلاً ارجاع شده است.',
      });
    }

    const assigneeLabel =
      assignedTo === 'SENIOR' ? 'مدیر ارشد' : 'رئیس هیئت مدیره';
    const history = Array.isArray(request.history)
      ? [...(request.history as unknown[])]
      : [];
    history.push({
      step: 'referred',
      labelFa: `ارجاع به ${assigneeLabel} توسط ادمین سایت`,
      at: this.nowJalaliLabel(),
    });

    request.status = ClubCardRequestStatus.REFERRED;
    request.assignedTo = assignedTo;
    request.history = history as JsonValue;
    const updated = await this.cardRequestRepo.save(request);

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'CLUB',
      action: 'ارجاع درخواست کارت عضویت',
      detail: `درخواست کارت «${request.member.fullName}» توسط ${actor.fullName} به ${assigneeLabel} ارجاع شد.`,
      entityType: 'ClubCardRequest',
      entityId: id,
    });

    return updated;
  }

  /** ⚑ Design authority rule: CEO/BOARD_CHAIR act on any REFERRED request;
   * SENIOR_MANAGER only on assignedTo=SENIOR. */
  private assertCanDecide(
    actor: AuthenticatedUser,
    assignedTo: 'SENIOR' | 'CHAIR' | null,
  ) {
    if (actor.role === 'CEO' || actor.role === 'BOARD_CHAIR') return;
    if (actor.role === 'SENIOR_MANAGER' && assignedTo === 'SENIOR') return;
    throw new ForbiddenException({
      code: ErrorCode.FORBIDDEN,
      message: 'این درخواست به شما ارجاع نشده است.',
    });
  }

  private nowJalaliLabel(): string {
    // Presentational timestamp for the history timeline (design shows
    // Jalali date-time strings); precise auditing lives in AuditLog.
    return new Date().toISOString();
  }

  private async getMemberPointsBalance(memberId: string): Promise<number> {
    const row = await this.clubMemberRepo.manager
      .createQueryBuilder(ClubPointsEntry, 'e')
      .select('SUM(e."signedPoints")', 'sum')
      .where('e."clubMemberId" = :memberId', { memberId })
      .getRawOne<{ sum: string | null }>();
    return row?.sum ? Number(row.sum) : 0;
  }

  /** Customer self-service: join the loyalty club (links User → ClubMember). */
  async joinMine(userId: string) {
    const existing = await this.clubMemberRepo.findOne({ where: { userId } });
    if (existing) {
      if (existing.deactivatedAt) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message:
            'عضویت باشگاه شما غیرفعال است؛ برای فعال‌سازی مجدد با پشتیبانی تماس بگیرید.',
        });
      }
      return this.getMyMembership(userId);
    }

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'کاربر یافت نشد.',
      });
    }
    if (!user.nationalIdEnc) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message:
          'برای عضویت در باشگاه، ابتدا کد ملی را در پروفایل خود تکمیل کنید.',
      });
    }
    const nationalId = normalizeNationalId(decryptPii(user.nationalIdEnc));
    if (!isValidIranianNationalId(nationalId)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'کد ملی پروفایل معتبر نیست.',
      });
    }
    const byNid = await this.clubMemberRepo.findOne({
      where: { nationalIdHash: hashPii(nationalId) },
    });
    if (byNid) {
      if (byNid.deactivatedAt) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message:
            'عضویت باشگاه با این کد ملی غیرفعال است؛ برای فعال‌سازی مجدد با پشتیبانی تماس بگیرید.',
        });
      }
      if (byNid.userId && byNid.userId !== userId) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message: 'عضویت باشگاه با این کد ملی قبلاً به حساب دیگری وصل است.',
        });
      }
      byNid.userId = userId;
      await this.clubMemberRepo.save(byNid);
      return this.getMyMembership(userId);
    }

    const email =
      user.email?.trim() ||
      (user.phone ? `${user.phone.replace(/\D/g, '')}@users.blujet.local` : '');
    if (!email) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message:
          'برای عضویت در باشگاه، ابتدا ایمیل یا شماره موبایل را در پروفایل تکمیل کنید.',
      });
    }

    await this.clubMemberRepo.save(
      this.clubMemberRepo.create({
        userId,
        fullName: user.fullName,
        email,
        birthDate: user.birthDate ?? null,
        nationalIdEnc: encryptPii(nationalId),
        nationalIdHash: hashPii(nationalId),
        level: ClubTier.SILVER,
        points: 0,
      }),
    );

    return this.getMyMembership(userId);
  }

  /** Customer self-service: full club membership view for the user panel. */
  async getMyMembership(userId: string) {
    const rule = await this.getOrCreateTierRule();
    const tierRules = {
      goldMinPoints: rule.goldMinPoints,
      platinumMinPoints: rule.platinumMinPoints,
      cardRequestMinPoints: rule.cardRequestMinPoints,
    };

    const member = await this.clubMemberRepo.findOne({
      where: { userId, deactivatedAt: IsNull() },
    });
    if (!member) {
      return {
        isMember: false,
        level: null,
        balance: 0,
        cardStatus: null,
        cardNo: null,
        tierRules,
        cardRequest: null,
        canRequestCard: false,
        pointsNeededForCard: rule.cardRequestMinPoints,
      };
    }

    const balance = await this.getMemberPointsBalance(member.id);
    const cardRequest = await this.cardRequestRepo
      .createQueryBuilder('r')
      .select(['r.id', 'r.status', 'r.history', 'r.cardNo', 'r.createdAt'])
      .where('r.memberId = :memberId', { memberId: member.id })
      .andWhere('r.status IN (:...statuses)', {
        statuses: [
          ClubCardRequestStatus.SUBMITTED,
          ClubCardRequestStatus.REFERRED,
          ClubCardRequestStatus.APPROVED,
        ],
      })
      .orderBy('r.createdAt', 'DESC')
      .getOne();

    const canRequestCard =
      member.cardStatus === ClubCardStatus.NONE &&
      balance >= rule.cardRequestMinPoints &&
      !cardRequest;

    return {
      isMember: true,
      level: member.level,
      balance,
      cardStatus: member.cardStatus,
      cardNo: member.cardNo,
      tierRules,
      cardRequest,
      canRequestCard,
      pointsNeededForCard: Math.max(rule.cardRequestMinPoints - balance, 0),
    };
  }

  /** Customer self-service: submit a membership-card issuance request. */
  async submitCardRequest(userId: string) {
    const member = await this.clubMemberRepo.findOne({
      where: { userId, deactivatedAt: IsNull() },
    });
    if (!member) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'عضو باشگاه یافت نشد.',
      });
    }

    const rule = await this.getOrCreateTierRule();
    const balance = await this.getMemberPointsBalance(member.id);

    if (balance < rule.cardRequestMinPoints) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'برای درخواست کارت عضویت به حد نصاب امتیاز نرسیده‌اید.',
      });
    }

    if (member.cardStatus === ClubCardStatus.ISSUED) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'کارت عضویت شما قبلاً صادر شده است.',
      });
    }

    const pending = await this.cardRequestRepo
      .createQueryBuilder('r')
      .where('r.memberId = :memberId', { memberId: member.id })
      .andWhere('r.status IN (:...statuses)', {
        statuses: [
          ClubCardRequestStatus.SUBMITTED,
          ClubCardRequestStatus.REFERRED,
        ],
      })
      .getOne();
    if (pending) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'درخواست قبلی شما در حال بررسی است.',
      });
    }

    const history = [
      {
        step: 'submitted',
        labelFa: 'رسیدن به حد امتیاز و ثبت درخواست صدور کارت',
        at: this.nowJalaliLabel(),
      },
    ];

    return this.clubMemberRepo.manager.transaction(async (tx) => {
      const req = await tx.save(
        tx.create(ClubCardRequest, {
          memberId: member.id,
          level: member.level,
          points: balance,
          status: ClubCardRequestStatus.SUBMITTED,
          history,
        }),
      );
      await tx.update(ClubMember, member.id, {
        cardStatus: ClubCardStatus.REVIEW,
      });
      return {
        id: req.id,
        status: req.status,
        history: req.history,
        cardNo: req.cardNo,
        createdAt: req.createdAt,
      };
    });
  }

  async decideRequest(
    actor: AuthenticatedUser,
    id: string,
    decision: 'approve' | 'reject',
  ) {
    const request = await this.cardRequestRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.member', 'member')
      .where('r.id = :id', { id })
      .getOne();
    if (!request) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'درخواست یافت نشد.',
      });
    }
    if (request.member.deactivatedAt) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'عضویت این مشتری غیرفعال است و صدور کارت مجاز نیست.',
      });
    }
    if (request.status !== ClubCardRequestStatus.REFERRED) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'این درخواست قبلاً بررسی شده است.',
      });
    }
    this.assertCanDecide(actor, request.assignedTo);

    const roleLabel = ROLE_LABELS_FA[actor.role];
    const history = (
      Array.isArray(request.history) ? [...(request.history as unknown[])] : []
    ) as JsonValue;

    await this.clubMemberRepo.manager.transaction(async (tx) => {
      if (decision === 'approve') {
        const cardNo = generateCardNo(request.level);
        (history as unknown[]).push({
          step: 'approved',
          labelFa: `تأیید و صدور کارت توسط ${roleLabel}`,
          at: this.nowJalaliLabel(),
        });
        request.status = ClubCardRequestStatus.APPROVED;
        request.cardNo = cardNo;
        request.decidedById = actor.id;
        request.decidedAt = new Date();
        request.history = history;
        await tx.save(request);
        await tx.update(ClubMember, request.memberId, {
          cardStatus: ClubCardStatus.ISSUED,
          cardNo,
          issuedByLabelFa: `${roleLabel} (تأیید درخواست)`,
        });
        return;
      }

      (history as unknown[]).push({
        step: 'rejected',
        labelFa: `رد درخواست توسط ${roleLabel}`,
        at: this.nowJalaliLabel(),
      });
      request.status = ClubCardRequestStatus.REJECTED;
      request.decidedById = actor.id;
      request.decidedAt = new Date();
      request.history = history;
      await tx.save(request);
      await tx.update(ClubMember, request.memberId, {
        cardStatus: ClubCardStatus.NONE,
      });
    });

    const updated = await this.cardRequestRepo
      .createQueryBuilder('r')
      .where('r.id = :id', { id })
      .getOneOrFail();

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'CLUB',
      action:
        decision === 'approve'
          ? 'تأیید و صدور کارت عضویت'
          : 'رد درخواست کارت عضویت',
      detail: `درخواست کارت «${request.member.fullName}» توسط ${actor.fullName} ${
        decision === 'approve'
          ? `تأیید و کارت ${updated.cardNo} صادر شد`
          : 'رد شد'
      }.`,
      entityType: 'ClubCardRequest',
      entityId: id,
    });

    return updated;
  }
}
