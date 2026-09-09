import { INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { InventoryController } from './inventory.controller';
import { InventoryInternalAuthGuard } from './inventory-internal-auth.guard';
import { InventoryReadService } from './inventory-read.service';

const token = 'inventory-http-token-2026-09-09';

@Module({
  controllers: [InventoryController],
  providers: [
    InventoryInternalAuthGuard,
    {
      provide: ConfigService,
      useValue: new ConfigService({ INVENTORY_INTERNAL_TOKEN: token }),
    },
    {
      provide: InventoryReadService,
      useValue: {
        getAvailability: jest.fn().mockResolvedValue({
          flightInstanceId: '11111111-1111-4111-8111-111111111111',
          availableSeats: 2,
        }),
      },
    },
  ],
})
class InventoryHttpTestModule {}

describe('InventoryController HTTP boundary', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [InventoryHttpTestModule],
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

  it('enforces internal auth and UUID validation', async () => {
    await request(app.getHttpServer())
      .get(
        '/internal/v1/inventory/flights/11111111-1111-4111-8111-111111111111/availability',
      )
      .expect(401);
    await request(app.getHttpServer())
      .get('/internal/v1/inventory/flights/not-a-uuid/availability')
      .set('X-Internal-Token', token)
      .expect(400);
  });

  it('serves only the read boundary', async () => {
    await request(app.getHttpServer())
      .get(
        '/internal/v1/inventory/flights/11111111-1111-4111-8111-111111111111/availability',
      )
      .set('X-Internal-Token', token)
      .expect(200)
      .expect({
        success: true,
        data: {
          flightInstanceId: '11111111-1111-4111-8111-111111111111',
          availableSeats: 2,
        },
      });
    await request(app.getHttpServer())
      .post(
        '/internal/v1/inventory/flights/11111111-1111-4111-8111-111111111111/lock',
      )
      .set('X-Internal-Token', token)
      .send({})
      .expect(404);
  });
});
