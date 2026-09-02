import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import { FarePricingProposal } from '../../database/entities/fare-pricing-proposal.entity';
import { FlightInstance } from '../../database/entities/flight-instance.entity';
import { Flight } from '../../database/entities/flight.entity';
import { Booking } from '../../database/entities/booking.entity';
import { AuditLog } from '../../database/entities/audit-log.entity';
import { FlightReview } from '../../database/entities/flight-review.entity';
import {
  FlightDefinitionStatus,
  FlightReviewDecision,
  FlightReviewStage,
  PricingProposalStatus,
} from '../../database/enums';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ErrorCode } from '../../common/errors';
import {
  PRICE_SUGGESTION_PROVIDER,
  type PriceSuggestionProvider,
} from '../ai/price-suggestion.provider';
import { FlightDefinitionService } from '../flights/flight-definition.service';
import { FlightsService } from '../flights/flights.service';
import { SearchService } from '../booking-engine/search.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { compareIrr, toIrr } from '../../common/money';
import type { Irr } from '../../common/money';

const LOCKED_MESSAGE =
  'پیشنهاد اولیه تأیید شده است؛ قیمت فروش را از عملیات تغییر قیمت پرواز منتشرشده ویرایش کنید.';

export interface PersistedAiSuggestion {
  priceIrr: number;
  reason: string;
  factors: string[];
  season: string;
  occasion: string;
  confidence: number;
  modelVersion: string;
  generatedAt: string;
}

const CEO_REGISTERED_VISIBILITY_MS = 3 * 24 * 60 * 60 * 1000;

export function isCeoRegisteredProposalVisible(
  proposal: Pick<FarePricingProposal, 'approvedAt'>,
  now = new Date(),
): boolean {
  return (
    proposal.approvedAt != null &&
    proposal.approvedAt.getTime() >=
      now.getTime() - CEO_REGISTERED_VISIBILITY_MS
  );
}

