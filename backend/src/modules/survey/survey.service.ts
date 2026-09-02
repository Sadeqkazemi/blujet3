import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { SurveySettings } from '../../database/entities/survey-settings.entity';
import { SurveyQuestion } from '../../database/entities/survey-question.entity';
import { SurveyInvite } from '../../database/entities/survey-invite.entity';
import { SurveyResponse } from '../../database/entities/survey-response.entity';
import { AiUsageLog } from '../../database/entities/ai-usage-log.entity';
import { Booking } from '../../database/entities/booking.entity';
import { Airport } from '../../database/entities/airport.entity';
import { FlightInstance } from '../../database/entities/flight-instance.entity';
import { SmsService } from '../sms/sms.service';
import { AuditService } from '../audit/audit.service';
import { ErrorCode } from '../../common/errors';
import { materializeSurveyInvites } from './survey-lifecycle.util';
import {
  SURVEY_SUMMARY_PROVIDER,
  type SurveySummaryProvider,
} from '../ai/survey-summary.provider';
import type {
  CreateSurveyQuestionDto,
  SubmitSurveyResponseDto,
  UpdateSurveySettingsDto,
} from './dto/survey.dtos';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

const FALLBACK_SUMMARY = 'خلاصه‌ای از نظرات این پرواز در دسترس نیست.';

