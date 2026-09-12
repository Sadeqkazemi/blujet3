import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as crypto from 'node:crypto';
import { EntityManager, IsNull, Repository } from 'typeorm';
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
import { LoyaltyMembershipClient } from './loyalty-membership.client';
import { LoyaltyTierRulesClient } from './loyalty-tier-rules.client';
import { LoyaltyMembersListClient } from './loyalty-members-list.client';
import { LoyaltyCardRequestsClient } from './loyalty-card-requests.client';
import { Optional } from '@nestjs/common';
import { LoyaltyProjectionEventService } from '../loyalty-projection-outbox/loyalty-projection-event.service';

const CARD_PREFIX: Record<ClubTier, string> = {
  SILVER: 'SILV',
  GOLD: 'GOLD',
  PLATINUM: 'PLAT',
};

type TierRuleValues = Pick<
  ClubTierRule,
  'goldMinPoints' | 'platinumMinPoints' | 'cardRequestMinPoints'
>;

function tierRulePreview(rule: TierRuleValues) {
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

function toTierRuleView(
  rule: TierRuleValues & Pick<ClubTierRule, 'updatedAt'>,
  updatedByLabelFa: string | null,
) {
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
    version,
    ...rest
  } = m;
  void nationalIdEnc;
  void nationalIdHash;
  void deactivatedAt;
  void deactivatedById;
  void deactivatedBy;
  void version;
  return rest;
}