@Injectable()
export class PricingService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(FarePricingProposal)
    private readonly proposalRepo: Repository<FarePricingProposal>,
    @InjectRepository(FlightInstance)
    private readonly instanceRepo: Repository<FlightInstance>,
    @InjectRepository(Flight)
    private readonly flightRepo: Repository<Flight>,
    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    @Inject(PRICE_SUGGESTION_PROVIDER)
    private readonly priceSuggestions: PriceSuggestionProvider,
    private readonly definitions: FlightDefinitionService,
    private readonly flights: FlightsService,
    private readonly search: SearchService,
  ) {}

  private withProposalRelations(
    qb: SelectQueryBuilder<FarePricingProposal>,
    alias = 'p',
  ) {
    return qb
      .leftJoinAndSelect(`${alias}.flightInstance`, 'flightInstance')
      .leftJoinAndSelect('flightInstance.flight', 'flight')
      .leftJoinAndSelect('flight.route', 'route')
      .leftJoin(`${alias}.proposedBy`, 'proposedBy')
      .addSelect(['proposedBy.id', 'proposedBy.fullName', 'proposedBy.role'])
      .leftJoin(`${alias}.approvedBy`, 'approvedBy')
      .addSelect(['approvedBy.id', 'approvedBy.fullName', 'approvedBy.role']);
  }

  /** CEO view: only operations-approved pending rows are actionable. */
  async listForCeo() {
    const proposals = await this.withProposalRelations(
      this.proposalRepo.createQueryBuilder('p'),
    )
      .orderBy('p.createdAt', 'DESC')
      .getMany();
    const pendingRows = proposals.filter(
      (p) =>
        p.status === PricingProposalStatus.PENDING &&
        (p.flightInstance.definitionStatus ===
          FlightDefinitionStatus.PENDING_CEO ||
          p.flightInstance.definitionStatus ===
            FlightDefinitionStatus.PENDING_REVISION),
    );
    const groupRows = (rows: FarePricingProposal[]) => {
      const groups = new Map<string, FarePricingProposal[]>();
      for (const row of rows) {
        const key = row.flightInstance.scheduleTemplateId ?? row.id;
        const current = groups.get(key) ?? [];
        current.push(row);
        groups.set(key, current);
      }
      return [...groups.values()].map((items) => {
        const sorted = [...items].sort(
          (left, right) =>
            left.flightInstance.departureAt.getTime() -
            right.flightInstance.departureAt.getTime(),
        );
        return {
          ...sorted[0]!,
          scheduleGroup: {
            occurrenceCount: sorted.length,
            startAt: sorted[0]!.flightInstance.departureAt.toISOString(),
            endAt: sorted.at(-1)!.flightInstance.departureAt.toISOString(),
            departures: sorted.map((item) =>
              item.flightInstance.departureAt.toISOString(),
            ),
          },
        };
      });
    };
    const pending = groupRows(pendingRows);
    return {
      pending,
      registered: groupRows(
        proposals.filter(
          (p) =>
            p.status === PricingProposalStatus.REGISTERED &&
            isCeoRegisteredProposalVisible(p),
        ),
      ),
      rejected: groupRows(
        proposals.filter((p) => p.status === PricingProposalStatus.REJECTED),
      ),
      pendingApprovalsCount: pending.length,
    };
  }

  async pendingApprovalsCount(): Promise<{ pendingApprovalsCount: number }> {
    const row = await this.proposalRepo
      .createQueryBuilder('p')
      .innerJoin('p.flightInstance', 'fi')
      .select('COUNT(DISTINCT COALESCE(fi."scheduleTemplateId", fi.id))', 'count')
      .where('p.status = :status', { status: PricingProposalStatus.PENDING })
      .andWhere('fi.definitionStatus IN (:...statuses)', {
        statuses: [
          FlightDefinitionStatus.PENDING_CEO,
          FlightDefinitionStatus.PENDING_REVISION,
        ],
      })
      .getRawOne<{ count: string }>();
    return { pendingApprovalsCount: Number(row?.count ?? 0) };
  }

  /** Commercial view: upcoming SCHEDULED instances joined with their proposal. */
  async listForCommercial() {
    const instances = await this.instanceRepo
      .createQueryBuilder('fi')
      .leftJoinAndSelect('fi.flight', 'flight')
      .leftJoinAndSelect('flight.route', 'route')
      .where('fi.status = :status', { status: 'SCHEDULED' })
      .orderBy('fi.departureAt', 'ASC')
      .getMany();

    const proposals = instances.length
      ? await this.withProposalRelations(
          this.proposalRepo.createQueryBuilder('p'),
        )
          .where('p.flightInstanceId IN (:...ids)', {
            ids: instances.map((i) => i.id),
          })
          .getMany()
      : [];
    const proposalByInstanceId = new Map(
      proposals.map((p) => [p.flightInstanceId, p]),
    );

    const agencySummaries = await Promise.all(
      instances.map((instance) => this.flights.allotmentSummary(instance.id)),
    );
    const agencySummaryByInstanceId = new Map(
      agencySummaries.map((summary) => [summary.flightInstanceId, summary]),
    );

    return {
      flights: instances.map((i) => ({
        ...i,
        pricing: proposalByInstanceId.get(i.id) ?? null,
        agencySummary: agencySummaryByInstanceId.get(i.id),
      })),
    };
  }

  async upsertProposal(
    actor: AuthenticatedUser,
    flightInstanceId: string,
    dto: {
      proposedPriceIrr: Irr;
      legalRateIrr?: Irr;
      note?: string;
      ceoNote?: string;
      operationsNote?: string;
      commercialNote?: string;
    },
  ) {
    const existing = await this.proposalRepo
      .createQueryBuilder('p')
      .where('p.flightInstanceId = :id', { id: flightInstanceId })
      .getOne();
    if (existing?.status === PricingProposalStatus.REGISTERED) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: LOCKED_MESSAGE,
      });
    }

    const proposalId = await this.dataSource.transaction(async (manager) => {
      // Lock the instance row alone — FOR UPDATE + LEFT JOIN fails on Postgres
      // ("nullable side of an outer join"). Relations are not needed here.
      const instance = await manager
        .createQueryBuilder(FlightInstance, 'fi')
        .setLock('pessimistic_write')
        .where('fi.id = :id', { id: flightInstanceId })
        .getOne();
      if (!instance) {
        throw new NotFoundException({
          code: ErrorCode.NOT_FOUND,
          message: 'پرواز یافت نشد.',
        });
      }

      const lockedExisting = await manager
        .createQueryBuilder(FarePricingProposal, 'p')
        .where('p.flightInstanceId = :id', { id: flightInstanceId })
        .getOne();

      let savedId: string;
      if (lockedExisting) {
        lockedExisting.proposedPriceIrr = dto.proposedPriceIrr;
        if (dto.legalRateIrr !== undefined) {
          lockedExisting.legalRateIrr = dto.legalRateIrr;
        }
        if (dto.note !== undefined) lockedExisting.note = dto.note;
        if (dto.ceoNote !== undefined) lockedExisting.ceoNote = dto.ceoNote;
        if (dto.operationsNote !== undefined) {
          lockedExisting.operationsNote = dto.operationsNote;
        }
        if (dto.commercialNote !== undefined) {
          lockedExisting.commercialNote = dto.commercialNote;
        }
        lockedExisting.proposedById = actor.id;
        lockedExisting.status = PricingProposalStatus.PENDING;
        lockedExisting.rejectionReason = null;
        lockedExisting.rejectedAt = null;
        lockedExisting.rejectedById = null;
        lockedExisting.aiSuggestion = null;
        if (instance.competitorPriceIrr != null) {
          lockedExisting.competitorPriceIrr = instance.competitorPriceIrr;
        }
        if (instance.basePriceIrr != null) {
          lockedExisting.basePriceIrr = instance.basePriceIrr;
        }
        lockedExisting.updatedAt = new Date();
        const saved = await manager.save(lockedExisting);
        savedId = saved.id;
      } else {
        const basePriceIrr = instance.basePriceIrr ?? dto.proposedPriceIrr;
        const created = await manager.save(
          manager.create(FarePricingProposal, {
            flightInstanceId,
            basePriceIrr,
            competitorPriceIrr: instance.competitorPriceIrr ?? null,
            proposedPriceIrr: dto.proposedPriceIrr,
            legalRateIrr: dto.legalRateIrr,
            note: dto.note,
            ceoNote: dto.ceoNote,
            operationsNote: dto.operationsNote,
            commercialNote: dto.commercialNote,
            proposedById: actor.id,
            status: PricingProposalStatus.PENDING,
            updatedAt: new Date(),
          }),
        );
        savedId = created.id;
      }

      this.definitions.markPendingCeoInTx(manager, flightInstanceId);
      return savedId;
    });

    const proposal = await this.withProposalRelations(
      this.proposalRepo.createQueryBuilder('p'),
    )
      .where('p.id = :id', { id: proposalId })
      .getOneOrFail();

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'PRICING',
      action: 'ارسال نرخ پیشنهادی پرواز',
      detail: `نرخ پیشنهادی پرواز ${proposal.flightInstance.flight.flightNo} توسط ${actor.fullName} برای گردش تأیید ثبت شد.`,
      entityType: 'FarePricingProposal',
      entityId: proposal.id,
      metadata: {
        proposedPriceIrr: dto.proposedPriceIrr,
        legalRateIrr: dto.legalRateIrr ?? null,
      },
    });

    return proposal;
  }

  async updatePublishedPrice(
    actor: AuthenticatedUser,
    flightInstanceId: string,
    dto: { salePriceIrr: Irr; reason: string; expectedVersion?: number },
  ) {
    const reason = dto.reason.trim();
    const result = await this.dataSource.transaction(async (manager) => {
      const instance = await manager.findOne(FlightInstance, {
        where: { id: flightInstanceId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!instance) {
        throw new NotFoundException({
          code: ErrorCode.NOT_FOUND,
          message: 'پرواز یافت نشد.',
        });
      }
      if (instance.definitionStatus !== FlightDefinitionStatus.PUBLISHED) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message: 'فقط قیمت پرواز منتشرشده قابل تغییر است.',
        });
      }
      if (
        dto.expectedVersion != null &&
        instance.version !== dto.expectedVersion
      ) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message:
            'نسخه پرواز تغییر کرده است. صفحه را تازه کنید و دوباره تلاش کنید.',
        });
      }

      const proposal = await manager.findOne(FarePricingProposal, {
        where: { flightInstanceId },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        !proposal ||
        proposal.status !== PricingProposalStatus.REGISTERED ||
        proposal.registeredPriceIrr == null
      ) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message: 'قیمت ثبت‌شده‌ای برای این پرواز وجود ندارد.',
        });
      }
      if (
        proposal.legalRateIrr != null &&
        compareIrr(dto.salePriceIrr, proposal.legalRateIrr) > 0
      ) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message: 'قیمت جدید از نرخ قانونی بیشتر است.',
        });
      }
      if (compareIrr(dto.salePriceIrr, proposal.registeredPriceIrr) === 0) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_FAILED,
          message: 'قیمت جدید با قیمت فعلی یکسان است.',
        });
      }

      const previousPrice = proposal.registeredPriceIrr;
      proposal.registeredPriceIrr = dto.salePriceIrr;
      proposal.updatedAt = new Date();
      instance.version += 1;
      await manager.save(proposal);
      await manager.save(instance);

      await manager.save(
        manager.create(AuditLog, {
          actorId: actor.id,
          actorRole: actor.role,
          category: 'PRICING',
          action: 'تغییر قیمت فروش پرواز منتشرشده',
          detail: reason,
          entityType: 'FarePricingProposal',
          entityId: proposal.id,
          metadata: {
            flightInstanceId,
            previousPriceIrr: String(previousPrice),
            salePriceIrr: String(dto.salePriceIrr),
            reason,
            version: instance.version,
          },
        }),
      );

      return { proposalId: proposal.id, version: instance.version };
    });

    await this.search.invalidateForInstance(flightInstanceId);
    const proposal = await this.withProposalRelations(
      this.proposalRepo.createQueryBuilder('p'),
    )
      .where('p.id = :id', { id: result.proposalId })
      .getOneOrFail();
    return { ...proposal, version: result.version };
  }

  async setLegalRate(actor: AuthenticatedUser, id: string, legalRateIrr: Irr) {
    const proposal = await this.withProposalRelations(
      this.proposalRepo.createQueryBuilder('p'),
    )
      .where('p.id = :id', { id })
      .getOne();
    if (!proposal) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'پیشنهاد قیمت یافت نشد.',
      });
    }

    if (proposal.status !== PricingProposalStatus.PENDING) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: LOCKED_MESSAGE,
      });
    }
    if (
      proposal.flightInstance.definitionStatus !==
        FlightDefinitionStatus.PENDING_CEO &&
      proposal.flightInstance.definitionStatus !==
        FlightDefinitionStatus.PENDING_REVISION
    ) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'این پیشنهاد هنوز توسط مدیر عملیات تأیید نشده است.',
      });
    }

    const legalRateUpdate = await this.proposalRepo.update(
      { id, status: PricingProposalStatus.PENDING },
      { legalRateIrr, updatedAt: new Date() },
    );
    if ((legalRateUpdate.affected ?? 0) === 0) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: LOCKED_MESSAGE,
      });
    }
    const updated = await this.withProposalRelations(
      this.proposalRepo.createQueryBuilder('p'),
    )
      .where('p.id = :id', { id })
      .getOneOrFail();

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'PRICING',
      action: 'ثبت نرخ قانونی (مصوب)',
      detail: `نرخ قانونی پرواز ${proposal.flightInstance.flight.flightNo} توسط ${actor.fullName} ثبت شد.`,
      entityType: 'FarePricingProposal',
      entityId: id,
      metadata: { legalRateIrr },
    });

    return updated;
  }

  async register(
    actor: AuthenticatedUser,
    id: string,
    source: 'PROPOSED' | 'AI',
    comment?: string,
  ) {
    const proposal = await this.withProposalRelations(
      this.proposalRepo.createQueryBuilder('p'),
    )
      .where('p.id = :id', { id })
      .getOne();
    if (!proposal) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'پیشنهاد قیمت یافت نشد.',
      });
    }
    // Idempotent: a second successful register call just returns the
    // already-registered row, without mutating the active definition again.
    if (proposal.status === PricingProposalStatus.REGISTERED) {
      return proposal;
    }
    if (proposal.status === PricingProposalStatus.REJECTED) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'این پیشنهاد رد شده است؛ ابتدا پیشنهاد جدید ارسال کنید.',
      });
    }

    // Conditional update + definition approval in one transaction. A
    // seasonal route is one commercial decision but remains one independent
    // FlightInstance per operating date after publication.
    const registered = await this.dataSource.transaction(async (manager) => {
      const lockedProposal = await manager.findOne(FarePricingProposal, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!lockedProposal) {
        throw new NotFoundException({
          code: ErrorCode.NOT_FOUND,
          message: 'پیشنهاد قیمت یافت نشد.',
        });
      }
      if (lockedProposal.status === PricingProposalStatus.REGISTERED) {
        return {
          alreadyRegistered: true as const,
          price: lockedProposal.registeredPriceIrr,
        };
      }

      let price: Irr = lockedProposal.proposedPriceIrr;
      if (source === 'AI') {
        const suggestion =
          lockedProposal.aiSuggestion as unknown as PersistedAiSuggestion | null;
        if (!suggestion?.priceIrr) {
          throw new ConflictException({
            code: ErrorCode.CONFLICT,
            message: 'برای این پیشنهاد تحلیل هوش مصنوعی ثبت نشده است.',
          });
        }
        price = toIrr(suggestion.priceIrr);
        if (
          lockedProposal.legalRateIrr != null &&
          compareIrr(price, lockedProposal.legalRateIrr) > 0
        ) {
          throw new ConflictException({
            code: ErrorCode.CONFLICT,
            message:
              'قیمت پیشنهادی هوش مصنوعی از نرخ قانونی (مصوب) بیشتر است و قابل ثبت نیست.',
          });
        }
      }
      if (lockedProposal.status === PricingProposalStatus.REJECTED) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message: 'این پیشنهاد رد شده است؛ ابتدا پیشنهاد جدید ارسال کنید.',
        });
      }
      const reviewComment =
        comment?.trim() ||
        (source === 'AI'
          ? 'قیمت پیشنهادی هوش مصنوعی و انتشار پرواز تأیید شد.'
          : 'قیمت پیشنهادی بازرگانی و انتشار پرواز تأیید شد.');
      const templateId = proposal.flightInstance.scheduleTemplateId;
      const instances = templateId
        ? await manager
            .getRepository(FlightInstance)
            .createQueryBuilder('instance')
            .setLock('pessimistic_write')
            .where('instance.scheduleTemplateId = :templateId', { templateId })
            .andWhere('instance.definitionStatus = :status', {
              status: FlightDefinitionStatus.PENDING_CEO,
            })
            .orderBy('instance.departureAt', 'ASC')
            .getMany()
        : await manager.find(FlightInstance, {
            where: { id: lockedProposal.flightInstanceId },
          });
      if (instances.length === 0) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message: 'رخدادی در انتظار تأیید مدیرعامل یافت نشد.',
        });
      }
      const instanceIds = instances.map((instance) => instance.id);
      const targetProposals = await manager
        .getRepository(FarePricingProposal)
        .createQueryBuilder('target')
        .setLock('pessimistic_write')
        .where('target.flightInstanceId IN (:...instanceIds)', { instanceIds })
        .andWhere('target.status = :status', {
          status: PricingProposalStatus.PENDING,
        })
        .getMany();
      if (targetProposals.length !== instances.length) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message: 'پیشنهاد قیمت همه روزهای این شماره پرواز آماده تأیید نیست.',
        });
      }

      const previousLocations: Array<{
        originCode: string;
        destCode: string;
        departureAt: Date;
      }> = [];
      for (const target of targetProposals) {
        target.status = PricingProposalStatus.REGISTERED;
        target.registeredPriceIrr = price;
        target.approvedById = actor.id;
        target.approvedAt = new Date();
        target.updatedAt = new Date();
        target.rejectionReason = null;
        target.rejectedAt = null;
        target.rejectedById = null;
        await manager.save(target);

        const { previousLocation } =
          await this.definitions.applyCeoApprovalInTx(
            manager,
            target.flightInstanceId,
            actor.id,
          );
        if (previousLocation) previousLocations.push(previousLocation);
        const review = await manager.save(
          manager.create(FlightReview, {
            flightInstanceId: target.flightInstanceId,
            stage: FlightReviewStage.CEO,
            decision: FlightReviewDecision.APPROVED,
            comment: reviewComment,
            reviewedByUserId: actor.id,
            reviewedAt: new Date(),
            expectedVersion: null,
          }),
        );
        await manager.save(
          manager.create(AuditLog, {
            actorId: actor.id,
            actorRole: actor.role,
            category: 'PRICING',
            action:
              source === 'AI'
                ? 'ثبت قیمت پرواز با پیشنهاد AI'
                : 'تأیید قیمت پیشنهادی بازرگانی',
            detail: `قیمت پرواز ${proposal.flightInstance.flight.flightNo} توسط ${actor.fullName} تأیید و منتشر شد.`,
            entityType: 'FarePricingProposal',
            entityId: target.id,
            metadata: {
              registeredPriceIrr: String(price),
              source,
              reviewId: review.id,
              scheduleTemplateId: templateId,
              occurrenceCount: instances.length,
            },
          }),
        );
      }
      return {
        alreadyRegistered: false as const,
        price,
        previousLocations,
        instanceIds,
      };
    });

    if (registered.alreadyRegistered) {
      return this.withProposalRelations(
        this.proposalRepo.createQueryBuilder('p'),
      )
        .where('p.id = :id', { id })
        .getOneOrFail();
    }

    await this.notifications.notify({
      recipientId: proposal.proposedById,
      category: 'APPROVAL',
      action: 'APPROVED',
      title: 'پیشنهاد قیمت شما تأیید شد',
      body: `مدیرعامل قیمت پرواز ${proposal.flightInstance.flight.flightNo} را تأیید و منتشر کرد.`,
      entityType: 'FarePricingProposal',
      entityId: id,
      dedupeKey: `FarePricingProposal:${id}:APPROVED`,
    });

    // Newly APPROVED inventory must appear in search immediately.
    await Promise.all(
      registered.instanceIds.map((instanceId) =>
        this.search.invalidateForInstance(instanceId),
      ),
    );
    // A revision may have moved the flight to a different route/date — the
    // OLD listing's cache entry is a separate key and must be busted too,
    // or the flight keeps appearing under its stale former date/route for
    // the rest of the cache TTL.
    await Promise.all(
      registered.previousLocations.map((previousLocation) =>
        this.search.invalidateForRouteDate(
          previousLocation.originCode,
          previousLocation.destCode,
          previousLocation.departureAt,
        ),
      ),
    );

    return this.withProposalRelations(this.proposalRepo.createQueryBuilder('p'))
      .where('p.id = :id', { id })
      .getOneOrFail();
  }

  async reject(
    actor: AuthenticatedUser,
    id: string,
    dto: {
      rejectionReason: string;
    },
  ) {
    const reason = (dto.rejectionReason ?? '').trim();
    if (!reason) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'دلیل رد الزامی است.',
      });
    }

    const proposal = await this.withProposalRelations(
      this.proposalRepo.createQueryBuilder('p'),
    )
      .where('p.id = :id', { id })
      .getOne();
    if (!proposal) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'پیشنهاد قیمت یافت نشد.',
      });
    }
    if (proposal.status === PricingProposalStatus.REJECTED) {
      return proposal;
    }
    if (proposal.status === PricingProposalStatus.REGISTERED) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: LOCKED_MESSAGE,
      });
    }

    const rejected = await this.dataSource.transaction(async (manager) => {
      await manager
        .createQueryBuilder(FlightInstance, 'fi')
        .setLock('pessimistic_write')
        .where('fi.id = :id', { id: proposal.flightInstanceId })
        .getOne();

      const lockedProposal = await manager.findOne(FarePricingProposal, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!lockedProposal) {
        throw new NotFoundException({
          code: ErrorCode.NOT_FOUND,
          message: 'پیشنهاد قیمت یافت نشد.',
        });
      }
      if (lockedProposal.status === PricingProposalStatus.REJECTED) {
        return { alreadyRejected: true as const };
      }
      if (lockedProposal.status === PricingProposalStatus.REGISTERED) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message: LOCKED_MESSAGE,
        });
      }

      const updated = await manager.update(
        FarePricingProposal,
        { id, status: PricingProposalStatus.PENDING },
        {
          status: PricingProposalStatus.REJECTED,
          rejectionReason: reason,
          rejectedById: actor.id,
          rejectedAt: new Date(),
          updatedAt: new Date(),
        },
      );
      if ((updated.affected ?? 0) === 0) {
        const raced = await manager.findOne(FarePricingProposal, {
          where: { id },
        });
        if (raced?.status === PricingProposalStatus.REJECTED) {
          return { alreadyRejected: true as const };
        }
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message: 'وضعیت پیشنهاد قابل رد نیست.',
        });
      }

      await this.definitions.applyCeoRejectionInTx(
        manager,
        lockedProposal.flightInstanceId,
        reason,
      );
      const review = await manager.save(
        manager.create(FlightReview, {
          flightInstanceId: lockedProposal.flightInstanceId,
          stage: FlightReviewStage.CEO,
          decision: FlightReviewDecision.REJECTED,
          comment: reason,
          reviewedByUserId: actor.id,
          reviewedAt: new Date(),
          expectedVersion: null,
        }),
      );
      await manager.save(
        manager.create(AuditLog, {
          actorId: actor.id,
          actorRole: actor.role,
          category: 'PRICING',
          action: 'رد پیشنهاد قیمت پرواز',
          detail: `پیشنهاد قیمت پرواز ${proposal.flightInstance.flight.flightNo} توسط ${actor.fullName} رد شد.`,
          entityType: 'FarePricingProposal',
          entityId: id,
          metadata: { rejectionReason: reason, reviewId: review.id },
        }),
      );
      return { alreadyRejected: false as const };
    });

    if (rejected.alreadyRejected) {
      return this.withProposalRelations(
        this.proposalRepo.createQueryBuilder('p'),
      )
        .where('p.id = :id', { id })
        .getOneOrFail();
    }

    await this.notifications.notify({
      recipientId: proposal.proposedById,
      category: 'APPROVAL',
      action: 'REJECTED',
      title: 'پیشنهاد قیمت شما رد شد',
      body: `مدیرعامل پیشنهاد قیمت پرواز ${proposal.flightInstance.flight.flightNo} را رد کرد: ${reason}`,
      entityType: 'FarePricingProposal',
      entityId: id,
      dedupeKey: `FarePricingProposal:${id}:REJECTED`,
    });

    return this.withProposalRelations(this.proposalRepo.createQueryBuilder('p'))
      .where('p.id = :id', { id })
      .getOneOrFail();
  }

  /**
   * Non-production only: creates a fresh SCHEDULED flight instance so
   * Playwright runs always have an un-priced row to drive (real instance
   * creation belongs to Phase 10's flight management). 404s in production.
   */
  async createTestInstance() {
    if (process.env.NODE_ENV === 'production') {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'یافت نشد.',
      });
    }
    const flight = await this.flightRepo.createQueryBuilder('f').getOneOrFail();
    const departureAt = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000);
    const created = await this.instanceRepo.save(
      this.instanceRepo.create({
        flightId: flight.id,
        departureAt,
        arrivalAt: new Date(departureAt.getTime() + 3 * 60 * 60 * 1000),
        capacity: 180,
        charterSeats: 60,
        status: 'SCHEDULED',
        definitionStatus: FlightDefinitionStatus.DRAFT,
      }),
    );
    return this.instanceRepo
      .createQueryBuilder('fi')
      .leftJoinAndSelect('fi.flight', 'flight')
      .leftJoinAndSelect('flight.route', 'route')
      .where('fi.id = :id', { id: created.id })
      .getOneOrFail();
  }

  /** Runs the advisory ML analysis for every PENDING proposal. Generation
   * never mutates prices/status — only the persisted aiSuggestion blob. */
  async runAiAnalysis(actor: AuthenticatedUser, requestId?: string) {
    const pending = await this.withProposalRelations(
      this.proposalRepo.createQueryBuilder('p'),
    )
      .where('p.status = :status', { status: 'PENDING' })
      .getMany();
    const analyzable = pending.filter((p) => p.competitorPriceIrr != null);
    if (analyzable.length === 0) {
      return { analyzed: 0, available: true };
    }

    const result = await this.priceSuggestions.suggest(
      // ADVISORY-ONLY ML boundary (CLAUDE.md ML Service Rules): the
      // FastAPI service expects plain JSON numbers, and this payload is a
      // one-way outbound signal for a suggestion — never round-tripped
      // back into a stored/authoritative field without going through
      // NestJS's own re-pricing/registration logic above. Individual fare
      // amounts are far below 2^53, so Number() loses no precision here.
      analyzable.map((p) => ({
        proposal_id: p.id,
        origin_code: p.flightInstance.flight.route.originCode,
        dest_code: p.flightInstance.flight.route.destCode,
        departure_at: p.flightInstance.departureAt.toISOString(),
        base_price_irr: Number(p.basePriceIrr),
        competitor_price_irr: Number(p.competitorPriceIrr),
        proposed_price_irr: Number(p.proposedPriceIrr),
        capacity: p.flightInstance.capacity,
        charter_seats: p.flightInstance.charterSeats,
      })),
      requestId,
    );

    // Graceful degradation: service down → documented empty result, no 500.
    if (!result) return { analyzed: 0, available: false };

    const generatedAt = new Date().toISOString();
    const pendingById = new Map(analyzable.map((p) => [p.id, p]));
    for (const s of result.suggestions) {
      const suggestion: PersistedAiSuggestion = {
        priceIrr: s.price_irr,
        reason: s.reason_fa,
        factors: s.factors_fa,
        season: s.season_fa,
        occasion: s.occasion_fa,
        confidence: s.confidence,
        modelVersion: result.model_version,
        generatedAt,
      };
      const target = pendingById.get(s.proposal_id);
      if (!target) continue;
      target.aiSuggestion = suggestion as unknown as typeof target.aiSuggestion;
      target.updatedAt = new Date();
      await this.proposalRepo.save(target);
    }

    // Usage logging per CLAUDE.md AI rules.
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'PRICING',
      action: 'اجرای تحلیل قیمت هوش مصنوعی',
      detail: `تحلیل هوش مصنوعی برای ${result.suggestions.length} پیشنهاد قیمت توسط ${actor.fullName} اجرا شد.`,
      metadata: {
        analyzed: result.suggestions.length,
        modelVersion: result.model_version,
      },
    });

    return { analyzed: result.suggestions.length, available: true };
  }
}
