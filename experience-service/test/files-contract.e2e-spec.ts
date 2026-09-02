import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

describe('Experience files contract (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  const actorId = randomUUID();
  const otherId = randomUUID();
  const token = () => process.env.EXPERIENCE_INTERNAL_TOKEN ?? '';
  const actor = {
    id: actorId,
    fullName: 'مالک فایل تست',
    role: 'USER',
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
      [actorId, 'USER', actor.fullName, otherId, 'USER', 'کاربر دیگر تست'],
    );
  });

  afterAll(async () => {
    await dataSource.query('DELETE FROM "stored_files" WHERE "ownerId" = $1', [
      actorId,
    ]);
    await dataSource.query('DELETE FROM "users" WHERE "id" = ANY($1)', [
      [actorId, otherId],
    ]);
    await app.close();
  });

  it('validates bytes and restricts deletion to the owner', async () => {
    const bytes = Buffer.from('experience-file-contract');
    const created = await request(app.getHttpServer())
      .post('/internal/v1/files')
      .set('x-internal-token', token())
      .send({
        actor,
        file: {
          originalName: 'contract.pdf',
          mimeType: 'application/pdf',
          sizeBytes: bytes.length,
          contentBase64: bytes.toString('base64'),
        },
      })
      .expect(201);
    expect(created.body.data).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        fileName: 'contract.pdf',
        sizeBytes: bytes.length,
      }),
    );

    await request(app.getHttpServer())
      .delete(`/internal/v1/files/${created.body.data.id}`)
      .set('x-internal-token', token())
      .send({ actor: { ...actor, id: otherId } })
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/internal/v1/files/${created.body.data.id}`)
      .set('x-internal-token', token())
      .send({ actor })
      .expect(200);
  });

  it('rejects a forged size before writing metadata', async () => {
    await request(app.getHttpServer())
      .post('/internal/v1/files')
      .set('x-internal-token', token())
      .send({
        actor,
        file: {
          originalName: 'forged.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 500,
          contentBase64: Buffer.from('small').toString('base64'),
        },
      })
      .expect(400);
  });
});
