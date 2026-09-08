import {
  INestApplication,
  Module,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { CoreItineraryRefundService } from '../pss/core-itinerary-refund.service';
import { CoreItineraryRetrievalService } from '../pss/core-itinerary-retrieval.service';
import { TicketingRefundController } from './ticketing-refund.controller';
import { TicketingRefundInternalAuthGuard } from './ticketing-refund-internal-auth.guard';

@Module({
  controllers: [TicketingRefundController],
  providers: [
    TicketingRefundInternalAuthGuard,
    {
      provide: ConfigService,
      useValue: new ConfigService({
        TICKETING_REFUND_INTERNAL_TOKEN: 'ticketing-refund-http-token-2026',
      }),
    },
    {
      provide: CoreItineraryRetrievalService,
      useValue: {
        retrieve: jest.fn().mockResolvedValue({ id: 'order-1', pnr: 'PNR1' }),
      },
    },
    {
      provide: CoreItineraryRefundService,
      useValue: {
        quote: jest.fn().mockResolvedValue({
          id: 'order-1',
          currency: 'IRR',
          refundableIrr: '1',
        }),
      },
    },
  ],
})
class TicketingRefundHttpTestModule {}

describe('TicketingRefundController HTTP boundary', () => {
  let app: INestApplication<App>;
  const token = 'ticketing-refund-http-token-2026';
  const ownerId = '3f4c1f5e-9a84-4f5a-8c4a-2c4f2e8b4e91';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TicketingRefundHttpTestModule],
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

  it('enforces the token and validates owner input', async () => {
    await request(app.getHttpServer())
      .get('/internal/v1/ticketing-refund/orders/PNR1/status')
      .query({ ownerId })
      .expect(401);
    await request(app.getHttpServer())
      .get('/internal/v1/ticketing-refund/orders/PNR1/status')
      .set('X-Internal-Token', token)
      .query({ ownerId: 'not-a-uuid' })
      .expect(400);
  });

  it('serves delegated status and quote without exposing write routes', async () => {
    await request(app.getHttpServer())
      .get('/internal/v1/ticketing-refund/orders/PNR1/status')
      .set('X-Internal-Token', token)
      .query({ ownerId })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({
          success: true,
          data: { id: 'order-1', pnr: 'PNR1' },
        });
      });
    await request(app.getHttpServer())
      .post(
        '/internal/v1/ticketing-refund/orders/00000000-0000-4000-8000-000000000001/refund-quote',
      )
      .set('X-Internal-Token', token)
      .send({ ownerId })
      .expect(200)
      .expect(({ body }) => {
        expect(body.success).toBe(true);
        expect(body.data.currency).toBe('IRR');
      });
    await request(app.getHttpServer())
      .post(
        '/internal/v1/ticketing-refund/orders/00000000-0000-4000-8000-000000000001/refund-quote',
      )
      .set('X-Internal-Token', token)
      .send({ ownerId: 'not-a-uuid' })
      .expect(400);
    await request(app.getHttpServer())
      .post(
        '/internal/v1/ticketing-refund/orders/00000000-0000-4000-8000-000000000001/apply',
      )
      .set('X-Internal-Token', token)
      .send({ ownerId })
      .expect(404);
  });

  it('propagates not-found from Core as 404', async () => {
    const retrieval = app.get(CoreItineraryRetrievalService);
    jest
      .spyOn(retrieval, 'retrieve')
      .mockRejectedValueOnce(new NotFoundException('missing'));
    await request(app.getHttpServer())
      .get('/internal/v1/ticketing-refund/orders/MISSING/status')
      .set('X-Internal-Token', token)
      .query({ ownerId })
      .expect(404);
  });
});
