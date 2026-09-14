import { INestApplication, Module, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AGENCY_DLQ_CONFIG } from '../agency-dlq.config';
import { AgencyDlqAuthGuard } from './agency-dlq-auth.guard';
import { AgencyDlqController } from './agency-dlq.controller';
import { AgencyDlqStore } from './agency-dlq.store';

const token = 'agency-operator-token-at-least-32-characters';
const recordId = '11111111-1111-4111-8111-111111111111';
const sanitized = {
  id: recordId,
  fingerprint: 'a'.repeat(64),
  eventId: null,
  stage: 'TRANSPORT',
  attempts: 3,
  totalAttempts: 3,
  status: 'QUARANTINED',
  firstFailedAt: '2026-09-13T08:00:00.000Z',
  lastFailedAt: '2026-09-13T08:02:00.000Z',
  quarantinedAt: '2026-09-13T08:02:00.000Z',
  approvedAt: null,
  resolvedAt: null,
};
const dlq = {
  list: jest.fn().mockResolvedValue([sanitized]),
  approve: jest.fn().mockResolvedValue({
    ...sanitized,
    status: 'SKIP_APPROVED',
  }),
};

@Module({
  controllers: [AgencyDlqController],
  providers: [
    AgencyDlqAuthGuard,
    { provide: AgencyDlqStore, useValue: dlq },
    {
      provide: AGENCY_DLQ_CONFIG,
      useValue: { enabled: true, maxAttempts: 3, operatorToken: token },
    },
  ],
})
class AgencyDlqHttpTestModule {}

describe('AgencyDlqController HTTP boundary', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AgencyDlqHttpTestModule],
    }).compile();
    app = moduleRef.createNestApplication<INestApplication<App>>();
    await app.init();
  });

  afterAll(async () => app.close());

  beforeEach(() => jest.clearAllMocks());

  it('requires the independent token and bounded query values', async () => {
    await request(app.getHttpServer())
      .get('/internal/v1/agency/dlq')
      .expect(401);
    await request(app.getHttpServer())
      .get('/internal/v1/agency/dlq')
      .set('X-Internal-Token', token)
      .query({ limit: 101 })
      .expect(400);
    await request(app.getHttpServer())
      .get('/internal/v1/agency/dlq')
      .set('X-Internal-Token', token)
      .query({ status: 'UNKNOWN' })
      .expect(400);
  });

  it('returns only the sanitized queue contract', async () => {
    const response = await request(app.getHttpServer())
      .get('/internal/v1/agency/dlq')
      .set('X-Internal-Token', token)
      .expect(200);

    expect(response.body).toEqual({ success: true, data: [sanitized] });
    expect(JSON.stringify(response.body)).not.toContain('topic');
    expect(JSON.stringify(response.body)).not.toContain('offset');
    expect(JSON.stringify(response.body)).not.toContain('payload');
    expect(JSON.stringify(response.body)).not.toContain('licenseNo');
    expect(dlq.list).toHaveBeenCalledWith('QUARANTINED', 50);
  });

  it('validates and audits retry and skip decisions', async () => {
    await request(app.getHttpServer())
      .post(`/internal/v1/agency/dlq/${recordId}/skip`)
      .set('X-Internal-Token', token)
      .send({ operatorId: 'x', reason: 'no' })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/internal/v1/agency/dlq/${recordId}/skip`)
      .set('X-Internal-Token', token)
      .send({ operatorId: 'operator-1', reason: 'approved incident 42' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/internal/v1/agency/dlq/${recordId}/retry`)
      .set('X-Internal-Token', token)
      .send({ operatorId: 'operator-2', reason: 'dependency restored' })
      .expect(201);

    expect(dlq.approve).toHaveBeenNthCalledWith(
      1,
      recordId,
      'skip',
      'operator-1',
      'approved incident 42',
    );
    expect(dlq.approve).toHaveBeenNthCalledWith(
      2,
      recordId,
      'retry',
      'operator-2',
      'dependency restored',
    );
  });

  it('rejects invalid and missing quarantine identifiers', async () => {
    await request(app.getHttpServer())
      .post('/internal/v1/agency/dlq/not-a-uuid/retry')
      .set('X-Internal-Token', token)
      .send({ operatorId: 'operator-2', reason: 'dependency restored' })
      .expect(400);
    dlq.approve.mockRejectedValueOnce(
      new NotFoundException({ code: 'NOT_FOUND', message: 'یافت نشد.' }),
    );
    await request(app.getHttpServer())
      .post(`/internal/v1/agency/dlq/${recordId}/retry`)
      .set('X-Internal-Token', token)
      .send({ operatorId: 'operator-2', reason: 'dependency restored' })
      .expect(404);
  });
});
