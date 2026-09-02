import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import type { ActorContextDto } from '../common/actor-context.dto';
import { SurveyInvite } from '../database/entities/survey-invite.entity';
import { SurveyQuestion } from '../database/entities/survey-question.entity';
import { SurveyResponse } from '../database/entities/survey-response.entity';
import { SurveySettings } from '../database/entities/survey-settings.entity';
import type {
  CreateSurveyQuestionDto,
  FlownBookingSnapshotDto,
  SubmitSurveyResponseDto,
  UpdateSurveySettingsDto,
} from './dto/survey.dto';

const RESULT_ROLES = ['CEO', 'SENIOR_MANAGER', 'BOARD_CHAIR'] as const;

@Injectable()
export class SurveyService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(SurveySettings)
    private readonly settingsRepo: Repository<SurveySettings>,
    @InjectRepository(SurveyQuestion)
    private readonly questionRepo: Repository<SurveyQuestion>,
    @InjectRepository(SurveyInvite)
    private readonly inviteRepo: Repository<SurveyInvite>,
    @InjectRepository(SurveyResponse)
    private readonly responseRepo: Repository<SurveyResponse>,
  ) {}

  private assertIt(actor: ActorContextDto): void {
    if (actor.role !== 'IT_MANAGER' && !actor.isSuperAdmin) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'دسترسی به تنظیمات نظرسنجی مجاز نیست.',
      });
    }
  }

  private assertResults(actor: ActorContextDto): void {
    if (
      !(RESULT_ROLES as readonly string[]).includes(actor.role) &&
      !actor.isSuperAdmin
    ) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'دسترسی به نتایج نظرسنجی مجاز نیست.',
      });
    }
  }

  private async settings(): Promise<SurveySettings> {
    const current = await this.settingsRepo.findOne({
      where: {},
      order: { createdAt: 'ASC' },
    });
    return (
      current ??
      this.settingsRepo.save(
        this.settingsRepo.create({
          enabled: true,
          title: 'نظرسنجی رضایت مسافران',
          updatedById: null,
          updatedByName: null,
          updatedAt: new Date(),
        }),
      )
    );
  }

  private settingsView(row: SurveySettings) {
    return {
      enabled: row.enabled,
      title: row.title,
      updatedAt: row.updatedAt,
      updatedByLabelFa: row.updatedByName,
    };
  }

  async getSettings(actor: ActorContextDto) {
    this.assertIt(actor);
    return this.settingsView(await this.settings());
  }

  async updateSettings(actor: ActorContextDto, input: UpdateSurveySettingsDto) {
    this.assertIt(actor);
    const row = await this.settings();
    if (input.enabled !== undefined) row.enabled = input.enabled;
    if (input.title !== undefined) row.title = input.title;
    row.updatedById = actor.id;
    row.updatedByName = actor.fullName;
    row.updatedAt = new Date();
    return this.settingsView(await this.settingsRepo.save(row));
  }

  async listQuestions(actor?: ActorContextDto) {
    if (actor) this.assertIt(actor);
    const rows = await this.questionRepo.find({ order: { order: 'ASC' } });
    return rows.map((row) => ({
      id: row.id,
      label: row.label,
      order: row.order,
    }));
  }

  async addQuestion(actor: ActorContextDto, input: CreateSurveyQuestionDto) {
    this.assertIt(actor);
    const last = await this.questionRepo.findOne({
      where: {},
      order: { order: 'DESC' },
    });
    const row = await this.questionRepo.save(
      this.questionRepo.create({
        label: input.label,
        order: (last?.order ?? -1) + 1,
      }),
    );
    return { id: row.id, label: row.label, order: row.order };
  }

  async removeQuestion(actor: ActorContextDto, id: string) {
    this.assertIt(actor);
    const row = await this.questionRepo.findOneBy({ id });
    if (!row) this.notFound('سؤال یافت نشد.');
    await this.questionRepo.delete({ id });
    return { id };
  }

  async materialize(bookings: FlownBookingSnapshotDto[]) {
    if (bookings.length === 0) return { pendingNotifications: [] };
    const existing = await this.inviteRepo.find({
      where: { bookingId: In(bookings.map((booking) => booking.bookingId)) },
    });
    const byBooking = new Map(
      existing.map((invite) => [invite.bookingId, invite]),
    );
    const resolved: SurveyInvite[] = [];
    for (const snapshot of bookings) {
      const invite =
        byBooking.get(snapshot.bookingId) ??
        this.inviteRepo.create({
          bookingId: snapshot.bookingId,
          flightInstanceId: snapshot.flightInstanceId,
          smsSentAt: null,
          respondedAt: null,
        });
      invite.contactPhoneSnapshot = snapshot.contactPhone ?? null;
      invite.flightNoSnapshot = snapshot.flightNo;
      invite.originCityFaSnapshot = snapshot.originCityFa;
      invite.destCityFaSnapshot = snapshot.destCityFa;
      invite.departureAtSnapshot = new Date(snapshot.departureAt);
      resolved.push(await this.inviteRepo.save(invite));
    }
    return {
      pendingNotifications: resolved
        .filter((invite) => !invite.smsSentAt && invite.contactPhoneSnapshot)
        .map((invite) => ({
          inviteId: invite.id,
          token: invite.token,
          phone: invite.contactPhoneSnapshot,
        })),
    };
  }

  async acknowledgeInvite(inviteId: string) {
    const invite = await this.inviteRepo.findOneBy({ id: inviteId });
    if (!invite) this.notFound('دعوت نظرسنجی یافت نشد.');
    if (!invite.smsSentAt) {
      invite.smsSentAt = new Date();
      await this.inviteRepo.save(invite);
    }
    return { inviteId, acknowledged: true };
  }

  private async inviteByToken(token: string) {
    const invite = await this.inviteRepo.findOneBy({ token });
    if (!invite) this.notFound('لینک نظرسنجی معتبر نیست.');
    const response = await this.responseRepo.findOneBy({ inviteId: invite.id });
    return { invite, response };
  }

  async getPublicInvite(token: string) {
    const { invite, response } = await this.inviteByToken(token);
    const settings = await this.settings();
    this.assertSurveyAvailable(settings.enabled, Boolean(response));
    return {
      title: settings.title,
      questions: await this.listQuestions(),
      flightNo: invite.flightNoSnapshot ?? '',
      originCityFa: invite.originCityFaSnapshot ?? '',
      destCityFa: invite.destCityFaSnapshot ?? '',
      departureAt: invite.departureAtSnapshot,
    };
  }

  async submitResponse(token: string, input: SubmitSurveyResponseDto) {
    const { invite, response } = await this.inviteByToken(token);
    const settings = await this.settings();
    this.assertSurveyAvailable(settings.enabled, Boolean(response));
    await this.dataSource.transaction(async (manager) => {
      await manager.save(
        manager.create(SurveyResponse, {
          inviteId: invite.id,
          rating: input.rating,
          comment: input.comment ?? null,
        }),
      );
      await manager.update(SurveyInvite, invite.id, {
        respondedAt: new Date(),
      });
    });
    return { submitted: true };
  }

  async getStats(actor: ActorContextDto) {
    this.assertIt(actor);
    const [flights, count, average, recent] = await Promise.all([
      this.responseRepo
        .createQueryBuilder('response')
        .innerJoin(SurveyInvite, 'invite', 'invite.id = response."inviteId"')
        .select('DISTINCT invite."flightInstanceId"', 'id')
        .getRawMany<{ id: string }>(),
      this.responseRepo.count(),
      this.responseRepo
        .createQueryBuilder('response')
        .select('AVG(response.rating)', 'average')
        .getRawOne<{ average: string | null }>(),
      this.responseRepo
        .createQueryBuilder('response')
        .innerJoin(SurveyInvite, 'invite', 'invite.id = response."inviteId"')
        .select('response.id', 'id')
        .addSelect('response.rating', 'rating')
        .addSelect('response.comment', 'comment')
        .addSelect('response.createdAt', 'at')
        .addSelect('invite.flightNoSnapshot', 'flightNo')
        .addSelect(
          `CONCAT(invite."originCityFaSnapshot", ' — ', invite."destCityFaSnapshot")`,
          'route',
        )
        .orderBy('response.createdAt', 'DESC')
        .take(8)
        .getRawMany<Record<string, unknown>>(),
    ]);
    return {
      flightsWithSurvey: flights.length,
      totalResponses: count,
      avgRating: average?.average
        ? Math.round(Number(average.average) * 10) / 10
        : 0,
      recentResponses: recent,
    };
  }

  async getResults(actor: ActorContextDto) {
    this.assertResults(actor);
    const settings = await this.settings();
    if (!settings.enabled) return { disabled: true as const, flights: [] };
    const rows = await this.responseRepo
      .createQueryBuilder('response')
      .innerJoin(SurveyInvite, 'invite', 'invite.id = response."inviteId"')
      .select('invite.flightInstanceId', 'flightInstanceId')
      .addSelect('invite.flightNoSnapshot', 'flightNo')
      .addSelect('invite.originCityFaSnapshot', 'originCityFa')
      .addSelect('invite.destCityFaSnapshot', 'destCityFa')
      .addSelect('invite.departureAtSnapshot', 'departureAt')
      .addSelect('COUNT(*)::int', 'count')
      .addSelect('AVG(response.rating)::float8', 'avgRating')
      .groupBy('invite.flightInstanceId')
      .addGroupBy('invite.flightNoSnapshot')
      .addGroupBy('invite.originCityFaSnapshot')
      .addGroupBy('invite.destCityFaSnapshot')
      .addGroupBy('invite.departureAtSnapshot')
      .orderBy('invite.departureAtSnapshot', 'DESC')
      .getRawMany<{
        flightInstanceId: string;
        flightNo: string;
        originCityFa: string;
        destCityFa: string;
        departureAt: Date;
        count: string;
        avgRating: string;
      }>();
    return {
      disabled: false as const,
      flights: rows.map((row) => ({
        ...row,
        count: Number(row.count),
        avgRating: Math.round(Number(row.avgRating) * 10) / 10,
      })),
    };
  }

  async comments(actor: ActorContextDto, flightInstanceId: string) {
    this.assertResults(actor);
    const rows = await this.responseRepo
      .createQueryBuilder('response')
      .innerJoin(SurveyInvite, 'invite', 'invite.id = response."inviteId"')
      .select('response.comment', 'comment')
      .where('invite."flightInstanceId" = :flightInstanceId', {
        flightInstanceId,
      })
      .andWhere('response.comment IS NOT NULL')
      .getRawMany<{ comment: string }>();
    return { comments: rows.map((row) => row.comment).filter(Boolean) };
  }

  private assertSurveyAvailable(enabled: boolean, responded: boolean): void {
    if (!enabled) {
      throw new ConflictException({
        code: 'SURVEY_DISABLED',
        message: 'نظرسنجی در حال حاضر غیرفعال است.',
      });
    }
    if (responded) {
      throw new ConflictException({
        code: 'SURVEY_ALREADY_SUBMITTED',
        message: 'شما قبلاً به این نظرسنجی پاسخ داده‌اید.',
      });
    }
  }

  private notFound(message: string): never {
    throw new NotFoundException({ code: 'NOT_FOUND', message });
  }
}
