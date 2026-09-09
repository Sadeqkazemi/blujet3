import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { Kafka, logLevel, type Consumer } from 'kafkajs';
import { Logger } from 'nestjs-pino';
import type { ReportingKafkaConsumerConfig } from '../../config/reporting-kafka-consumer.config';
import { ReportingKafkaHandler } from './reporting-kafka.handler';
import { ReportingItineraryProjectionStore } from './reporting-itinerary-projection.store';

export type ReportingKafkaRuntimeClient = Pick<
  Consumer,
  'connect' | 'subscribe' | 'run' | 'stop' | 'disconnect' | 'commitOffsets'
>;

export const REPORTING_KAFKA_CONFIG = Symbol('REPORTING_KAFKA_CONFIG');
export const REPORTING_KAFKA_CLIENT = Symbol('REPORTING_KAFKA_CLIENT');

export type ReportingKafkaRuntimeStatus = {
  enabled: boolean;
  state: 'disabled' | 'starting' | 'running' | 'failed' | 'stopped';
  processingFailures: number;
  lastProcessingFailureAt: string | null;
  lastMessageAt: string | null;
  lastProcessedAt: string | null;
  checkpointPartitions: number;
  maxObservedLag: string | null;
  lastCheckpointAt: string | null;
};

export function createReportingKafkaClient(
  config: ReportingKafkaConsumerConfig,
): ReportingKafkaRuntimeClient | null {
  if (!config.enabled) return null;
  return new Kafka({
    ...config.client,
    logLevel: logLevel.NOTHING,
  }).consumer(config.consumer);
}

@Injectable()
export class ReportingKafkaRuntime
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private started = false;
  private stopped = false;
  private state: ReportingKafkaRuntimeStatus['state'];
  private processingFailures = 0;
  private lastProcessingFailureAt: string | null = null;
  private lastMessageAt: string | null = null;
  private lastProcessedAt: string | null = null;
  private checkpointPartitions = 0;
  private maxObservedLag: bigint | null = null;
  private lastCheckpointAt: string | null = null;

  constructor(
    @Inject(REPORTING_KAFKA_CONFIG)
    private readonly config: ReportingKafkaConsumerConfig,
    @Inject(REPORTING_KAFKA_CLIENT)
    private readonly client: ReportingKafkaRuntimeClient | null,
    private readonly handler: ReportingKafkaHandler,
    private readonly projectionStore: ReportingItineraryProjectionStore,
    private readonly logger: Logger,
  ) {
    this.state = config.enabled ? 'stopped' : 'disabled';
  }

  getStatus(): ReportingKafkaRuntimeStatus {
    return {
      enabled: this.config.enabled,
      state: this.state,
      processingFailures: this.processingFailures,
      lastProcessingFailureAt: this.lastProcessingFailureAt,
      lastMessageAt: this.lastMessageAt,
      lastProcessedAt: this.lastProcessedAt,
      checkpointPartitions: this.checkpointPartitions,
      maxObservedLag: this.maxObservedLag?.toString() ?? null,
      lastCheckpointAt: this.lastCheckpointAt,
    };
  }

  isReady(): boolean {
    return !this.config.enabled || (this.started && !this.stopped);
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.config.enabled || !this.client || this.started) return;
    this.state = 'starting';
    try {
      const checkpoint = await this.projectionStore.getCheckpointSummary(
        this.config.consumer.groupId,
        this.config.topic,
      );
      this.checkpointPartitions = checkpoint.partitions;
      this.maxObservedLag =
        checkpoint.maxLag === null ? null : BigInt(checkpoint.maxLag);
      this.lastCheckpointAt = checkpoint.lastCheckpointAt;
      await this.client.connect();
      await this.client.subscribe({
        topic: this.config.topic,
        fromBeginning: this.config.fromBeginning,
      });
      const runConfig = this.handler.runConfig(this.client, {
        topic: this.config.topic,
        maxBytes: this.config.maxBytes,
        consumerGroup: this.config.consumer.groupId,
        requireSchemaId: this.config.requireSchemaId,
      });
      const eachMessage = runConfig.eachMessage;
      if (eachMessage) {
        runConfig.eachMessage = async (payload) => {
          this.lastMessageAt = new Date().toISOString();
          try {
            await eachMessage(payload);
            this.lastProcessedAt = new Date().toISOString();
            this.observeCheckpoint(payload);
          } catch {
            // Kafka logging is disabled; report failure without broker/PII data.
            this.processingFailures += 1;
            this.lastProcessingFailureAt = new Date().toISOString();
            this.logger.error('Reporting Kafka processing failed');
            throw new Error('Reporting Kafka processing failed');
          }
        };
      }
      await this.client.run(runConfig);
      this.started = true;
      this.state = 'running';
      this.logger.log(
        { groupId: this.config.consumer.groupId },
        'Reporting Kafka consumer started',
      );
    } catch {
      this.state = 'failed';
      await this.client.disconnect().catch(() => undefined);
      this.logger.error('Reporting Kafka consumer startup failed');
      throw new Error('Reporting Kafka consumer startup failed');
    }
  }

  private observeCheckpoint(payload: {
    partition?: number;
    message?: { offset?: string; highWatermark?: string };
  }): void {
    const partition = payload.partition;
    const offset = payload.message?.offset;
    const highWatermark = payload.message?.highWatermark;
    if (
      typeof partition !== 'number' ||
      !Number.isSafeInteger(partition) ||
      partition < 0 ||
      offset === undefined ||
      highWatermark === undefined ||
      !/^\d+$/.test(offset) ||
      !/^\d+$/.test(highWatermark)
    )
      return;
    const lag = BigInt(highWatermark) - (BigInt(offset) + 1n);
    const safeLag = lag > 0n ? lag : 0n;
    if (this.maxObservedLag === null || safeLag > this.maxObservedLag)
      this.maxObservedLag = safeLag;
    this.checkpointPartitions = Math.max(
      this.checkpointPartitions,
      partition + 1,
    );
    this.lastCheckpointAt = new Date().toISOString();
  }

  async onApplicationShutdown(): Promise<void> {
    if (!this.client || this.stopped) return;
    this.stopped = true;
    this.state = 'stopped';
    let failed = false;
    if (this.started) {
      try {
        await this.client.stop();
      } catch {
        failed = true;
      }
    }
    try {
      await this.client.disconnect();
    } catch {
      failed = true;
    }
    if (failed) {
      this.logger.error('Reporting Kafka consumer shutdown failed');
      throw new Error('Reporting Kafka consumer shutdown failed');
    }
  }
}
