import type { ConsumerRunConfig, EachMessagePayload } from 'kafkajs';
import type { Logger } from 'nestjs-pino';
import type { DataSource } from 'typeorm';
import type { OpsAdminKafkaConsumerConfig } from '../../config/ops-admin-kafka-consumer.config';
import { OpsAdminKafkaHandler } from './ops-admin-kafka.handler';
import type { OpsAdminProjectionStore } from './ops-admin-projection.store';
import {
  createOpsAdminKafkaClient,
  OpsAdminKafkaRuntime,
  type OpsAdminKafkaRuntimeClient,
} from './ops-admin-kafka.runtime';
import { OPS_ADMIN_PROJECTION_RUNTIME_ROLE } from './ops-admin-runtime-role.attestation';

describe('OpsAdminKafkaRuntime', () => {
  const disabled = { enabled: false } as const;
  const enabled: OpsAdminKafkaConsumerConfig = {
    enabled: true,
    requireSchemaId: false,
    topic: 'blujet.events.v1',
    fromBeginning: true,
    maxBytes: 4096,
    client: { clientId: 'ops-projection', brokers: ['localhost:9092'] },
    consumer: {
      groupId: 'ops-projection-v1',
      allowAutoTopicCreation: false,
      maxBytesPerPartition: 4096,
      retry: { retries: 5 },
    },
  };
  const runConfig = { autoCommit: false } as ConsumerRunConfig;
  const handler = {
    runConfig: jest.fn().mockReturnValue(runConfig),
  };
  const logger = {
    log: jest.fn(),
    error: jest.fn(),
  };
  const projectionStore = {
    getCheckpointState: jest.fn().mockResolvedValue({
      partitions: [],
      maxLag: null,
      lastCheckpointAt: null,
    }),
  };
  const validAttestation = {
    role: OPS_ADMIN_PROJECTION_RUNTIME_ROLE,
    sessionRole: OPS_ADMIN_PROJECTION_RUNTIME_ROLE,
    isolatedDatabase: true,
    safeSearchPath: true,
    loginRole: true,
    restrictedRole: true,
    noMemberships: true,
    noOwnership: true,
    databaseAccess: true,
    schemaAccess: true,
    noDdl: true,
    requiredGrants: true,
    leastPrivilege: true,
    noCrossDomainAccess: true,
    noForeignConnect: true,
  };
  const dataSource = {
    query: jest.fn().mockResolvedValue([validAttestation]),
  };

  function client(): jest.Mocked<OpsAdminKafkaRuntimeClient> {
    return {
      connect: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn().mockResolvedValue(undefined),
      run: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      commitOffsets: jest.fn().mockResolvedValue(undefined),
    };
  }

  function runtime(
    config: OpsAdminKafkaConsumerConfig,
    kafkaClient: OpsAdminKafkaRuntimeClient | null,
    database: Pick<DataSource, 'query'> = dataSource,
  ): OpsAdminKafkaRuntime {
    return new OpsAdminKafkaRuntime(
      config,
      kafkaClient,
      database as DataSource,
      handler as unknown as OpsAdminKafkaHandler,
      projectionStore as unknown as OpsAdminProjectionStore,
      logger as unknown as Logger,
    );
  }

  beforeEach(() => jest.clearAllMocks());

  it('creates no client and makes no broker call while disabled', async () => {
    expect(createOpsAdminKafkaClient(disabled)).toBeNull();
    const worker = runtime(disabled, null);

    await expect(worker.onApplicationBootstrap()).resolves.toBeUndefined();
    await expect(worker.onApplicationShutdown()).resolves.toBeUndefined();

    expect(handler.runConfig).not.toHaveBeenCalled();
    expect(worker.getStatus()).toEqual({
      enabled: false,
      state: 'disabled',
      processingFailures: 0,
      lastProcessingFailureAt: null,
      lastMessageAt: null,
      lastProcessedAt: null,
      checkpointPartitions: 0,
      maxObservedLag: null,
      lastCheckpointAt: null,
    });
    expect(projectionStore.getCheckpointState).not.toHaveBeenCalled();
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('attests before checkpoint recovery and every broker operation', async () => {
    const order: string[] = [];
    const kafkaClient = client();
    const database = {
      query: jest.fn().mockImplementation(() => {
        order.push('attestation');
        return Promise.resolve([validAttestation]);
      }),
    };
    projectionStore.getCheckpointState.mockImplementationOnce(() => {
      order.push('checkpoint');
      return Promise.resolve({
        partitions: [],
        maxLag: null,
        lastCheckpointAt: null,
      });
    });
    kafkaClient.connect.mockImplementation(() => {
      order.push('connect');
      return Promise.resolve();
    });
    kafkaClient.subscribe.mockImplementation(() => {
      order.push('subscribe');
      return Promise.resolve();
    });
    kafkaClient.run.mockImplementation(() => {
      order.push('run');
      return Promise.resolve();
    });

    await runtime(enabled, kafkaClient, database).onApplicationBootstrap();

    expect(order).toEqual([
      'attestation',
      'checkpoint',
      'connect',
      'subscribe',
      'run',
    ]);
  });

  it('fails before checkpoint recovery or any broker call when attestation fails', async () => {
    const kafkaClient = client();
    const database = {
      query: jest.fn().mockRejectedValue(new Error('secret role detail')),
    };
    const worker = runtime(enabled, kafkaClient, database);

    await expect(worker.onApplicationBootstrap()).rejects.toThrow(
      'Ops/Admin Kafka consumer startup failed',
    );

    expect(projectionStore.getCheckpointState).not.toHaveBeenCalled();
    expect(kafkaClient.connect).not.toHaveBeenCalled();
    expect(kafkaClient.subscribe).not.toHaveBeenCalled();
    expect(kafkaClient.run).not.toHaveBeenCalled();
    expect(kafkaClient.stop).not.toHaveBeenCalled();
    expect(kafkaClient.disconnect).not.toHaveBeenCalled();
    expect(worker.getStatus().state).toBe('failed');
    expect(logger.error).toHaveBeenCalledWith(
      'Ops/Admin Kafka consumer startup failed',
    );
  });

  it('makes no broker call when checkpoint recovery fails', async () => {
    const kafkaClient = client();
    projectionStore.getCheckpointState.mockRejectedValueOnce(
      new Error('secret checkpoint detail'),
    );

    await expect(
      runtime(enabled, kafkaClient).onApplicationBootstrap(),
    ).rejects.toThrow('Ops/Admin Kafka consumer startup failed');

    expect(kafkaClient.connect).not.toHaveBeenCalled();
    expect(kafkaClient.subscribe).not.toHaveBeenCalled();
    expect(kafkaClient.run).not.toHaveBeenCalled();
    expect(kafkaClient.stop).not.toHaveBeenCalled();
    expect(kafkaClient.disconnect).not.toHaveBeenCalled();
  });

  it('connects, subscribes and then runs the manual-ack handler', async () => {
    const order: string[] = [];
    const kafkaClient = client();
    kafkaClient.connect.mockImplementation(() => {
      order.push('connect');
      return Promise.resolve();
    });
    kafkaClient.subscribe.mockImplementation(() => {
      order.push('subscribe');
      return Promise.resolve();
    });
    kafkaClient.run.mockImplementation(() => {
      order.push('run');
      return Promise.resolve();
    });
    const worker = runtime(enabled, kafkaClient);

    await worker.onApplicationBootstrap();

    expect(order).toEqual(['connect', 'subscribe', 'run']);
    expect(projectionStore.getCheckpointState).toHaveBeenCalledWith(
      'ops-projection-v1',
      'blujet.events.v1',
    );
    expect(kafkaClient.subscribe).toHaveBeenCalledWith({
      topic: 'blujet.events.v1',
      fromBeginning: true,
    });
    expect(handler.runConfig).toHaveBeenCalledWith(kafkaClient, {
      topic: 'blujet.events.v1',
      maxBytes: 4096,
      consumerGroup: 'ops-projection-v1',
      requireSchemaId: false,
    });
    expect(kafkaClient.run).toHaveBeenCalledWith(runConfig);
    expect(worker.isReady()).toBe(true);
    await worker.onApplicationBootstrap();
    expect(kafkaClient.connect).toHaveBeenCalledTimes(1);
  });

  it('restores durable checkpoint evidence before connecting', async () => {
    const kafkaClient = client();
    const order: string[] = [];
    projectionStore.getCheckpointState.mockImplementationOnce(() => {
      order.push('checkpoint');
      return Promise.resolve({
        partitions: [1, 4],
        maxLag: '12',
        lastCheckpointAt: '2026-09-14T08:00:00.000Z',
      });
    });
    kafkaClient.connect.mockImplementation(() => {
      order.push('connect');
      return Promise.resolve();
    });
    const worker = runtime(enabled, kafkaClient);

    await worker.onApplicationBootstrap();

    expect(order).toEqual(['checkpoint', 'connect']);
    expect(worker.getStatus()).toMatchObject({
      checkpointPartitions: 2,
      maxObservedLag: '12',
      lastCheckpointAt: '2026-09-14T08:00:00.000Z',
    });
  });

  it.each(['connect', 'subscribe', 'run'] as const)(
    'sanitizes %s failure and disconnects partial startup',
    async (stage) => {
      const kafkaClient = client();
      kafkaClient[stage].mockRejectedValue(new Error('secret broker detail'));
      const worker = runtime(enabled, kafkaClient);

      const error: unknown = await worker
        .onApplicationBootstrap()
        .catch((failure: unknown) => failure);

      expect(error).toEqual(
        new Error('Ops/Admin Kafka consumer startup failed'),
      );
      expect(error).not.toHaveProperty('cause');
      expect(worker.getStatus().state).toBe('failed');
      expect(kafkaClient.disconnect).toHaveBeenCalledTimes(1);
      expect(logger.error).toHaveBeenCalledWith(
        'Ops/Admin Kafka consumer startup failed',
      );

      await worker.onApplicationShutdown();
      expect(kafkaClient.disconnect).toHaveBeenCalledTimes(1);
    },
  );

  it('records and sanitizes processing failures without logging payloads', async () => {
    const eachMessage = jest
      .fn<Promise<void>, [EachMessagePayload]>()
      .mockRejectedValue(new Error('secret payload'));
    handler.runConfig.mockReturnValueOnce({ autoCommit: false, eachMessage });
    const kafkaClient = client();
    const worker = runtime(enabled, kafkaClient);
    await worker.onApplicationBootstrap();
    const active = kafkaClient.run.mock.calls[0][0]!;
    const delivery = { topic: 'secret-topic' } as EachMessagePayload;

    await expect(active.eachMessage!(delivery)).rejects.toThrow(
      'Ops/Admin Kafka processing failed',
    );

    expect(eachMessage).toHaveBeenCalledWith(delivery);
    expect(kafkaClient.commitOffsets).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      'Ops/Admin Kafka processing failed',
    );
    expect(worker.getStatus()).toMatchObject({
      state: 'failed',
      processingFailures: 1,
      lastProcessedAt: null,
    });
    expect(worker.isReady()).toBe(false);
    expect(typeof worker.getStatus().lastMessageAt).toBe('string');
    expect(typeof worker.getStatus().lastProcessingFailureAt).toBe('string');
  });

  it('returns to running after an approved replay succeeds', async () => {
    const eachMessage = jest
      .fn<Promise<void>, [EachMessagePayload]>()
      .mockRejectedValueOnce(new Error('secret payload'))
      .mockResolvedValueOnce(undefined);
    handler.runConfig.mockReturnValueOnce({ autoCommit: false, eachMessage });
    const kafkaClient = client();
    const worker = runtime(enabled, kafkaClient);
    await worker.onApplicationBootstrap();
    const active = kafkaClient.run.mock.calls[0][0]!;
    const delivery = {
      partition: 3,
      message: { offset: '7', highWatermark: '12' },
    } as EachMessagePayload;

    await expect(active.eachMessage!(delivery)).rejects.toThrow(
      'Ops/Admin Kafka processing failed',
    );
    expect(worker.isReady()).toBe(false);

    await active.eachMessage!(delivery);

    expect(worker.isReady()).toBe(true);
    expect(worker.getStatus()).toMatchObject({
      state: 'running',
      processingFailures: 1,
      checkpointPartitions: 1,
    });
  });

  it('records successful processing without logging an error', async () => {
    const eachMessage = jest
      .fn<Promise<void>, [EachMessagePayload]>()
      .mockResolvedValue(undefined);
    handler.runConfig.mockReturnValueOnce({ autoCommit: false, eachMessage });
    const kafkaClient = client();
    const worker = runtime(enabled, kafkaClient);
    await worker.onApplicationBootstrap();
    const active = kafkaClient.run.mock.calls[0][0]!;

    await active.eachMessage!({
      partition: 3,
      message: { offset: '7', highWatermark: '12' },
    } as EachMessagePayload);

    expect(logger.error).not.toHaveBeenCalled();
    expect(worker.getStatus().processingFailures).toBe(0);
    expect(typeof worker.getStatus().lastProcessedAt).toBe('string');
    expect(worker.getStatus()).toMatchObject({
      checkpointPartitions: 1,
      maxObservedLag: '4',
    });
    expect(typeof worker.getStatus().lastCheckpointAt).toBe('string');
  });

  it('stops and disconnects once after successful startup', async () => {
    const kafkaClient = client();
    const worker = runtime(enabled, kafkaClient);
    await worker.onApplicationBootstrap();

    await worker.onApplicationShutdown();
    await worker.onApplicationShutdown();

    expect(kafkaClient.stop).toHaveBeenCalledTimes(1);
    expect(kafkaClient.disconnect).toHaveBeenCalledTimes(1);
    expect(worker.isReady()).toBe(false);
    expect(worker.getStatus().state).toBe('stopped');
  });

  it('sanitizes shutdown failure and still disconnects', async () => {
    const kafkaClient = client();
    const worker = runtime(enabled, kafkaClient);
    await worker.onApplicationBootstrap();
    kafkaClient.stop.mockRejectedValue(new Error('secret broker detail'));

    await expect(worker.onApplicationShutdown()).rejects.toThrow(
      'Ops/Admin Kafka consumer shutdown failed',
    );

    expect(kafkaClient.disconnect).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      'Ops/Admin Kafka consumer shutdown failed',
    );
  });
});
