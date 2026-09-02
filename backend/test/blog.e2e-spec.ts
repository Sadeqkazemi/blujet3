import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import request from 'supertest';
import * as crypto from 'node:crypto';
import { DataSource, In } from 'typeorm';
import { dataSourceOptions } from '../src/database/data-source.options';
import { BlogPost } from '../src/database/entities/blog-post.entity';
import { User } from '../src/database/entities/user.entity';
import { BlogCategory, BlogPostStatus } from '../src/database/enums';
import { createTestApp } from './helpers/app.helper';
import { loginAs } from './helpers/login.helper';

function auth(token: string | null | undefined) {
  return { Authorization: `Bearer ${token}` };
}

/** Phase D — SITE_ADMIN blog CMS + public listing. See docs/API.md. */
describe('Blog (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  const createdPostIds: string[] = [];

  beforeEach(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
  });

  afterEach(async () => {
    await app.close();
  });

  afterAll(async () => {
    // The app (and its DataSource) from the last test is already closed by
    // now, so cleanup runs against a fresh standalone connection.
    const cleanup = new DataSource(dataSourceOptions);
    await cleanup.initialize();
    if (createdPostIds.length > 0) {
      await cleanup.getRepository(BlogPost).delete({ id: In(createdPostIds) });
    }
    await cleanup.destroy();
  });

  async function createPostDirect(
    overrides?: Partial<{
      title: string;
      slug: string;
      status: 'DRAFT' | 'PUBLISHED' | 'SCHEDULED';
      category: 'NEWS' | 'GUIDE' | 'DEST' | 'OFFERS';
      scheduledAt: Date;
    }>,
  ) {
    const siteAdmin = await dataSource
      .getRepository(User)
      .findOneByOrFail({ username: 'site.admin' });
    const suffix = crypto.randomUUID().slice(0, 6);
    const blogPostRepo = dataSource.getRepository(BlogPost);
    const post = await blogPostRepo.save(
      blogPostRepo.create({
        title: overrides?.title ?? `مقالهٔ تست ${suffix}`,
        slug: overrides?.slug ?? `test-post-${suffix}`,
        body: 'متن نمونه برای تست.',
        category: overrides?.category ?? BlogCategory.NEWS,
        status: overrides?.status ?? BlogPostStatus.DRAFT,
        authorId: siteAdmin.id,
        publishedAt: overrides?.status === 'PUBLISHED' ? new Date() : undefined,
        scheduledAt: overrides?.scheduledAt,
        updatedAt: new Date(),
      }),
    );
    createdPostIds.push(post.id);
    return post;
  }

  describe('public', () => {
    it('GET /blog/posts returns published and due scheduled posts only', async () => {
      const published = await createPostDirect({
        status: 'PUBLISHED',
        slug: `pub-${crypto.randomUUID().slice(0, 6)}`,
      });
      const futureScheduled = await createPostDirect({
        status: 'SCHEDULED',
        slug: `sched-future-${crypto.randomUUID().slice(0, 6)}`,
        scheduledAt: new Date(Date.now() + 7 * 24 * 3_600_000),
      });
      const draft = await createPostDirect({
        status: 'DRAFT',
        slug: `draft-${crypto.randomUUID().slice(0, 6)}`,
      });

      const res = await request(app.getHttpServer()).get('/blog/posts');
      expect(res.status).toBe(200);
      const slugs = res.body.data.map((p: { slug: string }) => p.slug);
      expect(slugs).toContain(published.slug);
      expect(slugs).not.toContain(futureScheduled.slug);
      expect(slugs).not.toContain(draft.slug);
    });

    it('GET /blog/posts/:slug returns detail and increments viewCount; draft returns 404', async () => {
      const published = await createPostDirect({
        status: 'PUBLISHED',
        slug: `detail-${crypto.randomUUID().slice(0, 6)}`,
      });
      const draft = await createPostDirect({
        status: 'DRAFT',
        slug: `hidden-${crypto.randomUUID().slice(0, 6)}`,
      });

      const before = published.viewCount;
      const detail = await request(app.getHttpServer()).get(
        `/blog/posts/${published.slug}`,
      );
      expect(detail.status).toBe(200);
      expect(detail.body.data.title).toBe(published.title);
      expect(detail.body.data.viewCount).toBe(before + 1);

      const hidden = await request(app.getHttpServer()).get(
        `/blog/posts/${draft.slug}`,
      );
      expect(hidden.status).toBe(404);
    });
  });

  describe('admin (SITE_ADMIN)', () => {
    it('GET /blog/admin/stats and posts require auth; non-SITE_ADMIN gets 403', async () => {
      const unauth = await request(app.getHttpServer()).get(
        '/blog/admin/stats',
      );
      expect(unauth.status).toBe(401);

      const { accessToken: ceoToken } = await loginAs(app, 'ceo');
      const forbidden = await request(app.getHttpServer())
        .get('/blog/admin/posts')
        .set(auth(ceoToken));
      expect(forbidden.status).toBe(403);
    });

    it('POST draft + PATCH publish + DELETE soft-delete', async () => {
      const { accessToken } = await loginAs(app, 'site.admin');
      expect(accessToken).toBeTruthy();

      const createRes = await request(app.getHttpServer())
        .post('/blog/admin/posts')
        .set(auth(accessToken))
        .send({
          title: 'پست e2e پیش‌نویس',
          body: 'متن کامل مقاله.',
          category: 'GUIDE',
          status: 'DRAFT',
        });
      expect(createRes.status).toBe(201);
      const postId = createRes.body.data.id as string;
      createdPostIds.push(postId);
      expect(createRes.body.data.status).toBe('DRAFT');

      const publishRes = await request(app.getHttpServer())
        .patch(`/blog/admin/posts/${postId}`)
        .set(auth(accessToken))
        .send({ status: 'PUBLISHED' });
      expect(publishRes.status).toBe(200);
      expect(publishRes.body.data.status).toBe('PUBLISHED');

      const publicDetail = await request(app.getHttpServer()).get(
        `/blog/posts/${publishRes.body.data.slug}`,
      );
      expect(publicDetail.status).toBe(200);

      const deleteRes = await request(app.getHttpServer())
        .delete(`/blog/admin/posts/${postId}`)
        .set(auth(accessToken));
      expect(deleteRes.status).toBe(200);

      const listAfterDelete = await request(app.getHttpServer())
        .get('/blog/admin/posts')
        .set(auth(accessToken));
      const ids = listAfterDelete.body.data.map((p: { id: string }) => p.id);
      expect(ids).not.toContain(postId);
    });

    it('GET /blog/admin/posts?category=GUIDE filters by category', async () => {
      const guide = await createPostDirect({
        status: 'PUBLISHED',
        category: 'GUIDE',
        slug: `guide-${crypto.randomUUID().slice(0, 6)}`,
      });
      await createPostDirect({
        status: 'PUBLISHED',
        category: 'NEWS',
        slug: `news-${crypto.randomUUID().slice(0, 6)}`,
      });

      const { accessToken } = await loginAs(app, 'site.admin');
      const res = await request(app.getHttpServer())
        .get('/blog/admin/posts?category=GUIDE')
        .set(auth(accessToken));
      expect(res.status).toBe(200);
      const ids = res.body.data.map((p: { id: string }) => p.id);
      expect(ids).toContain(guide.id);
      expect(
        res.body.data.every(
          (p: { category: string }) => p.category === 'GUIDE',
        ),
      ).toBe(true);
    });
  });
});
