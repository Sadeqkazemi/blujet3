import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import request from 'supertest';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { DataSource, In } from 'typeorm';
import { dataSourceOptions } from '../src/database/data-source.options';
import { SiteDestinationHighlight } from '../src/database/entities/site-destination-highlight.entity';
import { SiteMediaAsset } from '../src/database/entities/site-media-asset.entity';
import { SiteRouteHighlight } from '../src/database/entities/site-route-highlight.entity';
import { StoredFile } from '../src/database/entities/stored-file.entity';
import { User } from '../src/database/entities/user.entity';
import { createTestApp } from './helpers/app.helper';
import { loginAs } from './helpers/login.helper';

function auth(token: string | null | undefined) {
  return { Authorization: `Bearer ${token}` };
}

/** Phase E — SITE_ADMIN media CMS + public home content. See docs/API.md. */
describe('Site content (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  const createdAssetIds: string[] = [];
  const createdDestIds: string[] = [];
  const createdRouteIds: string[] = [];
  const tempFiles: string[] = [];

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
    if (createdAssetIds.length) {
      await cleanup
        .getRepository(SiteMediaAsset)
        .delete({ id: In(createdAssetIds) });
    }
    if (createdDestIds.length) {
      await cleanup
        .getRepository(SiteDestinationHighlight)
        .delete({ id: In(createdDestIds) });
    }
    if (createdRouteIds.length) {
      await cleanup
        .getRepository(SiteRouteHighlight)
        .delete({ id: In(createdRouteIds) });
    }
    await cleanup.destroy();
    for (const f of tempFiles) {
      try {
        fs.unlinkSync(f);
      } catch {
        /* ignore */
      }
    }
  });

  async function seedImageFile(ownerId: string) {
    const filePath = path.join(
      os.tmpdir(),
      `site-content-${crypto.randomUUID()}.png`,
    );
    fs.writeFileSync(filePath, Buffer.from('fake-png-bytes'));
    tempFiles.push(filePath);
    const storedFileRepo = dataSource.getRepository(StoredFile);
    return storedFileRepo.save(
      storedFileRepo.create({
        ownerId,
        fileName: 'test-banner.png',
        mimeType: 'image/png',
        sizeBytes: 16,
        path: filePath,
      }),
    );
  }

  describe('public', () => {
    it('GET /site-content/home returns blocks, destinations, routes', async () => {
      const res = await request(app.getHttpServer()).get('/site-content/home');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.blocks)).toBe(true);
      expect(res.body.data.blocks.length).toBe(3);
      expect(Array.isArray(res.body.data.destinations)).toBe(true);
      expect(Array.isArray(res.body.data.routes)).toBe(true);
    });

    it('GET /site-content/media/:fileId serves library images', async () => {
      const { accessToken } = await loginAs(app, 'site.admin');
      expect(accessToken).toBeTruthy();
      const siteAdmin = await dataSource
        .getRepository(User)
        .findOneByOrFail({ username: 'site.admin' });
      const file = await seedImageFile(siteAdmin.id);
      const addRes = await request(app.getHttpServer())
        .post('/site-content/admin/library')
        .set(auth(accessToken))
        .send({ storedFileId: file.id });
      expect(addRes.status).toBe(201);
      createdAssetIds.push(addRes.body.data.id);

      const mediaRes = await request(app.getHttpServer()).get(
        `/site-content/media/${file.id}`,
      );
      expect(mediaRes.status).toBe(200);
      expect(mediaRes.headers['content-type']).toContain('image/png');
    });
  });

  describe('admin (SITE_ADMIN)', () => {
    it('GET /site-content/admin/library requires auth; non-SITE_ADMIN gets 403', async () => {
      const unauth = await request(app.getHttpServer()).get(
        '/site-content/admin/library',
      );
      expect(unauth.status).toBe(401);

      const { accessToken: ceoToken } = await loginAs(app, 'ceo');
      expect(ceoToken).toBeTruthy();
      const forbidden = await request(app.getHttpServer())
        .get('/site-content/admin/library')
        .set(auth(ceoToken));
      expect(forbidden.status).toBe(403);
    });

    it('POST /site-content/admin/library adds and DELETE soft-removes an asset', async () => {
      const { accessToken } = await loginAs(app, 'site.admin');
      expect(accessToken).toBeTruthy();
      const siteAdmin = await dataSource
        .getRepository(User)
        .findOneByOrFail({ username: 'site.admin' });
      const file = await seedImageFile(siteAdmin.id);

      const addRes = await request(app.getHttpServer())
        .post('/site-content/admin/library')
        .set(auth(accessToken))
        .send({ storedFileId: file.id, label: 'بنر تست' });
      expect(addRes.status).toBe(201);
      expect(addRes.body.success).toBe(true);
      expect(addRes.body.data.label).toBe('بنر تست');
      createdAssetIds.push(addRes.body.data.id);

      const listRes = await request(app.getHttpServer())
        .get('/site-content/admin/library')
        .set(auth(accessToken));
      expect(listRes.status).toBe(200);
      expect(
        listRes.body.data.some(
          (a: { id: string }) => a.id === addRes.body.data.id,
        ),
      ).toBe(true);

      const delRes = await request(app.getHttpServer())
        .delete(`/site-content/admin/library/${addRes.body.data.id}`)
        .set(auth(accessToken));
      expect(delRes.status).toBe(200);
    });

    it('PATCH /site-content/admin/blocks/:key updates hero and announcement fields', async () => {
      const { accessToken } = await loginAs(app, 'site.admin');
      expect(accessToken).toBeTruthy();

      const heroRes = await request(app.getHttpServer())
        .patch('/site-content/admin/blocks/HERO_BANNER')
        .set(auth(accessToken))
        .send({ title: 'عنوان تست بنر', badgeText: 'برچسب تست' });
      expect(heroRes.status).toBe(200);
      expect(heroRes.body.data.title).toBe('عنوان تست بنر');

      const annRes = await request(app.getHttpServer())
        .patch('/site-content/admin/blocks/ANNOUNCEMENT_BAR')
        .set(auth(accessToken))
        .send({ enabled: false, title: 'اطلاعیه غیرفعال' });
      expect(annRes.status).toBe(200);
      expect(annRes.body.data.enabled).toBe(false);

      const promoRes = await request(app.getHttpServer())
        .patch('/site-content/admin/blocks/PROMO_BANNER')
        .set(auth(accessToken))
        .send({
          badgeText: 'پیشنهاد ویژه',
          title: 'تخفیف تست',
          buttonText: 'رزرو',
        });
      expect(promoRes.status).toBe(200);
      expect(promoRes.body.data.badgeText).toBe('پیشنهاد ویژه');
    });

    it('PATCH invalid block key returns 400', async () => {
      const { accessToken } = await loginAs(app, 'site.admin');
      expect(accessToken).toBeTruthy();
      const res = await request(app.getHttpServer())
        .patch('/site-content/admin/blocks/INVALID_KEY')
        .set(auth(accessToken))
        .send({ title: 'x' });
      expect(res.status).toBe(400);
    });

    it('destinations and routes CRUD', async () => {
      const { accessToken } = await loginAs(app, 'site.admin');
      expect(accessToken).toBeTruthy();

      const destRes = await request(app.getHttpServer())
        .post('/site-content/admin/destinations')
        .set(auth(accessToken))
        .send({ airportCode: 'SYZ', priceIrr: 12_000_000, sortOrder: 9 });
      expect(destRes.status).toBe(201);
      createdDestIds.push(destRes.body.data.id);

      const patchDest = await request(app.getHttpServer())
        .patch(`/site-content/admin/destinations/${destRes.body.data.id}`)
        .set(auth(accessToken))
        .send({ priceIrr: 13_000_000 });
      expect(patchDest.status).toBe(200);
      expect(patchDest.body.data.priceIrr).toBe('13000000');

      const routeRes = await request(app.getHttpServer())
        .post('/site-content/admin/routes')
        .set(auth(accessToken))
        .send({
          fromAirportCode: 'THR',
          toAirportCode: 'SYZ',
          priceIrr: 9_500_000,
          sortOrder: 9,
        });
      expect(routeRes.status).toBe(201);
      createdRouteIds.push(routeRes.body.data.id);

      const invalidLegacyRoute = await request(app.getHttpServer())
        .post('/site-content/admin/routes')
        .set(auth(accessToken))
        .send({
          fromAirportCode: 'تهران',
          toAirportCode: 'مشهد',
          priceIrr: 9_500_000,
        });
      expect(invalidLegacyRoute.status).toBe(400);

      const delRoute = await request(app.getHttpServer())
        .delete(`/site-content/admin/routes/${routeRes.body.data.id}`)
        .set(auth(accessToken));
      expect(delRoute.status).toBe(200);

      const delDest = await request(app.getHttpServer())
        .delete(`/site-content/admin/destinations/${destRes.body.data.id}`)
        .set(auth(accessToken));
      expect(delDest.status).toBe(200);
    });
  });
});
