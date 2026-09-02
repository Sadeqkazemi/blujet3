import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { ContactMessage } from '../src/database/entities/contact-message.entity';

describe('Experience contact contract (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  const createdIds: string[] = [];
  const token = () => process.env.EXPERIENCE_INTERNAL_TOKEN ?? '';

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
  });

  afterAll(async () => {
    if (createdIds.length > 0) {
      await dataSource.getRepository(ContactMessage).delete(createdIds);
    }
    await app.close();
  });

  it('exposes schema-aware health and propagates request IDs', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .set('x-request-id', 'experience-e2e-request')
      .expect(200)
      .expect('x-request-id', 'experience-e2e-request');
    expect(response.body).toEqual(
      expect.objectContaining({
        status: 'ok',
        service: 'blujet-experience',
        database: 'up',
      }),
    );
    await request(app.getHttpServer()).get('/health/live').expect(200, {
      status: 'ok',
      service: 'blujet-experience',
    });
  });

  it('protects internal routes and rejects unknown fields', async () => {
    await request(app.getHttpServer()).get('/internal/v1/contact').expect(401);
    await request(app.getHttpServer())
      .post('/internal/v1/contact')
      .set('x-internal-token', token())
      .send({
        name: 'کاربر تست',
        phone: '09121234567',
        subject: 'موضوع تست',
        body: 'متن پیام تست',
        unexpected: true,
      })
      .expect(400);
  });

  it('persists a validated message and returns it in the recent inbox', async () => {
    const marker = randomUUID();
    const created = await request(app.getHttpServer())
      .post('/internal/v1/contact')
      .set('x-internal-token', token())
      .send({
        name: ' کاربر تست ',
        phone: ' 09121234567 ',
        subject: `پیام ${marker}`,
        body: ' متن پیام تست ',
      })
      .expect(201);
    createdIds.push(created.body.data.id);
    expect(created.body.data).toEqual(
      expect.objectContaining({
        name: 'کاربر تست',
        phone: '09121234567',
        subject: `پیام ${marker}`,
        body: 'متن پیام تست',
      }),
    );

    const recent = await request(app.getHttpServer())
      .get('/internal/v1/contact')
      .set('x-internal-token', token())
      .expect(200);
    expect(recent.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: created.body.data.id }),
      ]),
    );
  });
});
