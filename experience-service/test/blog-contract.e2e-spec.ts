import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { BlogPost } from '../src/database/entities/blog-post.entity';

describe('Experience blog contract (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  const actorId = randomUUID();
  const postIds: string[] = [];
  const token = () => process.env.EXPERIENCE_INTERNAL_TOKEN ?? '';
  const actor = {
    id: actorId,
    fullName: 'مدیر محتوای تست',
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
      'INSERT INTO "users" ("id", "role", "fullName", "updatedAt") VALUES ($1, $2, $3, NOW())',
      [actorId, 'SITE_ADMIN', actor.fullName],
    );
  });

  afterAll(async () => {
    if (postIds.length > 0) {
      await dataSource.getRepository(BlogPost).delete(postIds);
    }
    await dataSource.query('DELETE FROM "users" WHERE "id" = $1', [actorId]);
    await app.close();
  });

  it('requires both the service token and a SITE_ADMIN actor', async () => {
    await request(app.getHttpServer())
      .post('/internal/v1/blog/admin/stats')
      .send(actor)
      .expect(401);
    await request(app.getHttpServer())
      .post('/internal/v1/blog/admin/stats')
      .set('x-internal-token', token())
      .send({ ...actor, role: 'USER' })
      .expect(403);
  });

  it('creates a snapshot-backed post and exposes only published content', async () => {
    const marker = randomUUID();
    const draft = await request(app.getHttpServer())
      .post('/internal/v1/blog/admin/posts')
      .set('x-internal-token', token())
      .send({
        actor,
        input: {
          title: `مقاله ${marker}`,
          body: 'متن کامل مقاله تست',
          category: 'GUIDE',
          status: 'DRAFT',
        },
      })
      .expect(201);
    postIds.push(draft.body.data.id);
    expect(draft.body.data.authorName).toBe(actor.fullName);

    await request(app.getHttpServer())
      .get(`/internal/v1/blog/public/posts/${draft.body.data.slug}`)
      .set('x-internal-token', token())
      .expect(404);

    const published = await request(app.getHttpServer())
      .patch(`/internal/v1/blog/admin/posts/${draft.body.data.id}`)
      .set('x-internal-token', token())
      .send({ actor, input: { status: 'PUBLISHED' } })
      .expect(200);
    expect(published.body.data.status).toBe('PUBLISHED');

    const publicPost = await request(app.getHttpServer())
      .get(`/internal/v1/blog/public/posts/${draft.body.data.slug}`)
      .set('x-internal-token', token())
      .expect(200);
    expect(publicPost.body.data).toEqual(
      expect.objectContaining({
        slug: draft.body.data.slug,
        authorName: actor.fullName,
        viewCount: 1,
      }),
    );
  });

  it('lists admin posts and preserves the public API query contract', async () => {
    const admin = await request(app.getHttpServer())
      .post('/internal/v1/blog/admin/posts/search?category=GUIDE')
      .set('x-internal-token', token())
      .send(actor)
      .expect(201);
    expect(admin.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: postIds[0], category: 'GUIDE' }),
      ]),
    );

    const publicList = await request(app.getHttpServer())
      .get('/internal/v1/blog/public/posts?category=GUIDE')
      .set('x-internal-token', token())
      .expect(200);
    expect(publicList.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ slug: expect.any(String) }),
      ]),
    );
  });
});
