import { INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PaymentReconciliationController } from './payment-reconciliation.controller';
import { PaymentReconciliationInternalAuthGuard } from './payment-reconciliation-internal-auth.guard';
import { PaymentReconciliationReadService } from './payment-reconciliation-read.service';

const token = 'payment-reconciliation-http-token-2026';

@Module({
  controllers: [PaymentReconciliationController],
  providers: [
    PaymentReconciliationInternalAuthGuard,
    {
      provide: ConfigService,
      useValue: new ConfigService({
        PAYMENT_RECONCILIATION_INTERNAL_TOKEN: token,
      }),
    },
    {
      provide: PaymentReconciliationReadService,
      useValue: {
        listPending: jest.fn().mockResolvedValue([]),
        listCompensationRequired: jest.fn().mockResolvedValue([]),
        status: jest.fn().mockResolvedValue({ booking: { pnr: 'PNR1' } }),
      },
    },
  ],
})
class PaymentReconciliationHttpTestModule {}

describe('PaymentReconciliationController HTTP boundary', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PaymentReconciliationHttpTestModule],
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

  it('enforces internal auth and list validation', async () => {
    await request(app.getHttpServer())
      .get('/internal/v1/payment-reconciliation/pending')
      .expect(401);
    await request(app.getHttpServer())
      .get('/internal/v1/payment-reconciliation/pending')
      .set('X-Internal-Token', token)
      .query({ limit: 0 })
      .expect(400);
    await request(app.getHttpServer())
      .get('/internal/v1/payment-reconciliation/sagas/compensation-required')
      .expect(401);
    await request(app.getHttpServer())
      .get('/internal/v1/payment-reconciliation/sagas/compensation-required')
      .set('X-Internal-Token', token)
      .query({ limit: 101 })
      .expect(400);
  });

  it('serves read-only pending and status routes', async () => {
    await request(app.getHttpServer())
      .get('/internal/v1/payment-reconciliation/pending')
      .set('X-Internal-Token', token)
      .expect(200)
      .expect({ success: true, data: [] });
    await request(app.getHttpServer())
      .get('/internal/v1/payment-reconciliation/sagas/compensation-required')
      .set('X-Internal-Token', token)
      .expect(200)
      .expect({ success: true, data: [] });
    await request(app.getHttpServer())
      .get('/internal/v1/payment-reconciliation/orders/PNR1/status')
      .set('X-Internal-Token', token)
      .expect(200)
      .expect({ success: true, data: { booking: { pnr: 'PNR1' } } });
    await request(app.getHttpServer())
      .post('/internal/v1/payment-reconciliation/orders/PNR1/resolve')
      .set('X-Internal-Token', token)
      .send({})
      .expect(404);
  });
});
