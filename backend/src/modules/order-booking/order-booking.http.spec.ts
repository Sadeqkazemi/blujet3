import { INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { OrderBookingController } from './order-booking.controller';
import { OrderBookingInternalAuthGuard } from './order-booking-internal-auth.guard';
import { OrderBookingReadService } from './order-booking-read.service';

const token = 'order-booking-http-token-2026-09-09';

@Module({
  controllers: [OrderBookingController],
  providers: [
    OrderBookingInternalAuthGuard,
    {
      provide: ConfigService,
      useValue: new ConfigService({ ORDER_BOOKING_INTERNAL_TOKEN: token }),
    },
    {
      provide: OrderBookingReadService,
      useValue: {
        listDueHolds: jest.fn().mockResolvedValue([]),
        getOrder: jest.fn().mockResolvedValue({ order: { pnr: 'ABC123' } }),
      },
    },
  ],
})
class OrderBookingHttpTestModule {}

describe('OrderBookingController HTTP boundary', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [OrderBookingHttpTestModule],
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

  it('enforces internal auth and query validation', async () => {
    await request(app.getHttpServer())
      .get('/internal/v1/order-booking/holds/due')
      .expect(401);
    await request(app.getHttpServer())
      .get('/internal/v1/order-booking/holds/due')
      .set('X-Internal-Token', token)
      .query({ limit: 0 })
      .expect(400);
    await request(app.getHttpServer())
      .get('/internal/v1/order-booking/holds/due')
      .set('X-Internal-Token', token)
      .query({ asOf: 'not-a-date' })
      .expect(400);
  });

  it('serves only the read boundary', async () => {
    await request(app.getHttpServer())
      .get('/internal/v1/order-booking/holds/due')
      .set('X-Internal-Token', token)
      .expect(200)
      .expect({ success: true, data: [] });
    await request(app.getHttpServer())
      .get('/internal/v1/order-booking/orders/ABC123')
      .set('X-Internal-Token', token)
      .expect(200)
      .expect({ success: true, data: { order: { pnr: 'ABC123' } } });
    await request(app.getHttpServer())
      .post('/internal/v1/order-booking/orders/ABC123/cancel')
      .set('X-Internal-Token', token)
      .send({})
      .expect(404);
  });
});
