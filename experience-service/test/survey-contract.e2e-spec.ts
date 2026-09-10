import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

describe('Experience survey contract (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let bookingId: string;
  let flightInstanceId: string;
  let inviteId: string;
  let inviteToken: string;
  let originalSettings:
    | {
        id: string;
        enabled: boolean;
        title: string;
        updatedById: string | null;
        updatedByName: string | null;
      }
    | undefined;
  const actorId = randomUUID();
  const token = () => process.env.EXPERIENCE_INTERNAL_TOKEN ?? '';
  const itActor = {
    id: actorId,
    fullName: 'مدیر فناوری تست',
    role: 'IT_MANAGER',
    isSuperAdmin: false,
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    dataSource = app.get(DataSource);
    [originalSettings] = await dataSource.query<
      Array<NonNullable<typeof originalSettings>>
    >(
      'SELECT "id", "enabled", "title", "updatedById", "updatedByName" FROM "experience"."survey_settings" ORDER BY "createdAt" ASC LIMIT 1',
    );
    bookingId = randomUUID();
    flightInstanceId = randomUUID();
  });

  afterAll(async () => {
    if (inviteId) {
      await dataSource.query(
        'DELETE FROM "experience"."survey_responses" WHERE "inviteId" = $1',
        [inviteId],
      );
      await dataSource.query(
        'DELETE FROM "experience"."survey_invites" WHERE "id" = $1',
        [inviteId],
      );
    }
    if (originalSettings) {
      await dataSource.query(
        'UPDATE "experience"."survey_settings" SET "enabled" = $1, "title" = $2, "updatedById" = $3, "updatedByName" = $4, "updatedAt" = NOW() WHERE "id" = $5',
        [
          originalSettings.enabled,
          originalSettings.title,
          originalSettings.updatedById,
          originalSettings.updatedByName,
          originalSettings.id,
        ],
      );
    } else {
      await dataSource.query(
        'DELETE FROM "experience"."survey_settings" WHERE "updatedById" = $1',
        [actorId],
      );
    }
    await app.close();
  });

  it('stores the updater name and enforces the IT role', async () => {
    await request(app.getHttpServer())
      .post('/internal/v1/survey/admin/settings/detail')
      .set('x-internal-token', token())
      .send({ actor: { ...itActor, role: 'USER' } })
      .expect(403);

    const updated = await request(app.getHttpServer())
      .patch('/internal/v1/survey/admin/settings')
      .set('x-internal-token', token())
      .send({
        actor: itActor,
        input: { enabled: true, title: 'نظرسنجی قرارداد تست' },
      })
      .expect(200);
    expect(updated.body.data.updatedByLabelFa).toBe(itActor.fullName);
  });

  it('materializes an idempotent Core snapshot and exposes the public form', async () => {
    const snapshot = {
      bookingId,
      flightInstanceId,
      contactPhone: '09121234567',
      flightNo: 'BJ-E2E',
      originCityFa: 'تهران',
      destCityFa: 'مشهد',
      departureAt: '2026-09-01T10:00:00.000Z',
    };
    const first = await request(app.getHttpServer())
      .post('/internal/v1/survey/materialize')
      .set('x-internal-token', token())
      .send({ bookings: [snapshot] })
      .expect(201);
    inviteId = first.body.data.pendingNotifications[0].inviteId;
    inviteToken = first.body.data.pendingNotifications[0].token;

    const second = await request(app.getHttpServer())
      .post('/internal/v1/survey/materialize')
      .set('x-internal-token', token())
      .send({ bookings: [snapshot] })
      .expect(201);
    expect(second.body.data.pendingNotifications[0].inviteId).toBe(inviteId);

    const publicInvite = await request(app.getHttpServer())
      .get(`/internal/v1/survey/public/${inviteToken}`)
      .set('x-internal-token', token())
      .expect(200);
    expect(publicInvite.body.data).toEqual(
      expect.objectContaining({
        flightNo: 'BJ-E2E',
        originCityFa: 'تهران',
        destCityFa: 'مشهد',
      }),
    );
  });

  it('accepts one response and rejects replay with the stable code', async () => {
    await request(app.getHttpServer())
      .post(`/internal/v1/survey/public/${inviteToken}`)
      .set('x-internal-token', token())
      .send({ input: { rating: 5, comment: 'عالی بود' } })
      .expect(201);

    const replay = await request(app.getHttpServer())
      .post(`/internal/v1/survey/public/${inviteToken}`)
      .set('x-internal-token', token())
      .send({ input: { rating: 4 } })
      .expect(409);
    expect(replay.body.code).toBe('SURVEY_ALREADY_SUBMITTED');
  });
});