function toCardRequestView<T extends ClubCardRequest>(request: T) {
  const { version, member, ...view } = request;
  void version;
  return { ...view, ...(member ? { member: toMemberView(member) } : {}) };
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
    private readonly loyaltyMembership: LoyaltyMembershipClient,
    private readonly loyaltyTierRules: LoyaltyTierRulesClient,
    private readonly loyaltyMembersList: LoyaltyMembersListClient,
    private readonly loyaltyProjection: LoyaltyProjectionEventService,
    @Optional()
    private readonly loyaltyCardRequests?: LoyaltyCardRequestsClient,
  ) {}

  // ── Phase 65: club tier rules (singleton config) ────────────────────────

  private async getOrCreateTierRule(
    manager?: EntityManager,
  ): Promise<ClubTierRule> {
    if (manager) {
      await manager.query(
        "SELECT pg_advisory_xact_lock(hashtextextended('loyalty-tier-rule', 0))",
      );
    }
    const repository =
      manager?.getRepository(ClubTierRule) ?? this.tierRuleRepo;
    const existing = await repository.findOne({
      where: {},
      order: { createdAt: 'ASC' },
    });
    if (existing) return existing;
    if (!manager) {
      return this.tierRuleRepo.manager.transaction((tx) =>
        this.getOrCreateTierRule(tx),
      );
    }
    // Defense in depth only — src/database/seed.ts creates this row normally.
    const created = await repository.save(
      repository.create({ updatedAt: new Date() }),
    );
    await this.loyaltyProjection.recordTierRule(manager, created, 'CREATED');
    return created;
  }

  private async tierRuleView(
    rule: Pick<
      ClubTierRule,
      | 'goldMinPoints'
      | 'platinumMinPoints'
      | 'cardRequestMinPoints'
      | 'updatedAt'
      | 'updatedById'
    >,
  ) {
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

  async getTierRules(requestId?: string) {
    const remote = await this.loyaltyTierRules.get(requestId);
    if (remote)
      return this.tierRuleView({
        ...remote,
        updatedAt: new Date(remote.updatedAt),
      });
    return this.tierRuleView(await this.getOrCreateTierRule());
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

    const updated = await this.tierRuleRepo.manager.transaction(async (tx) => {
      const before = await this.getOrCreateTierRule(tx);
      const beforeSnapshot = { ...before };
      before.goldMinPoints = dto.goldMinPoints;
      before.platinumMinPoints = dto.platinumMinPoints;
      before.cardRequestMinPoints = dto.cardRequestMinPoints;
      before.updatedById = actor.id;
      before.updatedAt = new Date();
      const saved = await tx.save(before);

      await this.audit.record(
        {
          actorId: actor.id,
          actorRole: actor.role,
          category: 'CLUB',
          action: 'تغییر قوانین باشگاه مشتریان',
          detail:
            `قوانین باشگاه مشتریان توسط ${actor.fullName} تغییر کرد: ` +
            `حد نصاب طلایی از ${beforeSnapshot.goldMinPoints} به ${saved.goldMinPoints}، ` +
            `حد نصاب پلاتین از ${beforeSnapshot.platinumMinPoints} به ${saved.platinumMinPoints}، ` +
            `حد نصاب کارت از ${beforeSnapshot.cardRequestMinPoints} به ${saved.cardRequestMinPoints}.`,
          entityType: 'ClubTierRule',
          entityId: saved.id,
        },
        tx,
      );
      await this.loyaltyProjection.recordTierRule(tx, saved, 'UPDATED');
      return saved;
    });

    return toTierRuleView(updated, ROLE_LABELS_FA[actor.role]);
  }

  private async getMemberOrThrow(
    id: string,
    manager?: EntityManager,
  ): Promise<ClubMember> {
    const repository =
      manager?.getRepository(ClubMember) ?? this.clubMemberRepo;
    const member = await repository.findOne({
      where: { id, deactivatedAt: IsNull() },
      ...(manager ? { lock: { mode: 'pessimistic_write' as const } } : {}),
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
    actor: AuthenticatedUser,
    requestId?: string,
  ) {
    const normalized = query.q ? normalizeNationalId(query.q.trim()) : '';
    const requiresProtectedCoreRead =
      actor.role === 'SITE_ADMIN' || /^\d{10}$/.test(normalized);
    if (!requiresProtectedCoreRead) {
      const remote = await this.loyaltyMembersList.get(query, requestId);
      if (remote) return remote;
    }
    return this.listMembersLocal(query, actor);
  }

  private async listMembersLocal(
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
    const member = await this.clubMemberRepo.manager.transaction(async (tx) => {
      const repository = tx.getRepository(ClubMember);
      await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        hashPii(nationalId),
      ]);
      const duplicate = await repository.findOne({
        where: { nationalIdHash: hashPii(nationalId) },
        lock: { mode: 'pessimistic_write' },
      });
      if (duplicate) {
        if (!duplicate.deactivatedAt) {
          throw new ConflictException({
            code: ErrorCode.CONFLICT,
            message: 'عضوی با این کد ملی قبلاً ثبت شده است.',
          });
        }
        duplicate.fullName = dto.fullName;
        duplicate.email = dto.email;
        duplicate.birthDate = dto.birthDate ? new Date(dto.birthDate) : null;
        duplicate.level = dto.level;
        duplicate.points = dto.points ?? duplicate.points;
        duplicate.deactivatedAt = null;
        duplicate.deactivatedById = null;
        const restored = await repository.save(duplicate);
        await this.audit.record(
          {
            actorId: actor.id,
            actorRole: actor.role,
            category: 'CLUB',
            action: 'بازگردانی مشتری VIP',
            detail: `عضویت VIP «${dto.fullName}» توسط ${actor.fullName} دوباره فعال شد.`,
            entityType: 'ClubMember',
            entityId: restored.id,
          },
          tx,
        );
        await this.loyaltyProjection.recordMember(tx, restored, 'UPDATED');
        return restored;
      }

      const created = await repository.save(
        repository.create({
          fullName: dto.fullName,
          email: dto.email,
          birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
          nationalIdEnc: encryptPii(nationalId),
          nationalIdHash: hashPii(nationalId),
          level: dto.level,
          points: dto.points ?? 0,
        }),
      );

      await this.audit.record(
        {
          actorId: actor.id,
          actorRole: actor.role,
          category: 'CLUB',
          action: 'تعریف مشتری VIP جدید',
          detail: `عضو «${dto.fullName}» با سطح ${dto.level} توسط ${actor.fullName} به باشگاه افزوده شد.`,
          entityType: 'ClubMember',
          entityId: created.id,
        },
        tx,
      );
      await this.loyaltyProjection.recordMember(tx, created, 'CREATED');
      return created;
    });

    return toMemberView(member);
  }

  async deactivateMember(actor: AuthenticatedUser, id: string) {
    const member = await this.clubMemberRepo.manager.transaction(async (tx) => {
      const current = await this.getMemberOrThrow(id, tx);
      current.deactivatedAt = new Date();
      current.deactivatedById = actor.id;
      const saved = await tx.save(current);

      await this.audit.record(
        {
          actorId: actor.id,
          actorRole: actor.role,
          category: 'CLUB',
          action: 'غیرفعال‌سازی مشتری VIP',
          detail: `عضویت VIP «${saved.fullName}» توسط ${actor.fullName} غیرفعال شد؛ مزایا متوقف و تمام سوابق مشتری حفظ شد.`,
          entityType: 'ClubMember',
          entityId: saved.id,
        },
        tx,
      );
      await this.loyaltyProjection.recordMember(tx, saved, 'DEACTIVATED');
      return saved;
    });

    return {
      id: member.id,
      isActive: false,
      deactivatedAt: member.deactivatedAt,
    };
  }

  async updateLevel(actor: AuthenticatedUser, id: string, level: ClubTier) {
    const updated = await this.clubMemberRepo.manager.transaction(
      async (tx) => {
        const member = await this.getMemberOrThrow(id, tx);
        const previousLevel = member.level;
        if (previousLevel === level) return member;
        member.level = level;
        const saved = await tx.save(member);

        await this.audit.record(
          {
            actorId: actor.id,
            actorRole: actor.role,
            category: 'CLUB',
            action: 'تغییر سطح عضویت',
            detail: `سطح عضویت «${member.fullName}» توسط ${actor.fullName} از ${previousLevel} به ${level} تغییر کرد.`,
            entityType: 'ClubMember',
            entityId: id,
          },
          tx,
        );
        await this.loyaltyProjection.recordMember(tx, saved, 'UPDATED');
        return saved;
      },
    );

    return toMemberView(updated);
  }

  async issueCardDirect(actor: AuthenticatedUser, id: string) {
    const updated = await this.clubMemberRepo.manager.transaction(
      async (tx) => {
        const member = await this.getMemberOrThrow(id, tx);
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
        const saved = await tx.save(member);

        // The mocks issue silently with no trail — the real system audits (⚑).
        await this.audit.record(
          {
            actorId: actor.id,
            actorRole: actor.role,
            category: 'CLUB',
            action: 'صدور مستقیم کارت عضویت',
            detail: `کارت ${saved.cardNo} برای «${member.fullName}» توسط ${actor.fullName} صادر شد (صدور مستقیم).`,
            entityType: 'ClubMember',
            entityId: id,
          },
          tx,
        );
        await this.loyaltyProjection.recordMember(tx, saved, 'ISSUED');
        return saved;
      },
    );

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
    return this.clubMemberRepo.manager.transaction(async (tx) => {
      const member = await tx.save(
        tx.create(ClubMember, {
          fullName: `عضو آزمایشی ${crypto.randomUUID().slice(0, 6)}`,
          email: `${crypto.randomUUID().slice(0, 8)}@e2e.example`,
          nationalIdEnc: encryptPii(nid),
          nationalIdHash: hashPii(nid),
          points: 6000,
          level: ClubTier.GOLD,
          cardStatus: ClubCardStatus.REVIEW,
        }),
      );
      await this.loyaltyProjection.recordMember(tx, member, 'CREATED');
      const request = await tx.save(
        tx.create(ClubCardRequest, {
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
      await this.loyaltyProjection.recordCardRequest(tx, request, 'CREATED');
      return toCardRequestView(request);
    });
  }

  // ── Card requests ─────────────────────────────────────────────────────

  async listRequests(requestId?: string) {
    // SUBMITTED lives in the site-admin track — the exec panels only ever
    // see REFERRED/APPROVED/REJECTED (confirmed against all three designs).
    const remote = await this.loyaltyCardRequests?.get(requestId);
    if (remote) return remote;
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
    return requests.map(toCardRequestView);
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
    return this.cardRequestRepo.manager.transaction(async (tx) => {
      const request = await tx
        .getRepository(ClubCardRequest)
        .createQueryBuilder('r')
        .leftJoinAndSelect('r.member', 'member')
        .where('r.id = :id', { id })
        .setLock('pessimistic_write', undefined, ['r'])
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
      const updated = await tx.save(request);

      await this.audit.record(
        {
          actorId: actor.id,
          actorRole: actor.role,
          category: 'CLUB',
          action: 'ارجاع درخواست کارت عضویت',
          detail: `درخواست کارت «${request.member.fullName}» توسط ${actor.fullName} به ${assigneeLabel} ارجاع شد.`,
          entityType: 'ClubCardRequest',
          entityId: id,
        },
        tx,
      );
      await this.loyaltyProjection.recordCardRequest(tx, updated, 'REFERRED');
      return toCardRequestView(updated);
    });
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
      return this.getMyMembershipLocal(userId);
    }

    await this.clubMemberRepo.manager.transaction(async (tx) => {
      const user = await tx.getRepository(User).findOne({
        where: { id: userId },
      });
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
      const repository = tx.getRepository(ClubMember);
      await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        hashPii(nationalId),
      ]);
      const byNid = await repository.findOne({
        where: { nationalIdHash: hashPii(nationalId) },
        lock: { mode: 'pessimistic_write' },
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
        if (byNid.userId === userId) return;
        byNid.userId = userId;
        const linked = await repository.save(byNid);
        await this.loyaltyProjection.recordMember(tx, linked, 'LINKED');
        return;
      }

      const email =
        user.email?.trim() ||
        (user.phone
          ? `${user.phone.replace(/\D/g, '')}@users.blujet.local`
          : '');
      if (!email) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_FAILED,
          message:
            'برای عضویت در باشگاه، ابتدا ایمیل یا شماره موبایل را در پروفایل تکمیل کنید.',
        });
      }

      const created = await repository.save(
        repository.create({
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
      await this.loyaltyProjection.recordMember(tx, created, 'CREATED');
    });

    return this.getMyMembershipLocal(userId);
  }

  /** Customer self-service: full club membership view for the user panel. */
  async getMyMembership(userId: string, requestId?: string) {
    const remote = await this.loyaltyMembership.get(userId, requestId);
    if (remote) {
      const {
        userId: assertedOwner,
        balance,
        pointsNeededForCard,
        ...view
      } = remote;
      void assertedOwner;
      return {
        ...view,
        balance: Number(balance),
        pointsNeededForCard: Number(pointsNeededForCard),
      };
    }
    return this.getMyMembershipLocal(userId);
  }

  private async getMyMembershipLocal(userId: string) {
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
    return this.clubMemberRepo.manager.transaction(async (tx) => {
      const member = await tx.getRepository(ClubMember).findOne({
        where: { userId, deactivatedAt: IsNull() },
        lock: { mode: 'pessimistic_write' },
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

      const pending = await tx
        .getRepository(ClubCardRequest)
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

      const req = await tx.save(
        tx.create(ClubCardRequest, {
          memberId: member.id,
          level: member.level,
          points: balance,
          status: ClubCardRequestStatus.SUBMITTED,
          history,
        }),
      );
      const currentMember = await tx.getRepository(ClubMember).findOneByOrFail({
        id: member.id,
      });
      currentMember.cardStatus = ClubCardStatus.REVIEW;
      const updatedMember = await tx.save(currentMember);
      await this.loyaltyProjection.recordCardRequest(tx, req, 'CREATED');
      await this.loyaltyProjection.recordMember(tx, updatedMember, 'UPDATED');
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
    return this.clubMemberRepo.manager.transaction(async (tx) => {
      const request = await tx
        .getRepository(ClubCardRequest)
        .createQueryBuilder('r')
        .leftJoinAndSelect('r.member', 'member')
        .where('r.id = :id', { id })
        .setLock('pessimistic_write', undefined, ['r'])
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
        Array.isArray(request.history)
          ? [...(request.history as unknown[])]
          : []
      ) as JsonValue;
      const member = await this.getMemberOrThrow(request.memberId, tx);

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
        member.cardStatus = ClubCardStatus.ISSUED;
        member.cardNo = cardNo;
        member.issuedByLabelFa = `${roleLabel} (تأیید درخواست)`;
      } else {
        (history as unknown[]).push({
          step: 'rejected',
          labelFa: `رد درخواست توسط ${roleLabel}`,
          at: this.nowJalaliLabel(),
        });
        request.status = ClubCardRequestStatus.REJECTED;
        request.decidedById = actor.id;
        request.decidedAt = new Date();
        request.history = history;
        member.cardStatus = ClubCardStatus.NONE;
      }

      const updated = await tx.save(request);
      const updatedMember = await tx.save(member);
      await this.audit.record(
        {
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
        },
        tx,
      );
      await this.loyaltyProjection.recordCardRequest(tx, updated, 'DECIDED');
      await this.loyaltyProjection.recordMember(
        tx,
        updatedMember,
        decision === 'approve' ? 'ISSUED' : 'UPDATED',
      );
      const { version, member: joinedMember, ...view } = updated;
      void version;
      void joinedMember;
      return view;
    });
  }
}
