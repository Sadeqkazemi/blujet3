import { INestApplication, Module, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { OPS_ADMIN_DLQ_CONFIG } from '../../config/ops-admin-dlq.config';
import { OpsAdminDlqAuthGuard } from './ops-admin-dlq-auth.guard';
import { OpsAdminDlqController } from './ops-admin-dlq.controller';
import { OpsAdminDlqStore } from './ops-admin-dlq.store';

const token = 'ops-admin-operator-token-at-least-32-characters';
const recordId = '11111111-1111-4111-8111-111111111111';
const sanitized = {
  id: recordId,
  fingerprint: 'a'.repeat(64),
  eventId: null,
  stage: 'TRANSPORT',
  attempts: 3,
  totalAttempts: 3,
  status: 'QUARANTINED',
  firstFailedAt: '2026-09-14T08:00:00.000Z',
  lastFailedAt: '2026-09-14T08:02:00.000Z',
  quarantinedAt: '2026-09-14T08:02:00.000Z',
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
  controllers: [OpsAdminDlqController],
  providers: [
    OpsAdminDlqAuthGuard,
    { provide: OpsAdminDlqStore, useValue: dlq },
    {
      provide: OPS_ADMIN_DLQ_CONFIG,
      useValue: { enabled: true, maxAttempts: 3, operatorToken: token },
    },
  ],
})
class OpsAdminDlqHttpTestModule {}

describe('OpsAdminDlqController HTTP boundary', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [OpsAdminDlqHttpTestModule],
    }).compile();
    app = moduleRef.createNestApplication<INestApplication<App>>();
    await app.init();
  });

  afterAll(async () => app.close());

  beforeEach(() => jest.clearAllMocks());

  it('requires the independent token and bounded query values', async () => {
    await request(app.getHttpServer())
      .get('/internal/v1/ops-admin/dlq')
      .expect(401);
    await request(app.getHttpServer())
      .get('/internal/v1/ops-admin/dlq')
      .set('X-Internal-Token', token)
      .query({ limit: 101 })
      .expect(400);
    await request(app.getHttpServer())
      .get('/internal/v1/ops-admin/dlq')
      .set('X-Internal-Token', token)
      .query({ status: 'UNKNOWN' })
      .expect(400);
  });

  it('returns only the sanitized queue contract', async () => {
    const response = await request(app.getHttpServer())
      .get('/internal/v1/ops-admin/dlq')
      .set('X-Internal-Token', token)
      .expect(200);

    expect(response.body).toEqual({ success: true, data: [sanitized] });
    expect(JSON.stringify(response.body)).not.toContain('topic');
    expect(JSON.stringify(response.body)).not.toContain('offset');
    expect(JSON.stringify(response.body)).not.toContain('payload');
    expect(JSON.stringify(response.body)).not.toContain('taskId');
    expect(dlq.list).toHaveBeenCalledWith('QUARANTINED', 50);
  });

  it('validates and audits retry and skip decisions', async () => {
    await request(app.getHttpServer())
      .post(`/internal/v1/ops-admin/dlq/${recordId}/skip`)
      .set('X-Internal-Token', token)
      .send({ operatorId: 'x', reason: 'free text is forbidden' })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/internal/v1/ops-admin/dlq/${recordId}/skip`)
      .set('X-Internal-Token', token)
      .send({ operatorId: 'operator-1', reason: 'free text is forbidden' })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/internal/v1/ops-admin/dlq/${recordId}/skip`)
      .set('X-Internal-Token', token)
      .send({
        operatorId: 'operator-1',
        reason: 'MESSAGE_REJECTED_AFTER_REVIEW',
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/internal/v1/ops-admin/dlq/${recordId}/retry`)
      .set('X-Internal-Token', token)
      .send({
        operatorId: 'operator-2',
        reason: 'TRANSIENT_DEPENDENCY_RECOVERED',
      })
      .expect(201);

    expect(dlq.approve).toHaveBeenNthCalledWith(
      1,
      recordId,
      'skip',
      'operator-1',
      'MESSAGE_REJECTED_AFTER_REVIEW',
    );
    expect(dlq.approve).toHaveBeenNthCalledWith(
      2,
      recordId,
      'retry',
      'operator-2',
      'TRANSIENT_DEPENDENCY_RECOVERED',
    );
  });

  it('rejects invalid and missing quarantine identifiers', async () => {
    await request(app.getHttpServer())
      .post('/internal/v1/ops-admin/dlq/not-a-uuid/retry')
      .set('X-Internal-Token', token)
      .send({
        operatorId: 'operator-2',
        reason: 'TRANSIENT_DEPENDENCY_RECOVERED',
      })
      .expect(400);
    dlq.approve.mockRejectedValueOnce(
      new NotFoundException({ code: 'NOT_FOUND', message: 'یافت نشد.' }),
    );
    await request(app.getHttpServer())
      .post(`/internal/v1/ops-admin/dlq/${recordId}/retry`)
      .set('X-Internal-Token', token)
      .send({
        operatorId: 'operator-2',
        reason: 'TRANSIENT_DEPENDENCY_RECOVERED',
      })
      .expect(404);
  });
});
