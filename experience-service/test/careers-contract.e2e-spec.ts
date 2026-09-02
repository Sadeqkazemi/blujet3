import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { JobApplication } from '../src/database/entities/job-application.entity';
import { JobPosting } from '../src/database/entities/job-posting.entity';

describe('Experience careers contract (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  const actorId = randomUUID();
  const targetId = randomUUID();
  const postingIds: string[] = [];
  const applicationIds: string[] = [];
  const token = () => process.env.EXPERIENCE_INTERNAL_TOKEN ?? '';
  const actor = {
    id: actorId,
    fullName: 'مدیر استخدام تست',
    role: 'SITE_ADMIN',
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
    await dataSource.query(
      'INSERT INTO "users" ("id", "role", "fullName", "updatedAt") VALUES ($1, $2, $3, NOW()), ($4, $5, $6, NOW())',
      [
        actorId,
        'SITE_ADMIN',
        actor.fullName,
        targetId,
        'COMMERCIAL_MANAGER',
        'مدیر مقصد تست',
      ],
    );
  });

  afterAll(async () => {
    if (applicationIds.length > 0) {
      await dataSource.getRepository(JobApplication).delete(applicationIds);
    }
    if (postingIds.length > 0) {
      await dataSource.getRepository(JobPosting).delete(postingIds);
    }
    await dataSource.query('DELETE FROM "users" WHERE "id" = ANY($1)', [
      [actorId, targetId],
    ]);
    await app.close();
  });

  it('creates a job and exposes it through the public read contract', async () => {
    const marker = randomUUID();
    const created = await request(app.getHttpServer())
      .post('/internal/v1/careers/admin/postings')
      .set('x-internal-token', token())
      .send({
        actor,
        input: {
          title: `کارشناس تست ${marker}`,
          dept: 'فناوری',
          city: 'تهران',
          type: 'FULL_TIME',
          generalReqs: ['دقت'],
          specialReqs: ['TypeScript'],
        },
      })
      .expect(201);
    postingIds.push(created.body.data.id);

    const publicJob = await request(app.getHttpServer())
      .get(`/internal/v1/careers/public/jobs/${created.body.data.id}`)
      .set('x-internal-token', token())
      .expect(200);
    expect(publicJob.body.data).toEqual(
      expect.objectContaining({ id: created.body.data.id, active: true }),
    );
  });

  it('encrypts applicant PII and persists the referral display snapshot', async () => {
    const applied = await request(app.getHttpServer())
      .post('/internal/v1/careers/public/applications')
      .set('x-internal-token', token())
      .send({
        jobId: postingIds[0],
        input: {
          firstName: 'سارا',
          lastName: 'احمدی',
          nationalId: '0012345679',
          phone: '09121234567',
        },
      })
      .expect(201);
    applicationIds.push(applied.body.data.id);

    const stored = await dataSource
      .getRepository(JobApplication)
      .createQueryBuilder('application')
      .select('application.nationalIdEnc', 'nationalIdEnc')
      .where('application.id = :id', { id: applied.body.data.id })
      .getRawOne<{ nationalIdEnc: string }>();
    expect(stored?.nationalIdEnc).not.toContain('0012345679');

    await request(app.getHttpServer())
      .patch(
        `/internal/v1/careers/admin/applications/${applied.body.data.id}/refer`,
      )
      .set('x-internal-token', token())
      .send({
        actor,
        target: { id: targetId, fullName: 'مدیر مقصد تست' },
      })
      .expect(200);

    const detail = await request(app.getHttpServer())
      .post(
        `/internal/v1/careers/admin/applications/${applied.body.data.id}/detail`,
      )
      .set('x-internal-token', token())
      .send({ actor })
      .expect(201);
    expect(detail.body.data).toEqual(
      expect.objectContaining({
        nationalId: '0012345679',
        status: 'REFERRED',
      }),
    );

    const updated = await dataSource
      .getRepository(JobApplication)
      .createQueryBuilder('application')
      .select('application.assigneeName', 'assigneeName')
      .where('application.id = :id', { id: applied.body.data.id })
      .getRawOne<{ assigneeName: string }>();
    expect(updated?.assigneeName).toBe('مدیر مقصد تست');
  });
});
