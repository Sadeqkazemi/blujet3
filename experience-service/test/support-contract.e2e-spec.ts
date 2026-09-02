import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

describe('Experience support contract (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  const userId = randomUUID();
  const otherId = randomUUID();
  const adminId = randomUUID();
  const targetId = randomUUID();
  const ticketIds: string[] = [];
  const token = () => process.env.EXPERIENCE_INTERNAL_TOKEN ?? '';
  const user = {
    id: userId,
    fullName: 'کاربر پشتیبانی تست',
    role: 'USER',
    isSuperAdmin: false,
  };
  const admin = {
    id: adminId,
    fullName: 'ادمین پشتیبانی تست',
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
      'INSERT INTO "users" ("id", "role", "fullName", "updatedAt") VALUES ($1, $2, $3, NOW()), ($4, $5, $6, NOW()), ($7, $8, $9, NOW()), ($10, $11, $12, NOW())',
      [
        userId,
        'USER',
        user.fullName,
        otherId,
        'USER',
        'کاربر دیگر',
        adminId,
        'SITE_ADMIN',
        admin.fullName,
        targetId,
        'EMPLOYEE',
        'کارشناس مقصد',
      ],
    );
  });

  afterAll(async () => {
    if (ticketIds.length > 0) {
      await dataSource.query(
        'DELETE FROM "support_tickets" WHERE "id" = ANY($1)',
        [ticketIds],
      );
    }
    await dataSource.query('DELETE FROM "users" WHERE "id" = ANY($1)', [
      [userId, otherId, adminId, targetId],
    ]);
    await app.close();
  });

  it('enforces customer ownership across list/detail/reply', async () => {
    const created = await request(app.getHttpServer())
      .post('/internal/v1/support/mine/tickets')
      .set('x-internal-token', token())
      .send({
        actor: user,
        input: {
          requesterName: user.fullName,
          requesterPhone: '09121234567',
          subject: 'مشکل پرداخت تست',
          body: 'شرح مشکل پرداخت تست',
        },
      })
      .expect(201);
    ticketIds.push(created.body.data.id);

    await request(app.getHttpServer())
      .post(`/internal/v1/support/mine/tickets/${created.body.data.id}/detail`)
      .set('x-internal-token', token())
      .send({ actor: { ...user, id: otherId } })
      .expect(404);

    const mine = await request(app.getHttpServer())
      .post('/internal/v1/support/mine/tickets/search')
      .set('x-internal-token', token())
      .send({ actor: user, callerPhone: '09121234567' })
      .expect(201);
    expect(mine.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: created.body.data.id }),
      ]),
    );
  });

  it('rejects a customer actor on the staff contract', async () => {
    await request(app.getHttpServer())
      .post('/internal/v1/support/admin/tickets/search')
      .set('x-internal-token', token())
      .send({ actor: user })
      .expect(403);
  });

  it('supports staff reply and customer satisfaction lifecycle', async () => {
    const id = ticketIds[0];
    const answered = await request(app.getHttpServer())
      .post(`/internal/v1/support/admin/tickets/${id}/replies`)
      .set('x-internal-token', token())
      .send({ actor: admin, input: { body: 'پاسخ کامل پشتیبانی' } })
      .expect(201);
    expect(answered.body.data.status).toBe('ANSWERED');

    const feedback = await request(app.getHttpServer())
      .patch(`/internal/v1/support/mine/tickets/${id}/feedback`)
      .set('x-internal-token', token())
      .send({ actor: user, callerPhone: '09121234567', satisfied: true })
      .expect(200);
    expect(feedback.body.data.status).toBe('CLOSED');
  });

  it('stores a forwarding display snapshot without an Identity join', async () => {
    const created = await request(app.getHttpServer())
      .post('/internal/v1/support/public/tickets')
      .set('x-internal-token', token())
      .send({
        requesterName: 'مهمان تست',
        requesterPhone: '09120000000',
        subject: 'موضوع ارجاع تست',
        body: 'شرح ارجاع تست',
      })
      .expect(201);
    ticketIds.push(created.body.data.id);

    const forwarded = await request(app.getHttpServer())
      .patch(
        `/internal/v1/support/admin/tickets/${created.body.data.id}/forward`,
      )
      .set('x-internal-token', token())
      .send({
        actor: admin,
        target: {
          id: targetId,
          fullName: 'کارشناس مقصد',
          roleLabelFa: 'کارمند',
        },
      })
      .expect(200);
    expect(forwarded.body.data.forwardedTo).toEqual({
      id: targetId,
      fullName: 'کارشناس مقصد',
    });
  });
});
