import { INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { OpsAdminController } from './ops-admin.controller';
import { OpsAdminInternalAuthGuard } from './ops-admin-internal-auth.guard';
import { OpsAdminReadService } from './ops-admin-read.service';

const token = 'ops-admin-http-token-2026-09-09';

@Module({
  controllers: [OpsAdminController],
  providers: [
    OpsAdminInternalAuthGuard,
    {
      provide: ConfigService,
      useValue: new ConfigService({ OPS_ADMIN_INTERNAL_TOKEN: token }),
    },
    {
      provide: OpsAdminReadService,
      useValue: {
        cartableSummary: jest.fn().mockResolvedValue({ groups: [] }),
        listCartableTasks: jest.fn().mockResolvedValue([]),
      },
    },
  ],
})
class OpsAdminHttpTestModule {}

describe('OpsAdminController HTTP boundary', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [OpsAdminHttpTestModule],
    }).compile();
    app = moduleRef.createNestApplication<INestApplication<App>>();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('enforces internal auth and queue filters', async () => {
    await request(app.getHttpServer())
      .get('/internal/v1/ops-admin/cartable/summary')
      .expect(401);
    await request(app.getHttpServer())
      .get('/internal/v1/ops-admin/cartable/tasks')
      .set('X-Internal-Token', token)
      .query({ limit: 0 })
      .expect(400);
    await request(app.getHttpServer())
      .get('/internal/v1/ops-admin/cartable/tasks')
      .set('X-Internal-Token', token)
      .query({ status: 'UNKNOWN' })
      .expect(400);
  });

  it('serves only the read boundary', async () => {
    await request(app.getHttpServer())
      .get('/internal/v1/ops-admin/cartable/summary')
      .set('X-Internal-Token', token)
      .expect(200)
      .expect({ success: true, data: { groups: [] } });
    await request(app.getHttpServer())
      .get('/internal/v1/ops-admin/cartable/tasks')
      .set('X-Internal-Token', token)
      .expect(200)
      .expect({ success: true, data: [] });
    await request(app.getHttpServer())
      .post('/internal/v1/ops-admin/cartable/tasks/task-1/approve')
      .set('X-Internal-Token', token)
      .send({})
      .expect(404);
  });
});