@Injectable()
export class SurveyService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(SurveySettings)
    private readonly settingsRepo: Repository<SurveySettings>,
    @InjectRepository(SurveyQuestion)
    private readonly questionRepo: Repository<SurveyQuestion>,
    @InjectRepository(SurveyInvite)
    private readonly inviteRepo: Repository<SurveyInvite>,
    @InjectRepository(SurveyResponse)
    private readonly responseRepo: Repository<SurveyResponse>,
    @InjectRepository(AiUsageLog)
    private readonly aiUsageLogRepo: Repository<AiUsageLog>,
    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,
    @InjectRepository(Airport)
    private readonly airportRepo: Repository<Airport>,
    private readonly sms: SmsService,
    private readonly audit: AuditService,
    @Inject(SURVEY_SUMMARY_PROVIDER)
    private readonly summaryProvider: SurveySummaryProvider,
  ) {}

  private async materialize(): Promise<void> {
    await materializeSurveyInvites(
      this.dataSource,
      this.bookingRepo,
      this.inviteRepo,
      this.settingsRepo,
      this.sms,
    );
  }

  // ── IT_MANAGER configuration ────────────────────────────────────────
  private async getOrCreateSettings() {
    const existing = await this.settingsRepo.findOne({
      where: {},
      order: { createdAt: 'ASC' },
      relations: { updatedBy: true },
    });
    if (existing) return existing;
    return this.settingsRepo.save(
      this.settingsRepo.create({ updatedAt: new Date() }),
    );
  }

  async getSettings() {
    const s = await this.getOrCreateSettings();
    return {
      enabled: s.enabled,
      title: s.title,
      updatedAt: s.updatedAt,
      updatedByLabelFa: s.updatedBy?.fullName ?? null,
    };
  }

  async updateSettings(actor: AuthenticatedUser, dto: UpdateSurveySettingsDto) {
    const current = await this.getOrCreateSettings();
    if (dto.enabled !== undefined) current.enabled = dto.enabled;
    if (dto.title !== undefined) current.title = dto.title;
    current.updatedById = actor.id;
    current.updatedAt = new Date();
    const saved = await this.settingsRepo.save(current);
    const updated = await this.settingsRepo.findOne({
      where: { id: saved.id },
      relations: { updatedBy: true },
    });
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'SURVEY',
      action: 'تغییر تنظیمات نظرسنجی مسافران',
      detail: `${actor.fullName} تنظیمات نظرسنجی را به‌روزرسانی کرد.`,
      entityType: 'SurveySettings',
      entityId: saved.id,
    });
    return {
      enabled: updated!.enabled,
      title: updated!.title,
      updatedAt: updated!.updatedAt,
      updatedByLabelFa: updated!.updatedBy?.fullName ?? null,
    };
  }

  async listQuestions() {
    const rows = await this.questionRepo.find({ order: { order: 'ASC' } });
    return rows.map((q) => ({ id: q.id, label: q.label, order: q.order }));
  }

  async addQuestion(actor: AuthenticatedUser, dto: CreateSurveyQuestionDto) {
    const last = await this.questionRepo.findOne({
      where: {},
      order: { order: 'DESC' },
    });
    const question = await this.questionRepo.save(
      this.questionRepo.create({
        label: dto.label,
        order: (last?.order ?? -1) + 1,
      }),
    );
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'SURVEY',
      action: 'افزودن سؤال نظرسنجی',
      detail: `${actor.fullName} سؤال «${dto.label}» را افزود.`,
      entityType: 'SurveyQuestion',
      entityId: question.id,
    });
    return { id: question.id, label: question.label, order: question.order };
  }

  async removeQuestion(actor: AuthenticatedUser, id: string) {
    const question = await this.questionRepo.findOneBy({ id });
    if (!question) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'سؤال یافت نشد.',
      });
    }
    await this.questionRepo.delete({ id });
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'SURVEY',
      action: 'حذف سؤال نظرسنجی',
      detail: `${actor.fullName} سؤال «${question.label}» را حذف کرد.`,
      entityType: 'SurveyQuestion',
      entityId: id,
    });
    return { id };
  }

  async getStats() {
    await this.materialize();

    const [flightsWithSurveyCount, totalResponses, avgRow, recent] =
      await Promise.all([
        this.responseRepo
          .createQueryBuilder('r')
          .innerJoin('r.invite', 'invite')
          .select('DISTINCT invite.flightInstanceId', 'flightInstanceId')
          .getRawMany<{ flightInstanceId: string }>()
          .then((rows) => rows.length),
        this.responseRepo.count(),
        this.responseRepo
          .createQueryBuilder('r')
          .select('AVG(r.rating)', 'avg')
          .getRawOne<{ avg: string | null }>(),
        this.responseRepo
          .createQueryBuilder('r')
          .leftJoinAndSelect('r.invite', 'invite')
          .leftJoinAndSelect('invite.flightInstance', 'flightInstance')
          .leftJoinAndSelect('flightInstance.flight', 'flight')
          .leftJoinAndSelect('flight.route', 'route')
          .orderBy('r.createdAt', 'DESC')
          .take(8)
          .getMany(),
      ]);

    const airportCodes = new Set<string>();
    for (const r of recent) {
      airportCodes.add(r.invite.flightInstance.flight.route.originCode);
      airportCodes.add(r.invite.flightInstance.flight.route.destCode);
    }
    const airportRows = airportCodes.size
      ? await this.airportRepo
          .createQueryBuilder('a')
          .where('a.code IN (:...codes)', { codes: [...airportCodes] })
          .getMany()
      : [];
    const cityFa = new Map(airportRows.map((a) => [a.code, a.cityFa]));

    return {
      flightsWithSurvey: flightsWithSurveyCount,
      totalResponses,
      avgRating: avgRow?.avg ? Math.round(Number(avgRow.avg) * 10) / 10 : 0,
      recentResponses: recent.map((r) => {
        const route = r.invite.flightInstance.flight.route;
        const origin = cityFa.get(route.originCode) ?? route.originCode;
        const dest = cityFa.get(route.destCode) ?? route.destCode;
        return {
          id: r.id,
          flightNo: r.invite.flightInstance.flight.flightNo,
          route: `${origin} — ${dest}`,
          rating: r.rating,
          comment: r.comment,
          at: r.createdAt,
        };
      }),
    };
  }

  // ── Public token-based submission ───────────────────────────────────
  private async findInviteByToken(token: string) {
    const invite = await this.inviteRepo
      .createQueryBuilder('si')
      .leftJoinAndSelect('si.flightInstance', 'flightInstance')
      .leftJoinAndSelect('flightInstance.flight', 'flight')
      .leftJoinAndSelect('flight.route', 'route')
      .leftJoinAndSelect('si.booking', 'booking')
      .where('si.token = :token', { token })
      .getOne();
    // A booking later marked NO_SHOW never actually flew — its invite is
    // treated exactly like an unknown token (same generic message, no
    // oracle on the booking's internal status) rather than a distinct
    // error, so a no-show passenger (or anyone holding the link) can no
    // longer submit — or even see — a rating for a flight they didn't
    // take.
    if (!invite || invite.booking.status === 'NO_SHOW') {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'لینک نظرسنجی معتبر نیست.',
      });
    }
    // SurveyInvite has no inverse relation to SurveyResponse (same
    // recurring shape as Booking elsewhere in this codebase) — a separate
    // query replaces the joined-relation read.
    const response = await this.responseRepo.findOneBy({
      inviteId: invite.id,
    });
    return { ...invite, response };
  }

  async getPublicInvite(token: string) {
    const invite = await this.findInviteByToken(token);
    const settings = await this.getOrCreateSettings();
    if (!settings.enabled) {
      throw new ConflictException({
        code: ErrorCode.SURVEY_DISABLED,
        message: 'نظرسنجی در حال حاضر غیرفعال است.',
      });
    }
    if (invite.response) {
      throw new ConflictException({
        code: ErrorCode.SURVEY_ALREADY_SUBMITTED,
        message: 'شما قبلاً به این نظرسنجی پاسخ داده‌اید.',
      });
    }
    const [questions, originAirport, destAirport] = await Promise.all([
      this.listQuestions(),
      this.airportRepo.findOneBy({
        code: invite.flightInstance.flight.route.originCode,
      }),
      this.airportRepo.findOneBy({
        code: invite.flightInstance.flight.route.destCode,
      }),
    ]);
    return {
      title: settings.title,
      questions,
      flightNo: invite.flightInstance.flight.flightNo,
      originCityFa:
        originAirport?.cityFa ?? invite.flightInstance.flight.route.originCode,
      destCityFa:
        destAirport?.cityFa ?? invite.flightInstance.flight.route.destCode,
      departureAt: invite.flightInstance.departureAt,
    };
  }

  async submitResponse(token: string, dto: SubmitSurveyResponseDto) {
    const invite = await this.findInviteByToken(token);
    const settings = await this.getOrCreateSettings();
    if (!settings.enabled) {
      throw new ConflictException({
        code: ErrorCode.SURVEY_DISABLED,
        message: 'نظرسنجی در حال حاضر غیرفعال است.',
      });
    }
    if (invite.response) {
      throw new ConflictException({
        code: ErrorCode.SURVEY_ALREADY_SUBMITTED,
        message: 'شما قبلاً به این نظرسنجی پاسخ داده‌اید.',
      });
    }
    await this.responseRepo.manager.transaction(async (tx) => {
      await tx.save(
        tx.create(SurveyResponse, {
          inviteId: invite.id,
          rating: dto.rating,
          comment: dto.comment,
        }),
      );
      await tx.update(SurveyInvite, invite.id, { respondedAt: new Date() });
    });
    return { submitted: true };
  }

  // ── Exec read-only results + AI summary ─────────────────────────────
  async getResults() {
    await this.materialize();
    const settings = await this.getOrCreateSettings();
    if (!settings.enabled) {
      return { disabled: true as const, flights: [] };
    }

    // Real DB-level aggregation (count/avg computed by Postgres, not by
    // loading every historical response into Node) — this endpoint is
    // hit on every load of three different exec panels, so it must stay
    // bounded by the number of *surveyed flights*, not the number of
    // responses ever submitted.
    const grouped = await this.responseRepo.manager.query<
      { flightInstanceId: string; count: string; avgRating: string }[]
    >(`
      SELECT si."flightInstanceId" AS "flightInstanceId",
             COUNT(*)::int AS "count",
             AVG(sr.rating)::float8 AS "avgRating"
      FROM survey_invites si
      JOIN survey_responses sr ON sr."inviteId" = si.id
      GROUP BY si."flightInstanceId"
    `);
    if (grouped.length === 0) {
      return { disabled: false as const, flights: [] };
    }

    const instances = await this.responseRepo.manager
      .createQueryBuilder(FlightInstance, 'fi')
      .leftJoinAndSelect('fi.flight', 'flight')
      .leftJoinAndSelect('flight.route', 'route')
      .where('fi.id IN (:...ids)', {
        ids: grouped.map((g) => g.flightInstanceId),
      })
      .getMany();
    const instanceById = new Map(instances.map((i) => [i.id, i]));

    const airportCodes = new Set<string>();
    for (const i of instanceById.values()) {
      airportCodes.add(i.flight.route.originCode);
      airportCodes.add(i.flight.route.destCode);
    }
    const airports = await this.airportRepo
      .createQueryBuilder('a')
      .where('a.code IN (:...codes)', { codes: [...airportCodes] })
      .getMany();
    const cityFa = new Map(airports.map((a) => [a.code, a.cityFa]));

    const flights = grouped
      .map((g) => {
        const instance = instanceById.get(g.flightInstanceId);
        if (!instance) return null;
        return {
          flightInstanceId: g.flightInstanceId,
          flightNo: instance.flight.flightNo,
          originCityFa:
            cityFa.get(instance.flight.route.originCode) ??
            instance.flight.route.originCode,
          destCityFa:
            cityFa.get(instance.flight.route.destCode) ??
            instance.flight.route.destCode,
          departureAt: instance.departureAt,
          count: Number(g.count),
          avgRating: Math.round(Number(g.avgRating) * 10) / 10,
        };
      })
      .filter((f): f is NonNullable<typeof f> => f !== null);
    flights.sort((a, b) => b.departureAt.getTime() - a.departureAt.getTime());

    return { disabled: false as const, flights };
  }

  async analyzeFlight(flightInstanceId: string, actor: AuthenticatedUser) {
    const responses = await this.responseRepo
      .createQueryBuilder('r')
      .innerJoin('r.invite', 'invite')
      .where('invite.flightInstanceId = :flightInstanceId', {
        flightInstanceId,
      })
      .getMany();
    const comments = responses
      .map((r) => r.comment)
      .filter((c): c is string => !!c && c.trim().length > 0);

    const result = await this.summaryProvider.summarize(comments);
    if (!result) {
      return { summary: FALLBACK_SUMMARY };
    }

    await this.aiUsageLogRepo.save(
      this.aiUsageLogRepo.create({
        provider: 'survey-summary',
        userId: actor.id,
        contextId: flightInstanceId,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      }),
    );

    return { summary: result.summary };
  }
}
