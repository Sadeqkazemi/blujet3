import type { ConsumerRunConfig, EachMessagePayload } from 'kafkajs';
import type { Logger } from 'nestjs-pino';
import type { ReportingKafkaConsumerConfig } from '../../config/reporting-kafka-consumer.config';
import { ReportingKafkaHandler } from './reporting-kafka.handler';
import {
  createReportingKafkaClient,
  ReportingKafkaRuntime,
  type ReportingKafkaRuntimeClient,
} from './reporting-kafka.runtime';
import type { ReportingItineraryProjectionStore } from './reporting-itinerary-projection.store';

describe('ReportingKafkaRuntime', () => {
  const disabled = { enabled: false } as const;
  const enabled: ReportingKafkaConsumerConfig = {
    enabled: true,
    topic: 'blujet.events.v1',
    fromBeginning: true,
    maxBytes: 4096,
    client: { clientId: 'reporting', brokers: ['localhost:9092'] },
    consumer: {
      groupId: 'reporting-v1',
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
    getCheckpointSummary: jest.fn().mockResolvedValue({
      partitions: 0,
      maxLag: null,
      lastCheckpointAt: null,
    }),
  };

  function client(): jest.Mocked<ReportingKafkaRuntimeClient> {
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
    config: ReportingKafkaConsumerConfig,
    kafkaClient: ReportingKafkaRuntimeClient | null,
  ): ReportingKafkaRuntime {
    return new ReportingKafkaRuntime(
      config,
      kafkaClient,
      handler as unknown as ReportingKafkaHandler,
      projectionStore as unknown as ReportingItineraryProjectionStore,
      logger as unknown as Logger,
    );
  }

  beforeEach(() => jest.clearAllMocks());

  it('creates no client and makes no broker call while disabled', async () => {
    expect(createReportingKafkaClient(disabled)).toBeNull();
    const worker = runtime(disabled, null);
    await expect(worker.onApplicationBootstrap()).resolves.toBeUndefined();
    await expect(worker.onApplicationShutdown()).resolves.toBeUndefined();
    expect(handler.runConfig).not.toHaveBeenCalled();
  });

  it('connects, subscribes, then runs the manual-ack handler', async () => {
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
    expect(kafkaClient.subscribe).toHaveBeenCalledWith({
      topic: 'blujet.events.v1',
      fromBeginning: true,
    });
    expect(handler.runConfig).toHaveBeenCalledWith(kafkaClient, {
      topic: 'blujet.events.v1',
      maxBytes: 4096,
      consumerGroup: 'reporting-v1',
    });
    expect(kafkaClient.run).toHaveBeenCalledWith(runConfig);
    await worker.onApplicationBootstrap();
    expect(kafkaClient.connect).toHaveBeenCalledTimes(1);
  });

  it('restores durable checkpoint evidence before connecting', async () => {
    projectionStore.getCheckpointSummary.mockResolvedValueOnce({
      partitions: 2,
      maxLag: '17',
      lastCheckpointAt: '2026-09-08T00:00:00.000Z',
    });
    const kafkaClient = client();
    const worker = runtime(enabled, kafkaClient);

    await worker.onApplicationBootstrap();

    expect(projectionStore.getCheckpointSummary).toHaveBeenCalledWith(
      'reporting-v1',
      'blujet.events.v1',
    );
    expect(worker.getStatus()).toMatchObject({
      checkpointPartitions: 2,
      maxObservedLag: '17',
      lastCheckpointAt: '2026-09-08T00:00:00.000Z',
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
        new Error('Reporting Kafka consumer startup failed'),
      );
      expect(error).not.toHaveProperty('cause');
      expect(kafkaClient.disconnect).toHaveBeenCalledTimes(1);
      expect(logger.error).toHaveBeenCalledWith(
        'Reporting Kafka consumer startup failed',
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
  });

  it('sanitizes shutdown failure', async () => {
    const kafkaClient = client();
    const worker = runtime(enabled, kafkaClient);
    await worker.onApplicationBootstrap();
    kafkaClient.stop.mockRejectedValue(new Error('secret broker detail'));

    await expect(worker.onApplicationShutdown()).rejects.toThrow(
      'Reporting Kafka consumer shutdown failed',
    );
    expect(kafkaClient.disconnect).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      'Reporting Kafka consumer shutdown failed',
    );
  });

  it('logs and propagates a sanitized processing failure without logging payload', async () => {
    const eachMessage = jest
      .fn()
      .mockRejectedValue(new Error('secret payload'));
    handler.runConfig.mockReturnValueOnce({ autoCommit: false, eachMessage });
    const kafkaClient = client();
    const worker = runtime(enabled, kafkaClient);
    await worker.onApplicationBootstrap();
    const active = kafkaClient.run.mock.calls[0][0]!;
    const delivery = { topic: 'secret-topic' } as EachMessagePayload;

    await expect(active.eachMessage!(delivery)).rejects.toThrow(
      'Reporting Kafka processing failed',
    );
    expect(eachMessage).toHaveBeenCalledWith(delivery);
    expect(active.autoCommit).toBe(false);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      'Reporting Kafka processing failed',
    );
    expect(kafkaClient.commitOffsets).not.toHaveBeenCalled();
    const status = worker.getStatus();
    expect(status).toMatchObject({
      state: 'running',
      processingFailures: 1,
      lastProcessedAt: null,
    });
    expect(typeof status.lastMessageAt).toBe('string');
    expect(typeof status.lastProcessingFailureAt).toBe('string');
  });

  it('does not log an error when the message handler succeeds', async () => {
    const eachMessage = jest.fn().mockResolvedValue(undefined);
    handler.runConfig.mockReturnValueOnce({ autoCommit: false, eachMessage });
    const kafkaClient = client();
    const worker = runtime(enabled, kafkaClient);
    await worker.onApplicationBootstrap();
    const active = kafkaClient.run.mock.calls[0][0]!;
    await active.eachMessage!({} as EachMessagePayload);
    expect(eachMessage).toHaveBeenCalledTimes(1);
    expect(logger.error).not.toHaveBeenCalled();
    const status = worker.getStatus();
    expect(status).toMatchObject({
      state: 'running',
      processingFailures: 0,
    });
    expect(typeof status.lastMessageAt).toBe('string');
    expect(typeof status.lastProcessedAt).toBe('string');
  });
});
