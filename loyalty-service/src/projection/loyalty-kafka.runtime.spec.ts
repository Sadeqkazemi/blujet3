import type { ConsumerRunConfig, EachMessagePayload } from 'kafkajs';
import type { Logger } from 'nestjs-pino';
import type { LoyaltyKafkaConsumerConfig } from '../loyalty-kafka.config';
import { LoyaltyKafkaHandler } from './loyalty-kafka.handler';
import type { LoyaltyProjectionStore } from './loyalty-projection.store';
import {
  createLoyaltyKafkaClient,
  LoyaltyKafkaRuntime,
  type LoyaltyKafkaRuntimeClient,
} from './loyalty-kafka.runtime';

describe('LoyaltyKafkaRuntime', () => {
  const disabled = { enabled: false } as const;
  const enabled: LoyaltyKafkaConsumerConfig = {
    enabled: true,
    requireSchemaId: false,
    topic: 'blujet.events.v1',
    fromBeginning: true,
    maxBytes: 4096,
    client: { clientId: 'loyalty', brokers: ['localhost:9092'] },
    consumer: {
      groupId: 'loyalty-v1',
      allowAutoTopicCreation: false,
      maxBytesPerPartition: 4096,
      retry: { retries: 5 },
    },
  };
  const runConfig = { autoCommit: false } as ConsumerRunConfig;
  const handler = { runConfig: jest.fn().mockReturnValue(runConfig) };
  const projectionStore = {
    getCheckpointState: jest.fn().mockResolvedValue({
      partitions: [],
      maxLag: null,
      lastCheckpointAt: null,
    }),
  };
  const logger = { log: jest.fn(), error: jest.fn() };

  function client(): jest.Mocked<LoyaltyKafkaRuntimeClient> {
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
    config: LoyaltyKafkaConsumerConfig,
    kafkaClient: LoyaltyKafkaRuntimeClient | null,
  ): LoyaltyKafkaRuntime {
    return new LoyaltyKafkaRuntime(
      config,
      kafkaClient,
      handler as unknown as LoyaltyKafkaHandler,
      projectionStore as unknown as LoyaltyProjectionStore,
      logger as unknown as Logger,
    );
  }

  beforeEach(() => jest.clearAllMocks());

  it('creates no client and makes no broker call while disabled', async () => {
    expect(createLoyaltyKafkaClient(disabled)).toBeNull();
    const worker = runtime(disabled, null);

    await expect(worker.onApplicationBootstrap()).resolves.toBeUndefined();
    await expect(worker.onApplicationShutdown()).resolves.toBeUndefined();

    expect(handler.runConfig).not.toHaveBeenCalled();
    expect(worker.isReady()).toBe(true);
    expect(worker.getStatus()).toMatchObject({
      enabled: false,
      state: 'disabled',
    });
  });

  it('connects, subscribes, then runs the manual-ack handler once', async () => {
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

    expect(worker.isReady()).toBe(false);
    await worker.onApplicationBootstrap();

    expect(order).toEqual(['connect', 'subscribe', 'run']);
    expect(projectionStore.getCheckpointState).toHaveBeenCalledWith(
      'loyalty-v1',
      'blujet.events.v1',
    );
    expect(kafkaClient.subscribe).toHaveBeenCalledWith({
      topic: 'blujet.events.v1',
      fromBeginning: true,
    });
    expect(handler.runConfig).toHaveBeenCalledWith(kafkaClient, {
      topic: 'blujet.events.v1',
      maxBytes: 4096,
      consumerGroup: 'loyalty-v1',
      requireSchemaId: false,
    });
    expect(kafkaClient.run).toHaveBeenCalledWith(runConfig);
    expect(worker.isReady()).toBe(true);
    await worker.onApplicationBootstrap();
    expect(kafkaClient.connect).toHaveBeenCalledTimes(1);
  });

  it.each(['connect', 'subscribe', 'run'] as const)(
    'sanitizes %s failure and disconnects partial startup',
    async (stage) => {
      const kafkaClient = client();
      kafkaClient[stage].mockRejectedValue(new Error('secret broker detail'));
      const worker = runtime(enabled, kafkaClient);

      await expect(worker.onApplicationBootstrap()).rejects.toThrow(
        'Loyalty Kafka consumer startup failed',
      );
      expect(worker.getStatus().state).toBe('failed');
      expect(kafkaClient.disconnect).toHaveBeenCalledTimes(1);
      expect(logger.error).toHaveBeenCalledWith(
        'Loyalty Kafka consumer startup failed',
      );
    },
  );

  it('stops and disconnects once after successful startup', async () => {
    const kafkaClient = client();
    const worker = runtime(enabled, kafkaClient);
    await worker.onApplicationBootstrap();

    await worker.onApplicationShutdown();
    await worker.onApplicationShutdown();

    expect(kafkaClient.stop).toHaveBeenCalledTimes(1);
    expect(kafkaClient.disconnect).toHaveBeenCalledTimes(1);
    expect(worker.isReady()).toBe(false);
  });

  it('sanitizes shutdown failure and still disconnects', async () => {
    const kafkaClient = client();
    const worker = runtime(enabled, kafkaClient);
    await worker.onApplicationBootstrap();
    kafkaClient.stop.mockRejectedValue(new Error('secret broker detail'));

    await expect(worker.onApplicationShutdown()).rejects.toThrow(
      'Loyalty Kafka consumer shutdown failed',
    );
    expect(kafkaClient.disconnect).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      'Loyalty Kafka consumer shutdown failed',
    );
  });

  it('records and propagates a content-free processing failure', async () => {
    const eachMessage = jest
      .fn()
      .mockRejectedValue(new Error('secret payload detail'));
    handler.runConfig.mockReturnValueOnce({ autoCommit: false, eachMessage });
    const kafkaClient = client();
    const worker = runtime(enabled, kafkaClient);
    await worker.onApplicationBootstrap();
    const active = kafkaClient.run.mock.calls[0][0]!;

    await expect(
      active.eachMessage!({ topic: 'private-topic' } as EachMessagePayload),
    ).rejects.toThrow('Loyalty Kafka processing failed');

    expect(logger.error).toHaveBeenCalledWith(
      'Loyalty Kafka processing failed',
    );
    expect(worker.getStatus()).toMatchObject({
      state: 'running',
      processingFailures: 1,
      lastProcessedAt: null,
    });
    expect(typeof worker.getStatus().lastMessageAt).toBe('string');
    expect(typeof worker.getStatus().lastProcessingFailureAt).toBe('string');
  });

  it('records successful message completion without an error log', async () => {
    const eachMessage = jest.fn().mockResolvedValue(undefined);
    handler.runConfig.mockReturnValueOnce({ autoCommit: false, eachMessage });
    const kafkaClient = client();
    const worker = runtime(enabled, kafkaClient);
    await worker.onApplicationBootstrap();
    const active = kafkaClient.run.mock.calls[0][0]!;

    await active.eachMessage!({
      partition: 7,
      message: { offset: '10', highWatermark: '15' },
    } as unknown as EachMessagePayload);

    expect(logger.error).not.toHaveBeenCalled();
    expect(worker.getStatus()).toMatchObject({
      state: 'running',
      processingFailures: 0,
      checkpointPartitions: 1,
      maxObservedLag: '4',
    });
    expect(typeof worker.getStatus().lastProcessedAt).toBe('string');
    expect(typeof worker.getStatus().lastCheckpointAt).toBe('string');
  });

  it('restores durable checkpoint evidence before broker connection', async () => {
    projectionStore.getCheckpointState.mockResolvedValueOnce({
      partitions: [2, 7],
      maxLag: '12',
      lastCheckpointAt: '2026-09-13T05:30:00.000Z',
    });
    const kafkaClient = client();
    const worker = runtime(enabled, kafkaClient);

    await worker.onApplicationBootstrap();

    expect(
      projectionStore.getCheckpointState.mock.invocationCallOrder[0],
    ).toBeLessThan(kafkaClient.connect.mock.invocationCallOrder[0]);
    expect(worker.getStatus()).toMatchObject({
      checkpointPartitions: 2,
      maxObservedLag: '12',
      lastCheckpointAt: '2026-09-13T05:30:00.000Z',
    });
  });
});
