import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { SiteDestinationHighlight } from '../src/database/entities/site-destination-highlight.entity';
import { SiteRouteHighlight } from '../src/database/entities/site-route-highlight.entity';

describe('Experience site-content contract (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  const actorId = randomUUID();
  const destinationIds: string[] = [];
  const routeIds: string[] = [];
  const token = () => process.env.EXPERIENCE_INTERNAL_TOKEN ?? '';
  const actor = {
    id: actorId,
    fullName: 'مدیر محتوای سایت تست',
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
    if (destinationIds.length > 0) {
      await dataSource
        .getRepository(SiteDestinationHighlight)
        .delete(destinationIds);
    }
    if (routeIds.length > 0) {
      await dataSource.getRepository(SiteRouteHighlight).delete(routeIds);
    }
    await dataSource.query('DELETE FROM "users" WHERE "id" = $1', [actorId]);
    await app.close();
  });

  it('rejects an untrusted role even when the internal token is valid', async () => {
    await request(app.getHttpServer())
      .post('/internal/v1/site-content/admin/routes/search')
      .set('x-internal-token', token())
      .send({ actor: { ...actor, role: 'USER' } })
      .expect(403);
  });

  it('creates Experience-owned destination and route rows', async () => {
    const destination = await request(app.getHttpServer())
      .post('/internal/v1/site-content/admin/destinations')
      .set('x-internal-token', token())
      .send({
        actor,
        input: { airportCode: 'aaa', priceIrr: 1200000, sortOrder: 901 },
      })
      .expect(201);
    destinationIds.push(destination.body.data.id);
    expect(destination.body.data).toEqual(
      expect.objectContaining({ airportCode: 'AAA', priceIrr: '1200000' }),
    );

    const route = await request(app.getHttpServer())
      .post('/internal/v1/site-content/admin/routes')
      .set('x-internal-token', token())
      .send({
        actor,
        input: {
          fromAirportCode: 'aaa',
          toAirportCode: 'bbb',
          priceIrr: 2500000,
          sortOrder: 902,
        },
      })
      .expect(201);
    routeIds.push(route.body.data.id);
    expect(route.body.data).toEqual(
      expect.objectContaining({
        fromAirportCode: 'AAA',
        toAirportCode: 'BBB',
        priceIrr: '2500000',
      }),
    );
  });

  it('returns locale content without querying Core-owned flight tables', async () => {
    const response = await request(app.getHttpServer())
      .get('/internal/v1/site-content/public/home-content?locale=en')
      .set('x-internal-token', token())
      .expect(200);
    expect(response.body.data.blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'HERO_BANNER',
          title: 'Book your next flight with blujet',
        }),
      ]),
    );
    expect(response.body.data.destinations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: destinationIds[0] }),
      ]),
    );
    expect(response.body.data.routes).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: routeIds[0] })]),
    );
    expect(response.body.data).not.toHaveProperty('destinationStats');
  });
});
