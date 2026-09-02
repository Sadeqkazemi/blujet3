import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { IdempotencyRecord } from '../src/database/entities/idempotency-record.entity';
import { OutboxEvent } from '../src/database/entities/outbox-event.entity';
import { IdempotentCommandService } from '../src/reliability/idempotent-command.service';

describe('PSS service shell (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('exposes public database-aware health', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .set('x-request-id', 'pss-e2e-request')
      .expect(200)
      .expect('x-request-id', 'pss-e2e-request');
    expect(response.body).toEqual(
      expect.objectContaining({
        status: 'ok',
        service: 'blujet-pss',
        database: 'up',
      }),
    );
    await request(app.getHttpServer())
      .get('/health/live')
      .expect(200, { status: 'ok', service: 'blujet-pss' });
    await request(app.getHttpServer()).get('/health/ready').expect(200);
  });

  it('protects internal capabilities and reports rollout truthfully', async () => {
    await request(app.getHttpServer())
      .get('/internal/v1/capabilities')
      .expect(401);

    const response = await request(app.getHttpServer())
      .get('/internal/v1/capabilities')
      .set('x-internal-token', process.env.PSS_INTERNAL_TOKEN ?? '')
      .expect(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        service: 'blujet-pss',
        salesEnabled: false,
        capabilities: expect.objectContaining({
          separateDatabase: true,
          electronicTickets: false,
          ndc: false,
        }),
      }),
    );
  });

  it('replays an identical command once and persists one outbox event atomically', async () => {
    const commands = app.get(IdempotentCommandService);
    const dataSource = app.get(DataSource);
    const caller = `e2e:${Date.now()}`;
    const operation = 'test-command';
    const key = 'same-request';
    let handlerCalls = 0;

    const execute = () =>
      commands.execute(
        caller,
        operation,
        key,
        { orderId: 'order-1', amount: 10 },
        () => {
          handlerCalls += 1;
          return Promise.resolve({
            response: { accepted: true, sequence: handlerCalls },
            events: [
              {
                aggregateType: 'test-order',
                aggregateId: caller,
                eventType: 'test.command.accepted',
                payload: { orderId: 'order-1' },
              },
            ],
          });
        },
      );

    try {
      await expect(execute()).resolves.toEqual({ accepted: true, sequence: 1 });
      await expect(execute()).resolves.toEqual({ accepted: true, sequence: 1 });
      expect(handlerCalls).toBe(1);
      expect(
        await dataSource.getRepository(OutboxEvent).count({
          where: { aggregateId: caller },
        }),
      ).toBe(1);
      expect(
        await dataSource.getRepository(IdempotencyRecord).count({
          where: { caller, operation, key },
        }),
      ).toBe(1);
      await expect(
        commands.execute(caller, operation, key, { orderId: 'changed' }, () =>
          Promise.resolve({ response: { accepted: false } }),
        ),
      ).rejects.toMatchObject({ status: 409 });
    } finally {
      await dataSource
        .getRepository(OutboxEvent)
        .delete({ aggregateId: caller });
      await dataSource
        .getRepository(IdempotencyRecord)
        .delete({ caller, operation, key });
    }
  });

  it('returns a fail-closed shadow report while business tables are absent', async () => {
    const snapshot = {
      capturedAt: '2026-09-01T00:00:00.000Z',
      website: {
        orders: 1,
        travellers: 1,
        heldOrders: 0,
        ticketedOrders: 1,
        inventoryTransactions: 0,
      },
    };
    await request(app.getHttpServer())
      .post('/internal/v1/reconciliation/shadow')
      .send(snapshot)
      .expect(401);
    const response = await request(app.getHttpServer())
      .post('/internal/v1/reconciliation/shadow')
      .set('x-internal-token', process.env.PSS_INTERNAL_TOKEN ?? '')
      .send(snapshot)
      .expect(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        cutoverReady: false,
        missingTables: [
          'pss_orders',
          'pss_travellers',
          'pss_inventory_transactions',
        ],
      }),
    );
    await request(app.getHttpServer())
      .post('/internal/v1/reconciliation/shadow')
      .set('x-internal-token', process.env.PSS_INTERNAL_TOKEN ?? '')
      .send({ ...snapshot, website: { ...snapshot.website, orders: -1 } })
      .expect(400);
  });
});
