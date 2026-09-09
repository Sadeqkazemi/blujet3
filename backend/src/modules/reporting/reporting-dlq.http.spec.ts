import { INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { REPORTING_DLQ_CONFIG } from '../../config/reporting-dlq.config';
import { ReportingDlqAuthGuard } from './reporting-dlq-auth.guard';
import { ReportingDlqController } from './reporting-dlq.controller';
import { ReportingDlqStore } from './reporting-dlq.store';

const token = 'reporting-operator-token-at-least-32-characters';
const recordId = '11111111-1111-4111-8111-111111111111';
const dlq = {
  list: jest.fn().mockResolvedValue([]),
  approve: jest
    .fn()
    .mockResolvedValue({ id: recordId, status: 'SKIP_APPROVED' }),
};

@Module({
  controllers: [ReportingDlqController],
  providers: [
    ReportingDlqAuthGuard,
    { provide: ReportingDlqStore, useValue: dlq },
    {
      provide: REPORTING_DLQ_CONFIG,
      useValue: { enabled: true, maxAttempts: 3, operatorToken: token },
    },
  ],
})
class ReportingDlqHttpTestModule {}

describe('ReportingDlqController HTTP boundary', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ReportingDlqHttpTestModule],
    }).compile();
    app = moduleRef.createNestApplication<INestApplication<App>>();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => jest.clearAllMocks());

  it('enforces independent auth and bounded list filters', async () => {
    await request(app.getHttpServer())
      .get('/internal/v1/reporting/dlq')
      .expect(401);
    await request(app.getHttpServer())
      .get('/internal/v1/reporting/dlq')
      .set('X-Internal-Token', token)
      .query({ limit: 101 })
      .expect(400);
    await request(app.getHttpServer())
      .get('/internal/v1/reporting/dlq')
      .set('X-Internal-Token', token)
      .query({ status: 'UNKNOWN' })
      .expect(400);
  });

  it('returns only the sanitized queue contract', async () => {
    await request(app.getHttpServer())
      .get('/internal/v1/reporting/dlq')
      .set('X-Internal-Token', token)
      .expect(200)
      .expect({ success: true, data: [] });
    expect(dlq.list).toHaveBeenCalledWith('QUARANTINED', 50);
  });

  it('requires a valid decision audit body', async () => {
    await request(app.getHttpServer())
      .post(`/internal/v1/reporting/dlq/${recordId}/skip`)
      .set('X-Internal-Token', token)
      .send({ operatorId: 'x', reason: 'no' })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/internal/v1/reporting/dlq/${recordId}/skip`)
      .set('X-Internal-Token', token)
      .send({ operatorId: 'operator-1', reason: 'approved incident 42' })
      .expect(201);
    expect(dlq.approve).toHaveBeenCalledWith(
      recordId,
      'skip',
      'operator-1',
      'approved incident 42',
    );
  });
});
