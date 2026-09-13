import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { Kafka, logLevel, type Consumer } from 'kafkajs';
import { Logger } from 'nestjs-pino';
import type { LoyaltyKafkaConsumerConfig } from '../loyalty-kafka.config';
import { LoyaltyKafkaHandler } from './loyalty-kafka.handler';
import { LoyaltyProjectionStore } from './loyalty-projection.store';

export type LoyaltyKafkaRuntimeClient = Pick<
  Consumer,
  'connect' | 'subscribe' | 'run' | 'stop' | 'disconnect' | 'commitOffsets'
>;

export const LOYALTY_KAFKA_CONFIG = Symbol('LOYALTY_KAFKA_CONFIG');
export const LOYALTY_KAFKA_CLIENT = Symbol('LOYALTY_KAFKA_CLIENT');

export type LoyaltyKafkaRuntimeStatus = {
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

export function createLoyaltyKafkaClient(
  config: LoyaltyKafkaConsumerConfig,
): LoyaltyKafkaRuntimeClient | null {
  if (!config.enabled) return null;
  return new Kafka({
    ...config.client,
    logLevel: logLevel.NOTHING,
  }).consumer(config.consumer);
}

@Injectable()
export class LoyaltyKafkaRuntime
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private started = false;
  private stopped = false;
  private state: LoyaltyKafkaRuntimeStatus['state'];
  private processingFailures = 0;
  private lastProcessingFailureAt: string | null = null;
  private lastMessageAt: string | null = null;
  private lastProcessedAt: string | null = null;
  private checkpointPartitions = new Set<number>();
  private maxObservedLag: bigint | null = null;
  private lastCheckpointAt: string | null = null;

  constructor(
    @Inject(LOYALTY_KAFKA_CONFIG)
    private readonly config: LoyaltyKafkaConsumerConfig,
    @Inject(LOYALTY_KAFKA_CLIENT)
    private readonly client: LoyaltyKafkaRuntimeClient | null,
    private readonly handler: LoyaltyKafkaHandler,
    private readonly projectionStore: LoyaltyProjectionStore,
    private readonly logger: Logger,
  ) {
    this.state = config.enabled ? 'stopped' : 'disabled';
  }

  getStatus(): LoyaltyKafkaRuntimeStatus {
    return {
      enabled: this.config.enabled,
      state: this.state,
      processingFailures: this.processingFailures,
      lastProcessingFailureAt: this.lastProcessingFailureAt,
      lastMessageAt: this.lastMessageAt,
      lastProcessedAt: this.lastProcessedAt,
      checkpointPartitions: this.checkpointPartitions.size,
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
      const checkpoint = await this.projectionStore.getCheckpointState(
        this.config.consumer.groupId,
        this.config.topic,
      );
      this.checkpointPartitions = new Set(checkpoint.partitions);
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
            this.processingFailures += 1;
            this.lastProcessingFailureAt = new Date().toISOString();
            this.logger.error('Loyalty Kafka processing failed');
            throw new Error('Loyalty Kafka processing failed');
          }
        };
      }
      await this.client.run(runConfig);
      this.started = true;
      this.state = 'running';
      this.logger.log('Loyalty Kafka consumer started');
    } catch {
      this.state = 'failed';
      await this.client.disconnect().catch(() => undefined);
      this.logger.error('Loyalty Kafka consumer startup failed');
      throw new Error('Loyalty Kafka consumer startup failed');
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
      !/^(0|[1-9][0-9]{0,18})$/.test(offset)
    )
      return;
    this.checkpointPartitions.add(partition);
    if (
      highWatermark !== undefined &&
      /^(0|[1-9][0-9]{0,18})$/.test(highWatermark)
    ) {
      const observed = BigInt(highWatermark) - (BigInt(offset) + 1n);
      const lag = observed > 0n ? observed : 0n;
      if (this.maxObservedLag === null || lag > this.maxObservedLag)
        this.maxObservedLag = lag;
    }
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
      this.logger.error('Loyalty Kafka consumer shutdown failed');
      throw new Error('Loyalty Kafka consumer shutdown failed');
    }
  }
}
